//! 分场条薄 HTTP。算出这一刻只走 SettingBook.world_at。

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use narra::db::connection::{init_db, DbConfig};
use narra::db::schema::apply_schema;
use narra::services::canon::SettingBook;
use narra::services::circumstances::suggest_promise_op;
use narra::services::world::{
    BeatDraft, Column, Entity, Presence, Promise, ROLE_PRESENT, STATUS_COMMITTED, World,
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
    pending: Option<Pending>,
    selected: Option<String>,
    selected_canon: Option<String>,
    paste_suggestions: Vec<PasteSuggest>,
    fill_pending: Option<BeatDraft>,
}

#[derive(Clone, Serialize, Deserialize)]
struct UiDraft {
    id: String,
    title: String,
    draft: BeatDraft,
}

#[derive(Clone, Serialize, Deserialize)]
struct Suggestion {
    id: String,
    label: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Pending {
    op: String,
    suggestions: Vec<Suggestion>,
    original_columns: Vec<Column>,
    proposed_columns: Option<Vec<Column>>,
    target_beat: Option<String>,
    target_entity: Option<String>,
    target_column: Option<String>,
    impacts: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct PasteSuggest {
    id: String,
    field: String,
    text: String,
    applied: bool,
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
struct PatchDraft {
    id: String,
    intent: Option<String>,
    do_text: Option<String>,
    say_text: Option<String>,
    think_text: Option<String>,
    value_shift: Option<String>,
    kind: Option<String>,
    place_id: Option<String>,
    column_id: Option<String>,
    visible_to: Option<Vec<String>>,
    telling_ord: Option<i64>,
    apply_fill: Option<bool>,
}

#[derive(Deserialize)]
struct PresenceReq {
    draft_id: Option<String>,
    canon_id: Option<String>,
    entity_id: String,
    action: String,
}

#[derive(Deserialize)]
struct CommitReq {
    id: String,
}

#[derive(Deserialize)]
struct WorldQ {
    t: Option<i64>,
}

#[derive(Deserialize)]
struct StructPreview {
    op: String,
    column_id: Option<String>,
    beat_id: Option<String>,
    #[serde(default)]
    fail_refs: bool,
}

#[derive(Deserialize)]
struct StructConfirm {
    choice: String,
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
    pending: Option<Pending>,
    selected: Option<String>,
    selected_canon: Option<String>,
    paste_suggestions: Vec<PasteSuggest>,
    fill_pending: Option<BeatDraft>,
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

fn empty_sess(book: SettingBook) -> BookSess {
    BookSess {
        book,
        drafts: vec![],
        n: 1,
        window_start: 0,
        reading_order: false,
        pending: None,
        selected: None,
        selected_canon: None,
        paste_suggestions: vec![],
        fill_pending: None,
    }
}

fn drafts_path(root: &std::path::Path, name: &str) -> PathBuf {
    root.join(name).join("drafts.json")
}

fn load_drafts(root: &std::path::Path, name: &str) -> Vec<UiDraft> {
    std::fs::read_to_string(drafts_path(root, name))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist_drafts(root: &std::path::Path, name: &str, drafts: &[UiDraft]) {
    let _ = std::fs::create_dir_all(root.join(name));
    let _ = std::fs::write(
        drafts_path(root, name),
        serde_json::to_string_pretty(drafts).unwrap_or_else(|_| "[]".into()),
    );
}

fn load_dotenv() {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for _ in 0..8 {
        let f = dir.join(".env");
        if f.is_file() {
            if let Ok(s) = std::fs::read_to_string(&f) {
                for line in s.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    if let Some((k, v)) = line.split_once('=') {
                        let k = k.trim();
                        let v = v.trim().trim_matches('"');
                        if std::env::var(k).is_err() {
                            std::env::set_var(k, v);
                        }
                    }
                }
            }
            return;
        }
        if !dir.pop() {
            break;
        }
    }
}

fn disk_books(root: &std::path::Path) -> Vec<String> {
    let mut names = vec![];
    if let Ok(rd) = std::fs::read_dir(root) {
        for e in rd.flatten() {
            if e.path().join("world.db").exists() {
                if let Some(n) = e.file_name().to_str() {
                    names.push(n.to_string());
                }
            }
        }
    }
    names.sort();
    names
}

#[tokio::main]
async fn main() {
    load_dotenv();
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
        .route("/api/entities/delete", post(delete_entity))
        .route("/api/window", post(set_window))
        .route("/api/drafts/patch", post(patch_draft))
        .route("/api/presence", post(set_presence))
        .route("/api/commit", post(do_commit))
        .route("/api/world", get(get_world))
        .route("/api/write-next", post(write_next))
        .route("/api/write-parallel", post(write_parallel))
        .route("/api/export", get(export_md))
        .route("/api/reading-order", post(toggle_ro))
        .route("/api/fill-fake", post(fill_fake))
        .route("/api/structure/preview", post(structure_preview))
        .route("/api/structure/confirm", post(structure_confirm))
        .route("/api/structure/cancel", post(structure_cancel))
        .route("/api/paste", post(paste_draft))
        .route("/api/ellipsis", post(make_ellipsis))
        .route("/api/delete-draft", post(delete_draft))
        .route("/api/delete-canon", post(delete_canon))
        .route("/api/dossier/{id}", get(get_dossier).post(save_dossier))
        .route("/api/occupancy", get(occupancy).post(occupancy_write_refuse))
        .route("/api/circumstances", get(circumstances))
        .route("/api/search", get(search_entities))
        .route("/api/knows", get(knows_list))
        .route("/api/telling", post(set_telling))
        .route("/api/fill-live", post(fill_live))
        .route("/api/paste/apply", post(paste_apply))
        .route("/api/select", post(select_item))
        .route("/api/promises", post(plant_promise))
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
    let mut books = disk_books(&app.data_root);
    for k in g.books.keys() {
        if !books.contains(k) {
            books.push(k.clone());
        }
    }
    Json(BookList {
        books,
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
    book.upsert_column(&Column {
        id: "col0".into(),
        clock_from: 0,
        clock_to: 60,
        display_ord: 0,
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut g = app.inner.lock().await;
    g.books.insert(name.clone(), empty_sess(book));
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
        let drafts = load_drafts(&app.data_root, &name);
        let mut sess = empty_sess(book);
        sess.drafts = drafts;
        let mut g = app.inner.lock().await;
        g.books.insert(name.clone(), sess);
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
    let committed: Vec<_> = canon
        .beats
        .into_iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .collect();
    let mut columns = canon.columns;
    if sess.reading_order {
        columns.sort_by_key(|c| {
            committed
                .iter()
                .filter(|b| b.column_id == c.id)
                .filter_map(|b| b.telling_ord)
                .min()
                .unwrap_or(c.display_ord)
        });
    } else {
        columns.sort_by_key(|c| c.display_ord);
    }
    Ok(UiState {
        book: Some(name.into()),
        n: sess.n,
        window_start: sess.window_start,
        reading_order: sess.reading_order,
        columns,
        entities: canon.entities,
        committed,
        drafts: sess.drafts.clone(),
        world,
        pending: sess.pending.clone(),
        selected: sess.selected.clone(),
        selected_canon: sess.selected_canon.clone(),
        paste_suggestions: sess.paste_suggestions.clone(),
        fill_pending: sess.fill_pending.clone(),
    })
}

async fn state(State(app): State<App>) -> Result<Json<UiState>, (StatusCode, String)> {
    let g = app.inner.lock().await;
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

async fn delete_entity(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or((StatusCode::BAD_REQUEST, "无 id".into()))?;
    if body.get("fail_refs").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Err((
            StatusCode::CONFLICT,
            "引用查询失败，不准假装 0 引用".into(),
        ));
    }
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let (hung, resolved) = sess
        .book
        .entity_hung_on_canon(id)
        .await
        .map_err(|_| {
            (
                StatusCode::CONFLICT,
                "引用查询失败，不准假装 0 引用".to_string(),
            )
        })?;
    let hung_draft = sess.drafts.iter().any(|d| {
        d.draft
            .presences
            .iter()
            .any(|p| p.entity_id == resolved || p.entity_id == id)
    });
    if hung || hung_draft {
        return Err((
            StatusCode::BAD_REQUEST,
            "已挂在场上的设定不能从设定里删，须先从分场条拿掉".into(),
        ));
    }
    sess.book
        .delete_entity(&resolved)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true, "deleted": resolved})))
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

async fn patch_draft(
    State(app): State<App>,
    Json(body): Json<PatchDraft>,
) -> Result<Json<BeatDraft>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let d = sess
        .drafts
        .iter_mut()
        .find(|x| x.id == body.id)
        .ok_or((StatusCode::BAD_REQUEST, "无此草稿".into()))?;
    if body.apply_fill.unwrap_or(false) {
        if let Some(f) = sess.fill_pending.clone() {
            if f.do_text.is_some() {
                d.draft.do_text = f.do_text;
            }
            if f.say_text.is_some() {
                d.draft.say_text = f.say_text;
            }
            if f.think_text.is_some() {
                d.draft.think_text = f.think_text;
            }
            sess.fill_pending = None;
        }
    }
    if let Some(v) = body.intent {
        d.draft.intent = v;
    }
    if let Some(v) = body.do_text {
        d.draft.do_text = Some(v);
    }
    if let Some(v) = body.say_text {
        d.draft.say_text = Some(v);
    }
    if let Some(v) = body.think_text {
        d.draft.think_text = Some(v);
    }
    if let Some(v) = body.value_shift {
        d.draft.value_shift = Some(v);
    }
    if let Some(v) = body.kind {
        d.draft.kind = v;
    }
    if let Some(v) = body.place_id {
        d.draft.place_id = Some(v);
    }
    if let Some(v) = body.column_id {
        d.draft.column_id = v;
    }
    if let Some(v) = body.visible_to {
        d.draft.visible_to = Some(v);
    }
    if let Some(v) = body.telling_ord {
        d.draft.telling_ord = Some(v);
    }
    sess.selected = Some(body.id.clone());
    let out = d.draft.clone();
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(out))
}

async fn set_presence(
    State(app): State<App>,
    Json(body): Json<PresenceReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    if let Some(canon_id) = &body.canon_id {
        if body.action != "remove" {
            return Err((StatusCode::BAD_REQUEST, "正史在场只能拿掉，须确认变更".into()));
        }
        let canon = sess
            .book
            .load_canon()
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        sess.pending = Some(Pending {
            op: "remove_presence".into(),
            suggestions: vec![
                Suggestion {
                    id: "remove".into(),
                    label: format!("从本场拿掉 {}", body.entity_id),
                },
                Suggestion {
                    id: "cancel".into(),
                    label: "取消".into(),
                },
            ],
            original_columns: canon.columns,
            proposed_columns: None,
            target_beat: Some(canon_id.clone()),
            target_entity: Some(body.entity_id.clone()),
            target_column: None,
            impacts: vec!["在场连续性".into(), "算出这一刻".into()],
        });
        return Ok(Json(serde_json::json!({"need_confirm": true, "op": "remove_presence"})));
    }
    let draft_id = body
        .draft_id
        .ok_or((StatusCode::BAD_REQUEST, "无此草稿".into()))?;
    let d = sess
        .drafts
        .iter_mut()
        .find(|x| x.id == draft_id)
        .ok_or((StatusCode::BAD_REQUEST, "无此草稿".into()))?;
    match body.action.as_str() {
        "add" => {
            if !d.draft.presences.iter().any(|p| p.entity_id == body.entity_id) {
                d.draft.presences.push(Presence {
                    entity_id: body.entity_id.clone(),
                    beat_id: d.id.clone(),
                    role: ROLE_PRESENT.into(),
                });
            }
        }
        "remove" => {
            d.draft.presences.retain(|p| p.entity_id != body.entity_id);
        }
        _ => return Err((StatusCode::BAD_REQUEST, "action 须 add/remove".into())),
    }
    let out = d.draft.clone();
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(serde_json::to_value(out).unwrap_or(serde_json::json!({}))))
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
        Ok(b) => {
            persist_drafts(&app.data_root, &name, &sess.drafts);
            Ok(Json(serde_json::json!({
            "ok": true,
            "id": b.id,
            "seq": b.commit_seq,
            "column_id": b.column_id,
            "clock_from": b.clock_from,
            "clock_to": b.clock_to,
            "presences": b.presences,
        })))
        }
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
    sess.book
        .world_at(q.t.unwrap_or(0), None)
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
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
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
    let id = format!(
        "d{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    sess.drafts.push(UiDraft {
        id: id.clone(),
        title: "下一场".into(),
        draft: BeatDraft {
            id: Some(id.clone()),
            kind: "scene".into(),
            column_id: last.id.clone(),
            intent: intent.clone(),
            value_shift: Some("本场变化".into()),
            do_text: Some(format!("为「{intent}」行动")),
            clock_from: last.clock_from,
            clock_to: last.clock_to,
            place_id: body
                .get("place_id")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            presences: vec![],
            ..BeatDraft::default()
        },
    });
    sess.selected = Some(id.clone());
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(serde_json::json!({"id": id, "appended_last": true, "column_id": last.id})))
}

