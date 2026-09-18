//! 分场条薄 HTTP。算出这一刻只走 SettingBook.world_at。

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{Request, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use narra::db::connection::{init_db, DbConfig};
use narra::db::schema::apply_schema;
use narra::services::canon::{BeatPatch, SettingBook};
use narra::services::circumstances::{apply_person_lens, suggest_promise_op};
use narra::services::constrain;
use narra::services::chapter_compose::{
    self, approved_excerpt, ban_reject_reason, ban_scan, beat_weight, clean_export_md,
    dialogue_hanzi, dialogue_ratio_pct, dialogue_rewrite_system_prompt, dialogue_rewrite_user_prompt,
    dlg_rewrite_hanzi_floor, dlg_rewrite_is_weak, dlg_rewrite_worth_keeping, expand_system_prompt,
    expand_user_prompt, fact_check,
    hanzi_count, has_ban_violation, has_repeat_violation, min_hanzi_for_beat,
    pick_dialogue_rewrite_targets_skipping, polish_system_prompt, polish_user_prompt,
    repeat_reject_reason, source_blob, weave_beat, CHAPTER_DLG_MIN_PCT, DLG_REWRITE_MAX_BEATS,
    DLG_REWRITE_MAX_ROUNDS, DLG_REWRITE_MAX_TRIES_PER_ROUND,
    DlgBeatStat, FactReport, MinHanziMode, SourceBeat,
};
use narra::services::craft::{self, BookCraft, ExportBeat};
use narra::services::fill::{
    chat_completions_url, classify_paste_field, clip_export_field, extract_chat_content,
    fill_cast_suffix, fill_system_prompt, fill_user_prompt_with_desires, literary_thin,
    packet_facts, parse_fill_content, parse_talk_content, scrub_thing_fields, talk_system_prompt,
    talk_user_prompt,
};
use narra::services::materialize::invalidate_interval;
use narra::services::relations;
use narra::services::span::{
    parse_plan_content, plan_system_prompt, plan_user_prompt, span_circumstances, PlanBone,
};
use narra::services::world::{
    apply_track_flatten, Beat, BeatDraft, BeatThread, Canon, Column, Delta, Entity, KnowledgeWrite,
    PersonTrack, Presence, Promise, PromiseOp, StoryThread, KIND_FACTION, KIND_PERSON, KIND_PLACE,
    KIND_RULE, KIND_THING, ROLE_PRESENT, STATUS_COMMITTED, World,
};
use serde::{Deserialize, Serialize};
use surrealdb::types::SurrealValue;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

#[derive(Clone)]
struct App {
    inner: Arc<Mutex<Inner>>,
    switch: Arc<Mutex<()>>,
    data_root: PathBuf,
}

struct Inner {
    /// 同时只留当前打开的那一本。换书前会 drop 旧会话，避免 N 份嵌入式引擎常驻。
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
    selected_col: Option<String>,
    paste_suggestions: Vec<PasteSuggest>,
    fill_pending: Option<BeatDraft>,
    lens_person: Option<String>,
    craft: BookCraft,
    threads: Vec<StoryThread>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct UiDraft {
    id: String,
    title: String,
    draft: BeatDraft,
    #[serde(default)]
    stale_world: bool,
    #[serde(default)]
    filled: bool,
}

impl UiDraft {
    fn new(id: String, title: impl Into<String>, draft: BeatDraft) -> Self {
        Self {
            id,
            title: title.into(),
            draft,
            stale_world: false,
            filled: false,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct Suggestion {
    id: String,
    label: String,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct Pending {
    op: String,
    suggestions: Vec<Suggestion>,
    original_columns: Vec<Column>,
    proposed_columns: Option<Vec<Column>>,
    target_beat: Option<String>,
    target_entity: Option<String>,
    target_column: Option<String>,
    #[serde(default)]
    proposed_clock_to: Option<i64>,
    #[serde(default)]
    proposed_clock_from: Option<i64>,
    #[serde(default)]
    follow: bool,
    impacts: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct PasteSuggest {
    id: String,
    field: String,
    text: String,
    applied: bool,
    #[serde(default)]
    skipped: bool,
    #[serde(default)]
    target_draft: Option<String>,
    #[serde(default)]
    target_label: String,
}

#[derive(Serialize, Clone)]
struct BookCard {
    name: String,
    premise: String,
    columns: usize,
    committed: usize,
    drafts: usize,
    opened_at: i64,
    #[serde(default)]
    last_intent: String,
}

#[derive(Serialize)]
struct BookList {
    books: Vec<String>,
    #[serde(default)]
    items: Vec<BookCard>,
    current: Option<String>,
}

#[derive(Deserialize)]
struct CreateBook {
    name: String,
    #[serde(default)]
    premise: Option<String>,
    #[serde(default)]
    clock_origin_label: Option<String>,
    #[serde(default)]
    clock_origin_minute: Option<i64>,
    #[serde(default)]
    clock_format: Option<String>,
}

#[derive(Deserialize)]
struct NewEntity {
    id: String,
    kind: String,
    name: String,
    #[serde(default)]
    aliases: Option<String>,
    #[serde(default)]
    profile: Option<std::collections::BTreeMap<String, String>>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct BookMeta {
    #[serde(default)]
    opened_at: i64,
    #[serde(default)]
    columns: usize,
    #[serde(default)]
    committed: usize,
    #[serde(default)]
    last_intent: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct SetupRel {
    id: String,
    kind: String,
    from: String,
    to: String,
    #[serde(default)]
    note: String,
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
    title: Option<String>,
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
    deltas: Option<Vec<Delta>>,
    knowledge_writes: Option<Vec<KnowledgeWrite>>,
    promise_ops: Option<Vec<PromiseOp>>,
    cause_beat: Option<String>,
    tracks: Option<Vec<PersonTrack>>,
    clock_from: Option<i64>,
    clock_to: Option<i64>,
    story_threads: Option<Vec<BeatThread>>,
}

#[derive(Deserialize)]
struct ClockReq {
    id: String,
    draft: bool,
    clock_from: i64,
    clock_to: i64,
    follow: Option<bool>,
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
struct TalkGetQ {
    id: Option<String>,
}

#[derive(Deserialize, Default)]
struct StructPreview {
    op: String,
    column_id: Option<String>,
    beat_id: Option<String>,
    entity_id: Option<String>,
    #[serde(default)]
    fail_refs: bool,
    #[serde(default)]
    clock_to: Option<i64>,
    #[serde(default)]
    clock_from: Option<i64>,
    #[serde(default)]
    follow: Option<bool>,
}

#[derive(Deserialize)]
struct StructConfirm {
    choice: String,
}

#[derive(Clone, Serialize)]
struct ColCoverage {
    column_id: String,
    place: bool,
    person: bool,
    thing: bool,
    faction: bool,
    promise: bool,
}

#[derive(Clone, Serialize)]
struct BeatWarning {
    beat_id: String,
    code: String,
    message: String,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    world_error: Option<String>,
    pending: Option<Pending>,
    selected: Option<String>,
    selected_canon: Option<String>,
    selected_col: Option<String>,
    coverage: Vec<ColCoverage>,
    warnings: Vec<BeatWarning>,
    paste_suggestions: Vec<PasteSuggest>,
    fill_pending: Option<BeatDraft>,
    lens_person: Option<String>,
    people: Vec<Entity>,
    craft: BookCraft,
    talk_log: Vec<serde_json::Value>,
    #[serde(default)]
    all_entities: Vec<Entity>,
    #[serde(default)]
    promises: Vec<Promise>,
    #[serde(default)]
    threads: Vec<StoryThread>,
}

fn web_dist() -> PathBuf {
    if let Ok(p) = std::env::var("SETTING_WEB_DIR") {
        return PathBuf::from(p);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/dist")
}

async fn proxy_vite(req: Request<Body>) -> impl IntoResponse {
    let base = std::env::var("SETTING_WEB_DEV").unwrap_or_else(|_| "http://127.0.0.1:5173".into());
    let uri = format!("{}{}", base.trim_end_matches('/'), req.uri());
    match reqwest::Client::new().get(&uri).send().await {
        Ok(r) => {
            let status =
                StatusCode::from_u16(r.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let ct = r
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("text/html")
                .to_string();
            let bytes = r.bytes().await.unwrap_or_default();
            (
                status,
                [(axum::http::header::CONTENT_TYPE, ct)],
                bytes,
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            format!("Vite 开发服务打不开：{e}。旧单文件已废入口，请先 npm run dev 或 npm run build。"),
        )
            .into_response(),
    }
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
    let book = SettingBook::new(Arc::new(db));
    book.sync_official()
        .await
        .map_err(|e| format!("官方表双写失败: {e}"))?;
    Ok(book)
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
        selected_col: None,
        paste_suggestions: vec![],
        fill_pending: None,
        lens_person: None,
        craft: BookCraft::default(),
        threads: vec![],
    }
}

/// 把还在内存里的书草稿/设定写回盘，再整表取出。调用方随后 drop 引擎。
fn persist_and_take_all(root: &std::path::Path, g: &mut Inner) -> Vec<BookSess> {
    g.current = None;
    g.books
        .drain()
        .map(|(name, sess)| {
            persist_drafts(root, &name, &sess.drafts);
            persist_craft(root, &name, &sess.craft);
            persist_threads(root, &name, &sess.threads);
            sess
        })
        .collect()
}

/// 关掉一本已取出的书：丢掉 `Surreal` 句柄。
///
/// v3 没有公开 `Surreal::shutdown`。3.1.0 修了 #7304 之后，官方关闭路径就是
/// 最后一个客户端 Drop（嵌入式 RocksDB 的 fd/线程随 Drop 释放）。
/// `invalidate()` 只清登录态，不能拿来关引擎。
///
/// Drop 嵌式 RocksDB 会同步堵线程。必须放进 `spawn_blocking`，否则 tokio
/// 工作线程卡住，下一本 `open_book_dir` / `/api/state` 一起饿死，e2e 的
/// `book-label` 5s 就空。
async fn release_book_engine(sess: BookSess) {
    let _ = tokio::task::spawn_blocking(move || drop(sess)).await;
}

async fn release_book_engines(sessions: Vec<BookSess>) {
    for sess in sessions {
        release_book_engine(sess).await;
    }
}

fn book_db_path(root: &std::path::Path, name: &str) -> PathBuf {
    root.join(name).join("world.db")
}

fn n_for_loaded_book(canon: &narra::services::world::Canon, drafts: &[UiDraft]) -> u8 {
    let has_canon = canon.beats.iter().any(|b| b.status == STATUS_COMMITTED);
    if has_canon || !drafts.is_empty() {
        4
    } else {
        1
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
    if let Ok(s) = serde_json::to_string_pretty(drafts) {
        let _ = std::fs::write(drafts_path(root, name), s);
    }
}

fn craft_path(root: &std::path::Path, name: &str) -> PathBuf {
    root.join(name).join("craft.json")
}

fn load_craft(root: &std::path::Path, name: &str) -> BookCraft {
    std::fs::read_to_string(craft_path(root, name))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist_craft(root: &std::path::Path, name: &str, craft: &BookCraft) {
    let _ = std::fs::create_dir_all(root.join(name));
    let _ = std::fs::write(
        craft_path(root, name),
        serde_json::to_string_pretty(craft).unwrap_or_else(|_| "{}".into()),
    );
}

fn threads_path(root: &std::path::Path, name: &str) -> PathBuf {
    root.join(name).join("threads.json")
}

fn load_threads(root: &std::path::Path, name: &str) -> Vec<StoryThread> {
    std::fs::read_to_string(threads_path(root, name))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist_threads(root: &std::path::Path, name: &str, threads: &[StoryThread]) {
    let _ = std::fs::create_dir_all(root.join(name));
    let _ = std::fs::write(
        threads_path(root, name),
        serde_json::to_string_pretty(threads).unwrap_or_else(|_| "[]".into()),
    );
}

fn next_thread_color(threads: &[StoryThread]) -> u8 {
    let used = threads
        .iter()
        .filter(|t| t.thread_type != "主线")
        .count();
    (used % 6) as u8
}

fn thread_hung_on(
    committed: &[Beat],
    drafts: &[UiDraft],
    id: &str,
) -> Vec<String> {
    let mut names = Vec::new();
    for b in committed {
        if b.story_threads.iter().any(|t| t.id == id) {
            names.push(if b.intent.is_empty() {
                b.id.clone()
            } else {
                b.intent.clone()
            });
        }
    }
    for d in drafts {
        if d.draft.story_threads.iter().any(|t| t.id == id) {
            names.push(if d.draft.intent.is_empty() {
                d.id.clone()
            } else {
                d.draft.intent.clone()
            });
        }
    }
    names
}

fn meta_path(root: &std::path::Path, name: &str) -> PathBuf {
    root.join(name).join("meta.json")
}

fn load_meta(root: &std::path::Path, name: &str) -> BookMeta {
    std::fs::read_to_string(meta_path(root, name))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist_meta(root: &std::path::Path, name: &str, meta: &BookMeta) {
    let _ = std::fs::create_dir_all(root.join(name));
    let _ = std::fs::write(
        meta_path(root, name),
        serde_json::to_string_pretty(meta).unwrap_or_else(|_| "{}".into()),
    );
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn update_meta_counts(root: &std::path::Path, name: &str, columns: usize, committed: usize) {
    let mut m = load_meta(root, name);
    m.columns = columns;
    m.committed = committed;
    m.opened_at = now_secs();
    persist_meta(root, name, &m);
}

fn rel_path(root: &std::path::Path, name: &str) -> PathBuf {
    root.join(name).join("setup_relations.json")
}

fn load_rels(root: &std::path::Path, name: &str) -> Vec<SetupRel> {
    std::fs::read_to_string(rel_path(root, name))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist_rels(root: &std::path::Path, name: &str, rels: &[SetupRel]) {
    let _ = std::fs::create_dir_all(root.join(name));
    let _ = std::fs::write(
        rel_path(root, name),
        serde_json::to_string_pretty(rels).unwrap_or_else(|_| "[]".into()),
    );
}

fn rel_allowed(kind: &str, from_kind: &str, to_kind: &str) -> bool {
    match kind {
        "related" => true,
        "member" => from_kind == KIND_PERSON && to_kind == KIND_FACTION,
        "holds" => from_kind == KIND_PERSON && to_kind == KIND_THING,
        "contains" => from_kind == KIND_PLACE && to_kind == KIND_PLACE,
        _ => false,
    }
}

fn rel_label(kind: &str) -> &'static str {
    match kind {
        "member" => "属于",
        "holds" => "拿着",
        "contains" => "在…之内",
        _ => "和…有关系",
    }
}

fn reverse_rel_label(kind: &str) -> &'static str {
    match kind {
        "member" => "…的成员",
        "holds" => "在…手上",
        "contains" => "…里面有",
        _ => "和…有关系",
    }
}

fn set_last_intent(root: &std::path::Path, name: &str, intent: &str) {
    let mut m = load_meta(root, name);
    m.last_intent = intent.trim().to_string();
    persist_meta(root, name, &m);
}

fn book_card(root: &std::path::Path, name: &str) -> BookCard {
    let craft = load_craft(root, name);
    let drafts = load_drafts(root, name);
    let meta = load_meta(root, name);
    let last_intent = if !meta.last_intent.trim().is_empty() {
        meta.last_intent
    } else {
        drafts
            .last()
            .map(|d| {
                if d.title.trim().is_empty() || d.title == "下一场" {
                    d.draft.intent.clone()
                } else {
                    d.title.clone()
                }
            })
            .unwrap_or_default()
    };
    BookCard {
        name: name.to_string(),
        premise: craft.premise,
        columns: meta.columns.max(1),
        committed: meta.committed,
        drafts: drafts.len(),
        opened_at: meta.opened_at,
        last_intent,
    }
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

fn talk_file(root: &std::path::Path, book: &str, draft_id: &str) -> PathBuf {
    root.join(book).join("talk").join(format!("{draft_id}.jsonl"))
}

fn read_talk_lines(root: &std::path::Path, book: &str, draft_id: &str) -> Vec<serde_json::Value> {
    let Ok(s) = std::fs::read_to_string(talk_file(root, book, draft_id)) else {
        return vec![];
    };
    s.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn append_talk_line(root: &std::path::Path, book: &str, draft_id: &str, line: &serde_json::Value) {
    let path = talk_file(root, book, draft_id);
    let _ = std::fs::create_dir_all(path.parent().unwrap());
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(f, "{line}");
    }
}

fn mark_later_filled_stale(drafts: &mut [UiDraft], after_clock_from: i64) {
    for d in drafts.iter_mut() {
        if d.filled && d.draft.clock_from > after_clock_from {
            d.stale_world = true;
        }
    }
}

fn plan_window(canon: &Canon, goal: &BeatDraft) -> Result<(i64, i64), String> {
    let mut cols = canon.columns.clone();
    cols.sort_by_key(|c| c.display_ord);
    let Some(goal_col) = cols.iter().find(|c| c.id == goal.column_id) else {
        return Err("目标场没有列".into());
    };
    let last = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .max_by_key(|b| b.clock_to);
    let from = last.map(|b| b.clock_to).unwrap_or(0);
    let last_ord = last
        .and_then(|b| cols.iter().find(|c| c.id == b.column_id))
        .map(|c| c.display_ord)
        .unwrap_or(-1);
    let mut to = goal.clock_from;
    if to <= from && goal_col.display_ord > last_ord {
        to = goal.clock_to;
    }
    if to <= from {
        Err("两列之间没有故事时间可铺，先确认后移或借时间".into())
    } else {
        Ok((from, to))
    }
}

async fn call_chat(system: &str, user: &str) -> Result<String, (StatusCode, String)> {
    call_chat_ex(system, user, 180, 1200).await
}

fn pin_ipv4_addr(
    addrs: impl IntoIterator<Item = std::net::SocketAddr>,
) -> Option<std::net::SocketAddr> {
    addrs.into_iter().find(|a| a.ip().is_ipv4())
}

fn map_reqwest_err(e: reqwest::Error) -> (StatusCode, String) {
    let mut msg = format!("模型请求失败：{e}");
    let mut src = std::error::Error::source(&e);
    while let Some(s) = src {
        msg.push_str(" :: ");
        msg.push_str(&s.to_string());
        src = s.source();
    }
    (StatusCode::BAD_GATEWAY, msg)
}

/// 只走 A 记录，避开 AAAA ENETUNREACH 把 180s 读超时吃光。
/// 禁止 `local_address(0.0.0.0)`：r4b 上 TCP ESTAB 但 HTTP 永不回；同机 curl -4 0.72s/200。
async fn chat_http_client(
    timeout_secs: u64,
    url: &str,
) -> Result<reqwest::Client, (StatusCode, String)> {
    let parsed = reqwest::Url::parse(url).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("模型地址读不了：{e}"),
        )
    })?;
    let host = parsed.host_str().unwrap_or("").to_string();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let pin = match tokio::net::lookup_host((host.as_str(), port)).await {
        Ok(addrs) => pin_ipv4_addr(addrs),
        Err(e) => {
            eprintln!("call_chat dns_fail host={host} err={e}");
            None
        }
    };
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .connect_timeout(std::time::Duration::from_secs(10));
    if let Some(addr) = pin {
        builder = builder.resolve(&host, addr);
        eprintln!("call_chat pin_ipv4 host={host} addr={}", addr.ip());
    } else if !host.is_empty() {
        eprintln!("call_chat pin_ipv4_miss host={host}");
    }
    builder
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn call_chat_ex(
    system: &str,
    user: &str,
    timeout_secs: u64,
    max_tokens: u32,
) -> Result<String, (StatusCode, String)> {
    let key = std::env::var("SETTING_LLM_API_KEY").unwrap_or_default();
    if key.trim().is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "没配模型密钥，可以手写动作。".into(),
        ));
    }
    let base = std::env::var("SETTING_LLM_BASE_URL").unwrap_or_else(|_| {
        "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1".into()
    });
    if base.trim().is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "没配模型服务，可以手写动作。".into(),
        ));
    }
    let model = std::env::var("SETTING_LLM_MODEL").unwrap_or_else(|_| "qwen3.8-flash".into());
    let url = chat_completions_url(&base);
    let client = chat_http_client(timeout_secs, &url).await?;
    // qwen3.8-flash 默认开思考。长 polish 会把 180s 读超时吃光：
    // 同机 curl 对照（r4c 拍 5 两次 timeout 之后）：同长 prompt max_tokens=512
    // 无此字段 → 45s 0 字节；enable_thinking=false → 0.56s/200。不是改 T2 的 180s。
    let sent = serde_json::json!({
        "model": model,
        "temperature": 0.4,
        "max_tokens": max_tokens,
        "enable_thinking": false,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    });
    let resp = client
        .post(&url)
        .bearer_auth(key.trim())
        .header("Content-Type", "application/json")
        .json(&sent)
        .send()
        .await
        .map_err(map_reqwest_err)?;
    let status = resp.status();
    let body_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("模型返回读不了：{e}")))?;
    if !status.is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("模型 HTTP {status}：{body_json}"),
        ));
    }
    extract_chat_content(&body_json).map_err(|e| (StatusCode::BAD_GATEWAY, e))
}

fn polish_reject_reason(check: &FactReport, hanzi: usize, source_hanzi: usize, llm_err: Option<&str>) -> String {
    if let Some(e) = llm_err {
        return format!("llm_error:{e}");
    }
    let mut parts = Vec::new();
    if !check.missing_quotes.is_empty() {
        parts.push(format!("missing_quotes={}", check.missing_quotes.join("|")));
    }
    if !check.added_entities.is_empty() {
        parts.push(format!("added_entities={}", check.added_entities.join("|")));
    }
    if !check.added_quotes.is_empty() {
        parts.push(format!("added_quotes_n={}", check.added_quotes.len()));
    }
    if hanzi < source_hanzi {
        parts.push(format!("hanzi {hanzi}<source {source_hanzi}"));
    }
    if parts.is_empty() {
        "unknown".into()
    } else {
        parts.join("; ")
    }
}

fn log_compose_event(
    path: &str,
    kind: &str,
    beat_i: usize,
    beat_n: usize,
    id: &str,
    attempt: u32,
    reason: &str,
    check: Option<&FactReport>,
    hanzi: usize,
    source_hanzi: usize,
    min_hanzi: usize,
) {
    if let Some(c) = check {
        eprintln!(
            "compose-chapter {path} {kind} beat={beat_i}/{beat_n} id={id} attempt={attempt} reason={reason} missing_quotes={:?} added_entities={:?} added_quotes={:?} hanzi={hanzi} source_hanzi={source_hanzi} min_hanzi={min_hanzi}",
            c.missing_quotes, c.added_entities, c.added_quotes
        );
    } else {
        eprintln!(
            "compose-chapter {path} {kind} beat={beat_i}/{beat_n} id={id} attempt={attempt} reason={reason} hanzi={hanzi} source_hanzi={source_hanzi} min_hanzi={min_hanzi}"
        );
    }
}

struct RewriteOutcome {
    text: Option<String>,
    attempts: u32,
    last_reason: String,
    last_check: Option<FactReport>,
    last_hanzi: usize,
}

async fn try_llm_rewrite(
    path: &str,
    system: &str,
    user0: String,
    src_blob: &str,
    entity_names: &[String],
    src_h: usize,
    min_h: usize,
    beat_i: usize,
    beat_n: usize,
    id: &str,
    max_attempts: u32,
    dlg_before: Option<f64>,
) -> RewriteOutcome {
    let mut out = RewriteOutcome {
        text: None,
        attempts: 0,
        last_reason: String::new(),
        last_check: None,
        last_hanzi: 0,
    };
    let mut prompt = user0.clone();
    for attempt in 1u32..=max_attempts {
        out.attempts = attempt;
        match call_chat_ex(system, &prompt, 180, 4096).await {
            Ok(txt) => {
                let txt = txt.trim().to_string();
                let check = fact_check(src_blob, &txt, entity_names);
                let h = hanzi_count(&txt);
                out.last_check = Some(check.clone());
                out.last_hanzi = h;
                let repeat_bad = has_repeat_violation(&txt);
                let ban_bad = has_ban_violation(&txt);
                if check.polish_pass() && !repeat_bad && !ban_bad {
                    let after_dlg = dialogue_ratio_pct(&txt);
                    let weak = path == "dlg_rewrite"
                        && dlg_before
                            .map(|b| dlg_rewrite_is_weak(b, after_dlg))
                            .unwrap_or(false);
                    if weak && attempt < max_attempts {
                        let reason = format!(
                            "dlg_weak {}->{after_dlg}",
                            dlg_before.unwrap_or(0.0)
                        );
                        out.last_reason = reason.clone();
                        // 弱稿先留着：第二稿若事实闸失败，章级 gate 仍可用这一版。
                        out.text = Some(txt);
                        log_compose_event(
                            path,
                            "REJECT",
                            beat_i,
                            beat_n,
                            id,
                            attempt,
                            &reason,
                            Some(&check),
                            h,
                            src_h,
                            min_h,
                        );
                        prompt = format!(
                            "{user0}\n\n上一稿未过审：{reason}\n把叙述场面改成人物开口推进。不增删事实，不动已给对白原文。「」内原文必须出现。对白比仍低于两成，继续把旁白改成在场人物轮流说话，禁止把旁白整段套进「」，禁止复读凑数，禁止套话「淡淡道」「嘴角微微」。"
                        );
                        continue;
                    }
                    log_compose_event(
                        path,
                        "ACCEPT",
                        beat_i,
                        beat_n,
                        id,
                        attempt,
                        "ok",
                        Some(&check),
                        h,
                        src_h,
                        min_h,
                    );
                    out.last_reason.clear();
                    out.text = Some(txt);
                    return out;
                }
                let reason = if ban_bad && check.polish_pass() && !repeat_bad {
                    ban_reject_reason(&txt)
                } else if repeat_bad && check.polish_pass() {
                    repeat_reject_reason(&txt)
                } else {
                    polish_reject_reason(&check, h, src_h, None)
                };
                out.last_reason = reason.clone();
                log_compose_event(
                    path,
                    "REJECT",
                    beat_i,
                    beat_n,
                    id,
                    attempt,
                    &reason,
                    Some(&check),
                    h,
                    src_h,
                    min_h,
                );
                prompt = if path == "dlg_rewrite" {
                    format!(
                        "{user0}\n\n上一稿未过审：{reason}\n把叙述场面改成人物开口推进。不增删事实，不动已给对白原文。「」内原文必须出现，禁止新人物新地点，禁止复读凑数。禁止套话「淡淡道」「嘴角微微」。"
                    )
                } else {
                    format!(
                        "{user0}\n\n上一稿未过审：{reason}\n请只重排已给的正史句子。「」内原文必须出现，禁止新人物新地点，禁止复读同一句或同一段。场面靠对白推进。禁止套话「淡淡道」「嘴角微微」。"
                    )
                };
            }
            Err(e) => {
                out.last_reason = polish_reject_reason(&FactReport::default(), 0, src_h, Some(&e.1));
                log_compose_event(
                    path,
                    "REJECT",
                    beat_i,
                    beat_n,
                    id,
                    attempt,
                    &out.last_reason,
                    None,
                    0,
                    src_h,
                    min_h,
                );
            }
        }
    }
    out
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
        switch: Arc::new(Mutex::new(())),
        data_root,
    };
    let api = Router::new()
        .route("/api/books", get(list_books).post(create_book))
        .route("/api/books/{name}", patch(patch_book).delete(delete_book))
        .route("/api/books/{name}/open", post(open_book))
        .route("/api/scenes/{id}", get(get_scene))
        .route("/api/setup-relations", get(list_setup_rels))
        .route(
            "/api/entities/{id}/relations",
            post(add_setup_rel),
        )
        .route(
            "/api/entities/{id}/relations/{rid}",
            delete(delete_setup_rel),
        )
        .route("/api/state", get(state))
        .route("/api/entities", post(add_entity))
        .route("/api/entities/delete", post(delete_entity))
        .route("/api/window", post(set_window))
        .route("/api/drafts/patch", post(patch_draft))
        .route("/api/clocks", post(set_clocks))
        .route("/api/presence", post(set_presence))
        .route("/api/commit", post(do_commit))
        .route("/api/constrain", post(do_constrain))
        .route("/api/world", get(get_world))
        .route("/api/coverage", get(get_coverage))
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
        .route("/api/beats/{id}/revise", post(revise_beat))
        .route("/api/dossier/{id}", get(get_dossier).post(save_dossier))
        .route("/api/occupancy", get(occupancy).post(occupancy_write_refuse))
        .route("/api/lens", post(set_lens))
        .route("/api/relations", get(relations_get).post(relations_write_refuse))
        .route("/api/circumstances", get(circumstances))
        .route("/api/search", get(search_entities))
        .route("/api/bridge", get(official_bridge).post(official_bridge_write_refuse))
        .route("/api/knows", get(knows_list))
        .route("/api/telling", post(set_telling))
        .route("/api/fill-live", post(fill_live))
        .route("/api/compose-chapter", post(compose_chapter))
        .route("/api/talk", get(get_talk).post(do_talk))
        .route("/api/plan-suggest", post(plan_suggest))
        .route("/api/plan-apply", post(plan_apply))
        .route("/api/paste/apply", post(paste_apply))
        .route("/api/select", post(select_item))
        .route("/api/promises", post(plant_promise))
        .route("/api/craft", get(get_craft).post(put_craft).put(put_craft))
        .route("/api/threads", get(list_threads).post(create_thread))
        .route("/api/threads/{id}", patch(patch_thread).delete(delete_thread))
        .route("/api/threads/{id}/track", get(thread_track))
        .route("/api/threads/progress", get(thread_progress))
        .route("/health", get(|| async { "ok" }))
        .layer(CorsLayer::permissive())
        .with_state(app);
    let router = if std::env::var("SETTING_WEB_DEV").is_ok() {
        api.fallback(proxy_vite)
    } else {
        let dist = web_dist();
        let index = dist.join("index.html");
        api.fallback_service(ServeDir::new(dist).not_found_service(ServeFile::new(index)))
    };
    let addr = std::env::var("SETTING_BIND").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind");
    eprintln!("setting-api {addr}");
    axum::serve(listener, router).await.expect("serve");
}

fn book_list_payload(root: &std::path::Path, g: &Inner) -> BookList {
    let mut books = disk_books(root);
    for k in g.books.keys() {
        if !books.contains(k) {
            books.push(k.clone());
        }
    }
    books.sort();
    let items = books.iter().map(|n| book_card(root, n)).collect();
    BookList {
        books,
        items,
        current: g.current.clone(),
    }
}

async fn list_books(State(app): State<App>) -> Json<BookList> {
    let g = app.inner.lock().await;
    Json(book_list_payload(&app.data_root, &g))
}

fn reveal_column(sess: &mut BookSess, display_ord: i64) {
    let idx = display_ord.max(0) as usize;
    let n = sess.n.max(1) as usize;
    if idx < sess.window_start {
        sess.window_start = idx;
    } else if idx >= sess.window_start + n {
        sess.window_start = idx + 1 - n;
    }
}

fn max_committed_clock(canon: &narra::services::world::Canon) -> i64 {
    canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .map(|b| b.clock_from)
        .max()
        .unwrap_or(0)
}

fn column_clock(
    columns: &[Column],
    selected_col: Option<&str>,
    window_start: usize,
) -> i64 {
    if let Some(id) = selected_col {
        if let Some(c) = columns.iter().find(|c| c.id == id) {
            return c.clock_from;
        }
    }
    columns
        .get(window_start)
        .or_else(|| columns.first())
        .map(|c| c.clock_from)
        .unwrap_or(0)
}

fn beat_to_draft(b: &Beat) -> BeatDraft {
    BeatDraft {
        id: Some(b.id.clone()),
        kind: b.kind.clone(),
        column_id: b.column_id.clone(),
        intent: b.intent.clone(),
        value_shift: b.value_shift.clone(),
        do_text: b.do_text.clone(),
        say_text: b.say_text.clone(),
        think_text: b.think_text.clone(),
        clock_from: b.clock_from,
        clock_to: b.clock_to,
        place_id: b.place_id.clone(),
        presences: b.presences.clone(),
        ..BeatDraft::default()
    }
}

fn column_moment_draft(canon: &Canon, col_id: &str, t: i64) -> BeatDraft {
    let beats: Vec<&Beat> = canon
        .beats
        .iter()
        .filter(|b| b.column_id == col_id && b.status == STATUS_COMMITTED)
        .collect();
    let mut presences: Vec<Presence> = vec![];
    let mut place_id = None;
    let mut intent = String::from("看这一刻");
    for b in &beats {
        if !b.intent.trim().is_empty() {
            intent = b.intent.clone();
        }
        if b.place_id.is_some() {
            place_id = b.place_id.clone();
        }
        for p in &b.presences {
            if !presences.iter().any(|x| x.entity_id == p.entity_id) {
                presences.push(p.clone());
            }
        }
    }
    let col = canon.columns.iter().find(|c| c.id == col_id);
    BeatDraft {
        intent,
        column_id: col_id.into(),
        clock_from: col.map(|c| c.clock_from).unwrap_or(t),
        clock_to: col.map(|c| c.clock_to).unwrap_or(t + 1),
        place_id,
        presences,
        ..BeatDraft::default()
    }
}

fn entity_by_id<'a>(canon: &'a Canon, id: &str) -> Option<&'a Entity> {
    canon
        .entities
        .iter()
        .find(|e| e.id == id || e.name == id)
}

fn entity_kind(canon: &Canon, id: &str) -> Option<String> {
    entity_by_id(canon, id).map(|e| e.kind.clone())
}

fn window_column_ids(columns: &[Column], start: usize, n: u8) -> HashSet<String> {
    let mut cols = columns.to_vec();
    cols.sort_by_key(|c| c.display_ord);
    cols.into_iter()
        .skip(start)
        .take((n.max(1)) as usize)
        .map(|c| c.id)
        .collect()
}

fn ids_on_beat(place_id: Option<&str>, presences: &[Presence]) -> HashSet<String> {
    let mut ids = HashSet::new();
    if let Some(p) = place_id {
        if !p.trim().is_empty() {
            ids.insert(p.to_string());
        }
    }
    for p in presences.iter().filter(|p| p.role == ROLE_PRESENT) {
        ids.insert(p.entity_id.clone());
    }
    ids
}

fn appearing_on(
    committed: &[Beat],
    drafts: &[UiDraft],
    col_ids: &HashSet<String>,
) -> HashSet<String> {
    let mut ids = HashSet::new();
    for b in committed
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED && col_ids.contains(&b.column_id))
    {
        ids.extend(ids_on_beat(b.place_id.as_deref(), &b.presences));
    }
    for d in drafts.iter().filter(|d| col_ids.contains(&d.draft.column_id)) {
        ids.extend(ids_on_beat(d.draft.place_id.as_deref(), &d.draft.presences));
    }
    ids
}

