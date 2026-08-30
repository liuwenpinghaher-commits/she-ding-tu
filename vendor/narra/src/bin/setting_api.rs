//! 分场条薄 HTTP。算出这一刻只走 SettingBook.world_at。

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use narra::db::connection::{init_db, DbConfig};
use narra::db::schema::apply_schema;
use narra::services::canon::SettingBook;
use narra::services::world::{
    BeatDraft, Column, Entity, Presence, ROLE_PRESENT, World,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct App {
    inner: Arc<Mutex<Inner>>,
    data_root: PathBuf,
}

struct Inner {
    books: HashMap<String, BookSess>,
    current: Option<String>,
}

struct BookSess {
    book: SettingBook,
    drafts: Vec<UiDraft>,
    n: u8,
    window_start: usize,
    reading_order: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct UiDraft {
    id: String,
    title: String,
    draft: BeatDraft,
}

#[derive(Serialize)]
struct BookList {
    books: Vec<String>,
    current: Option<String>,
}

#[derive(Deserialize)]
struct CreateBook {
    name: String,
}

#[derive(Deserialize)]
struct NewEntity {
    id: String,
    kind: String,
    name: String,
}

#[derive(Deserialize)]
struct WindowReq {
    n: Option<u8>,
    start: Option<usize>,
    density: Option<String>,
}

#[derive(Deserialize)]
struct DraftReq {
    id: Option<String>,
    title: Option<String>,
    draft: BeatDraft,
}

#[derive(Deserialize)]
struct CommitReq {
    id: String,
}

#[derive(Deserialize)]
struct WorldQ {
    t: Option<i64>,
}

#[derive(Serialize)]
struct UiState {
    book: Option<String>,
    n: u8,
    window_start: usize,
    reading_order: bool,
    columns: Vec<Column>,
    entities: Vec<Entity>,
    committed: Vec<narra::services::world::Beat>,
    drafts: Vec<UiDraft>,
    world: Option<World>,
}

fn html() -> &'static str {
    include_str!("../../../../apps/stripboard/index.html")
}

async fn open_book_dir(root: &PathBuf, name: &str) -> Result<SettingBook, String> {
    let dir = root.join(name);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = dir.join("world.db");
    let cfg = DbConfig::Embedded {
        path: Some(db_path.to_string_lossy().into_owned()),
    };
    let db = init_db(&cfg, &dir).await.map_err(|e| e.to_string())?;
    apply_schema(&db).await.map_err(|e| e.to_string())?;
    Ok(SettingBook::new(Arc::new(db)))
}

#[tokio::main]
async fn main() {
    let data_root = std::env::var("SETTING_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/books"));
    std::fs::create_dir_all(&data_root).ok();
    let app = App {
        inner: Arc::new(Mutex::new(Inner {
            books: HashMap::new(),
            current: None,
        })),
        data_root,
    };
    let router = Router::new()
        .route("/", get(index))
        .route("/api/books", get(list_books).post(create_book))
        .route("/api/books/{name}/open", post(open_book))
        .route("/api/state", get(state))
        .route("/api/entities", post(add_entity))
        .route("/api/window", post(set_window))
        .route("/api/drafts", post(save_draft))
        .route("/api/commit", post(do_commit))
        .route("/api/world", get(get_world))
        .route("/api/write-next", post(write_next))
        .route("/api/export", get(export_md))
        .route("/api/reading-order", post(toggle_ro))
        .route("/api/fill-fake", post(fill_fake))
        .route("/api/add-column", post(add_column))
        .route("/api/paste", post(paste_draft))
        .route("/api/supersede", post(do_supersede))
        .route("/health", get(|| async { "ok" }))
        .layer(CorsLayer::permissive())
        .with_state(app);
    let addr = std::env::var("SETTING_BIND").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind");
    eprintln!("setting-api {addr}");
    axum::serve(listener, router).await.expect("serve");
}

async fn index() -> impl IntoResponse {
    Html(html().to_string())
}

async fn list_books(State(app): State<App>) -> Json<BookList> {
    let g = app.inner.lock().await;
    Json(BookList {
        books: g.books.keys().cloned().collect(),
        current: g.current.clone(),
    })
}