async fn write_parallel(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let intent = body
        .get("intent")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if intent.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有本场任务不准写".into()));
    }
    let col = body
        .get("column_id")
        .and_then(|v| v.as_str())
        .unwrap_or("col0")
        .to_string();
    let place_id = body
        .get("place_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let c = canon
        .columns
        .iter()
        .find(|x| x.id == col)
        .cloned()
        .ok_or((StatusCode::BAD_REQUEST, "无此列".into()))?;
    let id = format!(
        "p{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    sess.drafts.push(UiDraft {
        id: id.clone(),
        title: "并列".into(),
        draft: BeatDraft {
            id: Some(id.clone()),
            kind: "scene".into(),
            column_id: c.id.clone(),
            intent,
            value_shift: Some("并列".into()),
            do_text: Some("并列动作".into()),
            clock_from: c.clock_from,
            clock_to: c.clock_to,
            place_id,
            ..BeatDraft::default()
        },
    });
    sess.selected = Some(id.clone());
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(serde_json::json!({"id": id, "column_id": c.id, "clock_from": c.clock_from, "clock_to": c.clock_to})))
}

async fn select_item(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    sess.selected = body.get("draft_id").and_then(|v| v.as_str()).map(|s| s.to_string());
    sess.selected_canon = body.get("canon_id").and_then(|v| v.as_str()).map(|s| s.to_string());
    Ok(Json(serde_json::json!({
        "selected": sess.selected,
        "selected_canon": sess.selected_canon,
    })))
}