fn page_entities(canon: &Canon, drafts: &[UiDraft], start: usize, n: u8) -> Vec<Entity> {
    let page_cols = window_column_ids(&canon.columns, start, n);
    let on_page = appearing_on(&canon.beats, drafts, &page_cols);
    let all_cols: HashSet<String> = canon.columns.iter().map(|c| c.id.clone()).collect();
    let anywhere = appearing_on(&canon.beats, drafts, &all_cols);
    canon
        .entities
        .iter()
        .filter(|e| on_page.contains(&e.id) || !anywhere.contains(&e.id))
        .cloned()
        .collect()
}

fn present_of_kind(canon: &Canon, presences: &[Presence], kind: &str) -> Vec<String> {
    presences
        .iter()
        .filter(|p| p.role == ROLE_PRESENT)
        .filter(|p| entity_kind(canon, &p.entity_id).as_deref() == Some(kind))
        .map(|p| p.entity_id.clone())
        .collect()
}

fn refuse_empty_cast(
    canon: &Canon,
    presences: &[Presence],
    place_id: Option<&str>,
    removing: &str,
) -> Result<(), (StatusCode, String)> {
    let kind = entity_kind(canon, removing).unwrap_or_default();
    if kind == KIND_PERSON {
        let left = present_of_kind(canon, presences, KIND_PERSON)
            .into_iter()
            .filter(|id| id != removing)
            .count();
        if left == 0 {
            return Err((
                StatusCode::BAD_REQUEST,
                "场面不能拿掉最后一人".into(),
            ));
        }
    }
    if kind == KIND_PLACE {
        let other_presence = present_of_kind(canon, presences, KIND_PLACE)
            .into_iter()
            .any(|id| id != removing);
        let other_place = place_id
            .map(|p| !p.is_empty() && p != removing)
            .unwrap_or(false);
        if !other_presence && !other_place {
            return Err((StatusCode::BAD_REQUEST, "地点不能拿空".into()));
        }
    }
    Ok(())
}

fn paste_field_of(text: &str) -> String {
    classify_paste_field(text)
}

fn delete_canon_impacts(canon: &Canon, beat: &Beat) -> Vec<String> {
    let same_col_left = canon.beats.iter().any(|b| {
        b.id != beat.id
            && b.column_id == beat.column_id
            && b.status == STATUS_COMMITTED
    });
    let hole = if same_col_left {
        format!(
            "故事时间空洞：无（同列 {} 还有其他正史）",
            beat.column_id
        )
    } else {
        format!(
            "故事时间空洞：列 {} 的 {}–{} 将空",
            beat.column_id, beat.clock_from, beat.clock_to
        )
    };
    let later = canon
        .beats
        .iter()
        .filter(|b| {
            b.id != beat.id && b.status == STATUS_COMMITTED && b.clock_from >= beat.clock_to
        })
        .count();
    let later_s = if later == 0 {
        "后续场规定情境：无".into()
    } else {
        format!("后续场规定情境：后续 {later} 场仍声称成立，须重查穿帮")
    };
    let know_n = beat.knowledge_writes.len();
    let know = if know_n == 0
        && beat.do_text.as_deref().unwrap_or("").is_empty()
        && beat.say_text.as_deref().unwrap_or("").is_empty()
    {
        "知情：无".into()
    } else {
        format!("知情：本场 {know_n} 条知情写入及当场目击将不再进入算出这一刻")
    };
    let promises = if beat.promise_ops.is_empty() {
        "伏笔状态：无".into()
    } else {
        format!(
            "伏笔状态：本场 {} 条埋设/推进/兑现/作废将失去依据",
            beat.promise_ops.len()
        )
    };
    let pres: Vec<_> = beat
        .presences
        .iter()
        .filter(|p| p.role == ROLE_PRESENT)
        .map(|p| p.entity_id.as_str())
        .collect();
    let presence = if pres.is_empty() {
        "在场连续性：无".into()
    } else {
        format!("在场连续性：{}", pres.join("、"))
    };
    let deps = constrain::causal_dependents(canon, &beat.id);
    let cause = if deps.is_empty() {
        "因果缺口：无".into()
    } else {
        format!(
            "因果缺口：{} 指向这场",
            deps.iter()
                .map(|b| b.intent.as_str())
                .collect::<Vec<_>>()
                .join("、")
        )
    };
    vec![
        hole,
        later_s,
        cause,
        know,
        promises,
        presence,
        format!(
            "算出这一刻：须从 t={} 起重算",
            beat.clock_from
        ),
        format!(
            "第几次写入正史不重编号 / 该次写入作废（seq={}）",
            beat.commit_seq
        ),
    ]
}

