//! 人点之后才 mutate Narra：写入正史 / 确认变更 / 作废。

use crate::db::connection::NarraDb;
use crate::services::circumstances::{given_circumstances, ScenePacket};
use crate::services::constrain::{constrain, ConstraintReport};
use crate::services::materialize::{invalidate_interval, world_at_cached};
use crate::services::world::{
    knows_at, world_at, Beat, BeatDraft, Canon, Column, Entity, Presence, Promise, World,
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
struct RelRow {
    #[serde(rename = "in")]
    inn: RecordId,
    #[serde(rename = "out")]
    out: RecordId,
    role: String,
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

fn rec_key(id: &RecordId) -> String {
    id.key().to_string().trim_matches('"').to_string()
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
            .query("SELECT * FROM setting_entity; SELECT * FROM setting_column; SELECT * FROM setting_beat; SELECT * FROM setting_present_in; SELECT * FROM setting_promise;")
            .await?;
        let entities: Vec<EntityRow> = q.take(0)?;
        let columns: Vec<ColumnRow> = q.take(1)?;
        let beats: Vec<BeatRow> = q.take(2)?;
        let rels: Vec<RelRow> = q.take(3)?;
        let promises: Vec<PromiseRow> = q.take(4)?;

        let entities: Vec<Entity> = entities
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
        let columns: Vec<Column> = columns
            .into_iter()
            .map(|c| Column {
                id: rec_key(&c.id),
                clock_from: c.clock_from,
                clock_to: c.clock_to,
                display_ord: c.display_ord,
            })
            .collect();
        let mut beat_map: Vec<Beat> = beats
            .into_iter()
            .map(|b| Beat {
                id: rec_key(&b.id),
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
                deltas: b
                    .deltas_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default(),
                knowledge_writes: b
                    .knowledge_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default(),
                promise_ops: b
                    .promise_ops_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default(),
                presences: vec![],
            })
            .collect();
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
        Ok(())
    }

    pub async fn revise_delta(
        &self,
        beat_id: &str,
        deltas: Vec<crate::services::world::Delta>,
    ) -> Result<(), NarraError> {
        let dj = serde_json::to_string(&deltas)?;
        let mut q = self
            .db
            .query("UPDATE $id SET deltas_json = $dj WHERE status = 'committed' RETURN AFTER")
            .bind(("id", RecordId::from(("setting_beat", beat_id))))
            .bind(("dj", dj))
            .await?;
        let rows: Vec<BeatRow> = q.take(0)?;
        if rows.is_empty() {
            return Err(NarraError::NotFound {
                entity_type: "setting_beat".into(),
                id: beat_id.into(),
            });
        }
        invalidate_interval(&self.db, rows[0].clock_from).await?;
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
        Ok(())
    }

    pub async fn beat_status(&self, beat_id: &str) -> Result<Option<String>, NarraError> {
        let canon = self.load_canon().await?;
        Ok(canon.beats.iter().find(|b| b.id == beat_id).map(|b| b.status.clone()))
    }

    pub async fn max_commit_seq(&self) -> Result<i64, NarraError> {
        Ok(self.next_seq().await? - 1)
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