async fn occupancy_write_refuse() -> (StatusCode, String) {
    (
        StatusCode::BAD_REQUEST,
        "出场飞出层只读，改在场须拖标记".into(),
    )
}

async fn export_md(State(app): State<App>) -> Result<String, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut md = format!("# {name}\n\n");
    let mut beats: Vec<_> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .cloned()
        .collect();
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
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let draft0 = sess
        .drafts
        .iter()
        .find(|x| x.id == id)
        .ok_or((StatusCode::BAD_REQUEST, "无草稿".into()))?
        .draft
        .clone();
    if draft0.intent.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有本场任务不准填".into()));
    }
    let pkt = sess
        .book
        .given_circumstances(&draft0)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut suggested = draft0;
    suggested.do_text = Some(format!("（假模型）为「{}」走了一步", suggested.intent));
    suggested.say_text = Some("阿莲：东西呢。".into());
    suggested.think_text = Some("铜牌不能丢。".into());
    sess.fill_pending = Some(suggested.clone());
    persist_drafts(&app.data_root, &name, &sess.drafts);
    let pkt_json = serde_json::to_value(&pkt).unwrap_or(serde_json::json!({}));
    Ok(Json(serde_json::json!({
        "do_text": suggested.do_text,
        "say_text": suggested.say_text,
        "think_text": suggested.think_text,
        "intent": suggested.intent,
        "auto_canon": false,
        "model_input": pkt_json,
        "model_input_has_suggestion": false,
        "model_input_has_structure": false,
    })))
}

async fn plant_promise(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let p = Promise {
        id: body
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("token_due")
            .to_string(),
        name: body
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("铜牌三日")
            .to_string(),
        status: "open".into(),
        related: body
            .get("related")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_else(|| vec!["阿莲".into()]),
        plant_clock: body.get("plant_clock").and_then(|v| v.as_i64()).or(Some(0)),
        deadline_clock: body
            .get("deadline_clock")
            .and_then(|v| v.as_i64())
            .or(Some(0)),
        red_herring: body
            .get("red_herring")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    };
    sess.book
        .upsert_promise(&p)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true, "id": p.id, "auto_canon": false})))
}