fn delete_canon_suggestions() -> Vec<Suggestion> {
    vec![
        Suggestion {
            id: "empty_beat".into(),
            label: "空洞变空场：占时不演或待写".into(),
        },
        Suggestion {
            id: "ellipsis".into(),
            label: "空洞变省略场：有时长不演".into(),
        },
        Suggestion {
            id: "extend_neighbor".into(),
            label: "邻场扩展故事时间盖住空洞".into(),
        },
        Suggestion {
            id: "shift".into(),
            label: "后续列前移合上缺口".into(),
        },
        Suggestion {
            id: "leave_hole".into(),
            label: "删完停在空洞，手写补一场".into(),
        },
        Suggestion {
            id: "cancel".into(),
            label: "取消删除".into(),
        },
    ]
}

fn coverage_for(canon: &Canon) -> Vec<ColCoverage> {
    canon
        .columns
        .iter()
        .map(|c| {
            let beats: Vec<_> = canon
                .beats
                .iter()
                .filter(|b| b.column_id == c.id && b.status == STATUS_COMMITTED)
                .collect();
            let mut place = beats.iter().any(|b| {
                b.place_id
                    .as_ref()
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false)
            });
            let mut person = false;
            let mut thing = false;
            let mut faction = false;
            let mut promise = beats.iter().any(|b| !b.promise_ops.is_empty());
            for b in &beats {
                for p in b.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
                    match canon.entity(&p.entity_id).map(|e| e.kind.as_str()) {
                        Some("place") => place = true,
                        Some("person") => person = true,
                        Some("thing") => thing = true,
                        Some("faction") => faction = true,
                        Some("promise") => promise = true,
                        _ => {}
                    }
                }
                for d in &b.deltas {
                    match canon.entity(&d.entity_id).map(|e| e.kind.as_str()) {
                        Some("place") => place = true,
                        Some("thing") => thing = true,
                        Some("faction") => faction = true,
                        _ => {}
                    }
                }
            }
            ColCoverage {
                column_id: c.id.clone(),
                place,
                person,
                thing,
                faction,
                promise,
            }
        })
        .collect()
}

fn empty_shift_warn(kind: &str, value_shift: Option<&str>) -> bool {
    if kind == "ellipsis" {
        return false;
    }
    value_shift.map(|s| s.trim().is_empty()).unwrap_or(true)
}

fn shrink_suggestions() -> Vec<Suggestion> {
    vec![
        Suggestion { id: "shift_back".into(), label: "后续列前移合上缺口".into() },
        Suggestion { id: "merge_next".into(), label: "缺口并入下一列".into() },
        Suggestion { id: "spare".into(), label: "缺口变空场次".into() },
        Suggestion { id: "cancel".into(), label: "取消".into() },
    ]
}

fn invade_suggestions() -> Vec<Suggestion> {
    vec![
        Suggestion { id: "shift_back".into(), label: "后续列前移合上缺口".into() },
        Suggestion { id: "merge_next".into(), label: "缺口并入下一列".into() },
        Suggestion { id: "spare".into(), label: "缺口变空场次".into() },
        Suggestion { id: "compress".into(), label: "被侵入列压缩".into() },
        Suggestion { id: "shift".into(), label: "被侵入列整体后移".into() },
        Suggestion { id: "merge".into(), label: "两列合并".into() },
        Suggestion { id: "empty".into(), label: "重叠变空场或省略场".into() },
        Suggestion { id: "parallel".into(), label: "重叠变同列多场".into() },
        Suggestion { id: "cancel".into(), label: "取消".into() },
    ]
}

fn resize_pending(
    original: Vec<Column>,
    column_id: Option<String>,
    clock_to: Option<i64>,
) -> Result<Pending, (StatusCode, String)> {
    let mut cols = original.clone();
    cols.sort_by_key(|c| c.display_ord);
    let id = column_id
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "无列可改钟".into()))?;
    let i = cols
        .iter()
        .position(|c| c.id == id)
        .ok_or((StatusCode::BAD_REQUEST, "无此列".into()))?;
    let from = cols[i].clock_from;
    let old_to = cols[i].clock_to;
    let new_to = clock_to.ok_or((StatusCode::BAD_REQUEST, "须拖出新时长".into()))?;
    if new_to <= from {
        return Err((StatusCode::BAD_REQUEST, "时长须大于 0".into()));
    }
    if new_to == old_to {
        return Err((StatusCode::BAD_REQUEST, "钟未变".into()));
    }
    let next_from = cols.get(i + 1).map(|c| c.clock_from);
    let (op, suggestions, impacts) = if let Some(nf) = next_from {
        if new_to > nf {
            (
                "invade",
                invade_suggestions(),
                vec!["侵入邻列：未确认正史仍是拖前".into()],
            )
        } else if new_to < old_to {
            (
                "shrink",
                shrink_suggestions(),
                vec!["空出一段时间：未确认正史仍是拖前".into()],
            )
        } else {
            (
                "extend",
                vec![
                    Suggestion { id: "accept".into(), label: "接受该列新时长".into() },
                    Suggestion { id: "cancel".into(), label: "取消".into() },
                ],
                vec!["拉长但不进入邻列".into()],
            )
        }
    } else if new_to < old_to {
        (
            "shrink",
            vec![
                Suggestion { id: "spare".into(), label: "缺口变空场次".into() },
                Suggestion { id: "accept".into(), label: "接受该列新时长".into() },
                Suggestion { id: "cancel".into(), label: "取消".into() },
            ],
            vec!["末列缩短".into()],
        )
    } else {
        (
            "extend",
            vec![
                Suggestion { id: "accept".into(), label: "接受该列新时长".into() },
                Suggestion { id: "cancel".into(), label: "取消".into() },
            ],
            vec!["末列向未来延长".into()],
        )
    };
    let mut proposed = cols;
    proposed[i].clock_to = new_to;
    Ok(Pending {
        op: op.into(),
        suggestions,
        original_columns: original,
        proposed_columns: Some(proposed),
        target_beat: None,
        target_entity: None,
        target_column: Some(id),
        proposed_clock_to: Some(new_to),
        proposed_clock_from: None,
        follow: false,
        impacts,
    })
}

fn collect_warnings(
    committed: &[narra::services::world::Beat],
    drafts: &[UiDraft],
) -> Vec<BeatWarning> {
    let mut out = Vec::new();
    let mut rows: Vec<(i64, String, bool)> = Vec::new();
    for b in committed {
        let empty = empty_shift_warn(&b.kind, b.value_shift.as_deref());
        if empty {
            out.push(BeatWarning {
                beat_id: b.id.clone(),
                code: "empty_value_shift".into(),
                message: "未写转折".into(),
            });
        }
        rows.push((b.clock_from, b.id.clone(), empty));
    }
    for d in drafts {
        let empty = empty_shift_warn(&d.draft.kind, d.draft.value_shift.as_deref());
        if empty {
            out.push(BeatWarning {
                beat_id: d.id.clone(),
                code: "empty_value_shift".into(),
                message: "未写转折".into(),
            });
        }
        rows.push((d.draft.clock_from, d.id.clone(), empty));
    }
    rows.sort_by_key(|r| (r.0, r.1.clone()));
    for i in 1..rows.len() {
        if rows[i].2 && rows[i - 1].2 {
            out.push(BeatWarning {
                beat_id: rows[i].1.clone(),
                code: "consecutive_empty_shift".into(),
                message: "连续空转".into(),
            });
        }
    }
    out
}

async fn create_book(
    State(app): State<App>,
    Json(body): Json<CreateBook>,
) -> Result<Json<BookList>, (StatusCode, String)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "书名空".into()));
    }
    let gate = app.switch.lock().await;
    if book_db_path(&app.data_root, &name).exists() {
        return Err((StatusCode::CONFLICT, "书已存在，请打开书".into()));
    }
    // 先关旧引擎再开新库。v3 嵌式 RocksDB 两份叠着 init 会把 tokio
    // 工作线程堵死，POST /api/books 超过 e2e 的 book-label 等待。
    let stale = {
        let mut g = app.inner.lock().await;
        persist_and_take_all(&app.data_root, &mut g)
    };
    release_book_engines(stale).await;
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
    let mut craft = BookCraft::default();
    if let Some(p) = body.premise {
        craft.premise = p;
    }
    if let Some(lab) = body.clock_origin_label {
        craft.clock_origin_label = lab;
    }
    if let Some(m) = body.clock_origin_minute {
        craft.clock_origin_minute = m;
    }
    if let Some(fmt) = body.clock_format {
        craft.clock_format = fmt;
    }
    if craft.clock_origin_minute == 0 && !craft.clock_origin_label.trim().is_empty() {
        craft.clock_origin_minute = craft::parse_hm_offset(&craft.clock_origin_label);
    }
    persist_craft(&app.data_root, &name, &craft);
    update_meta_counts(&app.data_root, &name, 1, 0);
    let mut sess = empty_sess(book);
    sess.craft = craft;
    let mut g = app.inner.lock().await;
    g.books.insert(name.clone(), sess);
    g.current = Some(name);
    let payload = book_list_payload(&app.data_root, &g);
    drop(g);
    drop(gate);
    Ok(Json(payload))
}

async fn open_book(
    State(app): State<App>,
    Path(name): Path<String>,
) -> Result<Json<BookList>, (StatusCode, String)> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "书名空".into()));
    }
    let gate = app.switch.lock().await;
    let already = {
        let g = app.inner.lock().await;
        g.books.contains_key(&name)
    };
    if !already {
        if !book_db_path(&app.data_root, &name).exists() {
            return Err((StatusCode::NOT_FOUND, "无此书".into()));
        }
        let stale = {
            let mut g = app.inner.lock().await;
            persist_and_take_all(&app.data_root, &mut g)
        };
        release_book_engines(stale).await;
        let book = open_book_dir(&app.data_root, &name)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        let drafts = load_drafts(&app.data_root, &name);
        let canon = book
            .load_canon()
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let n = n_for_loaded_book(&canon, &drafts);
        let mut sess = empty_sess(book);
        sess.drafts = drafts;
        sess.n = n;
        sess.craft = load_craft(&app.data_root, &name);
        sess.threads = load_threads(&app.data_root, &name);
        let cols = canon.columns.len();
        let committed = canon
            .beats
            .iter()
            .filter(|b| b.status == STATUS_COMMITTED)
            .count();
        update_meta_counts(&app.data_root, &name, cols, committed);
        let mut g = app.inner.lock().await;
        g.books.insert(name.clone(), sess);
        g.current = Some(name.clone());
        drop(g);
    }
    drop(gate);
    let mut g = app.inner.lock().await;
    g.current = Some(name.clone());
    Ok(Json(book_list_payload(&app.data_root, &g)))
}

#[derive(Deserialize, Default)]
struct PatchBook {
    premise: Option<String>,
    clock_origin_label: Option<String>,
    clock_origin_minute: Option<i64>,
    clock_format: Option<String>,
    minutes_per_tick: Option<i64>,
    export_include_draft: Option<bool>,
    export_order: Option<String>,
    export_extras: Option<String>,
    chapters: Option<Vec<craft::CraftChapter>>,
}

#[derive(Deserialize, Default)]
struct ConfirmQ {
    confirm: Option<String>,
}

async fn patch_book(
    State(app): State<App>,
    Path(name): Path<String>,
    Json(body): Json<PatchBook>,
) -> Result<Json<BookCraft>, (StatusCode, String)> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "书名空".into()));
    }
    if !book_db_path(&app.data_root, &name).exists() {
        return Err((StatusCode::NOT_FOUND, "无此书".into()));
    }
    let mut craft = {
        let g = app.inner.lock().await;
        g.books
            .get(&name)
            .map(|s| s.craft.clone())
            .unwrap_or_else(|| load_craft(&app.data_root, &name))
    };
    if let Some(v) = body.premise {
        craft.premise = v;
    }
    if let Some(v) = body.clock_origin_label {
        craft.clock_origin_label = v;
    }
    if let Some(v) = body.clock_origin_minute {
        craft.clock_origin_minute = v;
    }
    if let Some(v) = body.clock_format {
        craft.clock_format = v;
    }
    if let Some(v) = body.minutes_per_tick {
        craft.minutes_per_tick = v;
    }
    if let Some(v) = body.export_include_draft {
        craft.export_include_draft = v;
    }
    if let Some(v) = body.export_order {
        craft.export_order = v;
    }
    if let Some(v) = body.export_extras {
        craft.export_extras = v;
    }
    if let Some(v) = body.chapters {
        craft.chapters = v;
    }
    if craft.clock_origin_minute == 0 && !craft.clock_origin_label.trim().is_empty() {
        craft.clock_origin_minute = craft::parse_hm_offset(&craft.clock_origin_label);
    }
    craft = craft::normalize(craft);
    persist_craft(&app.data_root, &name, &craft);
    let mut g = app.inner.lock().await;
    if let Some(sess) = g.books.get_mut(&name) {
        sess.craft = craft.clone();
    }
    Ok(Json(craft))
}

async fn delete_book(
    State(app): State<App>,
    Path(name): Path<String>,
    Query(q): Query<ConfirmQ>,
) -> Result<Json<BookList>, (StatusCode, String)> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "书名空".into()));
    }
    let confirm = q.confirm.unwrap_or_default();
    if confirm != name {
        return Err((
            StatusCode::BAD_REQUEST,
            "删书须带确认参数，须等于书名".into(),
        ));
    }
    let sess = {
        let _gate = app.switch.lock().await;
        let mut g = app.inner.lock().await;
        let sess = g.books.remove(&name);
        if g.current.as_deref() == Some(name.as_str()) {
            g.current = None;
        }
        sess
    };
    if let Some(sess) = sess {
        release_book_engine(sess).await;
    }
    let dir = app.data_root.join(&name);
    if dir.exists() {
        let d = dir.clone();
        tokio::task::spawn_blocking(move || std::fs::remove_dir_all(&d))
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }
    let g = app.inner.lock().await;
    Ok(Json(book_list_payload(&app.data_root, &g)))
}

async fn get_scene(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let caused: Vec<serde_json::Value> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED && b.cause_beat.as_deref() == Some(id.as_str()))
        .map(|b| {
            serde_json::json!({
                "id": b.id,
                "intent": b.intent,
                "status": "committed",
            })
        })
        .chain(sess.drafts.iter().filter(|d| d.draft.cause_beat.as_deref() == Some(id.as_str())).map(|d| {
            serde_json::json!({
                "id": d.id,
                "intent": d.draft.intent,
                "status": "draft",
            })
        }))
        .collect();
    if let Some(d) = sess.drafts.iter().find(|x| x.id == id) {
        return Ok(Json(serde_json::json!({
            "id": d.id,
            "title": d.title,
            "status": "draft",
            "draft": d.draft,
            "caused": caused,
            "clock_label": sess.craft.format_span(d.draft.clock_from, d.draft.clock_to),
        })));
    }
    let beat = canon
        .beats
        .iter()
        .find(|b| b.id == id && b.status == STATUS_COMMITTED)
        .ok_or((StatusCode::NOT_FOUND, "无此场".into()))?;
    Ok(Json(serde_json::json!({
        "id": beat.id,
        "title": beat.intent,
        "status": "committed",
        "beat": beat,
        "caused": caused,
        "clock_label": sess.craft.format_span(beat.clock_from, beat.clock_to),
    })))
}

#[derive(Deserialize)]
struct NewRel {
    kind: String,
    target: String,
    #[serde(default)]
    note: Option<String>,
}

fn entity_kind_of(canon: &Canon, id: &str) -> Option<String> {
    canon
        .entities
        .iter()
        .find(|e| e.id == id || e.name == id)
        .map(|e| e.kind.clone())
}

fn resolve_ent(canon: &Canon, id: &str) -> Option<String> {
    canon
        .entities
        .iter()
        .find(|e| e.id == id || e.name == id)
        .map(|e| e.id.clone())
}

async fn list_setup_rels(
    State(app): State<App>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    Ok(Json(serde_json::json!({
        "relations": load_rels(&app.data_root, &name),
    })))
}

async fn add_setup_rel(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(body): Json<NewRel>,
) -> Result<Json<SetupRel>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let from = resolve_ent(&canon, &id).ok_or((StatusCode::NOT_FOUND, "无此元素".into()))?;
    let to = resolve_ent(&canon, &body.target).ok_or((StatusCode::NOT_FOUND, "无此对象".into()))?;
    let from_kind = entity_kind_of(&canon, &from).unwrap_or_default();
    let to_kind = entity_kind_of(&canon, &to).unwrap_or_default();
    if !rel_allowed(&body.kind, &from_kind, &to_kind) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("关系类型不合法：{} 不能 {} {}", from_kind, body.kind, to_kind),
        ));
    }
    drop(g);
    let mut rels = load_rels(&app.data_root, &name);
    let rid = format!(
        "r{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let rel = SetupRel {
        id: rid,
        kind: body.kind,
        from,
        to,
        note: body.note.unwrap_or_default(),
    };
    rels.push(rel.clone());
    persist_rels(&app.data_root, &name, &rels);
    Ok(Json(rel))
}

async fn delete_setup_rel(
    State(app): State<App>,
    Path((id, rid)): Path<(String, String)>,
    Query(q): Query<ConfirmQ>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    drop(g);
    let _ = id;
    let _ = q;
    let mut rels = load_rels(&app.data_root, &name);
    let n = rels.len();
    rels.retain(|r| r.id != rid);
    if rels.len() == n {
        return Err((StatusCode::NOT_FOUND, "无此关系".into()));
    }
    persist_rels(&app.data_root, &name, &rels);
    Ok(Json(serde_json::json!({"ok": true, "id": rid})))
}

async fn snapshot(sess: &BookSess, name: &str, data_root: &std::path::Path) -> Result<UiState, String> {
    let canon = sess.book.load_canon().await.map_err(|e| e.to_string())?;
    let coverage = coverage_for(&canon);
    let t = column_clock(
        &canon.columns,
        sess.selected_col.as_deref(),
        sess.window_start,
    );
    let (world, world_error) = match sess.book.world_at(t, None).await {
        Ok(w) => (Some(w), None),
        Err(e) => (
            None,
            Some(format!("算出这一刻失败：{e}。不会改去问模型现在世界怎样。")),
        ),
    };
    let committed: Vec<_> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .cloned()
        .collect();
    let warnings = collect_warnings(&committed, &sess.drafts);
    let mut columns = canon.columns.clone();
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
        entities: page_entities(&canon, &sess.drafts, sess.window_start, sess.n),
        committed,
        drafts: sess.drafts.clone(),
        world,
        world_error,
        pending: sess.pending.clone(),
        selected: sess.selected.clone(),
        selected_canon: sess.selected_canon.clone(),
        selected_col: sess.selected_col.clone(),
        coverage,
        warnings,
        paste_suggestions: sess.paste_suggestions.clone(),
        fill_pending: sess.fill_pending.clone(),
        lens_person: sess.lens_person.clone(),
        people: canon
            .entities
            .iter()
            .filter(|e| e.kind == KIND_PERSON)
            .cloned()
            .collect(),
        craft: sess.craft.clone(),
        talk_log: {
            let id = sess
                .selected
                .clone()
                .or_else(|| sess.selected_canon.clone())
                .unwrap_or_default();
            if id.is_empty() {
                vec![]
            } else {
                read_talk_lines(data_root, name, &id)
            }
        },
        all_entities: canon.entities.clone(),
        promises: canon.promises.clone(),
        threads: sess.threads.clone(),
    })
}

