//! 算出这一刻：纯函数。给定已写入正史的历史 + 故事时间 → 这一刻的世界。
//! 不要塞进 `temporal.rs`。

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const ROLE_PRESENT: &str = "present";
pub const ROLE_MENTIONED: &str = "mentioned";

pub const KIND_PERSON: &str = "person";
pub const KIND_PLACE: &str = "place";
pub const KIND_THING: &str = "thing";
pub const KIND_FACTION: &str = "faction";
pub const KIND_RULE: &str = "rule";
pub const KIND_PROMISE: &str = "promise";

pub const BEAT_SCENE: &str = "scene";
pub const BEAT_ELLIPSIS: &str = "ellipsis";

pub const STATUS_COMMITTED: &str = "committed";
pub const STATUS_SUPERSEDED: &str = "superseded";

pub const ATTR_WHERE: &str = "where";
pub const ATTR_HOLDS: &str = "holds";
pub const ATTR_MEMBER: &str = "member";

pub const CERT_KNOWS: &str = "knows";
pub const CERT_WRONG: &str = "wrong";
pub const CERT_SUSPECT: &str = "suspects";
pub const CERT_DENY: &str = "denies";
pub const CERT_FORGOT: &str = "forgot";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Entity {
    pub id: String,
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub profile: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Column {
    pub id: String,
    pub clock_from: i64,
    pub clock_to: i64,
    pub display_ord: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Presence {
    pub entity_id: String,
    pub beat_id: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Delta {
    pub entity_id: String,
    pub attr: String,
    pub value: String,
    /// 窗口起点；可早于本场（晚到）。
    pub clock_from: i64,
    /// None = 仍开着。
    pub clock_to: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct KnowledgeWrite {
    pub person_id: String,
    pub fact: String,
    /// knows / suspects / wrong / denies / forgot。空 = knows。
    #[serde(default)]
    pub certainty: String,
    /// 信错时：实际是什么（来自情状，不是第二份真源字符串）。
    #[serde(default)]
    pub truth_value: Option<String>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub source_person: Option<String>,
}

impl KnowledgeWrite {
    pub fn certainty_or_knows(&self) -> &str {
        if self.certainty.is_empty() {
            CERT_KNOWS
        } else {
            self.certainty.as_str()
        }
    }

    pub fn is_wrong(&self) -> bool {
        self.certainty_or_knows() == CERT_WRONG
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PromiseOp {
    pub promise_id: String,
    pub op: String, // plant / advance / payoff / discard
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Promise {
    pub id: String,
    pub name: String,
    pub status: String, // open / paid / discarded
    #[serde(default)]
    pub related: Vec<String>,
    pub plant_clock: Option<i64>,
    pub deadline_clock: Option<i64>,
    #[serde(default)]
    pub red_herring: bool,
}

/// 一场里一个人的动作 / 对白 / 内心。限知按这条轨检查。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PersonTrack {
    pub person_id: String,
    #[serde(default)]
    pub do_text: Option<String>,
    #[serde(default)]
    pub say_text: Option<String>,
    #[serde(default)]
    pub think_text: Option<String>,
}

pub fn flatten_tracks(tracks: &[PersonTrack]) -> (Option<String>, Option<String>, Option<String>) {
    let join = |pick: fn(&PersonTrack) -> Option<&str>| {
        let s = tracks
            .iter()
            .filter_map(|t| {
                let v = pick(t)?.trim();
                if v.is_empty() {
                    None
                } else {
                    Some(format!("{}：{}", t.person_id, v))
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    };
    (
        join(|t| t.do_text.as_deref()),
        join(|t| t.say_text.as_deref()),
        join(|t| t.think_text.as_deref()),
    )
}

pub fn apply_track_flatten(draft: &mut BeatDraft) {
    if draft.tracks.is_empty() {
        return;
    }
    let (do_t, say_t, think_t) = flatten_tracks(&draft.tracks);
    if do_t.is_some() {
        draft.do_text = do_t;
    }
    if say_t.is_some() {
        draft.say_text = say_t;
    }
    if think_t.is_some() {
        draft.think_text = think_t;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Beat {
    pub id: String,
    pub kind: String,
    pub column_id: String,
    pub status: String,
    pub commit_seq: i64,
    pub intent: String,
    pub value_shift: Option<String>,
    pub do_text: Option<String>,
    pub say_text: Option<String>,
    pub think_text: Option<String>,
    pub clock_from: i64,
    pub clock_to: i64,
    pub place_id: Option<String>,
    pub telling_ord: Option<i64>,
    pub cause_beat: Option<String>,
    pub visible_to: Option<Vec<String>>,
    #[serde(default)]
    pub deltas: Vec<Delta>,
    #[serde(default)]
    pub knowledge_writes: Vec<KnowledgeWrite>,
    #[serde(default)]
    pub promise_ops: Vec<PromiseOp>,
    #[serde(default)]
    pub presences: Vec<Presence>,
    #[serde(default)]
    pub tracks: Vec<PersonTrack>,
}

/// 写入正史之前的一场，只存在应用内存。不进 Narra。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct BeatDraft {
    pub id: Option<String>,
    pub kind: String,
    pub column_id: String,
    pub intent: String,
    pub value_shift: Option<String>,
    pub do_text: Option<String>,
    pub say_text: Option<String>,
    pub think_text: Option<String>,
    pub clock_from: i64,
    pub clock_to: i64,
    pub place_id: Option<String>,
    pub telling_ord: Option<i64>,
    pub cause_beat: Option<String>,
    pub visible_to: Option<Vec<String>>,
    #[serde(default)]
    pub deltas: Vec<Delta>,
    #[serde(default)]
    pub knowledge_writes: Vec<KnowledgeWrite>,
    #[serde(default)]
    pub promise_ops: Vec<PromiseOp>,
    #[serde(default)]
    pub presences: Vec<Presence>,
    #[serde(default)]
    pub tracks: Vec<PersonTrack>,
    /// 注入 RELATE 失败（切片 1.3）。
    #[serde(default)]
    pub fail_relate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StateWindow {
    pub entity_id: String,
    pub attr: String,
    pub value: String,
    pub clock_from: i64,
    pub clock_to: Option<i64>,
    pub commit_seq: i64,
    pub source_beat: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KnowledgeFact {
    pub person_id: String,
    pub fact: String,
    pub scene_id: String,
    pub clock_from: i64,
    pub commit_seq: i64,
    #[serde(default)]
    pub certainty: String,
    #[serde(default)]
    pub truth_value: Option<String>,
    #[serde(default)]
    pub method: Option<String>,
}

impl KnowledgeFact {
    pub fn certainty_or_knows(&self) -> &str {
        if self.certainty.is_empty() {
            CERT_KNOWS
        } else {
            self.certainty.as_str()
        }
    }

    pub fn is_known_true(&self) -> bool {
        self.certainty_or_knows() == CERT_KNOWS
    }

    pub fn is_wrong(&self) -> bool {
        self.certainty_or_knows() == CERT_WRONG
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct World {
    pub t: i64,
    pub as_of: Option<i64>,
    pub nodes: Vec<Entity>,
    pub states: Vec<StateWindow>,
    pub r#where: BTreeMap<String, String>,
    pub covering: Vec<String>,
    pub knows: BTreeMap<String, Vec<String>>,
    /// 含信错/怀疑。knows 只收「知道」。
    #[serde(default)]
    pub beliefs: Vec<KnowledgeFact>,
    pub promises: Vec<Promise>,
    pub edges: Vec<Presence>,
    /// 同列正在演的场（含省略场）。
    pub playing: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct Canon {
    pub entities: Vec<Entity>,
    pub columns: Vec<Column>,
    pub beats: Vec<Beat>,
    pub promises: Vec<Promise>,
}

impl Canon {
    pub fn committed_beats(&self, as_of: Option<i64>) -> Vec<&Beat> {
        let mut beats: Vec<&Beat> = self
            .beats
            .iter()
            .filter(|b| b.status == STATUS_COMMITTED)
            .filter(|b| as_of.map(|s| b.commit_seq <= s).unwrap_or(true))
            .collect();
        beats.sort_by_key(|b| (b.clock_from, b.commit_seq));
        beats
    }

    pub fn entity(&self, id: &str) -> Option<&Entity> {
        self.entities.iter().find(|e| e.id == id)
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct FoldState {
    windows: Vec<StateWindow>,
    knows: Vec<KnowledgeFact>,
    promises: BTreeMap<String, Promise>,
    covering: BTreeMap<String, Vec<(String, String, i64)>>, // column_clock_from -> (entity, place, seq)
}

fn close_overlapping(
    windows: &mut Vec<StateWindow>,
    entity_id: &str,
    attr: &str,
    new_from: i64,
    new_value: &str,
    source: &str,
) -> Result<bool, String> {
    for w in windows.iter_mut() {
        if w.entity_id == entity_id && w.attr == attr && w.clock_to.is_none() {
            if w.clock_from < new_from {
                w.clock_to = Some(new_from);
            } else if w.clock_from == new_from {
                if w.value == new_value {
                    return Ok(false);
                }
                if w.source_beat == source {
                    w.value = new_value.to_string();
                    return Ok(false);
                }
                return Err(format!(
                    "禁止静默并存：{entity_id}.{attr} 已有开窗与新窗同起点（来自 {source}）"
                ));
            } else {
                return Err(format!(
                    "禁止静默并存：{entity_id}.{attr} 开窗与新窗重叠"
                ));
            }
        } else if w.entity_id == entity_id
            && w.attr == attr
            && w.clock_to.map(|to| w.clock_from < new_from && new_from < to).unwrap_or(false)
        {
            return Err(format!(
                "禁止静默并存：{entity_id}.{attr} 与未收口窗口重叠"
            ));
        }
    }
    Ok(true)
}

/// 把一场已正史场算进世界。顺序固定。
pub(crate) fn apply_scene(mut st: FoldState, beat: &Beat) -> Result<FoldState, String> {
    // 1. 在场
    if let Some(place) = &beat.place_id {
        for p in beat
            .presences
            .iter()
            .filter(|p| p.role == ROLE_PRESENT)
        {
            st.covering
                .entry(beat.column_id.clone())
                .or_default()
                .push((p.entity_id.clone(), place.clone(), beat.commit_seq));
        }
    }

    // 2. 所在地惯性
    if let Some(place) = &beat.place_id {
        for p in beat.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
            if close_overlapping(
                &mut st.windows,
                &p.entity_id,
                ATTR_WHERE,
                beat.clock_from,
                place,
                &beat.id,
            )? {
                st.windows.push(StateWindow {
                    entity_id: p.entity_id.clone(),
                    attr: ATTR_WHERE.to_string(),
                    value: place.clone(),
                    clock_from: beat.clock_from,
                    clock_to: None,
                    commit_seq: beat.commit_seq,
                    source_beat: beat.id.clone(),
                });
            }
        }
    }

    // 3. 本场变化 → 情状
    for d in &beat.deltas {
        if close_overlapping(
            &mut st.windows,
            &d.entity_id,
            &d.attr,
            d.clock_from,
            &d.value,
            &beat.id,
        )? {
            st.windows.push(StateWindow {
                entity_id: d.entity_id.clone(),
                attr: d.attr.clone(),
                value: d.value.clone(),
                clock_from: d.clock_from,
                clock_to: d.clock_to,
                commit_seq: beat.commit_seq,
                source_beat: beat.id.clone(),
            });
        }
    }

    // 4. 知情
    for k in &beat.knowledge_writes {
        st.knows.push(KnowledgeFact {
            person_id: k.person_id.clone(),
            fact: k.fact.clone(),
            scene_id: beat.id.clone(),
            clock_from: beat.clock_from,
            commit_seq: beat.commit_seq,
            certainty: k.certainty_or_knows().to_string(),
            truth_value: k.truth_value.clone(),
            method: k.method.clone(),
        });
    }
    if beat.kind != BEAT_ELLIPSIS {
        let witnesses: Vec<String> = if let Some(vis) = &beat.visible_to {
            vis.clone()
        } else {
            beat.presences
                .iter()
                .filter(|p| p.role == ROLE_PRESENT)
                .map(|p| p.entity_id.clone())
                .collect()
        };
        if beat.do_text.as_deref().map(|s| !s.is_empty()).unwrap_or(false) {
            let fact = format!("看见:{}", beat.do_text.as_deref().unwrap());
            for w in &witnesses {
                st.knows.push(KnowledgeFact {
                    person_id: w.clone(),
                    fact: fact.clone(),
                    scene_id: beat.id.clone(),
                    clock_from: beat.clock_from,
                    commit_seq: beat.commit_seq,
                    certainty: CERT_KNOWS.into(),
                    truth_value: None,
                    method: Some("saw".into()),
                });
            }
        }
        if beat.say_text.as_deref().map(|s| !s.is_empty()).unwrap_or(false) {
            let fact = format!("听见:{}", beat.say_text.as_deref().unwrap());
            for w in &witnesses {
                st.knows.push(KnowledgeFact {
                    person_id: w.clone(),
                    fact: fact.clone(),
                    scene_id: beat.id.clone(),
                    clock_from: beat.clock_from,
                    commit_seq: beat.commit_seq,
                    certainty: CERT_KNOWS.into(),
                    truth_value: None,
                    method: Some("heard".into()),
                });
            }
        }
        if let Some(think) = beat.think_text.as_deref().filter(|s| !s.is_empty()) {
            // 内心仅本人：从在场里找不到「说话人」时，不广播。
            // 约定：think 归属第一个 present；测试里写明阿福 think。
            if let Some(owner) = beat
                .presences
                .iter()
                .find(|p| p.role == ROLE_PRESENT)
                .map(|p| p.entity_id.clone())
            {
                st.knows.push(KnowledgeFact {
                    person_id: owner,
                    fact: format!("心想:{think}"),
                    scene_id: beat.id.clone(),
                    clock_from: beat.clock_from,
                    commit_seq: beat.commit_seq,
                    certainty: CERT_KNOWS.into(),
                    truth_value: None,
                    method: Some("thought".into()),
                });
            }
        }
    }

    // 5. 伏笔
    for op in &beat.promise_ops {
        let p = st
            .promises
            .entry(op.promise_id.clone())
            .or_insert_with(|| Promise {
                id: op.promise_id.clone(),
                name: op.promise_id.clone(),
                status: "open".into(),
                related: vec![],
                plant_clock: None,
                deadline_clock: None,
                red_herring: false,
            });
        match op.op.as_str() {
            "plant" => {
                p.status = "open".into();
                p.plant_clock = Some(beat.clock_from);
            }
            "advance" => {}
            "payoff" => p.status = "paid".into(),
            "discard" => p.status = "discarded".into(),
            _ => {}
        }
    }

    Ok(st)
}

fn window_covers(w: &StateWindow, t: i64) -> bool {
    w.clock_from <= t && w.clock_to.map(|to| t < to).unwrap_or(true)
}

/// 全量算出这一刻。
pub fn world_at(canon: &Canon, t: i64, as_of: Option<i64>) -> Result<World, String> {
    fold_from(canon, t, as_of, FoldState::default(), None)
}

/// 从已有折状态接着折（增量）。未接线，禁止当「已交付的等价路径」。
#[allow(dead_code)]
pub(crate) fn fold_incremental(
    canon: &Canon,
    t: i64,
    as_of: Option<i64>,
    prev: FoldState,
    after_seq: i64,
) -> Result<World, String> {
    fold_from(canon, t, as_of, prev, Some(after_seq))
}

fn fold_from(
    canon: &Canon,
    t: i64,
    as_of: Option<i64>,
    mut st: FoldState,
    after_seq: Option<i64>,
) -> Result<World, String> {
    for p in &canon.promises {
        st.promises.entry(p.id.clone()).or_insert_with(|| p.clone());
    }
    let beats = canon.committed_beats(as_of);
    for b in beats {
        if after_seq.map(|s| b.commit_seq <= s).unwrap_or(false) {
            continue;
        }
        st = apply_scene(st, b)?;
    }

    let states: Vec<StateWindow> = st
        .windows
        .iter()
        .filter(|w| window_covers(w, t))
        .cloned()
        .collect();

    let mut where_map = BTreeMap::new();
    for w in &states {
        if w.attr == ATTR_WHERE {
            where_map.insert(w.entity_id.clone(), w.value.clone());
        }
    }

    let playing: Vec<String> = canon
        .committed_beats(as_of)
        .into_iter()
        .filter(|b| b.clock_from <= t && t < b.clock_to)
        .map(|b| b.id.clone())
        .collect();

    let mut covering = Vec::new();
    let mut edges = Vec::new();
    for b in canon.committed_beats(as_of) {
        if b.clock_from <= t && t < b.clock_to {
            for p in &b.presences {
                if p.role == ROLE_PRESENT {
                    covering.push(p.entity_id.clone());
                }
                edges.push(p.clone());
            }
        }
    }
    covering.sort();
    covering.dedup();

    let mut knows: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut beliefs = Vec::new();
    for k in &st.knows {
        if k.clock_from <= t {
            beliefs.push(k.clone());
            if k.is_known_true() {
                knows.entry(k.person_id.clone()).or_default().push(k.fact.clone());
            }
        }
    }
    for v in knows.values_mut() {
        v.sort();
        v.dedup();
    }

    let promises: Vec<Promise> = st.promises.into_values().collect();

    Ok(World {
        t,
        as_of,
        nodes: canon.entities.clone(),
        states,
        r#where: where_map,
        covering,
        knows,
        beliefs,
        promises,
        edges,
        playing,
    })
}

pub fn knows_at(canon: &Canon, t: i64, person: &str, as_of: Option<i64>) -> Result<Vec<String>, String> {
    let w = world_at(canon, t, as_of)?;
    Ok(w.knows.get(person).cloned().unwrap_or_default())
}

#[allow(dead_code)]
pub(crate) fn fold_state_for_materialize(canon: &Canon, as_of: Option<i64>) -> Result<FoldState, String> {
    let mut st = FoldState::default();
    for p in &canon.promises {
        st.promises.insert(p.id.clone(), p.clone());
    }
    for b in canon.committed_beats(as_of) {
        st = apply_scene(st, b)?;
    }
    Ok(st)
}

/// 观察等价比较（结构化，不是第二套 fold）。
pub fn worlds_equivalent(a: &World, b: &World) -> bool {
    let mut aa = a.clone();
    let mut bb = b.clone();
    aa.nodes.sort_by(|x, y| x.id.cmp(&y.id));
    bb.nodes.sort_by(|x, y| x.id.cmp(&y.id));
    aa.states.sort_by(|x, y| {
        (x.entity_id.clone(), x.attr.clone(), x.clock_from).cmp(&(
            y.entity_id.clone(),
            y.attr.clone(),
            y.clock_from,
        ))
    });
    bb.states.sort_by(|x, y| {
        (x.entity_id.clone(), x.attr.clone(), x.clock_from).cmp(&(
            y.entity_id.clone(),
            y.attr.clone(),
            y.clock_from,
        ))
    });
    aa.playing.sort();
    bb.playing.sort();
    aa.covering.sort();
    bb.covering.sort();
    aa.promises.sort_by(|x, y| x.id.cmp(&y.id));
    bb.promises.sort_by(|x, y| x.id.cmp(&y.id));
    aa.beliefs.sort_by(|x, y| {
        (x.person_id.clone(), x.fact.clone(), x.clock_from).cmp(&(
            y.person_id.clone(),
            y.fact.clone(),
            y.clock_from,
        ))
    });
    bb.beliefs.sort_by(|x, y| {
        (x.person_id.clone(), x.fact.clone(), x.clock_from).cmp(&(
            y.person_id.clone(),
            y.fact.clone(),
            y.clock_from,
        ))
    });
    aa == bb
}

pub fn empty_world(t: i64) -> World {
    World {
        t,
        as_of: None,
        ..World::default()
    }
}