async fn structure_preview(
    State(app): State<App>,
    Json(body): Json<StructPreview>,
) -> Result<Json<Pending>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let original = canon.columns.clone();
    let pending = match body.op.as_str() {
        "add_column" => Pending {
            op: "add_column".into(),
            suggestions: vec![
                Suggestion { id: "empty_col".into(), label: "插入空列：无场仅占故事时间".into() },
                Suggestion { id: "empty_beat".into(), label: "插入空场：有场卡可标省略场".into() },
                Suggestion { id: "shift".into(), label: "插入后把后续列后移".into() },
                Suggestion { id: "borrow".into(), label: "从邻列借时间".into() },
                Suggestion { id: "cancel".into(), label: "取消".into() },
            ],
            original_columns: original,
            proposed_columns: None,
            target_beat: None,
            target_entity: None,
            target_column: body.column_id.clone(),
            impacts: vec![],
        },
        "invade" => Pending {
            op: "invade".into(),
            suggestions: vec![
                Suggestion { id: "compress".into(), label: "被侵入列压缩".into() },
                Suggestion { id: "shift".into(), label: "被侵入列整体后移".into() },
                Suggestion { id: "merge".into(), label: "两列合并".into() },
                Suggestion { id: "empty".into(), label: "重叠变空场或省略场".into() },
                Suggestion { id: "parallel".into(), label: "重叠变同列多场".into() },
                Suggestion { id: "cancel".into(), label: "取消".into() },
            ],
            original_columns: original,
            proposed_columns: None,
            target_beat: body.column_id.clone(),
            target_entity: None,
            target_column: body.column_id,
            impacts: vec![],
        },
        "delete_canon" => {
            if body.fail_refs {
                return Err((
                    StatusCode::CONFLICT,
                    "影响清单查询失败，不准当无影响".into(),
                ));
            }
            let beat_id = body.beat_id.clone().unwrap_or_default();
            let beat = canon.beats.iter().find(|b| b.id == beat_id);
            let mut impacts = vec![
                "故事时间空洞".into(),
                "后续场规定情境".into(),
                "知情".into(),
                "伏笔状态".into(),
                "在场连续性".into(),
                "算出这一刻".into(),
                "第几次写入正史不重编号 / 该次写入作废".into(),
            ];
            if beat.is_none() {
                impacts.insert(0, "无此正史场".into());
            }
            Pending {
                op: "delete_canon".into(),
                suggestions: vec![
                    Suggestion { id: "fill".into(), label: "补洞：后列前移".into() },
                    Suggestion { id: "leave_hole".into(), label: "留下故事时间空洞".into() },
                    Suggestion { id: "cancel".into(), label: "取消".into() },
                ],
                original_columns: original,
                proposed_columns: None,
                target_beat: body.beat_id,
                target_entity: None,
                target_column: None,
                impacts,
            }
        }
        "remove_column" => {
            let col = body.column_id.clone().unwrap_or_else(|| {
                canon
                    .columns
                    .last()
                    .map(|c| c.id.clone())
                    .unwrap_or_else(|| "col0".into())
            });
            let has_canon = canon
                .beats
                .iter()
                .any(|b| b.column_id == col && b.status == STATUS_COMMITTED);
            let has_draft = sess.drafts.iter().any(|d| d.draft.column_id == col);
            if has_canon {
                Pending {
                    op: "remove_column".into(),
                    suggestions: vec![
                        Suggestion { id: "refuse".into(), label: "有正史禁止只减列丢掉历史，须合并或删已正史".into() },
                        Suggestion { id: "merge".into(), label: "与邻列合并（确认后钟并入）".into() },
                        Suggestion { id: "cancel".into(), label: "取消".into() },
                    ],
                    original_columns: original,
                    proposed_columns: None,
                    target_beat: None,
                    target_entity: None,
                    target_column: Some(col),
                    impacts: vec!["禁止只减列丢掉历史".into()],
                }
            } else if has_draft {
                Pending {
                    op: "remove_column".into(),
                    suggestions: vec![
                        Suggestion { id: "drop_drafts".into(), label: "丢掉本列草稿后减列".into() },
                        Suggestion { id: "move_drafts".into(), label: "草稿移到邻列再减列".into() },
                        Suggestion { id: "cancel".into(), label: "取消".into() },
                    ],
                    original_columns: original,
                    proposed_columns: None,
                    target_beat: None,
                    target_entity: None,
                    target_column: Some(col),
                    impacts: vec!["本列仅草稿".into()],
                }
            } else {
                Pending {
                    op: "remove_column".into(),
                    suggestions: vec![
                        Suggestion { id: "drop_empty".into(), label: "空列直接减列".into() },
                        Suggestion { id: "cancel".into(), label: "取消".into() },
                    ],
                    original_columns: original,
                    proposed_columns: None,
                    target_beat: None,
                    target_entity: None,
                    target_column: Some(col),
                    impacts: vec!["空列".into()],
                }
            }
        }
        "merge_columns" => Pending {
            op: "merge_columns".into(),
            suggestions: vec![
                Suggestion { id: "merge".into(), label: "后列并入前列，钟接上".into() },
                Suggestion { id: "cancel".into(), label: "取消".into() },
            ],
            original_columns: original,
            proposed_columns: None,
            target_beat: None,
            target_entity: None,
            target_column: body.column_id,
            impacts: vec![],
        },
        "swap_columns" => Pending {
            op: "swap_columns".into(),
            suggestions: vec![
                Suggestion { id: "swap".into(), label: "两列位置对调，钟跟着走".into() },
                Suggestion { id: "keep_clocks".into(), label: "只改排列不改钟".into() },
                Suggestion { id: "cancel".into(), label: "取消".into() },
            ],
            original_columns: original,
            proposed_columns: None,
            target_beat: None,
            target_entity: None,
            target_column: body.column_id,
            impacts: vec![],
        },
        "move_beat" => Pending {
            op: "move_beat".into(),
            suggestions: vec![
                Suggestion { id: "move".into(), label: "正史场换列并重算钟".into() },
                Suggestion { id: "cancel".into(), label: "取消".into() },
            ],
            original_columns: original,
            proposed_columns: None,
            target_beat: body.beat_id,
            target_entity: None,
            target_column: body.column_id,
            impacts: vec!["算出这一刻".into(), "规定情境轴".into()],
        },
        _ => return Err((StatusCode::BAD_REQUEST, "未知结构操作".into())),
    };
    sess.pending = Some(pending.clone());
    Ok(Json(pending))
}