async fn state(State(app): State<App>) -> Result<Json<UiState>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let st = snapshot(sess, &name, &app.data_root)
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let mut profile = body.profile.unwrap_or_default();
    if let Some(a) = body.aliases {
        if !a.trim().is_empty() {
            profile.insert("aliases".into(), a);
        }
    }
    sess.book
        .upsert_entity(&Entity {
            id: body.id,
            kind: body.kind,
            name: body.name,
            profile,
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
        let canon = sess
            .book
            .load_canon()
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let max_start = canon.columns.len().saturating_sub(1);
        sess.window_start = s.min(max_start);
    }
    Ok(Json(serde_json::json!({"n": sess.n, "start": sess.window_start})))
}

async fn patch_draft(
    State(app): State<App>,
    Json(body): Json<PatchDraft>,
) -> Result<Json<BeatDraft>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
            if !f.tracks.is_empty() {
                d.draft.tracks = f.tracks;
            }
            apply_track_flatten(&mut d.draft);
            sess.fill_pending = None;
        }
    }
    if let Some(v) = body.title {
        d.title = v;
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
    if let Some(v) = body.deltas {
        d.draft.deltas = v;
    }
    if let Some(v) = body.knowledge_writes {
        d.draft.knowledge_writes = v;
    }
    if let Some(v) = body.promise_ops {
        d.draft.promise_ops = v;
    }
    if let Some(v) = body.cause_beat {
        d.draft.cause_beat = if v.trim().is_empty() {
            None
        } else {
            Some(v)
        };
    }
    if let Some(v) = body.tracks {
        d.draft.tracks = v;
        apply_track_flatten(&mut d.draft);
    }
    if let Some(v) = body.clock_from {
        d.draft.clock_from = v;
    }
    if let Some(v) = body.clock_to {
        d.draft.clock_to = v;
    }
    if let Some(v) = body.story_threads {
        d.draft.story_threads = v;
    }
    sess.selected = Some(body.id.clone());
    let out = d.draft.clone();
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(out))
}

async fn set_clocks(
    State(app): State<App>,
    Json(body): Json<ClockReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if body.clock_to <= body.clock_from {
        return Err((StatusCode::BAD_REQUEST, "时长须大于 0".into()));
    }
    let follow = body.follow.unwrap_or(true);
    let mut g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    if body.draft {
        let old_to = {
            let d = sess
                .drafts
                .iter()
                .find(|x| x.id == body.id)
                .ok_or((StatusCode::BAD_REQUEST, "无此草稿".into()))?;
            d.draft.clock_to
        };
        let delta = {
            let d = sess.drafts.iter_mut().find(|x| x.id == body.id).unwrap();
            let delta = body.clock_from - d.draft.clock_from;
            d.draft.clock_from = body.clock_from;
            d.draft.clock_to = body.clock_to;
            delta
        };
        if follow && delta != 0 {
            for o in sess.drafts.iter_mut() {
                if o.id != body.id && o.draft.clock_from >= old_to {
                    o.draft.clock_from += delta;
                    o.draft.clock_to += delta;
                }
            }
        }
        persist_drafts(&app.data_root, &name, &sess.drafts);
    } else {
        let canon = sess
            .book
            .load_canon()
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let beat = canon
            .beats
            .iter()
            .find(|b| b.id == body.id && b.status == STATUS_COMMITTED)
            .ok_or((StatusCode::BAD_REQUEST, "无此正史".into()))?;
        let old_to = beat.clock_to;
        let delta = body.clock_from - beat.clock_from;
        sess.book
            .set_beat_clocks(&body.id, body.clock_from, body.clock_to)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if follow && delta != 0 {
            let later: Vec<(String, i64, i64)> = canon
                .beats
                .iter()
                .filter(|b| {
                    b.id != body.id && b.status == STATUS_COMMITTED && b.clock_from >= old_to
                })
                .map(|b| (b.id.clone(), b.clock_from + delta, b.clock_to + delta))
                .collect();
            for (id, a, b) in later {
                sess.book
                    .set_beat_clocks(&id, a, b)
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            }
            for o in sess.drafts.iter_mut() {
                if o.draft.clock_from >= old_to {
                    o.draft.clock_from += delta;
                    o.draft.clock_to += delta;
                }
            }
            persist_drafts(&app.data_root, &name, &sess.drafts);
        }
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn set_presence(
    State(app): State<App>,
    Json(body): Json<PresenceReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let kind = entity_kind(&canon, &body.entity_id).unwrap_or_default();
    if kind == KIND_RULE {
        return Err((
            StatusCode::BAD_REQUEST,
            "规则不能拖进场，请去档案".into(),
        ));
    }
    if let Some(canon_id) = &body.canon_id {
        let beat = canon
            .beats
            .iter()
            .find(|b| b.id == *canon_id && b.status == STATUS_COMMITTED)
            .ok_or((StatusCode::BAD_REQUEST, "无此正史".into()))?;
        if body.action == "add" {
            sess.pending = Some(Pending {
                op: "add_presence".into(),
                suggestions: vec![
                    Suggestion {
                        id: "add".into(),
                        label: format!("给本场加上 {}", body.entity_id),
                    },
                    Suggestion {
                        id: "cancel".into(),
                        label: "取消".into(),
                    },
                ],
                original_columns: canon.columns.clone(),
                proposed_columns: None,
                target_beat: Some(canon_id.clone()),
                target_entity: Some(body.entity_id.clone()),
                target_column: None,
                proposed_clock_to: None,
                proposed_clock_from: None,
                follow: false,
                impacts: vec!["在场连续性".into(), "算出这一刻".into(), "第几次写入正史不变".into()],
            });
            return Ok(Json(serde_json::json!({"need_confirm": true, "op": "add_presence"})));
        }
        if body.action != "remove" {
            return Err((StatusCode::BAD_REQUEST, "正史在场须确认变更".into()));
        }
        refuse_empty_cast(
            &canon,
            &beat.presences,
            beat.place_id.as_deref(),
            &body.entity_id,
        )?;
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
            proposed_clock_to: None,
            proposed_clock_from: None,
            follow: false,
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
            if kind == KIND_PLACE {
                d.draft.presences.retain(|p| {
                    entity_kind(&canon, &p.entity_id).as_deref() != Some(KIND_PLACE)
                });
                d.draft.place_id = Some(body.entity_id.clone());
            }
            if !d.draft.presences.iter().any(|p| p.entity_id == body.entity_id) {
                d.draft.presences.push(Presence {
                    entity_id: body.entity_id.clone(),
                    beat_id: d.id.clone(),
                    role: ROLE_PRESENT.into(),
                });
            }
        }
        "remove" => {
            refuse_empty_cast(
                &canon,
                &d.draft.presences,
                d.draft.place_id.as_deref(),
                &body.entity_id,
            )?;
            d.draft.presences.retain(|p| p.entity_id != body.entity_id);
            if d.draft.place_id.as_deref() == Some(body.entity_id.as_str()) {
                d.draft.place_id = None;
            }
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let pos = sess
        .drafts
        .iter()
        .position(|d| d.id == body.id)
        .ok_or((StatusCode::BAD_REQUEST, "无此草稿".into()))?;
    let ui = sess.drafts.remove(pos);
    let report = match sess.book.constrain_draft(&ui.draft).await {
        Ok(r) => r,
        Err(e) => {
            sess.drafts.insert(pos, ui);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
        }
    };
    if report.blocks() {
        sess.drafts.insert(pos, ui);
        let msg = report
            .findings
            .iter()
            .filter(|f| f.grade == constrain::Grade::Strict)
            .map(|f| f.message.clone())
            .collect::<Vec<_>>()
            .join("；");
        return Err((StatusCode::BAD_REQUEST, msg));
    }
    let warnings: Vec<String> = report
        .findings
        .iter()
        .filter(|f| f.grade != constrain::Grade::Strict)
        .map(|f| f.message.clone())
        .collect();
    match sess.book.commit(ui.draft.clone()).await {
        Ok(b) => {
            mark_later_filled_stale(&mut sess.drafts, b.clock_from);
            persist_drafts(&app.data_root, &name, &sess.drafts);
            set_last_intent(&app.data_root, &name, &b.intent);
            Ok(Json(serde_json::json!({
            "ok": true,
            "id": b.id,
            "seq": b.commit_seq,
            "column_id": b.column_id,
            "clock_from": b.clock_from,
            "clock_to": b.clock_to,
            "presences": b.presences,
            "warnings": warnings,
            "auto_canon": false,
        })))
        }
        Err(e) => {
            let existed = match sess.book.load_canon().await {
                Ok(canon) => canon.beats.into_iter().find(|b| {
                    b.status == STATUS_COMMITTED
                        && (b.id == ui.id || ui.draft.id.as_deref() == Some(b.id.as_str()))
                }),
                Err(_) => None,
            };
            if let Some(b) = existed {
                persist_drafts(&app.data_root, &name, &sess.drafts);
                set_last_intent(&app.data_root, &name, &b.intent);
                return Ok(Json(serde_json::json!({
                    "ok": true,
                    "id": b.id,
                    "seq": b.commit_seq,
                    "column_id": b.column_id,
                    "clock_from": b.clock_from,
                    "clock_to": b.clock_to,
                    "presences": b.presences,
                    "warnings": warnings,
                    "auto_canon": false,
                    "idempotent": true,
                })));
            }
            sess.drafts.insert(pos, ui);
            Err((StatusCode::BAD_REQUEST, e.to_string()))
        }
    }
}

async fn do_constrain(
    State(app): State<App>,
    Json(body): Json<CommitReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let ui = sess
        .drafts
        .iter()
        .find(|d| d.id == body.id)
        .ok_or((StatusCode::BAD_REQUEST, "无此草稿".into()))?;
    let report = sess
        .book
        .constrain_draft(&ui.draft)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({
        "findings": report.findings,
        "blocks": report.blocks(),
    })))
}

async fn get_world(
    State(app): State<App>,
    Query(q): Query<WorldQ>,
) -> Result<Json<World>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let t = if let Some(t) = q.t {
        t
    } else {
        let canon = sess
            .book
            .load_canon()
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        column_clock(
            &canon.columns,
            sess.selected_col.as_deref(),
            sess.window_start,
        )
    };
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let occupied = canon
        .beats
        .iter()
        .any(|b| b.column_id == last.id && b.status == STATUS_COMMITTED)
        || sess.drafts.iter().any(|d| d.draft.column_id == last.id);
    let col = if occupied {
        let next = last.display_ord + 1;
        let c = Column {
            id: format!("col{next}"),
            clock_from: last.clock_to,
            clock_to: last.clock_to + 60,
            display_ord: next,
        };
        sess.book
            .upsert_column(&c)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        c
    } else {
        last
    };
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
            column_id: col.id.clone(),
            intent: intent.clone(),
            value_shift: None,
            clock_from: col.clock_from,
            clock_to: col.clock_to,
            place_id: body
                .get("place_id")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            presences: vec![],
            ..BeatDraft::default()
        },
        ..Default::default()
    });
    sess.selected = Some(id.clone());
    reveal_column(sess, col.display_ord);
    persist_drafts(&app.data_root, &name, &sess.drafts);
    set_last_intent(&app.data_root, &name, &intent);
    Ok(Json(serde_json::json!({
        "id": id,
        "appended_last": true,
        "column_id": col.id,
        "new_column": occupied,
    })))
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let clock_from = body
        .get("clock_from")
        .and_then(|v| v.as_i64())
        .unwrap_or(c.clock_from);
    let clock_to = body
        .get("clock_to")
        .and_then(|v| v.as_i64())
        .unwrap_or(c.clock_to);
    sess.drafts.push(UiDraft {
        id: id.clone(),
        title: "并列".into(),
        draft: BeatDraft {
            id: Some(id.clone()),
            kind: "scene".into(),
            column_id: c.id.clone(),
            intent: intent.clone(),
            value_shift: None,
            clock_from,
            clock_to,
            place_id,
            ..BeatDraft::default()
        },
        ..Default::default()
    });
    sess.selected = Some(id.clone());
    persist_drafts(&app.data_root, &name, &sess.drafts);
    set_last_intent(&app.data_root, &name, &intent);
    Ok(Json(serde_json::json!({"id": id, "column_id": c.id, "clock_from": c.clock_from, "clock_to": c.clock_to})))
}

async fn select_item(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    if let Some(col) = body.get("column_id").and_then(|v| v.as_str()) {
        sess.selected_col = if col.is_empty() {
            None
        } else {
            Some(col.to_string())
        };
    }
    if body.get("draft_id").is_some() || body.get("canon_id").is_some() {
        sess.selected = body
            .get("draft_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        sess.selected_canon = body
            .get("canon_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
    }
    Ok(Json(serde_json::json!({
        "selected": sess.selected,
        "selected_canon": sess.selected_canon,
        "selected_col": sess.selected_col,
    })))
}

async fn get_coverage(
    State(app): State<App>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "coverage": coverage_for(&canon) })))
}

async fn occupancy_write_refuse() -> (StatusCode, String) {
    (
        StatusCode::BAD_REQUEST,
        "出场飞出层只读，改在场须拖标记".into(),
    )
}

async fn official_bridge_write_refuse() -> (StatusCode, String) {
    (
        StatusCode::BAD_REQUEST,
        "官方表不能冒充写入正史，请回分场条点写入正史".into(),
    )
}

async fn set_lens(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let person = body
        .get("person")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    sess.lens_person = person.clone();
    Ok(Json(serde_json::json!({"lens_person": person})))
}

async fn relations_write_refuse() -> (StatusCode, String) {
    (
        StatusCode::BAD_REQUEST,
        "连线只读，改正史回分场条".into(),
    )
}

#[derive(Deserialize)]
struct RelQ {
    person: Option<String>,
}

async fn relations_get(
    State(app): State<App>,
    Query(q): Query<RelQ>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let person = q
        .person
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or(sess.lens_person.as_deref())
        .ok_or((StatusCode::BAD_REQUEST, "先选一个人".into()))?
        .to_string();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let t = column_clock(
        &canon.columns,
        sess.selected_col.as_deref(),
        sess.window_start,
    );
    let world = sess
        .book
        .world_at(t, None)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let (nodes, edges) = relations::relations_for(&canon, &world, &person);
    Ok(Json(serde_json::json!({
        "readonly": true,
        "person": person,
        "t": world.t,
        "nodes": nodes,
        "edges": edges,
        "where": world.r#where,
    })))
}

#[derive(Deserialize)]
struct ExportQ {
    #[serde(default)]
    canon_only: Option<String>,
    #[serde(default)]
    from_col: Option<String>,
    #[serde(default)]
    to_col: Option<String>,
    #[serde(default)]
    chapter: Option<String>,
    #[serde(default)]
    order: Option<String>,
    #[serde(default)]
    include: Option<String>,
}

async fn get_craft(State(app): State<App>) -> Result<Json<BookCraft>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g
        .books
        .get(&name)
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    Ok(Json(sess.craft.clone()))
}

async fn put_craft(
    State(app): State<App>,
    Json(body): Json<BookCraft>,
) -> Result<Json<BookCraft>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g
        .books
        .get_mut(&name)
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let craft = craft::normalize(body);
    persist_craft(&app.data_root, &name, &craft);
    sess.craft = craft.clone();
    Ok(Json(craft))
}

#[derive(Deserialize)]
struct NewThread {
    name: String,
    #[serde(rename = "type", default)]
    thread_type: Option<String>,
    color: Option<u8>,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Deserialize)]
struct PatchThread {
    name: Option<String>,
    #[serde(rename = "type")]
    thread_type: Option<String>,
    color: Option<u8>,
    description: Option<String>,
}

async fn list_threads(State(app): State<App>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    Ok(Json(serde_json::json!({ "threads": sess.threads })))
}

async fn create_thread(
    State(app): State<App>,
    Json(body): Json<NewThread>,
) -> Result<Json<StoryThread>, (StatusCode, String)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "线名空".into()));
    }
    let kind = body.thread_type.unwrap_or_else(|| "支线".into());
    if kind != "主线" && kind != "支线" {
        return Err((StatusCode::BAD_REQUEST, "类型只有主线或支线".into()));
    }
    let mut g = app.inner.lock().await;
    let book = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&book).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    if sess.threads.iter().any(|t| t.name == name) {
        return Err((StatusCode::BAD_REQUEST, "已有同名逻辑线".into()));
    }
    let color = if kind == "主线" {
        0
    } else {
        body.color.unwrap_or_else(|| next_thread_color(&sess.threads)) % 6
    };
    let id = format!(
        "t{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let thread = StoryThread {
        id,
        name,
        color,
        thread_type: kind,
        description: body.description.unwrap_or_default(),
    };
    sess.threads.push(thread.clone());
    persist_threads(&app.data_root, &book, &sess.threads);
    Ok(Json(thread))
}

async fn patch_thread(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(body): Json<PatchThread>,
) -> Result<Json<StoryThread>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let book = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&book).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let t = sess
        .threads
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or((StatusCode::NOT_FOUND, "无此逻辑线".into()))?;
    if let Some(n) = body.name {
        let n = n.trim().to_string();
        if n.is_empty() {
            return Err((StatusCode::BAD_REQUEST, "线名空".into()));
        }
        t.name = n;
    }
    if let Some(k) = body.thread_type {
        if k != "主线" && k != "支线" {
            return Err((StatusCode::BAD_REQUEST, "类型只有主线或支线".into()));
        }
        t.thread_type = k;
    }
    if let Some(c) = body.color {
        if t.thread_type != "主线" {
            t.color = c % 6;
        }
    }
    if let Some(d) = body.description {
        t.description = d;
    }
    let out = t.clone();
    persist_threads(&app.data_root, &book, &sess.threads);
    Ok(Json(out))
}

async fn delete_thread(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let book = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&book).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    if !sess.threads.iter().any(|t| t.id == id) {
        return Err((StatusCode::NOT_FOUND, "无此逻辑线".into()));
    }
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let committed: Vec<_> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .cloned()
        .collect();
    let hung = thread_hung_on(&committed, &sess.drafts, &id);
    if !hung.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("还有场挂着这条线：{}", hung.join("、")),
        ));
    }
    sess.threads.retain(|t| t.id != id);
    persist_threads(&app.data_root, &book, &sess.threads);
    Ok(Json(serde_json::json!({"ok": true, "id": id})))
}