async fn create_book(
    State(app): State<App>,
    Json(body): Json<CreateBook>,
) -> Result<Json<BookList>, (StatusCode, String)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "书名空".into()));
    }
    let book = open_book_dir(&app.data_root, &name)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    // 空书一列
    book.upsert_column(&Column {
        id: "col0".into(),
        clock_from: 0,
        clock_to: 60,
        display_ord: 0,
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut g = app.inner.lock().await;
    g.books.insert(
        name.clone(),
        BookSess {
            book,
            drafts: vec![],
            n: 1,
            window_start: 0,
            reading_order: false,
        },
    );
    g.current = Some(name);
    Ok(Json(BookList {
        books: g.books.keys().cloned().collect(),
        current: g.current.clone(),
    }))
}

async fn open_book(
    State(app): State<App>,
    Path(name): Path<String>,
) -> Result<Json<BookList>, (StatusCode, String)> {
    if !app.inner.lock().await.books.contains_key(&name) {
        let book = open_book_dir(&app.data_root, &name)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        let mut g = app.inner.lock().await;
        g.books.insert(
            name.clone(),
            BookSess {
                book,
                drafts: vec![],
                n: 1,
                window_start: 0,
                reading_order: false,
            },
        );
    }
    let mut g = app.inner.lock().await;
    g.current = Some(name);
    Ok(Json(BookList {
        books: g.books.keys().cloned().collect(),
        current: g.current.clone(),
    }))
}

async fn snapshot(sess: &BookSess, name: &str) -> Result<UiState, String> {
    let canon = sess.book.load_canon().await.map_err(|e| e.to_string())?;
    let t = sess
        .drafts
        .last()
        .map(|d| d.draft.clock_from)
        .or_else(|| canon.columns.first().map(|c| c.clock_from))
        .unwrap_or(0);
    let world = sess.book.world_at(t, None).await.ok();
    Ok(UiState {
        book: Some(name.into()),
        n: sess.n,
        window_start: sess.window_start,
        reading_order: sess.reading_order,
        columns: canon.columns,
        entities: canon.entities,
        committed: canon.beats,
        drafts: sess.drafts.clone(),
        world,
    })
}

async fn state(State(app): State<App>) -> Result<Json<UiState>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let st = snapshot(sess, &name)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(st))
}

async fn add_entity(
    State(app): State<App>,
    Json(body): Json<NewEntity>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    sess.book
        .upsert_entity(&Entity {
            id: body.id,
            kind: body.kind,
            name: body.name,
            profile: Default::default(),
        })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn set_window(
    State(app): State<App>,
    Json(body): Json<WindowReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    if let Some(d) = body.density.as_deref() {
        sess.n = match d {
            "sparse" => 2,
            "mid" => 4,
            "dense" => 6,
            _ => sess.n,
        };
    }
    if let Some(n) = body.n {
        sess.n = n.clamp(1, 6);
    }
    if let Some(s) = body.start {
        sess.window_start = s;
    }
    Ok(Json(serde_json::json!({"n": sess.n, "start": sess.window_start})))
}

async fn save_draft(
    State(app): State<App>,
    Json(body): Json<DraftReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let id = body
        .id
        .unwrap_or_else(|| format!("d{}", sess.drafts.len()));
    let mut draft = body.draft;
    draft.id = Some(id.clone());
    if let Some(ex) = sess.drafts.iter_mut().find(|d| d.id == id) {
        ex.draft = draft;
        if let Some(t) = body.title {
            ex.title = t;
        }
    } else {
        sess.drafts.push(UiDraft {
            title: body.title.unwrap_or_else(|| "草稿".into()),
            id,
            draft,
        });
    }
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn do_commit(
    State(app): State<App>,
    Json(body): Json<CommitReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let pos = sess
        .drafts
        .iter()
        .position(|d| d.id == body.id)
        .ok_or((StatusCode::BAD_REQUEST, "无此草稿".into()))?;
    let ui = sess.drafts.remove(pos);
    match sess.book.commit(ui.draft.clone()).await {
        Ok(b) => Ok(Json(serde_json::json!({"ok": true, "id": b.id, "seq": b.commit_seq}))),
        Err(e) => {
            sess.drafts.insert(pos, ui);
            Err((StatusCode::BAD_REQUEST, e.to_string()))
        }
    }
}

async fn get_world(
    State(app): State<App>,
    Query(q): Query<WorldQ>,
) -> Result<Json<World>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let t = q.t.unwrap_or(0);
    sess.book
        .world_at(t, None)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn write_next(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let intent = body
        .get("intent")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if intent.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有本场任务不准写下一场".into()));
    }
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let canon = sess.book.load_canon().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let last = canon
        .columns
        .iter()
        .max_by_key(|c| c.display_ord)
        .cloned()
        .unwrap_or(Column {
            id: "col0".into(),
            clock_from: 0,
            clock_to: 60,
            display_ord: 0,
        });
    let id = format!("d{}", sess.drafts.len() + 1);
    sess.drafts.push(UiDraft {
        id: id.clone(),
        title: "下一场".into(),
        draft: BeatDraft {
            id: Some(id.clone()),
            kind: "scene".into(),
            column_id: last.id,
            intent: intent.clone(),
            value_shift: Some("本场变化".into()),
            do_text: Some(format!("为「{intent}」行动")),
            clock_from: last.clock_from,
            clock_to: last.clock_to,
            presences: vec![],
            ..BeatDraft::default()
        },
    });
    Ok(Json(serde_json::json!({"id": id, "appended_last": true})))
}

async fn export_md(State(app): State<App>) -> Result<String, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let canon = sess.book.load_canon().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut md = format!("# {name}\n\n");
    let mut beats = canon.beats.clone();
    if sess.reading_order {
        beats.sort_by_key(|b| b.telling_ord.unwrap_or(b.commit_seq));
    } else {
        beats.sort_by_key(|b| (b.clock_from, b.commit_seq));
    }
    for b in beats {
        md.push_str(&format!("## {}\n状态：正史\n本场任务：{}\n\n", b.id, b.intent));
    }
    for d in &sess.drafts {
        md.push_str(&format!(
            "## {}\n状态：草稿\n本场任务：{}\n\n",
            d.title, d.draft.intent
        ));
    }
    Ok(md)
}