async fn structure_confirm(
    State(app): State<App>,
    Json(body): Json<StructConfirm>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if body.choice == "cancel" {
        return structure_cancel(State(app)).await;
    }
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let pending = sess
        .pending
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "无待确认变更".into()))?;
    match pending.op.as_str() {
        "add_column" => {
            let mut cols = pending.original_columns;
            cols.sort_by_key(|c| c.display_ord);
            let after_idx = pending
                .target_column
                .as_ref()
                .and_then(|id| cols.iter().position(|c| &c.id == id))
                .unwrap_or(cols.len().saturating_sub(1));
            let next = cols.iter().map(|c| c.display_ord).max().unwrap_or(-1) + 1;
            let new_id = format!("col{next}");
            let (new_from, new_to, attach_empty_beat) = match body.choice.as_str() {
                "shift" => {
                    let dur = 60_i64;
                    let insert_from = cols.get(after_idx).map(|c| c.clock_to).unwrap_or(0);
                    for c in cols.iter_mut().skip(after_idx + 1) {
                        c.clock_from += dur;
                        c.clock_to += dur;
                    }
                    cols.insert(
                        after_idx + 1,
                        Column {
                            id: new_id.clone(),
                            clock_from: insert_from,
                            clock_to: insert_from + dur,
                            display_ord: next,
                        },
                    );
                    (insert_from, insert_from + dur, false)
                }
                "borrow" => {
                    let t = cols.get_mut(after_idx).ok_or((StatusCode::BAD_REQUEST, "无列可借".into()))?;
                    let mid = t.clock_from + (t.clock_to - t.clock_from).max(2) / 2;
                    let old_to = t.clock_to;
                    t.clock_to = mid;
                    cols.insert(
                        after_idx + 1,
                        Column {
                            id: new_id.clone(),
                            clock_from: mid,
                            clock_to: old_to,
                            display_ord: next,
                        },
                    );
                    (mid, old_to, false)
                }
                "empty_beat" => {
                    let last_to = cols.iter().map(|c| c.clock_to).max().unwrap_or(0);
                    cols.push(Column {
                        id: new_id.clone(),
                        clock_from: last_to,
                        clock_to: last_to + 60,
                        display_ord: next,
                    });
                    (last_to, last_to + 60, true)
                }
                _ => {
                    // empty_col：只在末尾占新的故事时间，不后移已有列
                    let last_to = cols.iter().map(|c| c.clock_to).max().unwrap_or(0);
                    cols.push(Column {
                        id: new_id.clone(),
                        clock_from: last_to,
                        clock_to: last_to + 60,
                        display_ord: next,
                    });
                    (last_to, last_to + 60, false)
                }
            };
            for (i, c) in cols.iter_mut().enumerate() {
                c.display_ord = i as i64;
            }
            SettingBook::preview_columns(&cols).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            sess.book
                .confirm_columns(cols)
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            if attach_empty_beat {
                let eid = format!(
                    "empty{}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis())
                        .unwrap_or(0)
                );
                sess.drafts.push(UiDraft {
                    id: eid.clone(),
                    title: "空场".into(),
                    draft: BeatDraft {
                        id: Some(eid),
                        kind: "scene".into(),
                        column_id: new_id,
                        intent: String::new(),
                        clock_from: new_from,
                        clock_to: new_to,
                        ..BeatDraft::default()
                    },
                });
                persist_drafts(&app.data_root, &name, &sess.drafts);
            }
        }
        "invade" => {
            let mut cols = pending.original_columns;
            cols.sort_by_key(|c| c.display_ord);
            let i = pending
                .target_column
                .as_ref()
                .and_then(|id| cols.iter().position(|c| &c.id == id))
                .unwrap_or(0);
            if i + 1 >= cols.len() {
                return Err((StatusCode::BAD_REQUEST, "无邻列可侵入".into()));
            }
            let j = i + 1;
            match body.choice.as_str() {
                "compress" => {
                    let eat = (cols[j].clock_to - cols[j].clock_from).max(2) / 2;
                    cols[i].clock_to = cols[j].clock_from + eat;
                    cols[j].clock_from = cols[i].clock_to;
                }
                "shift" => {
                    let eat = (cols[j].clock_to - cols[j].clock_from).max(2) / 2;
                    let dur = cols[j].clock_to - cols[j].clock_from;
                    cols[i].clock_to = cols[j].clock_from + eat;
                    cols[j].clock_from = cols[i].clock_to;
                    cols[j].clock_to = cols[j].clock_from + dur;
                }
                "merge" | "parallel" => {
                    cols[i].clock_to = cols[i].clock_to.max(cols[j].clock_to);
                    let gone = cols[j].id.clone();
                    cols.remove(j);
                    sess.book
                        .confirm_columns(cols.clone())
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                    sess.book
                        .delete_column(&gone)
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                    for d in sess.drafts.iter_mut() {
                        if d.draft.column_id == gone {
                            d.draft.column_id = cols[i].id.clone();
                        }
                    }
                    persist_drafts(&app.data_root, &name, &sess.drafts);
                    sess.pending = None;
                    return Ok(Json(serde_json::json!({"ok": true, "choice": body.choice})));
                }
                "empty" => {
                    let eat = (cols[j].clock_to - cols[j].clock_from).max(2) / 2;
                    cols[i].clock_to = cols[j].clock_from + eat;
                    cols[j].clock_from = cols[i].clock_to;
                    let eid = format!(
                        "ovl{}",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis())
                            .unwrap_or(0)
                    );
                    sess.drafts.push(UiDraft {
                        id: eid.clone(),
                        title: "省略场".into(),
                        draft: BeatDraft {
                            id: Some(eid),
                            kind: "ellipsis".into(),
                            column_id: cols[j].id.clone(),
                            intent: "侵入后空场".into(),
                            clock_from: cols[j].clock_from,
                            clock_to: cols[j].clock_to,
                            ..BeatDraft::default()
                        },
                    });
                    persist_drafts(&app.data_root, &name, &sess.drafts);
                }
                _ => {
                    cols[j].clock_from = cols[i].clock_to;
                }
            }
            SettingBook::preview_columns(&cols).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            sess.book
                .confirm_columns(cols)
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
        }
        "delete_canon" => {
            if let Some(id) = &pending.target_beat {
                sess.book
                    .supersede(id)
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            }
        }
        "remove_presence" => {
            if body.choice == "remove" {
                let beat = pending
                    .target_beat
                    .as_deref()
                    .ok_or((StatusCode::BAD_REQUEST, "无场".into()))?;
                let ent = pending
                    .target_entity
                    .as_deref()
                    .ok_or((StatusCode::BAD_REQUEST, "无设定".into()))?;
                sess.book
                    .remove_presence(beat, ent)
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            }
        }
        "remove_column" => {
            if body.choice == "refuse" {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "有正史禁止只减列丢掉历史".into(),
                ));
            }
            let col = pending
                .target_column
                .clone()
                .ok_or((StatusCode::BAD_REQUEST, "无列".into()))?;
            match body.choice.as_str() {
                "drop_empty" | "drop_drafts" => {
                    sess.drafts.retain(|d| d.draft.column_id != col);
                    persist_drafts(&app.data_root, &name, &sess.drafts);
                    sess.book
                        .delete_column(&col)
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                }
                "move_drafts" => {
                    let dest = pending
                        .original_columns
                        .iter()
                        .find(|c| c.id != col)
                        .map(|c| c.id.clone())
                        .unwrap_or_else(|| "col0".into());
                    for d in sess.drafts.iter_mut() {
                        if d.draft.column_id == col {
                            d.draft.column_id = dest.clone();
                        }
                    }
                    persist_drafts(&app.data_root, &name, &sess.drafts);
                    sess.book
                        .delete_column(&col)
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                }
                "merge" => {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        "有正史禁止只减列丢掉历史，请走合并列".into(),
                    ));
                }
                _ => {}
            }
        }
        "merge_columns" => {
            if body.choice == "merge" && pending.original_columns.len() >= 2 {
                let mut cols = pending.original_columns.clone();
                cols.sort_by_key(|c| c.display_ord);
                let last = cols.pop().unwrap();
                let dest = cols.last().map(|c| c.id.clone()).unwrap_or_else(|| last.id.clone());
                if let Some(first) = cols.last_mut() {
                    first.clock_to = last.clock_to.max(first.clock_to);
                }
                let canon = sess
                    .book
                    .load_canon()
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                for b in canon.beats.iter().filter(|b| b.column_id == last.id && b.status == STATUS_COMMITTED) {
                    sess.book
                        .move_beat_column(&b.id, &dest)
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                }
                sess.book
                    .confirm_columns(cols.clone())
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                sess.book
                    .delete_column(&last.id)
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                for d in sess.drafts.iter_mut() {
                    if d.draft.column_id == last.id {
                        d.draft.column_id = dest.clone();
                    }
                }
                persist_drafts(&app.data_root, &name, &sess.drafts);
            }
        }
        "swap_columns" => {
            if pending.original_columns.len() >= 2 {
                let mut cols = pending.original_columns.clone();
                cols.sort_by_key(|c| c.display_ord);
                let ord0 = cols[0].display_ord;
                cols[0].display_ord = cols[1].display_ord;
                cols[1].display_ord = ord0;
                if body.choice == "swap" {
                    let (a_from, a_to) = (cols[0].clock_from, cols[0].clock_to);
                    cols[0].clock_from = cols[1].clock_from;
                    cols[0].clock_to = cols[1].clock_to;
                    cols[1].clock_from = a_from;
                    cols[1].clock_to = a_to;
                }
                SettingBook::preview_columns(&cols)
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                sess.book
                    .confirm_columns(cols)
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            }
        }
        "move_beat" => {
            if body.choice == "move" {
                let beat = pending
                    .target_beat
                    .as_deref()
                    .ok_or((StatusCode::BAD_REQUEST, "无场".into()))?;
                let col = pending
                    .target_column
                    .as_deref()
                    .ok_or((StatusCode::BAD_REQUEST, "无列".into()))?;
                sess.book
                    .move_beat_column(beat, col)
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            }
        }
        _ => {}
    }
    sess.pending = None;
    Ok(Json(serde_json::json!({"ok": true, "choice": body.choice})))
}