fn beats_on_thread(
    committed: &[Beat],
    drafts: &[UiDraft],
    id: &str,
) -> Vec<(i64, i64, String, String, String, String, bool)> {
    let mut rows = Vec::new();
    for b in committed {
        if let Some(st) = b.story_threads.iter().find(|t| t.id == id) {
            rows.push((
                b.clock_from,
                b.commit_seq,
                b.id.clone(),
                b.column_id.clone(),
                b.intent.clone(),
                if st.role.is_empty() { "推进".into() } else { st.role.clone() },
                true,
            ));
        }
    }
    for d in drafts {
        if let Some(st) = d.draft.story_threads.iter().find(|t| t.id == id) {
            rows.push((
                d.draft.clock_from,
                0,
                d.id.clone(),
                d.draft.column_id.clone(),
                d.draft.intent.clone(),
                if st.role.is_empty() { "推进".into() } else { st.role.clone() },
                false,
            ));
        }
    }
    rows.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    rows
}

async fn thread_track(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let book = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&book).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let thread = sess
        .threads
        .iter()
        .find(|t| t.id == id)
        .cloned()
        .ok_or((StatusCode::NOT_FOUND, "无此逻辑线".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let committed: Vec<_> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .cloned()
        .collect();
    let rows = beats_on_thread(&committed, &sess.drafts, &id);
    let first = rows.first().map(|r| r.2.clone());
    let last = rows.last().map(|r| r.2.clone());
    let beats: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.2,
                "column_id": r.3,
                "clock_from": r.0,
                "intent": r.4,
                "role": r.5,
                "canon": r.6,
                "enter": first.as_ref() == Some(&r.2),
                "exit": last.as_ref() == Some(&r.2),
            })
        })
        .collect();
    Ok(Json(serde_json::json!({
        "thread": thread,
        "beats": beats,
    })))
}

async fn thread_progress(
    State(app): State<App>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let book = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&book).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let committed: Vec<_> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .cloned()
        .collect();
    let sorted = craft::sorted_chapters(&sess.craft, &canon.columns);
    let chapters: Vec<(i64, String)> = if sorted.is_empty() {
        vec![(
            canon.columns.first().map(|c| c.display_ord).unwrap_or(0),
            "全书".into(),
        )]
    } else {
        sorted
            .into_iter()
            .map(|(ord, ch)| (ord, ch.title.clone()))
            .collect()
    };
    let mut lines = sess.threads.clone();
    lines.sort_by(|a, b| {
        let ak = if a.thread_type == "主线" { 0 } else { 1 };
        let bk = if b.thread_type == "主线" { 0 } else { 1 };
        ak.cmp(&bk).then(a.name.cmp(&b.name))
    });
    let mut cells = Vec::new();
    for th in &lines {
        let rows = beats_on_thread(&committed, &sess.drafts, &th.id);
        for (i, (from_ord, title)) in chapters.iter().enumerate() {
            let next = chapters.get(i + 1).map(|(ord, _)| *ord);
            let in_ch = |col: &str| {
                let ord = canon
                    .columns
                    .iter()
                    .find(|c| c.id == col)
                    .map(|c| c.display_ord)
                    .unwrap_or(0);
                ord >= *from_ord && next.map(|n| ord < n).unwrap_or(true)
            };
            let count = rows.iter().filter(|r| in_ch(&r.3)).count();
            if count > 0 {
                let first = rows.iter().find(|r| in_ch(&r.3));
                cells.push(serde_json::json!({
                    "line": th.id,
                    "chapter": title,
                    "count": count,
                    "beat_id": first.map(|r| r.2.clone()),
                    "column_id": first.map(|r| r.3.clone()),
                }));
            }
        }
    }
    let unassigned = committed
        .iter()
        .filter(|b| b.story_threads.is_empty())
        .count()
        + sess
            .drafts
            .iter()
            .filter(|d| d.draft.story_threads.is_empty())
            .count();
    Ok(Json(serde_json::json!({
        "lines": lines,
        "chapters": chapters.iter().map(|(_, t)| t.clone()).collect::<Vec<_>>(),
        "cells": cells,
        "unassigned": unassigned,
    })))
}

async fn export_md(
    State(app): State<App>,
    Query(q): Query<ExportQ>,
) -> Result<String, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let canon_only = matches!(
        q.canon_only.as_deref(),
        Some("1") | Some("true") | Some("yes")
    ) || matches!(q.include.as_deref(), Some("canon") | Some("canon_only"));
    let from_ord = q.from_col.as_ref().and_then(|id| {
        canon
            .columns
            .iter()
            .find(|c| &c.id == id)
            .map(|c| c.display_ord)
    });
    let to_ord = q.to_col.as_ref().and_then(|id| {
        canon
            .columns
            .iter()
            .find(|c| &c.id == id)
            .map(|c| c.display_ord)
    });
    let chapter_cols: Option<HashSet<String>> = q.chapter.as_ref().map(|ch| {
        craft::sorted_chapters(&sess.craft, &canon.columns)
            .into_iter()
            .find(|(_, c)| c.id == *ch || c.title == *ch)
            .map(|(_, start)| {
                let start_ord = canon
                    .columns
                    .iter()
                    .find(|c| c.id == start.start_column)
                    .map(|c| c.display_ord)
                    .unwrap_or(0);
                let next_ord = craft::sorted_chapters(&sess.craft, &canon.columns)
                    .into_iter()
                    .filter_map(|(o, _)| if o > start_ord { Some(o) } else { None })
                    .min();
                canon
                    .columns
                    .iter()
                    .filter(|c| {
                        c.display_ord >= start_ord
                            && next_ord.map(|n| c.display_ord < n).unwrap_or(true)
                    })
                    .map(|c| c.id.clone())
                    .collect()
            })
            .unwrap_or_default()
    });
    let in_range = |col_id: &str| -> bool {
        if let Some(set) = &chapter_cols {
            if !set.contains(col_id) {
                return false;
            }
        }
        let ord = canon
            .columns
            .iter()
            .find(|c| c.id == col_id)
            .map(|c| c.display_ord);
        if let (Some(f), Some(o)) = (from_ord, ord) {
            if o < f {
                return false;
            }
        }
        if let (Some(t), Some(o)) = (to_ord, ord) {
            if o > t {
                return false;
            }
        }
        true
    };
    let mut rows: Vec<ExportBeat> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED && in_range(&b.column_id))
        .map(|b| {
            let kind = if b.kind == "ellipsis" { "省略场" } else { "场" };
            ExportBeat {
                column_id: b.column_id.clone(),
                clock: b.clock_from,
                telling: b.telling_ord.unwrap_or(b.commit_seq),
                seq: b.commit_seq,
                block: format!(
                    "## {kind} · {}\n状态：正史\n本场任务：{}\n地点：{}\n价值转折：{}\n动作：{}\n对白：{}\n内心：{}\n\n",
                    b.intent,
                    b.intent,
                    b.place_id.as_deref().unwrap_or("（未标）"),
                    b.value_shift.as_deref().unwrap_or("（无）"),
                    clip_export_field(b.do_text.as_deref().unwrap_or(""), 40),
                    clip_export_field(b.say_text.as_deref().unwrap_or(""), 40),
                    clip_export_field(b.think_text.as_deref().unwrap_or(""), 40),
                ),
            }
        })
        .collect();
    if !canon_only {
        for d in &sess.drafts {
            let b = &d.draft;
            if !in_range(&b.column_id) {
                continue;
            }
            rows.push(ExportBeat {
                column_id: b.column_id.clone(),
                clock: b.clock_from,
                telling: b.telling_ord.unwrap_or(i64::MAX),
                seq: i64::MAX,
                block: format!(
                    "## 草稿 · {}\n状态：草稿\n本场任务：{}\n地点：{}\n价值转折：{}\n动作：{}\n对白：{}\n内心：{}\n\n",
                    b.intent,
                    b.intent,
                    b.place_id.as_deref().unwrap_or("（未标）"),
                    b.value_shift.as_deref().unwrap_or("（无）"),
                    clip_export_field(b.do_text.as_deref().unwrap_or(""), 40),
                    clip_export_field(b.say_text.as_deref().unwrap_or(""), 40),
                    clip_export_field(b.think_text.as_deref().unwrap_or(""), 40),
                ),
            });
        }
    }
    let reading = match q.order.as_deref() {
        Some("telling") | Some("reading") | Some("read") => true,
        Some("story") | Some("clock") => false,
        _ => sess.reading_order,
    };
    Ok(craft::export_markdown(
        &name,
        &sess.craft,
        &canon.columns,
        rows,
        reading,
    ))
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let people: Vec<String> = suggested
        .presences
        .iter()
        .filter(|p| p.role == ROLE_PRESENT)
        .map(|p| p.entity_id.clone())
        .collect();
    if people.is_empty() {
        suggested.do_text = Some(format!("（假模型）为「{}」走了一步", suggested.intent));
        suggested.say_text = Some("东西呢。".into());
        suggested.think_text = Some("不能丢。".into());
    } else {
        suggested.tracks = people
            .iter()
            .enumerate()
            .map(|(i, pid)| PersonTrack {
                person_id: pid.clone(),
                do_text: if i == 0 {
                    Some(format!("（假模型）为「{}」走了一步", suggested.intent))
                } else {
                    None
                },
                say_text: if i == 0 {
                    Some("东西呢。".into())
                } else {
                    None
                },
                think_text: if i == 0 {
                    Some("不能丢。".into())
                } else {
                    None
                },
            })
            .collect();
        apply_track_flatten(&mut suggested);
    }
    sess.fill_pending = Some(suggested.clone());
    persist_drafts(&app.data_root, &name, &sess.drafts);
    let pkt_json = serde_json::to_value(&pkt).unwrap_or(serde_json::json!({}));
    Ok(Json(serde_json::json!({
        "do_text": suggested.do_text,
        "say_text": suggested.say_text,
        "think_text": suggested.think_text,
        "tracks": suggested.tracks,
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let p = Promise {
        id: body
            .get("id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                format!(
                    "p{}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis())
                        .unwrap_or(0)
                )
            }),
        name: body
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("未命名伏笔")
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
            .unwrap_or_default(),
        plant_clock: body.get("plant_clock").and_then(|v| v.as_i64()).or(Some(0)),
        deadline_clock: body
            .get("deadline_clock")
            .and_then(|v| v.as_i64())
            .or(Some(180)),
        red_herring: body
            .get("red_herring")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    };
    sess.book
        .upsert_promise(&p)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = invalidate_interval(sess.book.db().as_ref(), p.deadline_clock.unwrap_or(0)).await;
    Ok(Json(serde_json::json!({"ok": true, "id": p.id, "auto_canon": false})))
}

async fn structure_preview(
    State(app): State<App>,
    Json(body): Json<StructPreview>,
) -> Result<Json<Pending>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
            proposed_clock_to: None,
            proposed_clock_from: None,
            follow: false,
            impacts: vec![],
        },
        "invade" | "resize" | "shrink" | "extend" => {
            resize_pending(original, body.column_id.clone(), body.clock_to)?
        }
        "delete_canon" => {
            if body.fail_refs {
                return Err((
                    StatusCode::CONFLICT,
                    "影响清单查询失败，不准当无影响".into(),
                ));
            }
            let beat_id = body
                .beat_id
                .clone()
                .ok_or((StatusCode::BAD_REQUEST, "没有选中的正史".into()))?;
            let beat = canon
                .beats
                .iter()
                .find(|b| b.id == beat_id && b.status == STATUS_COMMITTED)
                .ok_or((StatusCode::BAD_REQUEST, "无此正史场".into()))?;
            let impacts = delete_canon_impacts(&canon, beat);
            Pending {
                op: "delete_canon".into(),
                suggestions: delete_canon_suggestions(),
                original_columns: original,
                proposed_columns: None,
                target_beat: Some(beat_id),
                target_entity: None,
                target_column: Some(beat.column_id.clone()),
                proposed_clock_to: None,
                proposed_clock_from: None,
                follow: false,
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
                    proposed_clock_to: None,
                    proposed_clock_from: None,
                    follow: false,
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
                    proposed_clock_to: None,
                    proposed_clock_from: None,
                    follow: false,
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
                    proposed_clock_to: None,
                    proposed_clock_from: None,
                    follow: false,
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
            proposed_clock_to: None,
            proposed_clock_from: None,
            follow: false,
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
            proposed_clock_to: None,
            proposed_clock_from: None,
            follow: false,
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
            proposed_clock_to: None,
            proposed_clock_from: None,
            follow: false,
            impacts: vec!["算出这一刻".into(), "规定情境轴".into()],
        },
        "set_clocks" => {
            let beat_id = body
                .beat_id
                .clone()
                .ok_or((StatusCode::BAD_REQUEST, "没有选中的正史".into()))?;
            let beat = canon
                .beats
                .iter()
                .find(|b| b.id == beat_id && b.status == STATUS_COMMITTED)
                .ok_or((StatusCode::BAD_REQUEST, "无此正史场".into()))?;
            let _ = beat;
            Pending {
                op: "set_clocks".into(),
                suggestions: vec![
                    Suggestion { id: "apply".into(), label: "改这场的钟".into() },
                    Suggestion { id: "cancel".into(), label: "取消".into() },
                ],
                original_columns: original,
                proposed_columns: None,
                target_beat: Some(beat_id),
                target_entity: None,
                target_column: None,
                proposed_clock_to: body.clock_to,
                proposed_clock_from: body.clock_from,
                follow: body.follow.unwrap_or(false),
                impacts: vec![
                    "故事时间轴".into(),
                    "算出这一刻".into(),
                    "第几次写入正史不变".into(),
                ],
            }
        }
        "plan_mid" => Pending {
            op: "plan_mid".into(),
            suggestions: vec![
                Suggestion { id: "apply".into(), label: "确认后落成预场草稿（仍是草稿）".into() },
                Suggestion { id: "cancel".into(), label: "取消".into() },
            ],
            original_columns: original,
            proposed_columns: None,
            target_beat: body.beat_id,
            target_entity: None,
            target_column: body.column_id,
            proposed_clock_to: None,
            proposed_clock_from: None,
            follow: false,
            impacts: vec!["会在中间加列".into(), "预场草稿不算正史".into(), "算出这一刻要等写入正史".into()],
        },
        "add_presence" => {
            let beat_id = body
                .beat_id
                .clone()
                .ok_or((StatusCode::BAD_REQUEST, "没有选中的正史".into()))?;
            let entity_id = body
                .entity_id
                .clone()
                .ok_or((StatusCode::BAD_REQUEST, "没有要加的人".into()))?;
            Pending {
                op: "add_presence".into(),
                suggestions: vec![
                    Suggestion { id: "add".into(), label: format!("给本场加上 {entity_id}") },
                    Suggestion { id: "cancel".into(), label: "取消".into() },
                ],
                original_columns: original,
                proposed_columns: None,
                target_beat: Some(beat_id),
                target_entity: Some(entity_id),
                target_column: None,
                proposed_clock_to: None,
                proposed_clock_from: None,
                follow: false,
                impacts: vec!["在场连续性".into(), "算出这一刻".into(), "第几次写入正史不变".into()],
            }
        }
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
                    ..Default::default()
                });
                persist_drafts(&app.data_root, &name, &sess.drafts);
            }
        }
        "invade" | "shrink" | "extend" | "resize" => {
            let mut cols = pending.original_columns.clone();
            cols.sort_by_key(|c| c.display_ord);
            let i = pending
                .target_column
                .as_ref()
                .and_then(|id| cols.iter().position(|c| &c.id == id))
                .unwrap_or(0);
            let old_to = cols[i].clock_to;
            let new_to = pending
                .proposed_clock_to
                .unwrap_or(old_to);
            if new_to <= cols[i].clock_from {
                return Err((StatusCode::BAD_REQUEST, "时长须大于 0".into()));
            }
            match body.choice.as_str() {
                "accept" => {
                    cols[i].clock_to = new_to;
                }
                "shift_back" => {
                    let gap = old_to - new_to;
                    cols[i].clock_to = new_to;
                    for c in cols.iter_mut().skip(i + 1) {
                        c.clock_from -= gap;
                        c.clock_to -= gap;
                    }
                }
                "merge_next" => {
                    cols[i].clock_to = new_to;
                    if let Some(n) = cols.get_mut(i + 1) {
                        n.clock_from = new_to;
                    }
                }
                "spare" => {
                    cols[i].clock_to = new_to;
                    if old_to > new_to {
                        let next = cols.iter().map(|c| c.display_ord).max().unwrap_or(-1) + 1;
                        let nid = format!("gap{next}");
                        cols.insert(
                            i + 1,
                            Column {
                                id: nid,
                                clock_from: new_to,
                                clock_to: old_to,
                                display_ord: next,
                            },
                        );
                        for (k, c) in cols.iter_mut().enumerate() {
                            c.display_ord = k as i64;
                        }
                    }
                }
                "compress" => {
                    let j = i + 1;
                    if j >= cols.len() {
                        return Err((StatusCode::BAD_REQUEST, "无邻列可侵入".into()));
                    }
                    let max_to = (cols[j].clock_to - 1).max(cols[i].clock_from + 1);
                    cols[i].clock_to = new_to.min(max_to).max(cols[i].clock_from + 1);
                    cols[j].clock_from = cols[i].clock_to;
                }
                "shift" => {
                    let j = i + 1;
                    if j >= cols.len() {
                        return Err((StatusCode::BAD_REQUEST, "无邻列可侵入".into()));
                    }
                    let dur = cols[j].clock_to - cols[j].clock_from;
                    let delta = new_to - cols[j].clock_from;
                    cols[i].clock_to = new_to;
                    cols[j].clock_from = new_to;
                    cols[j].clock_to = new_to + dur;
                    if delta != 0 {
                        for c in cols.iter_mut().skip(j + 1) {
                            c.clock_from += delta;
                            c.clock_to += delta;
                        }
                    }
                }
                "merge" | "parallel" => {
                    let j = i + 1;
                    if j >= cols.len() {
                        return Err((StatusCode::BAD_REQUEST, "无邻列可侵入".into()));
                    }
                    cols[i].clock_to = new_to.max(cols[j].clock_to);
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
                    let j = i + 1;
                    if j >= cols.len() {
                        return Err((StatusCode::BAD_REQUEST, "无邻列可侵入".into()));
                    }
                    let max_to = (cols[j].clock_to - 1).max(cols[i].clock_from + 1);
                    cols[i].clock_to = new_to.min(max_to).max(cols[i].clock_from + 1);
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
                        ..Default::default()
                    });
                    persist_drafts(&app.data_root, &name, &sess.drafts);
                }
                "refuse" => {
                    return Err((StatusCode::BAD_REQUEST, "未选补洞建议".into()));
                }
                _ => {
                    return Err((StatusCode::BAD_REQUEST, "未知建议".into()));
                }
            }
            SettingBook::preview_columns(&cols).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            sess.book
                .confirm_columns(cols)
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
        }
        "delete_canon" => {
            let id = pending
                .target_beat
                .clone()
                .ok_or((StatusCode::BAD_REQUEST, "没有选中的正史".into()))?;
            let canon0 = sess
                .book
                .load_canon()
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let col_id = pending
                .target_column
                .clone()
                .or_else(|| {
                    canon0
                        .beats
                        .iter()
                        .find(|b| b.id == id)
                        .map(|b| b.column_id.clone())
                })
                .unwrap_or_else(|| "col0".into());
            let still_committed = canon0.beats.iter().any(|b| {
                b.column_id == col_id && b.status == STATUS_COMMITTED && b.id != id
            });
            if matches!(body.choice.as_str(), "shift" | "fill" | "extend_neighbor") && still_committed
            {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "同列还有正史，不能用前移或邻场盖住。请选停空洞或先处理同列正史。".into(),
                ));
            }
            sess.book
                .supersede(&id)
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            if sess.selected_canon.as_deref() == Some(id.as_str()) {
                sess.selected_canon = None;
            }
            match body.choice.as_str() {
                "leave_hole" => {}
                "empty_beat" | "ellipsis" => {
                    let col = pending
                        .original_columns
                        .iter()
                        .find(|c| c.id == col_id)
                        .cloned()
                        .unwrap_or(Column {
                            id: col_id.clone(),
                            clock_from: 0,
                            clock_to: 60,
                            display_ord: 0,
                        });
                    let kind = if body.choice == "ellipsis" {
                        "ellipsis"
                    } else {
                        "scene"
                    };
                    let eid = format!(
                        "hole{}",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis())
                            .unwrap_or(0)
                    );
                    sess.drafts.push(UiDraft {
                        id: eid.clone(),
                        title: if kind == "ellipsis" { "省略场" } else { "空场" }.into(),
                        draft: BeatDraft {
                            id: Some(eid),
                            kind: kind.into(),
                            column_id: col.id.clone(),
                            intent: if kind == "ellipsis" {
                                "省略".into()
                            } else {
                                "待写（空洞）".into()
                            },
                            clock_from: col.clock_from,
                            clock_to: col.clock_to,
                            ..BeatDraft::default()
                        },
                        ..Default::default()
                    });
                    persist_drafts(&app.data_root, &name, &sess.drafts);
                }
                "extend_neighbor" => {
                    if still_committed {
                        return Err((
                            StatusCode::BAD_REQUEST,
                            "同列还有正史，不能用邻场盖住".into(),
                        ));
                    }
                    let mut cols = pending.original_columns.clone();
                    cols.sort_by_key(|c| c.display_ord);
                    let idx = cols
                        .iter()
                        .position(|c| c.id == col_id)
                        .ok_or((StatusCode::BAD_REQUEST, "无此列".into()))?;
                    if idx > 0 {
                        let to = cols[idx].clock_to;
                        cols[idx - 1].clock_to = to;
                    } else if idx + 1 < cols.len() {
                        let from = cols[idx].clock_from;
                        cols[idx + 1].clock_from = from;
                    }
                    cols.remove(idx);
                    for (i, c) in cols.iter_mut().enumerate() {
                        c.display_ord = i as i64;
                    }
                    SettingBook::preview_columns(&cols)
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                    sess.book
                        .confirm_columns(cols)
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                    sess.book
                        .delete_column(&col_id)
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                }
                "shift" | "fill" => {
                    if still_committed {
                        return Err((
                            StatusCode::BAD_REQUEST,
                            "同列还有正史，不能前移合上".into(),
                        ));
                    }
                    let mut cols = pending.original_columns.clone();
                    cols.sort_by_key(|c| c.display_ord);
                    let idx = cols
                        .iter()
                        .position(|c| c.id == col_id)
                        .ok_or((StatusCode::BAD_REQUEST, "无此列".into()))?;
                    let hole_from = cols[idx].clock_from;
                    let dur = cols[idx].clock_to - cols[idx].clock_from;
                    cols.remove(idx);
                    for c in cols.iter_mut() {
                        if c.clock_from >= hole_from {
                            c.clock_from -= dur;
                            c.clock_to -= dur;
                        }
                    }
                    for (i, c) in cols.iter_mut().enumerate() {
                        c.display_ord = i as i64;
                    }
                    SettingBook::preview_columns(&cols)
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                    sess.book
                        .confirm_columns(cols.clone())
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                    sess.book
                        .delete_column(&col_id)
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                    let canon2 = sess
                        .book
                        .load_canon()
                        .await
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                    for b in canon2
                        .beats
                        .iter()
                        .filter(|b| b.status == STATUS_COMMITTED && b.clock_from >= hole_from)
                    {
                        sess.book
                            .set_beat_clocks(&b.id, b.clock_from - dur, b.clock_to - dur)
                            .await
                            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                    }
                    for d in sess.drafts.iter_mut() {
                        if d.draft.clock_from >= hole_from {
                            d.draft.clock_from -= dur;
                            d.draft.clock_to -= dur;
                        }
                        if d.draft.column_id == col_id && !cols.is_empty() {
                            d.draft.column_id = cols[0].id.clone();
                        }
                    }
                    persist_drafts(&app.data_root, &name, &sess.drafts);
                }
                _ => {
                    return Err((StatusCode::BAD_REQUEST, "未选补洞建议".into()));
                }
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
        "add_presence" => {
            if body.choice == "add" {
                let beat = pending
                    .target_beat
                    .as_deref()
                    .ok_or((StatusCode::BAD_REQUEST, "无场".into()))?;
                let ent = pending
                    .target_entity
                    .as_deref()
                    .ok_or((StatusCode::BAD_REQUEST, "无设定".into()))?;
                sess.book
                    .add_presence(beat, ent)
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            }
        }
        "set_clocks" => {
            if body.choice == "apply" {
                let id = pending
                    .target_beat
                    .clone()
                    .ok_or((StatusCode::BAD_REQUEST, "无此正史".into()))?;
                let canon = sess
                    .book
                    .load_canon()
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                let beat = canon
                    .beats
                    .iter()
                    .find(|b| b.id == id && b.status == STATUS_COMMITTED)
                    .ok_or((StatusCode::BAD_REQUEST, "无此正史".into()))?;
                let from = pending.proposed_clock_from.unwrap_or(beat.clock_from);
                let to = pending.proposed_clock_to.unwrap_or(beat.clock_to);
                let old_to = beat.clock_to;
                let delta = from - beat.clock_from;
                sess.book
                    .set_beat_clocks(&id, from, to)
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                if pending.follow && delta != 0 {
                    let later: Vec<(String, i64, i64)> = canon
                        .beats
                        .iter()
                        .filter(|b| {
                            b.id != id && b.status == STATUS_COMMITTED && b.clock_from >= old_to
                        })
                        .map(|b| (b.id.clone(), b.clock_from + delta, b.clock_to + delta))
                        .collect();
                    for (lid, a, b) in later {
                        sess.book
                            .set_beat_clocks(&lid, a, b)
                            .await
                            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                    }
                    for o in sess.drafts.iter_mut() {
                        if o.draft.clock_from >= old_to {
                            o.draft.clock_from += delta;
                            o.draft.clock_to += delta;
                        }
                    }
                    persist_drafts(&app.data_root, &name, &sess.drafts);
                }
            }
        }
        "plan_mid" => {}
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let chunks: Vec<&str> = text
        .split(|c| c == '\n' || c == '。')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    let chunks = if chunks.is_empty() { vec![text] } else { chunks };
    let target_draft = sess
        .selected
        .clone()
        .or_else(|| sess.drafts.last().map(|d| d.id.clone()));
    let target_label = target_draft
        .as_ref()
        .and_then(|id| sess.drafts.iter().find(|d| &d.id == id))
        .map(|d| {
            let title = if d.title.trim().is_empty() {
                "未名场"
            } else {
                d.title.as_str()
            };
            format!("草稿 · {title} · {}", d.draft.column_id)
        })
        .unwrap_or_else(|| "没有选中的草稿".into());
    sess.paste_suggestions = chunks
        .into_iter()
        .enumerate()
        .map(|(i, t)| PasteSuggest {
            id: format!("paste{i}"),
            field: paste_field_of(t),
            text: t.to_string(),
            applied: false,
            skipped: false,
            target_draft: target_draft.clone(),
            target_label: target_label.clone(),
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let skip = body.get("skip").and_then(|v| v.as_bool()).unwrap_or(false);
    let sug = sess
        .paste_suggestions
        .iter_mut()
        .find(|s| s.id == sid)
        .ok_or((StatusCode::BAD_REQUEST, "无此建议".into()))?;
    if skip {
        sug.skipped = true;
        sug.applied = true;
        return Ok(Json(serde_json::json!({
            "ok": true,
            "skipped": true,
            "auto_canon": false,
        })));
    }
    sug.applied = true;
    let field = sug.field.clone();
    let text = sug.text.clone();
    let draft_id = sug
        .target_draft
        .clone()
        .or_else(|| sess.selected.clone());
    let Some(id) = draft_id else {
        sug.applied = false;
        return Err((
            StatusCode::BAD_REQUEST,
            "没有选中的草稿，不能写入此框".into(),
        ));
    };
    let d = sess
        .drafts
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or((StatusCode::BAD_REQUEST, "没有选中的草稿，不能写入此框".into()))?;
    match field.as_str() {
        "say_text" => d.draft.say_text = Some(text.clone()),
        "think_text" => d.draft.think_text = Some(text.clone()),
        "intent" => d.draft.intent = text.clone(),
        "title" => d.title = text.clone(),
        "value_shift" => d.draft.value_shift = Some(text.clone()),
        _ => d.draft.do_text = Some(text.clone()),
    }
    sess.selected = Some(id.clone());
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(serde_json::json!({
        "ok": true,
        "applied": true,
        "field": field,
        "text": text,
        "auto_canon": false,
        "draft_id": id,
    })))
}