async fn toggle_ro(State(app): State<App>) -> Json<serde_json::Value> {
    let mut g = app.inner.lock().await;
    if let Some(name) = g.current.clone() {
        if let Some(s) = g.books.get_mut(&name) {
            s.reading_order = !s.reading_order;
            return Json(serde_json::json!({"reading_order": s.reading_order}));
        }
    }
    Json(serde_json::json!({"reading_order": false}))
}

async fn fill_fake(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<BeatDraft>, (StatusCode, String)> {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let d = sess
        .drafts
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or((StatusCode::BAD_REQUEST, "无草稿".into()))?;
    if d.draft.intent.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有本场任务不准填".into()));
    }
    d.draft.do_text = Some(format!("（假模型）为「{}」走了一步", d.draft.intent));
    d.draft.say_text = Some("……".into());
    Ok(Json(d.draft.clone()))
}

async fn add_column(State(app): State<App>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let canon = sess.book.load_canon().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut cols = canon.columns;
    let next = cols.iter().map(|c| c.display_ord).max().unwrap_or(-1) + 1;
    let last_to = cols.iter().map(|c| c.clock_to).max().unwrap_or(0);
    cols.push(Column {
        id: format!("col{next}"),
        clock_from: last_to,
        clock_to: last_to + 60,
        display_ord: next,
    });
    sess.book.confirm_columns(cols).await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn paste_draft(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let text = body.get("text").and_then(|v| v.as_str()).unwrap_or("");
    if text.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "空".into()));
    }
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let id = format!("paste{}", sess.drafts.len());
    sess.drafts.push(UiDraft {
        id: id.clone(),
        title: "丢一段草稿".into(),
        draft: BeatDraft {
            id: Some(id.clone()),
            kind: "scene".into(),
            column_id: "col0".into(),
            intent: "从粘贴来".into(),
            do_text: Some(text.into()),
            clock_from: 0,
            clock_to: 60,
            ..BeatDraft::default()
        },
    });
    Ok(Json(serde_json::json!({"id": id, "auto_canon": false})))
}

async fn do_supersede(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = body.get("id").and_then(|v| v.as_str()).ok_or((StatusCode::BAD_REQUEST, "无 id".into()))?;
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    sess.book.supersede(id).await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true})))
}

fn _keep(p: Presence) {
    let _ = (p, ROLE_PRESENT);
}