async fn structure_cancel(
    State(app): State<App>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    sess.pending = None;
    Ok(Json(serde_json::json!({"ok": true, "cancelled": true})))
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
    let chunks: Vec<&str> = text
        .split(|c| c == '\n' || c == '。')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    let chunks = if chunks.is_empty() { vec![text] } else { chunks };
    sess.paste_suggestions = chunks
        .into_iter()
        .enumerate()
        .map(|(i, t)| PasteSuggest {
            id: format!("paste{i}"),
            field: if t.contains('：') || t.contains(':') {
                "say_text".into()
            } else {
                "do_text".into()
            },
            text: t.to_string(),
            applied: false,
        })
        .collect();
    Ok(Json(serde_json::json!({
        "auto_canon": false,
        "entered_box": false,
        "suggestions": sess.paste_suggestions,
    })))
}

async fn paste_apply(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let sid = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let sug = sess
        .paste_suggestions
        .iter_mut()
        .find(|s| s.id == sid)
        .ok_or((StatusCode::BAD_REQUEST, "无此建议".into()))?;
    sug.applied = true;
    let field = sug.field.clone();
    let text = sug.text.clone();
    let draft_id = sess.selected.clone();
    if let Some(id) = draft_id {
        if let Some(d) = sess.drafts.iter_mut().find(|x| x.id == id) {
            match field.as_str() {
                "say_text" => d.draft.say_text = Some(text.clone()),
                "think_text" => d.draft.think_text = Some(text.clone()),
                _ => d.draft.do_text = Some(text.clone()),
            }
        }
        persist_drafts(&app.data_root, &name, &sess.drafts);
    }
    Ok(Json(serde_json::json!({
        "ok": true,
        "applied": true,
        "field": field,
        "text": text,
        "auto_canon": false,
        "draft_id": sess.selected,
    })))
}