async fn make_ellipsis(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or((StatusCode::BAD_REQUEST, "没有选中的正史".into()))?;
    structure_preview(
        State(app.clone()),
        Json(StructPreview {
            op: "delete_canon".into(),
            beat_id: Some(id.to_string()),
            fail_refs: body.get("fail_refs").and_then(|v| v.as_bool()).unwrap_or(false),
            ..Default::default()
        }),
    )
    .await?;
    Ok(Json(serde_json::json!({"need_confirm": true})))
}

async fn revise_beat(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(patch): Json<BeatPatch>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let (beat, warnings) = sess
        .book
        .revise(&id, patch)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "id": beat.id,
        "seq": beat.commit_seq,
        "commit_seq": beat.commit_seq,
        "do_text": beat.do_text,
        "say_text": beat.say_text,
        "think_text": beat.think_text,
        "warnings": warnings,
        "new_seq": false,
    })))
}

async fn get_dossier(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let mut appearances: Vec<serde_json::Value> = canon
        .beats
        .iter()
        .filter(|b| {
            b.status == STATUS_COMMITTED
                && (b.presences.iter().any(|p| p.entity_id == e.id)
                    || b.place_id.as_deref() == Some(e.id.as_str()))
        })
        .map(|b| {
            serde_json::json!({
                "id": b.id,
                "column_id": b.column_id,
                "intent": b.intent,
                "status": "committed",
            })
        })
        .collect();
    for d in &sess.drafts {
        let on = d.draft.presences.iter().any(|p| p.entity_id == e.id)
            || d.draft.place_id.as_deref() == Some(e.id.as_str());
        if on {
            appearances.push(serde_json::json!({
                "id": d.id,
                "column_id": d.draft.column_id,
                "intent": d.draft.intent,
                "status": "draft",
            }));
        }
    }
    let now = max_committed_clock(&canon);
    let w = sess.book.world_at(now, None).await.ok();
    let windows: Vec<serde_json::Value> = w
        .as_ref()
        .map(|w| {
            w.states
                .iter()
                .filter(|s| s.entity_id == e.id)
                .map(|s| {
                    serde_json::json!({
                        "entity_id": s.entity_id,
                        "attr": s.attr,
                        "value": s.value,
                        "clock_from": s.clock_from,
                        "clock_to": s.clock_to,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let knows: Vec<String> = w
        .as_ref()
        .and_then(|w| w.knows.get(&e.id).cloned())
        .unwrap_or_default();
    let wrong: Vec<String> = w
        .as_ref()
        .map(|w| {
            w.beliefs
                .iter()
                .filter(|b| b.person_id == e.id && b.is_wrong())
                .map(|b| {
                    let actual = b
                        .truth_value
                        .as_deref()
                        .filter(|s| !s.is_empty())
                        .unwrap_or("未知");
                    format!("信错「{}」（实际：{actual}）", b.fact)
                })
                .collect()
        })
        .unwrap_or_default();
    let promises: Vec<serde_json::Value> = w
        .as_ref()
        .map(|w| {
            w.promises
                .iter()
                .filter(|p| p.related.iter().any(|r| r == &e.id) || p.id == e.id)
                .map(|p| {
                    serde_json::json!({
                        "id": p.id,
                        "name": p.name,
                        "status": p.status,
                        "deadline_clock": p.deadline_clock,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let rels = load_rels(&app.data_root, &name);
    let relations_setup: Vec<serde_json::Value> = rels
        .iter()
        .filter(|r| r.from == e.id || r.to == e.id)
        .map(|r| {
            let outgoing = r.from == e.id;
            let other = if outgoing { &r.to } else { &r.from };
            let other_name = canon
                .entities
                .iter()
                .find(|x| x.id == *other)
                .map(|x| x.name.clone())
                .unwrap_or_else(|| other.clone());
            serde_json::json!({
                "id": r.id,
                "kind": r.kind,
                "direction": if outgoing { "out" } else { "in" },
                "other": other,
                "other_name": other_name,
                "label": if outgoing { rel_label(&r.kind) } else { reverse_rel_label(&r.kind) },
                "note": r.note,
            })
        })
        .collect();
    let mut relations_from_scenes = vec![];
    for b in canon.beats.iter().filter(|b| b.status == STATUS_COMMITTED) {
        let on = b.presences.iter().any(|p| p.entity_id == e.id)
            || b.place_id.as_deref() == Some(e.id.as_str());
        if !on {
            continue;
        }
        if let Some(p) = &b.place_id {
            if p != &e.id {
                relations_from_scenes.push(serde_json::json!({
                    "kind": "at",
                    "other": p,
                    "beat_id": b.id,
                    "label": "本场在",
                    "readonly": true,
                }));
            }
        }
        for p in &b.presences {
            if p.entity_id != e.id {
                relations_from_scenes.push(serde_json::json!({
                    "kind": "involves",
                    "other": p.entity_id,
                    "beat_id": b.id,
                    "label": "同场",
                    "readonly": true,
                }));
            }
        }
    }
    Ok(Json(serde_json::json!({
        "id": e.id,
        "kind": e.kind,
        "name": e.name,
        "profile": e.profile,
        "appearances": appearances,
        "beats": appearances,
        "beats_editable": false,
        "windows_readonly": windows,
        "knows_readonly": knows,
        "wrong_beliefs_readonly": wrong,
        "promises_readonly": promises,
        "relations_setup": relations_setup,
        "relations_from_scenes": relations_from_scenes,
    })))
}

async fn save_dossier(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut cols = canon.columns.clone();
    cols.sort_by_key(|c| c.display_ord);
    let mut cells = vec![];
    for e in &canon.entities {
        for c in &cols {
            let canon_on = canon.beats.iter().any(|b| {
                b.column_id == c.id
                    && b.status == STATUS_COMMITTED
                    && (b.presences.iter().any(|p| p.entity_id == e.id && p.role == ROLE_PRESENT)
                        || b.place_id.as_deref() == Some(e.id.as_str()))
            });
            let draft_on = sess.drafts.iter().any(|d| {
                d.draft.column_id == c.id
                    && (d.draft.presences.iter().any(|p| p.entity_id == e.id && p.role == ROLE_PRESENT)
                        || d.draft.place_id.as_deref() == Some(e.id.as_str()))
            });
            let status = if canon_on {
                "canon"
            } else if draft_on {
                "draft"
            } else {
                "none"
            };
            cells.push(serde_json::json!({
                "entity": e.id,
                "name": e.name,
                "kind": e.kind,
                "column": c.id,
                "present": canon_on,
                "draft": draft_on && !canon_on,
                "status": status,
            }));
        }
    }
    Ok(Json(serde_json::json!({
        "readonly": true,
        "columns": cols.iter().map(|c| serde_json::json!({"id": c.id, "display_ord": c.display_ord})).collect::<Vec<_>>(),
        "entities": canon.entities.iter().map(|e| serde_json::json!({"id": e.id, "name": e.name, "kind": e.kind})).collect::<Vec<_>>(),
        "cells": cells,
    })))
}

async fn circumstances(
    State(app): State<App>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let lens = sess.lens_person.clone();
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let t = column_clock(
        &canon.columns,
        sess.selected_col.as_deref(),
        sess.window_start,
    );
    let telling_upto = if sess.reading_order {
        let col = sess.selected_col.as_deref().or_else(|| {
            canon
                .columns
                .get(sess.window_start)
                .map(|c| c.id.as_str())
        });
        col.and_then(|cid| {
            canon
                .beats
                .iter()
                .filter(|b| b.column_id == cid && b.status == STATUS_COMMITTED)
                .map(|b| b.telling_ord.unwrap_or(b.commit_seq))
                .min()
        })
    } else {
        None
    };
    let draft = if let Some(sel) = &sess.selected {
        sess.drafts.iter().find(|x| &x.id == sel).map(|d| d.draft.clone())
    } else if let Some(cid) = &sess.selected_canon {
        canon
            .beats
            .iter()
            .find(|b| &b.id == cid && b.status == STATUS_COMMITTED)
            .map(beat_to_draft)
    } else {
        None
    };
    let Some(draft) = draft
        .or_else(|| {
            lens.as_ref().map(|p| BeatDraft {
                intent: "看这一刻".into(),
                column_id: sess
                    .selected_col
                    .clone()
                    .unwrap_or_else(|| "col0".into()),
                clock_from: t,
                clock_to: t + 1,
                presences: vec![Presence {
                    entity_id: p.clone(),
                    beat_id: String::new(),
                    role: ROLE_PRESENT.into(),
                }],
                ..BeatDraft::default()
            })
        })
        .or_else(|| {
            let col_id = sess.selected_col.clone().or_else(|| {
                canon.columns.get(sess.window_start).map(|c| c.id.clone())
            })?;
            Some(column_moment_draft(&canon, &col_id, t))
        })
    else {
        return Ok(Json(serde_json::json!({"empty": true})));
    };
    let mut pkt = sess
        .book
        .given_circumstances(&draft)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if let Some(upto) = telling_upto {
        pkt.reader_knows = narra::services::circumstances::reader_facts(&canon, Some(upto))
            .into_iter()
            .take(12)
            .collect();
        pkt.reader_irony
            .retain(|s| pkt.reader_knows.iter().any(|f| s.contains(f)));
    }
    if let Some(p) = &lens {
        let world = sess
            .book
            .world_at(draft.clock_from, None)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        pkt = apply_person_lens(pkt, &world, p);
    }
    let suggestion = suggest_promise_op(&pkt.open_promises, &draft);
    let total_open = canon
        .promises
        .iter()
        .filter(|p| p.status == "open")
        .count();
    let more = total_open.saturating_sub(pkt.open_promises.len());
    Ok(Json(serde_json::json!({
        "packet": pkt,
        "suggestion": suggestion,
        "suggestion_in_packet": false,
        "structure_suggestions_in_packet": false,
        "lens_person": lens,
        "world_unchanged": true,
        "open_promises_more": more,
        "open_promises_total": total_open,
    })))
}

#[derive(Deserialize)]
struct SearchQ {
    q: Option<String>,
}

async fn official_bridge(
    State(app): State<App>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g
        .current
        .clone()
        .ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let mut q = sess
        .book
        .db()
        .query("SELECT intent, title, status, commit_seq FROM scene")
        .query("SELECT name, aliases FROM character")
        .query("SELECT count() AS n FROM knows GROUP ALL")
        .query("SELECT count() AS n FROM setting_window GROUP ALL")
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    #[derive(Debug, serde::Deserialize, serde::Serialize, SurrealValue)]
    struct SceneRow {
        intent: Option<String>,
        title: Option<String>,
        status: Option<String>,
        commit_seq: Option<i64>,
    }
    #[derive(Debug, serde::Deserialize, serde::Serialize, SurrealValue)]
    struct CharRow {
        name: Option<String>,
        aliases: Option<narra::db::string_set::StringSet>,
    }
    #[derive(Debug, serde::Deserialize, SurrealValue)]
    struct CountRow {
        n: Option<surrealdb::types::Value>,
    }
    let scenes: Vec<SceneRow> = q.take(0).unwrap_or_default();
    let characters: Vec<CharRow> = q.take(1).unwrap_or_default();
    let knows: Vec<CountRow> = q.take(2).unwrap_or_default();
    let windows: Vec<CountRow> = q.take(3).unwrap_or_default();
    Ok(Json(serde_json::json!({
        "book": name,
        "world_at_source": "scene+knows+setting_window",
        "scenes": scenes,
        "characters": characters,
        "knows": knows
            .first()
            .and_then(|r| r.n.clone())
            .and_then(narra::db::string_set::value_as_i64)
            .unwrap_or(0),
        "setting_window": windows
            .first()
            .and_then(|r| r.n.clone())
            .and_then(narra::db::string_set::value_as_i64)
            .unwrap_or(0),
    })))
}

async fn search_entities(
    State(app): State<App>,
    Query(q): Query<SearchQ>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let needle = q.q.unwrap_or_default();
    let hits = sess
        .book
        .search_entities(&needle)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let page_cols = window_column_ids(&canon.columns, sess.window_start, sess.n);
    let on_page = appearing_on(&canon.beats, &sess.drafts, &page_cols);
    let hits: Vec<serde_json::Value> = hits
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "id": e.id,
                "kind": e.kind,
                "name": e.name,
                "on_page": on_page.contains(&e.id),
                "type": "entity",
            })
        })
        .collect();
    let qlow = needle.to_lowercase();
    let mut scene_hits: Vec<serde_json::Value> = vec![];
    if !qlow.is_empty() {
        for b in canon.beats.iter().filter(|b| b.status == STATUS_COMMITTED) {
            let blob = format!(
                "{} {} {} {} {}",
                b.intent,
                b.do_text.as_deref().unwrap_or(""),
                b.say_text.as_deref().unwrap_or(""),
                b.think_text.as_deref().unwrap_or(""),
                b.id
            )
            .to_lowercase();
            if blob.contains(&qlow) {
                scene_hits.push(serde_json::json!({
                    "id": b.id,
                    "kind": "scene",
                    "name": b.intent,
                    "type": "scene",
                    "status": "committed",
                    "column_id": b.column_id,
                }));
            }
        }
        for d in &sess.drafts {
            let blob = format!(
                "{} {} {} {} {} {}",
                d.title,
                d.draft.intent,
                d.draft.do_text.as_deref().unwrap_or(""),
                d.draft.say_text.as_deref().unwrap_or(""),
                d.draft.think_text.as_deref().unwrap_or(""),
                d.id
            )
            .to_lowercase();
            if blob.contains(&qlow) {
                scene_hits.push(serde_json::json!({
                    "id": d.id,
                    "kind": "scene",
                    "name": d.draft.intent,
                    "type": "scene",
                    "status": "draft",
                    "column_id": d.draft.column_id,
                }));
            }
        }
    }
    Ok(Json(serde_json::json!({
        "book": name,
        "q": needle,
        "hits": hits,
        "scenes": scene_hits,
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
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
        return Ok(Json(serde_json::json!({"knows": w.knows, "beliefs": w.beliefs, "t": t, "score": serde_json::Value::Null})));
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
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    sess.book
        .set_telling_ord(&body.beat_id, body.telling_ord)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true, "beat_id": body.beat_id, "telling_ord": body.telling_ord})))
}

async fn fill_live(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
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
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut thing_keys: HashSet<String> = HashSet::new();
    let mut speakers: Vec<String> = Vec::new();
    let mut props: Vec<String> = Vec::new();
    for e in &canon.entities {
        if e.kind == KIND_THING {
            thing_keys.insert(e.id.clone());
            thing_keys.insert(e.name.clone());
        }
    }
    for p in draft0.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
        match canon.entity(&p.entity_id).map(|e| e.kind.as_str()) {
            Some(KIND_PERSON) => speakers.push(p.entity_id.clone()),
            Some(KIND_THING) => props.push(p.entity_id.clone()),
            _ => {}
        }
    }
    speakers.sort();
    speakers.dedup();
    props.sort();
    props.dedup();
    let mut desires: Vec<String> = Vec::new();
    for p in draft0.presences.iter().filter(|pr| pr.role == ROLE_PRESENT) {
        if let Some(e) = canon.entity(&p.entity_id) {
            if e.kind == KIND_PERSON {
                if let Some(d) = e.profile.get("desire") {
                    let d = d.trim();
                    if !d.is_empty() {
                        desires.push(format!("{}想要{d}", e.name));
                    }
                }
            }
        }
    }
    let mut user = fill_user_prompt_with_desires(&draft0.intent, &pkt, &desires)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    user.push_str(&fill_cast_suffix(&speakers, &props));
    drop(g);
    let content = call_chat(fill_system_prompt(), &user).await?;
    let mut fields = parse_fill_content(&content).map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    scrub_thing_fields(&mut fields, &thing_keys);
    if fields.is_empty() {
        return Err((
            StatusCode::BAD_GATEWAY,
            "模型只给道具写了轨，已丢弃".into(),
        ));
    }
    let blob = format!(
        "{}{}{}{}",
        fields.do_text.as_deref().unwrap_or(""),
        fields.say_text.as_deref().unwrap_or(""),
        fields.think_text.as_deref().unwrap_or(""),
        fields.value_shift.as_deref().unwrap_or("")
    );
    if craft::contains_beat_advice(&blob) {
        return Err((
            StatusCode::BAD_GATEWAY,
            "模型输出含节拍教条，已丢弃".into(),
        ));
    }
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let mut suggested = sess
        .drafts
        .iter()
        .find(|x| x.id == id)
        .ok_or((StatusCode::BAD_REQUEST, "无草稿".into()))?
        .draft
        .clone();
    if let Some(t) = fields.do_text.clone() {
        suggested.do_text = Some(t);
    }
    if let Some(t) = fields.say_text.clone() {
        suggested.say_text = Some(t);
    }
    if let Some(t) = fields.think_text.clone() {
        suggested.think_text = Some(t);
    }
    if let Some(t) = fields.value_shift.clone() {
        suggested.value_shift = Some(t);
    }
    if !fields.tracks.is_empty() {
        suggested.tracks = fields.tracks.clone();
        apply_track_flatten(&mut suggested);
    }
    sess.fill_pending = Some(suggested.clone());
    persist_drafts(&app.data_root, &name, &sess.drafts);
    let pkt_json = serde_json::to_value(&pkt).unwrap_or(serde_json::json!({}));
    let thin = literary_thin(&fields, &pkt);
    Ok(Json(serde_json::json!({
        "do_text": suggested.do_text,
        "say_text": suggested.say_text,
        "think_text": suggested.think_text,
        "value_shift": suggested.value_shift,
        "tracks": suggested.tracks,
        "intent": suggested.intent,
        "auto_canon": false,
        "live": true,
        "model_input": pkt_json,
        "model_input_has_suggestion": false,
        "model_input_has_structure": false,
        "literary_thin": thin,
        "literary_notice": if thin {
            "这篇像复述，仍可改后写入正史"
        } else {
            ""
        },
    })))
}

async fn compose_chapter(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let chapter_q = body
        .get("chapter")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let polish = body
        .get("polish")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let target_hanzi = body
        .get("target_hanzi")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let min_hanzi_mode = MinHanziMode::parse(
        body.get("min_hanzi_mode")
            .and_then(|v| v.as_str())
            .unwrap_or("weighted"),
    );
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let craft = sess.craft.clone();
    let chs = craft::sorted_chapters(&craft, &canon.columns);
    let picked = chs.iter().find(|(_, c)| {
        if chapter_q.is_empty() {
            return false;
        }
        c.id == chapter_q
            || c.title == chapter_q
            || c.title.contains(&chapter_q)
            || (!c.title.is_empty() && chapter_q.contains(&c.title))
    }).or_else(|| {
        if chapter_q.is_empty() {
            chs.last()
        } else {
            None
        }
    });
    if !chapter_q.is_empty() && picked.is_none() && !chs.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有这一回".into()));
    }
    let chapter_title = if let Some((_, c)) = picked {
        c.title.clone()
    } else {
        chapter_q.clone()
    };
    let col_set: Option<HashSet<String>> = if let Some(&(start_ord, _)) = picked {
        let next_ord = chs
            .iter()
            .filter_map(|(o, _)| if *o > start_ord { Some(*o) } else { None })
            .min();
        Some(
            canon
                .columns
                .iter()
                .filter(|c| {
                    c.display_ord >= start_ord && next_ord.map(|n| c.display_ord < n).unwrap_or(true)
                })
                .map(|c| c.id.clone())
                .collect(),
        )
    } else {
        None
    };
    let mut beats: Vec<SourceBeat> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .filter(|b| col_set.as_ref().map(|s| s.contains(&b.column_id)).unwrap_or(true))
        .map(|b| SourceBeat {
            id: b.id.clone(),
            kind: b.kind.clone(),
            intent: b.intent.clone(),
            place: b.place_id.clone().unwrap_or_default(),
            do_text: b.do_text.clone().unwrap_or_default(),
            say_text: b.say_text.clone().unwrap_or_default(),
            think_text: b.think_text.clone().unwrap_or_default(),
            value_shift: b.value_shift.clone().unwrap_or_default(),
        })
        .collect();
    beats.sort_by_key(|b| {
        let ord = canon
            .beats
            .iter()
            .find(|x| x.id == b.id)
            .map(|x| (x.clock_from, x.commit_seq))
            .unwrap_or((0, 0));
        ord
    });
    if beats.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "这一回没有正史可拼".into()));
    }
    let entity_names: Vec<String> = canon
        .entities
        .iter()
        .map(|e| e.name.clone())
        .filter(|n| n.chars().count() >= 2)
        .collect();
    let premise = craft.premise.clone();
    drop(g);

    let chapter_source: usize = beats.iter().map(|b| hanzi_count(&source_blob(b))).sum();
    let chapter_target = if target_hanzi > 0 {
        target_hanzi
    } else {
        // 默认按 0.55 带宽的下限来铺，但产品自己不绑死某本书的锚。
        (chapter_source as f64 * 1.4).ceil() as usize
    };
    let source_all: String = beats.iter().map(|b| source_blob(b)).collect();
    let surplus = chapter_target.saturating_sub(chapter_source);
    let weight_sum: u64 = beats
        .iter()
        .filter(|b| b.kind != "ellipsis")
        .map(|b| beat_weight(hanzi_count(&source_blob(b))))
        .sum();
    let beat_n = beats.len();
    struct BeatWork {
        beat: SourceBeat,
        src_blob: String,
        src_h: usize,
        min_h: usize,
        body: String,
        used: &'static str,
        attempts: u32,
        expand_attempts: u32,
        last_reason: String,
        last_check: Option<FactReport>,
        dlg_rewritten: bool,
        dlg_rewrite_attempts: u32,
    }
    let mut works: Vec<BeatWork> = Vec::with_capacity(beats.len());
    for (i, b) in beats.iter().enumerate() {
        let src_blob = source_blob(b);
        let src_h = hanzi_count(&src_blob);
        let mut min_h = src_h;
        let mut body = weave_beat(b);
        let mut used = "weave";
        let mut attempts = 0u32;
        let mut last_reason = String::new();
        let mut last_check: Option<FactReport> = None;
        if polish && b.kind != "ellipsis" {
            min_h = min_hanzi_for_beat(src_h, min_hanzi_mode, weight_sum, surplus);
            let outcome = try_llm_rewrite(
                "polish",
                polish_system_prompt(),
                polish_user_prompt(b, min_h),
                &src_blob,
                &entity_names,
                src_h,
                min_h,
                i + 1,
                beat_n,
                &b.id,
                2,
                None,
            )
            .await;
            attempts = outcome.attempts;
            last_reason = outcome.last_reason.clone();
            last_check = outcome.last_check.clone();
            if let Some(txt) = outcome.text {
                body = txt;
                used = "polish";
            }
        }
        works.push(BeatWork {
            beat: b.clone(),
            src_blob,
            src_h,
            min_h,
            body,
            used,
            attempts,
            expand_attempts: 0,
            last_reason,
            last_check,
            dlg_rewritten: false,
            dlg_rewrite_attempts: 0,
        });
    }

    let approved_now = |works: &[BeatWork]| -> String {
        let bodies: Vec<String> = works
            .iter()
            .filter(|w| w.used == "polish" || w.used == "expand")
            .map(|w| w.body.clone())
            .collect();
        approved_excerpt(&bodies, 1800)
    };

    let mut dlg_gate_rounds = 0u32;
    let mut dlg_rewrites: Vec<serde_json::Value> = Vec::new();
    if polish {
        for i in 0..works.len() {
            if works[i].beat.kind == "ellipsis" {
                continue;
            }
            let need = works[i].used != "polish" || hanzi_count(&works[i].body) < works[i].min_h;
            if !need {
                continue;
            }
            let approved = approved_now(&works);
            let w = &works[i];
            eprintln!(
                "compose-chapter expand TRY beat={}/{beat_n} id={} reason=polish_{} approved_n={} min_hanzi={}",
                i + 1,
                w.beat.id,
                if w.used == "polish" { "short" } else { "rejected" },
                approved.matches("【已过审").count(),
                w.min_h
            );
            let outcome = try_llm_rewrite(
                "expand",
                expand_system_prompt(),
                expand_user_prompt(&w.beat, w.min_h, &approved),
                &w.src_blob,
                &entity_names,
                w.src_h,
                w.min_h,
                i + 1,
                beat_n,
                &w.beat.id,
                2,
                None,
            )
            .await;
            let w = &mut works[i];
            w.expand_attempts = outcome.attempts;
            if !outcome.last_reason.is_empty() {
                w.last_reason = outcome.last_reason.clone();
            }
            if outcome.last_check.is_some() {
                w.last_check = outcome.last_check.clone();
            }
            if let Some(txt) = outcome.text {
                let h = hanzi_count(&txt);
                if h >= hanzi_count(&w.body) {
                    w.body = txt;
                    w.used = "expand";
                } else {
                    eprintln!(
                        "compose-chapter expand SKIP_SHORTER beat={}/{beat_n} id={} hanzi={h} keep={} keep_hanzi={}",
                        i + 1,
                        w.beat.id,
                        w.used,
                        hanzi_count(&w.body)
                    );
                }
            }
            if w.used == "weave" {
                eprintln!(
                    "compose-chapter FALLBACK beat={}/{beat_n} id={} path=weave reason={} hanzi={} source_hanzi={} min_hanzi={}",
                    i + 1,
                    w.beat.id,
                    w.last_reason,
                    hanzi_count(&w.body),
                    w.src_h,
                    w.min_h
                );
            } else if w.used == "polish" && hanzi_count(&w.body) < w.min_h {
                eprintln!(
                    "compose-chapter FALLBACK beat={}/{beat_n} id={} path=keep_polish reason=expand_failed:{} hanzi={} min_hanzi={}",
                    i + 1,
                    w.beat.id,
                    w.last_reason,
                    hanzi_count(&w.body),
                    w.min_h
                );
            }
        }

        let prose_now: usize = works.iter().map(|w| hanzi_count(&w.body)).sum();
        if prose_now < chapter_target {
            eprintln!(
                "compose-chapter expand CHAPTER_SHORT prose_hanzi={prose_now} target={chapter_target}"
            );
            for i in 0..works.len() {
                if works[i].beat.kind == "ellipsis" {
                    continue;
                }
                if hanzi_count(&works[i].body) >= works[i].min_h {
                    continue;
                }
                let approved = approved_now(&works);
                let w = &works[i];
                eprintln!(
                    "compose-chapter expand CHAPTER_RETRY beat={}/{beat_n} id={} hanzi={} min_hanzi={}",
                    i + 1,
                    w.beat.id,
                    hanzi_count(&w.body),
                    w.min_h
                );
                let outcome = try_llm_rewrite(
                    "expand",
                    expand_system_prompt(),
                    expand_user_prompt(&w.beat, w.min_h, &approved),
                    &w.src_blob,
                    &entity_names,
                    w.src_h,
                    w.min_h,
                    i + 1,
                    beat_n,
                    &w.beat.id,
                    1,
                    None,
                )
                .await;
                let w = &mut works[i];
                w.expand_attempts = w.expand_attempts.saturating_add(outcome.attempts);
                if let Some(txt) = outcome.text {
                    if hanzi_count(&txt) > hanzi_count(&w.body) {
                        w.body = txt;
                        w.used = "expand";
                    }
                }
            }
        }

        // 章级对白比硬 gate：出稿后自算，低于 35.8% 才挑 1–3 个长叙述拍走 expand 改写。
        // 不逐拍定额。重写失败保留原拍，禁止回退 weave、禁止复读凑数。最多两轮。
        // 硬失败（无过审稿，如漏引语）换下一拍，避免 r6d 把「弃不弃他」连占两轮。
        let chapter_clean_dlg = |works: &[BeatWork]| -> f64 {
            let bodies: Vec<(SourceBeat, String)> = works
                .iter()
                .map(|w| (w.beat.clone(), w.body.clone()))
                .collect();
            let export = chapter_compose::export_composed(&name, &premise, &chapter_title, &bodies);
            dialogue_ratio_pct(&clean_export_md(&export))
        };
        let mut skip_hard: HashSet<usize> = HashSet::new();
        loop {
            let ratio_now = chapter_clean_dlg(&works);
            if ratio_now >= CHAPTER_DLG_MIN_PCT {
                eprintln!(
                    "compose-chapter dlg_gate PASS ratio={ratio_now} target={CHAPTER_DLG_MIN_PCT} rounds={dlg_gate_rounds}"
                );
                break;
            }
            if dlg_gate_rounds >= DLG_REWRITE_MAX_ROUNDS {
                eprintln!(
                    "compose-chapter dlg_gate STOP ratio={ratio_now} target={CHAPTER_DLG_MIN_PCT} rounds={dlg_gate_rounds}"
                );
                break;
            }
            dlg_gate_rounds += 1;
            let mut accepted_n = 0usize;
            let mut tried: HashSet<usize> = HashSet::new();
            eprintln!(
                "compose-chapter dlg_gate START round={dlg_gate_rounds} ratio={ratio_now} target={CHAPTER_DLG_MIN_PCT} skip_hard={skip_hard:?}"
            );
            loop {
                if accepted_n >= DLG_REWRITE_MAX_BEATS
                    || tried.len() >= DLG_REWRITE_MAX_TRIES_PER_ROUND
                {
                    break;
                }
                let skip_now: Vec<usize> = skip_hard
                    .iter()
                    .copied()
                    .chain(tried.iter().copied())
                    .collect();
                let stats: Vec<DlgBeatStat> = works
                    .iter()
                    .enumerate()
                    .map(|(i, w)| DlgBeatStat {
                        index: i,
                        kind: w.beat.kind.clone(),
                        hanzi: hanzi_count(&w.body),
                        dlg_pct: dialogue_ratio_pct(&w.body),
                    })
                    .collect();
                let picks = pick_dialogue_rewrite_targets_skipping(
                    &stats,
                    DLG_REWRITE_MAX_BEATS,
                    &skip_now,
                );
                let Some(i) = picks.into_iter().next() else {
                    if tried.is_empty() && accepted_n == 0 {
                        eprintln!(
                            "compose-chapter dlg_gate NO_PICKS ratio={ratio_now} round={dlg_gate_rounds}"
                        );
                    }
                    break;
                };
                tried.insert(i);
                let beat = works[i].beat.clone();
                let src_blob = works[i].src_blob.clone();
                let src_h = works[i].src_h;
                let body = works[i].body.clone();
                let id = beat.id.clone();
                let before = dialogue_ratio_pct(&body);
                let before_h = hanzi_count(&body);
                // 下限绑正史源，不绑润色后篇幅。r6a 把 14.7%→38.9% 的改写因短于旧叙述拒掉。
                let floor = dlg_rewrite_hanzi_floor(src_h);
                eprintln!(
                    "compose-chapter dlg_gate TRY round={dlg_gate_rounds} beat={}/{beat_n} id={id} before_pct={before} hanzi={before_h} floor={floor} accepted_n={accepted_n}",
                    i + 1
                );
                let outcome = try_llm_rewrite(
                    "dlg_rewrite",
                    dialogue_rewrite_system_prompt(),
                    dialogue_rewrite_user_prompt(&beat, &body, floor),
                    &src_blob,
                    &entity_names,
                    src_h,
                    floor,
                    i + 1,
                    beat_n,
                    &id,
                    2,
                    Some(before),
                )
                .await;
                let had_text = outcome.text.is_some();
                let w = &mut works[i];
                w.dlg_rewrite_attempts = w
                    .dlg_rewrite_attempts
                    .saturating_add(outcome.attempts);
                w.expand_attempts = w.expand_attempts.saturating_add(outcome.attempts);
                if !outcome.last_reason.is_empty() {
                    w.last_reason = outcome.last_reason.clone();
                }
                if outcome.last_check.is_some() {
                    w.last_check = outcome.last_check.clone();
                }
                let mut accepted = false;
                let mut after = before;
                let mut after_h = before_h;
                let mut reason = if outcome.last_reason.is_empty() {
                    "no_text".into()
                } else {
                    outcome.last_reason.clone()
                };
                if let Some(txt) = outcome.text {
                    after = dialogue_ratio_pct(&txt);
                    after_h = hanzi_count(&txt);
                    // 重写拍事实闸已在 try_llm_rewrite 用 polish_pass：只查 missing_quotes / added_entities，added_quotes 不计。
                    // 弱跳（13.5→14.9、17.9→18.1）不落盘，避免把长叙述锁死、下一轮改不到。
                    if after_h >= floor && dlg_rewrite_worth_keeping(before, after) {
                        w.body = txt;
                        w.used = "expand";
                        w.dlg_rewritten = true;
                        accepted = true;
                        reason = "ok".into();
                        accepted_n += 1;
                        eprintln!(
                            "compose-chapter dlg_gate REPLACE round={dlg_gate_rounds} beat={}/{beat_n} id={id} before_pct={before} after_pct={after} hanzi={before_h}->{after_h}",
                            i + 1
                        );
                    } else if after_h < floor {
                        reason = format!("short hanzi={after_h}<floor {floor}");
                        eprintln!(
                            "compose-chapter dlg_gate KEEP round={dlg_gate_rounds} beat={}/{beat_n} id={id} reason={reason}",
                            i + 1
                        );
                    } else if after <= before {
                        reason = format!("dlg_no_improve {before}->{after}");
                        eprintln!(
                            "compose-chapter dlg_gate KEEP round={dlg_gate_rounds} beat={}/{beat_n} id={id} reason={reason}",
                            i + 1
                        );
                    } else {
                        reason = format!("dlg_not_worth {before}->{after}");
                        eprintln!(
                            "compose-chapter dlg_gate KEEP round={dlg_gate_rounds} beat={}/{beat_n} id={id} reason={reason}",
                            i + 1
                        );
                    }
                } else {
                    eprintln!(
                        "compose-chapter dlg_gate KEEP round={dlg_gate_rounds} beat={}/{beat_n} id={id} reason={reason}",
                        i + 1
                    );
                }
                if !accepted && !had_text {
                    skip_hard.insert(i);
                    eprintln!(
                        "compose-chapter dlg_gate SKIP_HARD round={dlg_gate_rounds} beat={}/{beat_n} id={id} reason={reason}",
                        i + 1
                    );
                }
                dlg_rewrites.push(serde_json::json!({
                    "round": dlg_gate_rounds,
                    "index": i,
                    "id": id,
                    "before_pct": before,
                    "after_pct": after,
                    "before_hanzi": before_h,
                    "after_hanzi": after_h,
                    "accepted": accepted,
                    "reason": reason,
                }));
            }
            eprintln!(
                "compose-chapter dlg_gate ROUND_DONE round={dlg_gate_rounds} accepted={accepted_n} tried={} skip_hard={skip_hard:?}",
                tried.len()
            );
            if tried.is_empty() && accepted_n == 0 {
                break;
            }
        }
    }

    let mut polished_n = 0usize;
    let mut expand_n = 0usize;
    let mut fallback_n = 0usize;
    let mut beat_reports: Vec<serde_json::Value> = Vec::new();
    let mut bodies: Vec<(SourceBeat, String)> = Vec::new();
    for (i, w) in works.iter().enumerate() {
        match w.used {
            "polish" => polished_n += 1,
            "expand" => expand_n += 1,
            _ => {
                if polish && w.beat.kind != "ellipsis" {
                    fallback_n += 1;
                }
            }
        }
        let path = if w.dlg_rewritten {
            "dlg_rewrite"
        } else if w.used == "weave" && polish && w.beat.kind != "ellipsis" {
            "weave"
        } else {
            w.used
        };
        beat_reports.push(serde_json::json!({
            "index": i,
            "id": w.beat.id,
            "kind": w.beat.kind,
            "used": w.used,
            "path": path,
            "attempts": w.attempts,
            "expand_attempts": w.expand_attempts,
            "dlg_rewrite_attempts": w.dlg_rewrite_attempts,
            "dialogue_rewritten": w.dlg_rewritten,
            "source_hanzi": w.src_h,
            "hanzi": hanzi_count(&w.body),
            "dialogue_hanzi": dialogue_hanzi(&w.body),
            "dialogue_ratio": dialogue_ratio_pct(&w.body),
            "min_hanzi": w.min_h,
            "reject_reason": if w.used == "polish" { String::new() } else { w.last_reason.clone() },
        }));
        bodies.push((w.beat.clone(), w.body.clone()));
    }
    let export_md = chapter_compose::export_composed(&name, &premise, &chapter_title, &bodies);
    let prose: String = bodies
        .iter()
        .map(|(_, body)| body.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let check = fact_check(&source_all, &export_md, &entity_names);
    let han = hanzi_count(&export_md);
    let dlg_h = dialogue_hanzi(&prose);
    let dlg_pct = dialogue_ratio_pct(&prose);
    let clean_md = clean_export_md(&export_md);
    let dlg_clean_h = dialogue_hanzi(&clean_md);
    let dlg_clean_pct = dialogue_ratio_pct(&clean_md);
    let dlg_gate_ok = dlg_clean_pct >= CHAPTER_DLG_MIN_PCT;
    let ban_hits = ban_scan(&export_md);
    let ban_ok = ban_hits.is_empty();
    let gate_ok = check.polish_pass() && !has_repeat_violation(&prose);
    let payload = serde_json::json!({
        "chapter": chapter_title,
        "beats": beats.len(),
        "polished_beats": polished_n,
        "expand_beats": expand_n,
        "fallback_beats": fallback_n,
        "hanzi": han,
        "source_hanzi": chapter_source,
        "target_hanzi": chapter_target,
        "min_hanzi_mode": min_hanzi_mode.as_str(),
        "dialogue_hanzi": dlg_h,
        "dialogue_ratio": dlg_pct,
        "dialogue_ratio_clean": dlg_clean_pct,
        "dialogue_hanzi_clean": dlg_clean_h,
        "dialogue_gate": {
            "target_pct": CHAPTER_DLG_MIN_PCT,
            "rounds": dlg_gate_rounds,
            "ok": dlg_gate_ok,
            "final_pct": dlg_clean_pct,
            "rewrites": dlg_rewrites,
        },
        "fact_check": check,
        "gate_ok": gate_ok,
        "repeat_ok": !has_repeat_violation(&prose),
        "ban_ok": ban_ok,
        "ban_hits": ban_hits,
        "beat_reports": beat_reports,
        "prose": prose,
        "export_md": export_md,
        "auto_canon": false,
    });
    // 客户端 curl 超时会丢响应；落盘一份供验收。
    if let Ok(bytes) = serde_json::to_vec(&payload) {
        let dump = std::path::Path::new("logs/compose-last.json");
        if let Some(parent) = dump.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::write(dump, &bytes) {
            eprintln!("compose-chapter dump_fail path={} err={e}", dump.display());
        } else {
            eprintln!(
                "compose-chapter dump_ok path={} bytes={} hanzi={han} polished={polished_n} expand={expand_n} fallback={fallback_n} dlg={dlg_pct} dlg_clean={dlg_clean_pct} dlg_gate_ok={dlg_gate_ok} dlg_gate_rounds={dlg_gate_rounds}",
                dump.display(),
                bytes.len()
            );
        }
    }
    Ok(Json(payload))
}

async fn get_talk(
    State(app): State<App>,
    Query(q): Query<TalkGetQ>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let id = q
        .id
        .filter(|s| !s.is_empty())
        .or_else(|| sess.selected.clone())
        .or_else(|| sess.selected_canon.clone())
        .unwrap_or_default();
    if id.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有场".into()));
    }
    let lines = read_talk_lines(&app.data_root, &name, &id);
    Ok(Json(serde_json::json!({
        "id": id,
        "lines": lines,
        "notice": "讨论不是历史",
        "auto_canon": false,
    })))
}

async fn do_talk(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let field = body.get("field").and_then(|v| v.as_str()).unwrap_or("intent");
    let text = body.get("text").and_then(|v| v.as_str()).unwrap_or("");
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let ui = sess
        .drafts
        .iter()
        .find(|x| x.id == id)
        .ok_or((StatusCode::BAD_REQUEST, "无草稿".into()))?;
    let draft = ui.draft.clone();
    if draft.intent.trim().is_empty() && text.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有本场任务不准讨论生成".into()));
    }
    let pkt = sess
        .book
        .given_circumstances(&draft)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let presence: Vec<String> = draft
        .presences
        .iter()
        .filter(|p| p.role == ROLE_PRESENT)
        .map(|p| p.entity_id.clone())
        .collect();
    let draft_text = if !text.trim().is_empty() {
        text.to_string()
    } else {
        draft.intent.clone()
    };
    drop(g);
    let user = talk_user_prompt(field, &draft_text, &pkt, &presence);
    let content = call_chat(talk_system_prompt(), &user).await?;
    let facts = packet_facts(&pkt);
    let out = parse_talk_content(&content, &facts).map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    let line = serde_json::json!({
        "field": field,
        "user": draft_text,
        "reply": out.reply,
        "concerns": out.concerns,
        "notice": "讨论不是历史",
    });
    append_talk_line(&app.data_root, &name, id, &line);
    Ok(Json(serde_json::json!({
        "reply": out.reply,
        "concerns": out.concerns,
        "notice": "讨论不是历史",
        "auto_canon": false,
    })))
}

async fn plan_suggest(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let goal_id = body.get("goal_id").and_then(|v| v.as_str()).unwrap_or("");
    let g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let goal_draft = if let Some(d) = sess.drafts.iter().find(|d| d.id == goal_id) {
        d.draft.clone()
    } else if let Some(b) = canon.beats.iter().find(|b| b.id == goal_id) {
        BeatDraft {
            id: Some(b.id.clone()),
            kind: b.kind.clone(),
            column_id: b.column_id.clone(),
            intent: b.intent.clone(),
            clock_from: b.clock_from,
            clock_to: b.clock_to,
            place_id: b.place_id.clone(),
            presences: b.presences.clone(),
            ..BeatDraft::default()
        }
    } else {
        return Err((StatusCode::BAD_REQUEST, "没有目标场".into()));
    };
    if goal_draft.intent.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "目标场没有本场任务，不能给铺场建议".into()));
    }
    let (from, to) = match plan_window(&canon, &goal_draft) {
        Ok(w) => w,
        Err(notice) => {
            return Ok(Json(serde_json::json!({
                "need_structure": true,
                "options": ["后移", "借时间"],
                "notice": notice,
            })));
        }
    };
    let world = sess
        .book
        .world_at(from.saturating_sub(1).max(0), None)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let span = span_circumstances(&world, &canon, from, to, &goal_draft);
    drop(g);
    let mut facts = span.states.clone();
    facts.extend(span.knowledge_gaps.clone());
    facts.extend(span.beats_between.clone());
    for p in &span.open_promises {
        facts.push(p.name.clone());
    }
    facts.push(goal_draft.intent.clone());
    let user = plan_user_prompt(&goal_draft.intent, &facts, &span);
    let content = call_chat(plan_system_prompt(), &user).await?;
    let (summary, bones) =
        parse_plan_content(&content, &facts).map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    Ok(Json(serde_json::json!({
        "summary": summary,
        "bones": bones,
        "span": span,
        "persisted": false,
        "need_mid": true,
        "notice": "建议不进历史，刷新即消失，除非你点落为预场",
    })))
}

