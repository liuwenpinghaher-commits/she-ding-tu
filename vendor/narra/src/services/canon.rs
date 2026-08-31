//! 人点之后才 mutate Narra：写入正史 / 确认变更 / 作废。

use crate::db::connection::NarraDb;
use crate::services::circumstances::{given_circumstances, ScenePacket};
use crate::services::constrain::{constrain, ConstraintReport};
use crate::services::materialize::{invalidate_interval, world_at_cached};
use crate::services::narra_bridge;
use crate::services::world::{
    knows_at, world_at, Beat, BeatDraft, Canon, Column, Delta, Entity, KnowledgeWrite, Presence,
    Promise, PromiseOp, World, KIND_RULE, STATUS_COMMITTED, STATUS_SUPERSEDED,
};
use crate::NarraError;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use surrealdb::RecordId;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EntityRow {
    id: RecordId,
    kind: String,
    name: String,
    profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ColumnRow {
    id: RecordId,
    clock_from: i64,
    clock_to: i64,
    display_ord: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BeatRow {
    id: RecordId,
    kind: String,
    column: RecordId,
    status: String,
    commit_seq: i64,
    intent: String,
    value_shift: Option<String>,
    do_text: Option<String>,
    say_text: Option<String>,
    think_text: Option<String>,
    clock_from: i64,
    clock_to: i64,
    place: Option<RecordId>,
    telling_ord: Option<i64>,
    cause_beat: Option<RecordId>,
    visible_to: Option<Vec<String>>,
    deltas_json: Option<String>,
    promise_ops_json: Option<String>,
    knowledge_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowRow {
    entity: RecordId,
    attr: String,
    value: String,
    clock_from: i64,
    clock_to: Option<i64>,
    commit_seq: i64,
    source_beat: RecordId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KnowsEdgeRow {
    #[serde(rename = "in")]
    inn: RecordId,
    out: RecordId,
    certainty: Option<String>,
    truth_value: Option<String>,
    learning_method: Option<String>,
    scene: Option<RecordId>,
    clock_from: Option<i64>,
    commit_seq: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KnowledgeRow {
    id: RecordId,
    fact: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RelRow {
    #[serde(rename = "in")]
    inn: RecordId,
    #[serde(rename = "out")]
    out: RecordId,
    role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SceneRow {
    id: RecordId,
    status: Option<String>,
    commit_seq: Option<i64>,
    kind: Option<String>,
    intent: Option<String>,
    value_shift: Option<String>,
    do_text: Option<String>,
    say_text: Option<String>,
    think_text: Option<String>,
    telling_ord: Option<i64>,
    visible_to: Option<Vec<String>>,
    event: Option<RecordId>,
    primary_location: Option<RecordId>,
    setting_beat: Option<RecordId>,
    clock_from: Option<i64>,
    clock_to: Option<i64>,
    cause_beat: Option<RecordId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FactRow {
    id: RecordId,
    title: Option<String>,
    description: Option<String>,
    enforcement_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PromiseRow {
    id: RecordId,
    name: String,
    status: String,
    related: Vec<String>,
    plant_clock: Option<i64>,
    deadline_clock: Option<i64>,
    red_herring: bool,
}

/// 改已写入正史的场。缺省字段保持原值。不新分配 commit_seq。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BeatPatch {
    pub intent: Option<String>,
    pub do_text: Option<String>,
    pub say_text: Option<String>,
    pub think_text: Option<String>,
    pub value_shift: Option<String>,
    pub place_id: Option<String>,
    pub deltas: Option<Vec<Delta>>,
    pub knowledge_writes: Option<Vec<KnowledgeWrite>>,
    pub promise_ops: Option<Vec<PromiseOp>>,
    pub visible_to: Option<Vec<String>>,
}

fn opt_text(s: String) -> Option<String> {
    let t = s.trim().to_string();
    if t.is_empty() {
        None
    } else {
        Some(t)
    }
}

fn beat_as_draft(b: &Beat) -> BeatDraft {
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
        telling_ord: b.telling_ord,
        cause_beat: b.cause_beat.clone(),
        visible_to: b.visible_to.clone(),
        deltas: b.deltas.clone(),
        knowledge_writes: b.knowledge_writes.clone(),
        promise_ops: b.promise_ops.clone(),
        presences: b.presences.clone(),
        ..BeatDraft::default()
    }
}

fn rec_key(id: &RecordId) -> String {
    id.key()
        .to_string()
        .trim_matches(|c| c == '"' || c == '`')
        .to_string()
}

fn nonempty(s: &Option<String>) -> Option<String> {
    s.as_ref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
}

fn overlay_scene_content(b: &mut Beat, sc: &SceneRow) {
    if let Some(k) = nonempty(&sc.kind) {
        b.kind = k;
    }
    if let Some(i) = nonempty(&sc.intent) {
        b.intent = i;
    }
    if sc.value_shift.is_some() {
        b.value_shift = nonempty(&sc.value_shift);
    }
    if sc.do_text.is_some() {
        b.do_text = nonempty(&sc.do_text);
    }
    if sc.say_text.is_some() {
        b.say_text = nonempty(&sc.say_text);
    }
    if sc.think_text.is_some() {
        b.think_text = nonempty(&sc.think_text);
    }
    if sc.telling_ord.is_some() {
        b.telling_ord = sc.telling_ord;
    }
    if sc.visible_to.is_some() {
        b.visible_to = sc.visible_to.clone();
    }
    if let Some(ev) = &sc.event {
        b.column_id = rec_key(ev);
    }
    if sc.primary_location.is_some() {
        b.place_id = sc.primary_location.as_ref().map(rec_key);
    }
    if let Some(t) = sc.clock_from {
        b.clock_from = t;
    }
    if let Some(t) = sc.clock_to {
        b.clock_to = t;
    }
    if sc.cause_beat.is_some() {
        b.cause_beat = sc.cause_beat.as_ref().map(rec_key);
    }
}

fn overlay_scene(b: &mut Beat, sc: &SceneRow) {
    overlay_scene_content(b, sc);
    if let Some(s) = nonempty(&sc.status) {
        b.status = s;
    }
    if let Some(n) = sc.commit_seq {
        b.commit_seq = n;
    }
}

fn beat_from_scene(
    sc: &SceneRow,
    win_map: &std::collections::HashMap<String, Vec<Delta>>,
    know_map: &std::collections::HashMap<String, Vec<KnowledgeWrite>>,
) -> Beat {
    let id = sc
        .setting_beat
        .as_ref()
        .map(rec_key)
        .unwrap_or_else(|| rec_key(&sc.id));
    let mut b = Beat {
        id: id.clone(),
        kind: nonempty(&sc.kind).unwrap_or_else(|| "scene".into()),
        column_id: sc.event.as_ref().map(rec_key).unwrap_or_default(),
        status: nonempty(&sc.status).unwrap_or_else(|| STATUS_COMMITTED.into()),
        commit_seq: sc.commit_seq.unwrap_or(0),
        intent: nonempty(&sc.intent).unwrap_or_default(),
        value_shift: nonempty(&sc.value_shift),
        do_text: nonempty(&sc.do_text),
        say_text: nonempty(&sc.say_text),
        think_text: nonempty(&sc.think_text),
        clock_from: sc.clock_from.unwrap_or(0),
        clock_to: sc.clock_to.unwrap_or(0),
        place_id: sc.primary_location.as_ref().map(rec_key),
        telling_ord: sc.telling_ord,
        cause_beat: sc.cause_beat.as_ref().map(rec_key),
        visible_to: sc.visible_to.clone(),
        deltas: win_map.get(&id).cloned().unwrap_or_default(),
        knowledge_writes: know_map.get(&id).cloned().unwrap_or_default(),
        promise_ops: vec![],
        presences: vec![],
    };
    overlay_scene(&mut b, sc);
    b
}

fn fact_enforcement_label(level: &str) -> &'static str {
    match level.trim().to_ascii_lowercase().as_str() {
        "strict" | "hard" | "挡" => "挡",
        "warning" | "warn" | "标黄" => "标黄",
        _ => "无",
    }
}

pub struct SettingBook {
    db: Arc<NarraDb>,
}

impl SettingBook {
    pub fn new(db: Arc<NarraDb>) -> Self {
        Self { db }
    }

    pub async fn load_canon(&self) -> Result<Canon, NarraError> {
        let mut q = self
            .db
            .query("SELECT * FROM setting_entity; SELECT * FROM setting_column; SELECT * FROM setting_beat; SELECT * FROM setting_present_in; SELECT * FROM setting_promise; SELECT entity, attr, value, clock_from, clock_to, commit_seq, source_beat FROM setting_window; SELECT * FROM knows; SELECT id, fact FROM knowledge; SELECT id, status, commit_seq, kind, intent, value_shift, do_text, say_text, think_text, telling_ord, visible_to, event, primary_location, setting_beat, clock_from, clock_to, cause_beat FROM scene; SELECT id, title, description, enforcement_level FROM universe_fact;")
            .await?;
        let entities: Vec<EntityRow> = q.take(0)?;
        let columns: Vec<ColumnRow> = q.take(1)?;
        let beats: Vec<BeatRow> = q.take(2)?;
        let rels: Vec<RelRow> = q.take(3)?;
        let promises: Vec<PromiseRow> = q.take(4)?;
        let windows: Vec<WindowRow> = q.take(5).unwrap_or_default();
        let know_edges: Vec<KnowsEdgeRow> = q.take(6).unwrap_or_default();
        let knowledge_rows: Vec<KnowledgeRow> = q.take(7).unwrap_or_default();
        let scenes: Vec<SceneRow> = q.take(8).unwrap_or_default();
        let facts: Vec<FactRow> = q.take(9).unwrap_or_default();

        let mut entities: Vec<Entity> = entities
            .into_iter()
            .map(|e| Entity {
                id: rec_key(&e.id),
                kind: e.kind,
                name: e.name,
                profile: e
                    .profile
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
            })
            .collect();
        for f in &facts {
            let id = rec_key(&f.id);
            let enf = f
                .enforcement_level
                .as_deref()
                .map(fact_enforcement_label)
                .unwrap_or("无");
            if let Some(e) = entities
                .iter_mut()
                .find(|e| e.id == id && e.kind == KIND_RULE)
            {
                if e.profile
                    .get("enforcement")
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true)
                {
                    e.profile.insert("enforcement".into(), enf.into());
                }
                if e.profile
                    .get("scope")
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true)
                {
                    if let Some(desc) = f.description.as_deref() {
                        if let Some((_, rest)) = desc.split_once("范围：") {
                            e.profile.insert("scope".into(), rest.trim().into());
                        }
                    }
                }
            }
        }
        let columns: Vec<Column> = columns
            .into_iter()
            .map(|c| Column {
                id: rec_key(&c.id),
                clock_from: c.clock_from,
                clock_to: c.clock_to,
                display_ord: c.display_ord,
            })
            .collect();
        let mut win_map: std::collections::HashMap<String, Vec<Delta>> =
            std::collections::HashMap::new();
        for w in windows {
            win_map.entry(rec_key(&w.source_beat)).or_default().push(Delta {
                entity_id: rec_key(&w.entity),
                attr: w.attr,
                value: w.value,
                clock_from: w.clock_from,
                clock_to: w.clock_to,
            });
        }
        let fact_by_kid: std::collections::HashMap<String, String> = knowledge_rows
            .into_iter()
            .map(|k| (rec_key(&k.id), k.fact))
            .collect();
        let mut know_map: std::collections::HashMap<String, Vec<KnowledgeWrite>> =
            std::collections::HashMap::new();
        for e in know_edges {
            let Some(scene) = e.scene.as_ref() else { continue };
            let fact = fact_by_kid
                .get(&rec_key(&e.out))
                .cloned()
                .unwrap_or_default();
            if fact.is_empty() {
                continue;
            }
            know_map.entry(rec_key(scene)).or_default().push(KnowledgeWrite {
                person_id: rec_key(&e.inn),
                fact,
                certainty: e.certainty.unwrap_or_default(),
                truth_value: e.truth_value,
                method: e.learning_method,
                source_person: None,
            });
        }
        let mut beat_map: Vec<Beat> = beats
            .into_iter()
            .map(|b| {
                let id = rec_key(&b.id);
                let deltas = win_map.get(&id).cloned().unwrap_or_else(|| {
                    b.deltas_json
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok())
                        .unwrap_or_default()
                });
                let knowledge_writes = know_map.get(&id).cloned().unwrap_or_else(|| {
                    b.knowledge_json
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok())
                        .unwrap_or_default()
                });
                Beat {
                    id,
                    kind: b.kind,
                    column_id: rec_key(&b.column),
                    status: b.status,
                    commit_seq: b.commit_seq,
                    intent: b.intent,
                    value_shift: b.value_shift,
                    do_text: b.do_text,
                    say_text: b.say_text,
                    think_text: b.think_text,
                    clock_from: b.clock_from,
                    clock_to: b.clock_to,
                    place_id: b.place.as_ref().map(rec_key),
                    telling_ord: b.telling_ord,
                    cause_beat: b.cause_beat.as_ref().map(rec_key),
                    visible_to: b.visible_to,
                    deltas,
                    knowledge_writes,
                    promise_ops: b
                        .promise_ops_json
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok())
                        .unwrap_or_default(),
                    presences: vec![],
                }
            })
            .collect();
        for sc in scenes.iter().filter(|s| s.setting_beat.is_some()) {
            let id = sc
                .setting_beat
                .as_ref()
                .map(rec_key)
                .unwrap_or_else(|| rec_key(&sc.id));
            if let Some(b) = beat_map.iter_mut().find(|b| b.id == id) {
                overlay_scene_content(b, sc);
                if b.deltas.is_empty() {
                    if let Some(d) = win_map.get(&id) {
                        b.deltas = d.clone();
                    }
                }
                if b.knowledge_writes.is_empty() {
                    if let Some(k) = know_map.get(&id).or_else(|| know_map.get(&rec_key(&sc.id))) {
                        b.knowledge_writes = k.clone();
                    }
                }
            } else {
                beat_map.push(beat_from_scene(sc, &win_map, &know_map));
            }
        }
        for rel in rels {
            let beat_id = rec_key(&rel.out);
            let p = Presence {
                entity_id: rec_key(&rel.inn),
                beat_id: beat_id.clone(),
                role: rel.role,
            };
            if let Some(b) = beat_map.iter_mut().find(|b| b.id == beat_id) {
                b.presences.push(p);
            }
        }
        let promises = promises
            .into_iter()
            .map(|p| Promise {
                id: rec_key(&p.id),
                name: p.name,
                status: p.status,
                related: p.related,
                plant_clock: p.plant_clock,
                deadline_clock: p.deadline_clock,
                red_herring: p.red_herring,
            })
            .collect();
        Ok(Canon {
            entities,
            columns,
            beats: beat_map,
            promises,
        })
    }

    pub async fn world_at(&self, t: i64, as_of: Option<i64>) -> Result<World, NarraError> {
        let canon = self.load_canon().await?;
        world_at_cached(&self.db, &canon, t, as_of).await
    }

    pub async fn world_at_full(&self, t: i64, as_of: Option<i64>) -> Result<World, NarraError> {
        let canon = self.load_canon().await?;
        world_at(&canon, t, as_of).map_err(NarraError::Validation)
    }

    pub async fn knows_at(
        &self,
        t: i64,
        person: &str,
        as_of: Option<i64>,
    ) -> Result<Vec<String>, NarraError> {
        let canon = self.load_canon().await?;
        knows_at(&canon, t, person, as_of).map_err(NarraError::Validation)
    }

    pub async fn given_circumstances(&self, draft: &BeatDraft) -> Result<ScenePacket, NarraError> {
        let canon = self.load_canon().await?;
        let world = world_at(&canon, draft.clock_from, None).map_err(NarraError::Validation)?;
        Ok(given_circumstances(&world, &canon, draft))
    }

    pub async fn constrain_draft(&self, draft: &BeatDraft) -> Result<ConstraintReport, NarraError> {
        let canon = self.load_canon().await?;
        let world = world_at(&canon, draft.clock_from, None).map_err(NarraError::Validation)?;
        Ok(constrain(&world, &canon, draft))
    }

    pub async fn upsert_entity(&self, e: &Entity) -> Result<(), NarraError> {
        let profile = serde_json::to_string(&e.profile)?;
        let rid = RecordId::from(("setting_entity", e.id.as_str()));
        self.db
            .query("UPSERT $rid SET kind = $kind, name = $name, profile = $profile")
            .bind(("rid", rid))
            .bind(("kind", e.kind.clone()))
            .bind(("name", e.name.clone()))
            .bind(("profile", profile))
            .await?;
        narra_bridge::mirror_entity(&self.db, e).await?;
        Ok(())
    }

    pub async fn upsert_column(&self, c: &Column) -> Result<(), NarraError> {
        let rid = RecordId::from(("setting_column", c.id.as_str()));
        self.db
            .query("UPSERT $rid SET clock_from = $a, clock_to = $b, display_ord = $o")
            .bind(("rid", rid))
            .bind(("a", c.clock_from))
            .bind(("b", c.clock_to))
            .bind(("o", c.display_ord))
            .await?;
        narra_bridge::mirror_column(&self.db, c).await?;
        Ok(())
    }

    pub async fn upsert_promise(&self, p: &Promise) -> Result<(), NarraError> {
        let rid = RecordId::from(("setting_promise", p.id.as_str()));
        self.db
            .query("UPSERT $rid SET name = $n, status = $s, related = $r, plant_clock = $pc, deadline_clock = $dc, red_herring = $rh")
            .bind(("rid", rid))
            .bind(("n", p.name.clone()))
            .bind(("s", p.status.clone()))
            .bind(("r", p.related.clone()))
            .bind(("pc", p.plant_clock))
            .bind(("dc", p.deadline_clock))
            .bind(("rh", p.red_herring))
            .await?;
        Ok(())
    }

    async fn next_seq(&self) -> Result<i64, NarraError> {
        let mut q = self
            .db
            .query("SELECT math::max(commit_seq) AS m FROM setting_beat GROUP ALL")
            .await?;
        #[derive(Deserialize)]
        struct M {
            m: Option<i64>,
        }
        let rows: Vec<M> = q.take(0)?;
        Ok(rows.first().and_then(|r| r.m).unwrap_or(0) + 1)
    }

    /// 写入正史。草稿不进库。挡写入则不分配 seq。
    pub async fn commit(&self, draft: BeatDraft) -> Result<Beat, NarraError> {
        let report = self.constrain_draft(&draft).await?;
        if report.blocks() {
            let msg = report
                .findings
                .iter()
                .filter(|f| f.grade == crate::services::constrain::Grade::Strict)
                .map(|f| f.message.clone())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(NarraError::Validation(msg));
        }

        let seq = self.next_seq().await?;
        let id = draft
            .id
            .clone()
            .unwrap_or_else(|| format!("b{}", Uuid::new_v4().simple()));
        let kind = if draft.kind.is_empty() {
            "scene".into()
        } else {
            draft.kind.clone()
        };
        let deltas = serde_json::to_string(&draft.deltas)?;
        let kws = serde_json::to_string(&draft.knowledge_writes)?;
        let pops = serde_json::to_string(&draft.promise_ops)?;

        let beat_rid = RecordId::from(("setting_beat", id.as_str()));
        let col_rid = RecordId::from(("setting_column", draft.column_id.as_str()));
        let mut stmts = String::from("BEGIN TRANSACTION;\n");
        stmts.push_str(
            "CREATE $bid SET kind = $kind, column = $col, status = 'committed', commit_seq = $seq, intent = $intent, value_shift = $vs, do_text = $do, say_text = $say, think_text = $th, clock_from = $cf, clock_to = $ct, place = $place, telling_ord = $tell, cause_beat = $cause, visible_to = $vis, deltas_json = $dj, promise_ops_json = $pj, knowledge_json = $kj;\n",
        );
        if draft.fail_relate {
            stmts.push_str("RELATE $ghost->setting_present_in->$bid SET role = 'present';\n");
            stmts.push_str("THROW 'RELATE 失败，整笔回滚';\n");
        } else {
            for (i, _p) in draft.presences.iter().enumerate() {
                stmts.push_str(&format!(
                    "RELATE $e{i}->setting_present_in->$bid SET role = $r{i};\n"
                ));
            }
        }
        stmts.push_str("COMMIT TRANSACTION;");

        let mut q = self
            .db
            .query(stmts)
            .bind(("bid", beat_rid))
            .bind(("kind", kind.clone()))
            .bind(("col", col_rid))
            .bind(("seq", seq))
            .bind(("intent", draft.intent.clone()))
            .bind(("vs", draft.value_shift.clone()))
            .bind(("do", draft.do_text.clone()))
            .bind(("say", draft.say_text.clone()))
            .bind(("th", draft.think_text.clone()))
            .bind(("cf", draft.clock_from))
            .bind(("ct", draft.clock_to))
            .bind((
                "place",
                draft
                    .place_id
                    .as_ref()
                    .map(|p| RecordId::from(("setting_entity", p.as_str()))),
            ))
            .bind(("tell", draft.telling_ord))
            .bind((
                "cause",
                draft
                    .cause_beat
                    .as_ref()
                    .map(|p| RecordId::from(("setting_beat", p.as_str()))),
            ))
            .bind(("vis", draft.visible_to.clone()))
            .bind(("dj", deltas))
            .bind(("pj", pops))
            .bind(("kj", kws))
            .bind((
                "ghost",
                RecordId::from(("setting_entity", "___no_such_entity___")),
            ));
        for (i, p) in draft.presences.iter().enumerate() {
            q = q
                .bind((
                    format!("e{i}"),
                    RecordId::from(("setting_entity", p.entity_id.as_str())),
                ))
                .bind((format!("r{i}"), p.role.clone()));
        }
        q.await.map_err(|e| NarraError::Transaction(e.to_string()))?;
        if draft.fail_relate {
            return Err(NarraError::Transaction("RELATE 失败，整笔回滚".into()));
        }

        invalidate_interval(&self.db, draft.clock_from).await?;

        let canon = self.load_canon().await?;
        if let Some(beat) = canon.beats.iter().find(|b| b.id == id) {
            let col = canon.columns.iter().find(|c| c.id == beat.column_id);
            if let Some(c) = col {
                narra_bridge::mirror_column(&self.db, c).await?;
            }
            narra_bridge::mirror_beat(&self.db, beat, col).await?;
        }
        let canon = self.load_canon().await?;
        canon
            .beats
            .into_iter()
            .find(|b| b.id == id)
            .ok_or_else(|| NarraError::NotFound {
                entity_type: "setting_beat".into(),
                id,
            })
    }

    pub async fn supersede(&self, beat_id: &str) -> Result<(), NarraError> {
        let mut q = self
            .db
            .query("UPDATE $id SET status = 'superseded' WHERE status = 'committed' RETURN AFTER")
            .bind(("id", RecordId::from(("setting_beat", beat_id))))
            .await?;
        let rows: Vec<BeatRow> = q.take(0)?;
        if rows.is_empty() {
            return Err(NarraError::NotFound {
                entity_type: "setting_beat".into(),
                id: beat_id.into(),
            });
        }
        let from = rows[0].clock_from;
        invalidate_interval(&self.db, from).await?;
        self.remirror_beat_id(beat_id).await?;
        Ok(())
    }

    /// 改已写入正史的场。不新分配 commit_seq。返回冲突列表（不挡本次写入，除非本场本身被挡）。
    pub async fn revise(
        &self,
        beat_id: &str,
        patch: BeatPatch,
    ) -> Result<(Beat, Vec<String>), NarraError> {
        let canon = self.load_canon().await?;
        let old = canon
            .beats
            .iter()
            .find(|b| b.id == beat_id && b.status == STATUS_COMMITTED)
            .cloned()
            .ok_or_else(|| NarraError::NotFound {
                entity_type: "setting_beat".into(),
                id: beat_id.into(),
            })?;
        let seq = old.commit_seq;
        let mut next = old.clone();
        if let Some(v) = patch.intent {
            next.intent = v;
        }
        if let Some(v) = patch.do_text {
            next.do_text = opt_text(v);
        }
        if let Some(v) = patch.say_text {
            next.say_text = opt_text(v);
        }
        if let Some(v) = patch.think_text {
            next.think_text = opt_text(v);
        }
        if let Some(v) = patch.value_shift {
            next.value_shift = opt_text(v);
        }
        if let Some(v) = patch.place_id {
            next.place_id = opt_text(v);
        }
        if let Some(v) = patch.deltas {
            next.deltas = v;
        }
        if let Some(v) = patch.knowledge_writes {
            next.knowledge_writes = v;
        }
        if let Some(v) = patch.promise_ops {
            next.promise_ops = v;
        }
        if let Some(v) = patch.visible_to {
            next.visible_to = if v.is_empty() { None } else { Some(v) };
        }
        let draft = beat_as_draft(&next);
        let mut canon_ex = canon.clone();
        if let Some(b) = canon_ex.beats.iter_mut().find(|b| b.id == beat_id) {
            b.status = STATUS_SUPERSEDED.into();
        }
        let world = world_at(&canon_ex, next.clock_from, None).map_err(NarraError::Validation)?;
        let report = constrain(&world, &canon_ex, &draft);
        if report.blocks() {
            let msg = report
                .findings
                .iter()
                .filter(|f| f.grade == crate::services::constrain::Grade::Strict)
                .map(|f| f.message.clone())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(NarraError::Validation(msg));
        }
        let dj = serde_json::to_string(&next.deltas)?;
        let kws = serde_json::to_string(&next.knowledge_writes)?;
        let pops = serde_json::to_string(&next.promise_ops)?;
        let mut q = self
            .db
            .query(
                "UPDATE $bid SET intent = $intent, value_shift = $vs, do_text = $do, say_text = $say, think_text = $th, place = $place, visible_to = $vis, deltas_json = $dj, promise_ops_json = $pj, knowledge_json = $kj WHERE status = 'committed' RETURN AFTER",
            )
            .bind(("bid", RecordId::from(("setting_beat", beat_id))))
            .bind(("intent", next.intent.clone()))
            .bind(("vs", next.value_shift.clone()))
            .bind(("do", next.do_text.clone()))
            .bind(("say", next.say_text.clone()))
            .bind(("th", next.think_text.clone()))
            .bind((
                "place",
                next.place_id
                    .as_ref()
                    .map(|p| RecordId::from(("setting_entity", p.as_str()))),
            ))
            .bind(("vis", next.visible_to.clone()))
            .bind(("dj", dj))
            .bind(("pj", pops))
            .bind(("kj", kws))
            .await?;
        let rows: Vec<BeatRow> = q.take(0)?;
        if rows.is_empty() {
            return Err(NarraError::NotFound {
                entity_type: "setting_beat".into(),
                id: beat_id.into(),
            });
        }
        let invalidate_from = next
            .deltas
            .iter()
            .map(|d| d.clock_from)
            .min()
            .unwrap_or(next.clock_from)
            .min(next.clock_from);
        invalidate_interval(&self.db, invalidate_from).await?;
        let canon2 = self.load_canon().await?;
        let beat = canon2
            .beats
            .iter()
            .find(|b| b.id == beat_id)
            .cloned()
            .ok_or_else(|| NarraError::NotFound {
                entity_type: "setting_beat".into(),
                id: beat_id.into(),
            })?;
        if beat.commit_seq != seq {
            return Err(NarraError::Validation(
                "改已正史不得新分配第几次写入正史".into(),
            ));
        }
        let mut warnings = vec![];
        for later in canon2.beats.iter().filter(|b| {
            b.status == STATUS_COMMITTED && b.id != beat_id && b.clock_from >= beat.clock_from
        }) {
            let mut later_ex = canon2.clone();
            if let Some(b) = later_ex.beats.iter_mut().find(|b| b.id == later.id) {
                b.status = STATUS_SUPERSEDED.into();
            }
            let w = match world_at(&later_ex, later.clock_from, None) {
                Ok(w) => w,
                Err(e) => {
                    warnings.push(format!("{}：{}", later.id, e));
                    continue;
                }
            };
            let r = constrain(&w, &later_ex, &beat_as_draft(later));
            for f in r.findings {
                if f.grade != crate::services::constrain::Grade::Info {
                    warnings.push(format!("{}：{}", later.intent, f.message));
                }
            }
        }
        self.remirror_beat_id(beat_id).await?;
        Ok((beat, warnings))
    }

    pub async fn revise_delta(
        &self,
        beat_id: &str,
        deltas: Vec<crate::services::world::Delta>,
    ) -> Result<(), NarraError> {
        self.revise(
            beat_id,
            BeatPatch {
                deltas: Some(deltas),
                ..BeatPatch::default()
            },
        )
        .await?;
        Ok(())
    }

    pub async fn set_beat_clocks(
        &self,
        beat_id: &str,
        clock_from: i64,
        clock_to: i64,
    ) -> Result<(), NarraError> {
        self.db
            .query("UPDATE $id SET clock_from = $a, clock_to = $b WHERE status = 'committed'")
            .bind(("id", RecordId::from(("setting_beat", beat_id))))
            .bind(("a", clock_from))
            .bind(("b", clock_to))
            .await?;
        self.remirror_beat_id(beat_id).await?;
        Ok(())
    }

    /// 预览不写库。确认才提交。重叠钟拒绝。
    pub fn preview_columns(columns: &[Column]) -> Result<(), NarraError> {
        let mut cs = columns.to_vec();
        cs.sort_by_key(|c| c.clock_from);
        for w in cs.windows(2) {
            if w[0].clock_to > w[1].clock_from {
                return Err(NarraError::Validation(
                    "两列钟重叠不得当作正式状态".into(),
                ));
            }
        }
        Ok(())
    }

    pub async fn confirm_columns(&self, columns: Vec<Column>) -> Result<(), NarraError> {
        Self::preview_columns(&columns)?;
        let mut stmts = String::from("BEGIN TRANSACTION;\n");
        for (i, _) in columns.iter().enumerate() {
            stmts.push_str(&format!(
                "UPSERT $id{i} SET clock_from = $a{i}, clock_to = $b{i}, display_ord = $o{i};\n"
            ));
        }
        stmts.push_str("COMMIT TRANSACTION;");
        let mut q = self.db.query(stmts);
        for (i, c) in columns.iter().enumerate() {
            q = q
                .bind((format!("id{i}"), RecordId::from(("setting_column", c.id.as_str()))))
                .bind((format!("a{i}"), c.clock_from))
                .bind((format!("b{i}"), c.clock_to))
                .bind((format!("o{i}"), c.display_ord));
        }
        q.await?;
        invalidate_interval(&self.db, 0).await?;
        for c in &columns {
            narra_bridge::mirror_column(&self.db, c).await?;
        }
        Ok(())
    }

    pub async fn beat_status(&self, beat_id: &str) -> Result<Option<String>, NarraError> {
        let canon = self.load_canon().await?;
        Ok(canon.beats.iter().find(|b| b.id == beat_id).map(|b| b.status.clone()))
    }

    pub async fn max_commit_seq(&self) -> Result<i64, NarraError> {
        Ok(self.next_seq().await? - 1)
    }

    /// 已挂在正史场上的设定不能删。查询失败返回 Err，不准当 0 引用。
    pub async fn entity_hung_on_canon(&self, id: &str) -> Result<(bool, String), NarraError> {
        let canon = self.load_canon().await?;
        let resolved = canon
            .entities
            .iter()
            .find(|e| e.id == id || e.name == id)
            .map(|e| e.id.clone())
            .unwrap_or_else(|| id.to_string());
        let hung = canon.beats.iter().any(|b| {
            b.status == crate::services::world::STATUS_COMMITTED
                && b.presences.iter().any(|p| p.entity_id == resolved || p.entity_id == id)
        });
        Ok((hung, resolved))
    }

    pub async fn delete_entity(&self, id: &str) -> Result<(), NarraError> {
        let (hung, resolved) = self.entity_hung_on_canon(id).await?;
        if hung {
            return Err(NarraError::Validation(
                "已挂在场上的设定不能从设定里删，须先从分场条拿掉".into(),
            ));
        }
        let rid = RecordId::from(("setting_entity", resolved.as_str()));
        self.db.query("DELETE $rid").bind(("rid", rid)).await?;
        narra_bridge::delete_mirrored_entity(&self.db, &resolved).await?;
        Ok(())
    }

    /// 从正史场拿掉在场边。不新分配 commit_seq。须人点确认变更后才调。
    pub async fn remove_presence(&self, beat_id: &str, entity_id: &str) -> Result<(), NarraError> {
        let beat = RecordId::from(("setting_beat", beat_id));
        let ent = RecordId::from(("setting_entity", entity_id));
        let mut q = self
            .db
            .query("DELETE setting_present_in WHERE in = $eid AND out = $bid RETURN BEFORE")
            .bind(("eid", ent))
            .bind(("bid", beat))
            .await?;
        let rows: Vec<RelRow> = q.take(0).unwrap_or_else(|_| vec![]);
        if rows.is_empty() {
            return Err(NarraError::NotFound {
                entity_type: "setting_present_in".into(),
                id: format!("{entity_id}->{beat_id}"),
            });
        }
        let mut bq = self
            .db
            .query("SELECT * FROM $bid")
            .bind(("bid", RecordId::from(("setting_beat", beat_id))))
            .await?;
        let beats: Vec<BeatRow> = bq.take(0)?;
        if let Some(b) = beats.first() {
            invalidate_interval(&self.db, b.clock_from).await?;
        }
        self.remirror_beat_id(beat_id).await?;
        Ok(())
    }

    pub async fn delete_column(&self, column_id: &str) -> Result<(), NarraError> {
        let rid = RecordId::from(("setting_column", column_id));
        self.db.query("DELETE $rid").bind(("rid", rid)).await?;
        narra_bridge::delete_mirrored_column(&self.db, column_id).await?;
        Ok(())
    }

    pub async fn set_telling_ord(&self, beat_id: &str, ord: i64) -> Result<(), NarraError> {
        self.db
            .query("UPDATE $id SET telling_ord = $o WHERE status = 'committed'")
            .bind(("id", RecordId::from(("setting_beat", beat_id))))
            .bind(("o", ord))
            .await?;
        self.remirror_beat_id(beat_id).await?;
        Ok(())
    }

    pub async fn move_beat_column(&self, beat_id: &str, column_id: &str) -> Result<(), NarraError> {
        let mut q = self
            .db
            .query("UPDATE $id SET column = $col WHERE status = 'committed' RETURN AFTER")
            .bind(("id", RecordId::from(("setting_beat", beat_id))))
            .bind(("col", RecordId::from(("setting_column", column_id))))
            .await?;
        let rows: Vec<BeatRow> = q.take(0)?;
        if rows.is_empty() {
            return Err(NarraError::NotFound {
                entity_type: "setting_beat".into(),
                id: beat_id.into(),
            });
        }
        invalidate_interval(&self.db, rows[0].clock_from).await?;
        self.remirror_beat_id(beat_id).await?;
        Ok(())
    }

    async fn remirror_beat_id(&self, beat_id: &str) -> Result<(), NarraError> {
        let canon = self.load_canon().await?;
        if let Some(beat) = canon.beats.iter().find(|b| b.id == beat_id) {
            let col = canon.columns.iter().find(|c| c.id == beat.column_id);
            narra_bridge::mirror_beat(&self.db, beat, col).await?;
        }
        Ok(())
    }

    /// 把已有 setting_* 正史映到官方表。开书时调用。
    pub async fn sync_official(&self) -> Result<(), NarraError> {
        let canon = self.load_canon().await?;
        narra_bridge::sync_official(&self.db, &canon).await
    }

    pub async fn search_entities(&self, q: &str) -> Result<Vec<Entity>, NarraError> {
        let canon = self.load_canon().await?;
        let needle = q.trim();
        Ok(canon
            .entities
            .into_iter()
            .filter(|e| {
                if needle.is_empty() {
                    return true;
                }
                if e.id.contains(needle) || e.name.contains(needle) {
                    return true;
                }
                e.profile
                    .get("aliases")
                    .map(|a| {
                        a.split(|c| c == ',' || c == '，')
                            .any(|x| x.trim().contains(needle))
                    })
                    .unwrap_or(false)
            })
            .collect())
    }

    pub fn db(&self) -> Arc<NarraDb> {
        self.db.clone()
    }
}

pub fn draft_is_not_in_world(world: &World, intent: &str) -> bool {
    !world.playing.iter().any(|id| id.contains(intent))
        && world
            .states
            .iter()
            .all(|s| !s.source_beat.is_empty() || s.attr != intent)
}