async fn make_ellipsis(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let d = sess
        .drafts
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or((StatusCode::BAD_REQUEST, "无草稿".into()))?;
    d.draft.kind = "ellipsis".into();
    d.draft.do_text = None;
    d.draft.say_text = None;
    d.draft.think_text = None;
    d.title = "省略场".into();
    drop(d);
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(serde_json::json!({"ok": true, "kind": "ellipsis"})))
}

async fn delete_draft(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let confirm = body.get("confirm").and_then(|v| v.as_bool()).unwrap_or(false);
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if canon
        .beats
        .iter()
        .any(|b| b.id == id && b.status == STATUS_COMMITTED)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "已正史禁止走轻路径，请用删已正史".into(),
        ));
    }
    let is_draft = sess.drafts.iter().any(|d| d.id == id);
    if !is_draft {
        return Err((StatusCode::BAD_REQUEST, "无此草稿".into()));
    }
    let suggestions = vec![
        Suggestion {
            id: "leave_hole".into(),
            label: "留下故事时间空洞".into(),
        },
        Suggestion {
            id: "shift".into(),
            label: "后列前移补洞".into(),
        },
    ];
    if !confirm {
        return Ok(Json(serde_json::json!({
            "need_confirm": true,
            "gap_suggestions": suggestions,
            "light_path": true,
        })));
    }
    let before = sess.drafts.len();
    sess.drafts.retain(|d| d.id != id);
    if sess.selected.as_deref() == Some(id) {
        sess.selected = None;
    }
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(serde_json::json!({
        "ok": true,
        "removed": before != sess.drafts.len(),
        "narra_untouched": true,
    })))
}

async fn delete_canon(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    // 必须先走确认变更预览
    structure_preview(
        State(app.clone()),
        Json(StructPreview {
            op: "delete_canon".into(),
            column_id: None,
            beat_id: body.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()),
            fail_refs: body.get("fail_refs").and_then(|v| v.as_bool()).unwrap_or(false),
        }),
    )
    .await?;
    Ok(Json(serde_json::json!({"need_confirm": true})))
}

async fn get_dossier(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let e = canon
        .entities
        .iter()
        .find(|x| x.id == id || x.name == id)
        .ok_or((StatusCode::NOT_FOUND, "无此档案".into()))?;
    let beats: Vec<serde_json::Value> = canon
        .beats
        .iter()
        .filter(|b| {
            b.status == STATUS_COMMITTED
                && b.presences.iter().any(|p| p.entity_id == e.id)
        })
        .map(|b| serde_json::json!({"id": b.id, "column_id": b.column_id, "intent": b.intent}))
        .collect();
    let w = sess.book.world_at(0, None).await.ok();
    let windows: Vec<_> = w
        .as_ref()
        .map(|w| {
            w.states
                .iter()
                .filter(|s| s.entity_id == e.id)
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    Ok(Json(serde_json::json!({
        "id": e.id,
        "kind": e.kind,
        "name": e.name,
        "profile": e.profile,
        "beats": beats,
        "beats_editable": false,
        "windows_readonly": windows,
    })))
}

async fn save_dossier(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut e = canon
        .entities
        .iter()
        .find(|x| x.id == id || x.name == id)
        .cloned()
        .ok_or((StatusCode::NOT_FOUND, "无此档案".into()))?;
    if let Some(obj) = body.get("profile").and_then(|v| v.as_object()) {
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                e.profile.insert(k.clone(), s.to_string());
            }
        }
    }
    sess.book
        .upsert_entity(&e)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true, "id": e.id})))
}

async fn occupancy(State(app): State<App>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut cells = vec![];
    for e in &canon.entities {
        for c in &canon.columns {
            let on = canon.beats.iter().any(|b| {
                b.column_id == c.id
                    && b.status == "committed"
                    && b.presences.iter().any(|p| p.entity_id == e.id && p.role == ROLE_PRESENT)
            });
            cells.push(serde_json::json!({"entity": e.id, "column": c.id, "present": on}));
        }
    }
    Ok(Json(serde_json::json!({"readonly": true, "cells": cells})))
}

async fn circumstances(
    State(app): State<App>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let Some(sel) = &sess.selected else {
        return Ok(Json(serde_json::json!({"empty": true})));
    };
    let d = sess
        .drafts
        .iter()
        .find(|x| &x.id == sel)
        .ok_or((StatusCode::BAD_REQUEST, "无选中草稿".into()))?;
    let pkt = sess
        .book
        .given_circumstances(&d.draft)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let suggestion = suggest_promise_op(&pkt.open_promises, &d.draft);
    Ok(Json(serde_json::json!({
        "packet": pkt,
        "suggestion": suggestion,
        "suggestion_in_packet": false,
        "structure_suggestions_in_packet": false,
    })))
}

#[derive(Deserialize)]
struct SearchQ {
    q: Option<String>,
}

async fn search_entities(
    State(app): State<App>,
    Query(q): Query<SearchQ>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let needle = q.q.unwrap_or_default();
    let hits = sess
        .book
        .search_entities(&needle)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({
        "book": name,
        "q": needle,
        "hits": hits,
    })))
}