async fn plan_apply(
    State(app): State<App>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mode = body.get("mode").and_then(|v| v.as_str()).unwrap_or("tail");
    if mode == "mid" && body.get("structure_confirmed").and_then(|v| v.as_bool()) != Some(true) {
        return Err((
            StatusCode::BAD_REQUEST,
            "插在中间须先确认变更（结构层），场仍是草稿".into(),
        ));
    }
    let bones: Vec<PlanBone> = body
        .get("bones")
        .cloned()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    if bones.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有要落下的骨架".into()));
    }
    let mut g = app.inner.lock().await;
    let name = g.current.clone().ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let sess = g.books.get_mut(&name).ok_or((StatusCode::BAD_REQUEST, "未打开书".into()))?;
    let canon = sess
        .book
        .load_canon()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let (place_col, clock_from, clock_to) = if mode == "mid" {
        let goal_id = body.get("goal_id").and_then(|v| v.as_str()).unwrap_or("");
        let goal_draft = if let Some(d) = sess.drafts.iter().find(|d| d.id == goal_id) {
            d.draft.clone()
        } else if let Some(b) = canon.beats.iter().find(|b| b.id == goal_id) {
            BeatDraft {
                id: Some(b.id.clone()),
                kind: b.kind.clone(),
                column_id: b.column_id.clone(),
                intent: b.intent.clone(),
                clock_from: b.clock_from,
                clock_to: b.clock_to,
                place_id: b.place_id.clone(),
                presences: b.presences.clone(),
                ..BeatDraft::default()
            }
        } else {
            return Err((StatusCode::BAD_REQUEST, "没有目标场".into()));
        };
        let mut cols = canon.columns.clone();
        cols.sort_by_key(|c| c.display_ord);
        let gi = cols
            .iter()
            .position(|c| c.id == goal_draft.column_id)
            .ok_or((StatusCode::BAD_REQUEST, "目标场没有列".into()))?;
        let last = canon
            .beats
            .iter()
            .filter(|b| b.status == STATUS_COMMITTED)
            .max_by_key(|b| b.clock_to);
        let last_ord = last
            .and_then(|b| cols.iter().find(|c| c.id == b.column_id))
            .map(|c| c.display_ord)
            .unwrap_or(-1);
        if let Some(c) = cols
            .iter()
            .find(|c| c.display_ord > last_ord && c.display_ord < cols[gi].display_ord)
            .cloned()
        {
            (c.id, c.clock_from, c.clock_to)
        } else {
            let dur = 60_i64;
            let insert_from = if gi == 0 {
                cols[0].clock_from
            } else {
                cols[gi - 1].clock_to
            };
            for c in cols.iter_mut().skip(gi) {
                c.clock_from += dur;
                c.clock_to += dur;
            }
            let next = cols.iter().map(|c| c.display_ord).max().unwrap_or(-1) + 1;
            let new_id = format!("col{next}");
            cols.insert(
                gi,
                Column {
                    id: new_id.clone(),
                    clock_from: insert_from,
                    clock_to: insert_from + dur,
                    display_ord: next,
                },
            );
            for (i, c) in cols.iter_mut().enumerate() {
                c.display_ord = i as i64;
            }
            SettingBook::preview_columns(&cols)
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            sess.book
                .confirm_columns(cols.clone())
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            for d in sess.drafts.iter_mut() {
                if let Some(c) = cols.iter().find(|c| c.id == d.draft.column_id) {
                    let orig = canon.columns.iter().find(|x| x.id == c.id);
                    if orig.map(|o| o.clock_from != c.clock_from).unwrap_or(false) {
                        d.draft.clock_from = c.clock_from;
                        d.draft.clock_to = c.clock_to;
                    }
                }
            }
            (new_id, insert_from, insert_from + dur)
        }
    } else {
        let last = canon
            .columns
            .iter()
            .max_by_key(|c| c.display_ord)
            .cloned()
            .ok_or((StatusCode::BAD_REQUEST, "没有列".into()))?;
        (last.id, last.clock_from, last.clock_to)
    };
    if mode == "mid" {
        for d in sess.drafts.iter_mut() {
            if d.filled && d.draft.clock_from >= clock_to {
                d.stale_world = true;
            }
        }
    }
    let mut ids = vec![];
    for (i, bone) in bones.iter().enumerate() {
        let id = format!(
            "pre{}{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0),
            i
        );
        sess.drafts.push(UiDraft::new(
            id.clone(),
            "预场",
            BeatDraft {
                id: Some(id.clone()),
                kind: "scene".into(),
                column_id: place_col.clone(),
                intent: bone.intent.clone(),
                value_shift: Some(bone.necessity.clone()),
                clock_from,
                clock_to,
                presences: bone
                    .presence
                    .iter()
                    .map(|p| Presence {
                        entity_id: p.clone(),
                        beat_id: String::new(),
                        role: ROLE_PRESENT.into(),
                    })
                    .collect(),
                ..BeatDraft::default()
            },
        ));
        ids.push(id);
    }
    persist_drafts(&app.data_root, &name, &sess.drafts);
    Ok(Json(serde_json::json!({
        "ok": true,
        "ids": ids,
        "draft_only": true,
        "auto_canon": false,
        "column_id": place_col,
        "notice": "预场只到任务和在场，不是历史",
    })))
}

#[cfg(test)]
mod ipv4_pin_tests {
    use super::pin_ipv4_addr;
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

    #[test]
    fn picks_v4_skips_v6() {
        let v6 = SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), 443);
        let v4 = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(39, 106, 104, 16)), 443);
        assert_eq!(pin_ipv4_addr([v6, v4]), Some(v4));
        assert_eq!(pin_ipv4_addr([v6]), None);
        assert_eq!(pin_ipv4_addr([]), None);
    }
}