#[derive(Deserialize)]
struct KnowsQ {
    person: Option<String>,
    t: Option<i64>,
}

async fn knows_list(
    State(app): State<App>,
    Query(q): Query<KnowsQ>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    let person = q.person.unwrap_or_default();
    let t = if let Some(t) = q.t {
        t
    } else {
        let canon = sess
            .book
            .load_canon()
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        canon
            .beats
            .iter()
            .filter(|b| b.status == STATUS_COMMITTED)
            .map(|b| b.clock_from)
            .max()
            .unwrap_or(0)
    };
    if person.is_empty() {
        let w = sess
            .book
            .world_at(t, None)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        return Ok(Json(serde_json::json!({"knows": w.knows, "t": t, "score": serde_json::Value::Null})));
    }
    let facts = sess
        .book
        .knows_at(t, &person, None)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({
        "person": person,
        "facts": facts,
        "t": t,
        "score": serde_json::Value::Null,
    })))
}

#[derive(Deserialize)]
struct TellingReq {
    beat_id: String,
    telling_ord: i64,
}

async fn set_telling(
    State(app): State<App>,
    Json(body): Json<TellingReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).unwrap();
    sess.book
        .set_telling_ord(&body.beat_id, body.telling_ord)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true, "beat_id": body.beat_id, "telling_ord": body.telling_ord})))
}

fn parse_fill_json(raw: &str) -> Result<(Option<String>, Option<String>, Option<String>), String> {
    let s = raw.trim();
    let s = s
        .strip_prefix("```json")
        .or_else(|| s.strip_prefix("```"))
        .unwrap_or(s)
        .trim()
        .trim_end_matches("```")
        .trim();
    let start = s.find('{').ok_or_else(|| "模型返回无 JSON 对象".to_string())?;
    let end = s.rfind('}').ok_or_else(|| "模型返回 JSON 不完整".to_string())?;
    let v: serde_json::Value =
        serde_json::from_str(&s[start..=end]).map_err(|e| format!("模型 JSON 解析失败: {e}"))?;
    let pick = |keys: &[&str]| {
        keys.iter()
            .find_map(|k| v.get(*k).and_then(|x| x.as_str()).map(|s| s.to_string()))
            .filter(|s| !s.trim().is_empty())
    };
    Ok((
        pick(&["do_text", "动作", "do"]),
        pick(&["say_text", "对白", "say"]),
        pick(&["think_text", "内心", "think"]),
    ))
}

async fn fill_live(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let key = std::env::var("SETTING_LLM_API_KEY").unwrap_or_default();
    if key.trim().is_empty() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "缺 SETTING_LLM_API_KEY".into()));
    }
    let base = std::env::var("SETTING_LLM_BASE_URL")
        .unwrap_or_else(|_| "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1".into());
    let model = std::env::var("SETTING_LLM_MODEL").unwrap_or_else(|_| "qwen3.8-flash".into());
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let (draft0, pkt) = {
        let g = app.inner.lock().await;
        let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
        let sess = g.books.get(&name).unwrap();
        let draft0 = sess
            .drafts
            .iter()
            .find(|x| x.id == id)
            .ok_or((StatusCode::BAD_REQUEST, "无草稿".into()))?
            .draft
            .clone();
        if draft0.intent.trim().is_empty() {
            return Err((StatusCode::BAD_REQUEST, "没有本场任务不准填".into()));
        }
        let pkt = sess
            .book
            .given_circumstances(&draft0)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        (draft0, pkt)
    };
    let pkt_json = serde_json::to_value(&pkt).unwrap_or(serde_json::json!({}));
    let user = format!(
        "你在写设定图的一场戏。只根据已正史规定情境和本场任务填格子。\n\
不要指定写哪一场。不要兑现伏笔建议。不要结构建议。不要把内容写成正史。\n\
本场任务：{}\n规定情境 JSON：{}\n\
只返回 JSON：{{\"do_text\":\"动作\",\"say_text\":\"对白\",\"think_text\":\"内心\"}}",
        draft0.intent,
        pkt_json
    );
    let url = format!("{}/chat/completions", base.trim_end_matches('/'));
    let payload = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": "只输出一个 JSON 对象，不要Markdown。"},
            {"role": "user", "content": user}
        ],
        "temperature": 0.4
    });
    let resp = reqwest::Client::new()
        .post(&url)
        .bearer_auth(&key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("真调请求失败: {e}")))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("真调读体失败: {e}")))?;
    if !status.is_success() {
        let clipped: String = text.chars().take(240).collect();
        return Err((StatusCode::BAD_GATEWAY, format!("真调 HTTP {status}: {clipped}")));
    }
    let outer: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("真调外层 JSON 失败: {e}")))?;
    let content = outer
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .ok_or((StatusCode::BAD_GATEWAY, "真调无 choices[0].message.content".into()))?;
    let (do_text, say_text, think_text) =
        parse_fill_json(content).map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    if do_text.is_none() && say_text.is_none() && think_text.is_none() {
        return Err((StatusCode::BAD_GATEWAY, "真调 JSON 无动作/对白/内心".into()));
    }
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).unwrap();
    let mut suggested = draft0.clone();
    if do_text.is_some() {
        suggested.do_text = do_text.clone();
    }
    if say_text.is_some() {
        suggested.say_text = say_text.clone();
    }
    if think_text.is_some() {
        suggested.think_text = think_text.clone();
    }
    sess.fill_pending = Some(suggested);
    Ok(Json(serde_json::json!({
        "do_text": do_text,
        "say_text": say_text,
        "think_text": think_text,
        "intent": draft0.intent,
        "auto_canon": false,
        "live": true,
        "model": model,
        "model_input": pkt_json,
        "model_input_has_suggestion": false,
        "model_input_has_structure": false,
    })))
}
