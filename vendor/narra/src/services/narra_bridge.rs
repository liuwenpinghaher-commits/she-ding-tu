//! 把设定图正史双写进官方 Narra 表。load_canon 场骨架以带 setting_beat 的 scene 为准。

use crate::db::connection::NarraDb;
use crate::db::string_set::string_set;
use crate::services::world::{
    Beat, Canon, Column, Delta, Entity, ROLE_PRESENT, STATUS_COMMITTED,
};
use crate::NarraError;
use serde::Deserialize;
use surrealdb::types::{RecordId, SurrealValue, ToSql};
use surrealdb::IndexedResults;

fn check_ctx(resp: IndexedResults, ctx: &str) -> Result<(), NarraError> {
    resp.check()
        .map(|_| ())
        .map_err(|e| NarraError::Database(format!("{ctx}: {e}")))
}

fn aliases_of(e: &Entity) -> Vec<String> {
    e.profile
        .get("aliases")
        .map(|s| {
            s.split(|c| c == ',' || c == '，')
                .map(|x| x.trim().to_string())
                .filter(|x| !x.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn rec(table: &str, id: &str) -> RecordId {
    RecordId::new(table, id)
}

fn djb2(s: &str) -> u64 {
    let mut h: u64 = 5381;
    for b in s.as_bytes() {
        h = h.wrapping_mul(33).wrapping_add(*b as u64);
    }
    h
}

fn knowledge_id(person: &str, beat: &str, fact: &str) -> String {
    format!("k_{beat}_{person}_{:x}", djb2(fact))
}

fn window_id(beat: &str, d: &Delta) -> String {
    format!("w_{beat}_{}_{}_{}", d.entity_id, d.attr, d.clock_from)
}

pub async fn mirror_entity(db: &NarraDb, e: &Entity) -> Result<(), NarraError> {
    match e.kind.as_str() {
        "person" => {
            let aliases = aliases_of(e);
            let resp = db
                .query(
                    "UPSERT $rid SET name = $name, aliases = $aliases, updated_at = time::now()",
                )
                .bind(("rid", rec("character", e.id.as_str())))
                .bind(("name", e.name.clone()))
                .bind(("aliases", string_set(aliases)))
                .await
                .map_err(|err| NarraError::Database(err.to_string()))?;
            check_ctx(resp, &format!("mirror character {}", e.id.to_sql()))?;
        }
        "place" => {
            let loc_type = e
                .profile
                .get("place_kind")
                .cloned()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "place".into());
            let resp = db
                .query(
                    "UPSERT $rid SET name = $name, loc_type = $lt, description = $d, updated_at = time::now()",
                )
                .bind(("rid", rec("location", e.id.as_str())))
                .bind(("name", e.name.clone()))
                .bind(("lt", loc_type))
                .bind(("d", e.profile.get("setup").cloned()))
                .await
                .map_err(|err| NarraError::Database(err.to_string()))?;
            check_ctx(resp, &format!("mirror location {}", e.id.to_sql()))?;
        }
        "rule" => {
            let enf = match e.profile.get("enforcement").map(|s| s.trim()) {
                Some("挡") => "strict",
                Some("标黄") => "warning",
                _ => "informational",
            };
            let setup = e.profile.get("setup").cloned().unwrap_or_default();
            let scope = e.profile.get("scope").cloned().unwrap_or_default();
            let description = if scope.trim().is_empty() {
                setup
            } else {
                format!("{setup}\n范围：{scope}")
            };
            let resp = db
                .query(
                    "UPSERT $rid SET title = $title, description = $desc, categories = ['physical'], enforcement_level = $enf, scope = {}, updated_at = time::now()",
                )
                .bind(("rid", rec("universe_fact", e.id.as_str())))
                .bind(("title", e.name.clone()))
                .bind(("desc", description))
                .bind(("enf", enf.to_string()))
                .await
                .map_err(|err| NarraError::Database(err.to_string()))?;
            check_ctx(resp, &format!("mirror universe_fact {}", e.id.to_sql()))?;
        }
        _ => {}
    }
    Ok(())
}

pub async fn mirror_column(db: &NarraDb, c: &Column) -> Result<(), NarraError> {
    let resp = db
        .query(
            "UPSERT $rid SET title = $title, sequence = $seq, clock_from = $a, clock_to = $b, updated_at = time::now()",
        )
        .bind(("rid", rec("event", c.id.as_str())))
        .bind(("title", c.id.clone()))
        .bind(("seq", c.display_ord))
        .bind(("a", c.clock_from))
        .bind(("b", c.clock_to))
        .await
        .map_err(|e| NarraError::Database(e.to_string()))?;
    check_ctx(resp, &format!("mirror event {}", c.id.to_sql()))
}

pub async fn delete_mirrored_entity(db: &NarraDb, id: &str) -> Result<(), NarraError> {
    let resp = db
        .query("DELETE $c; DELETE $l;")
        .bind(("c", rec("character", id)))
        .bind(("l", rec("location", id)))
        .await
        .map_err(|e| NarraError::Database(e.to_string()))?;
    check_ctx(resp, &format!("delete mirrored {id}"))
}

pub async fn delete_mirrored_column(db: &NarraDb, id: &str) -> Result<(), NarraError> {
    let resp = db
        .query("DELETE $e")
        .bind(("e", rec("event", id)))
        .await
        .map_err(|e| NarraError::Database(e.to_string()))?;
    check_ctx(resp, &format!("delete event {id}"))
}

async fn character_exists(db: &NarraDb, id: &str) -> bool {
    #[derive(Deserialize, SurrealValue)]
    struct Named {
        name: Option<String>,
    }
    let mut q = match db
        .query("SELECT name FROM $c")
        .bind(("c", rec("character", id)))
        .await
    {
        Ok(q) => q,
        Err(_) => return false,
    };
    let rows: Vec<Named> = q.take(0).unwrap_or_default();
    rows.iter().any(|r| r.name.as_ref().map(|n| !n.is_empty()).unwrap_or(false))
}

pub async fn mirror_beat(db: &NarraDb, beat: &Beat, col: Option<&Column>) -> Result<(), NarraError> {
    let ev = rec(
        "event",
        col.map(|c| c.id.as_str()).unwrap_or(beat.column_id.as_str()),
    );
    let scene = rec("scene", beat.id.as_str());
    let beat_rid = rec("setting_beat", beat.id.as_str());
    let place = beat.place_id.as_ref().map(|p| rec("location", p.as_str()));
    let resp = db
        .query(
            "UPSERT $sid SET title = $title, summary = $sum, event = $ev, primary_location = $loc, status = $st, commit_seq = $seq, kind = $kind, intent = $intent, value_shift = $vs, do_text = $do, say_text = $say, think_text = $th, telling_ord = $tell, visible_to = $vis, setting_beat = $bid, clock_from = $cf, clock_to = $ct, updated_at = time::now()",
        )
        .bind(("sid", scene.clone()))
        .bind(("title", beat.intent.clone()))
        .bind(("sum", beat.do_text.clone()))
        .bind(("ev", ev.clone()))
        .bind(("loc", place))
        .bind(("st", beat.status.clone()))
        .bind(("seq", beat.commit_seq))
        .bind(("kind", beat.kind.clone()))
        .bind(("intent", beat.intent.clone()))
        .bind(("vs", beat.value_shift.clone()))
        .bind(("do", beat.do_text.clone()))
        .bind(("say", beat.say_text.clone()))
        .bind(("th", beat.think_text.clone()))
        .bind(("tell", beat.telling_ord))
        .bind(("vis", beat.visible_to.clone()))
        .bind(("bid", beat_rid.clone()))
        .bind(("cf", beat.clock_from))
        .bind(("ct", beat.clock_to))
        .await
        .map_err(|e| NarraError::Database(e.to_string()))?;
    check_ctx(resp, &format!("upsert scene {}", beat.id.to_sql()))?;

    let resp = db
        .query("DELETE participates_in WHERE out = $s; DELETE knows WHERE scene = $s; DELETE setting_window WHERE source_beat = $b;")
        .bind(("s", scene.clone()))
        .bind(("b", beat_rid.clone()))
        .await
        .map_err(|e| NarraError::Database(e.to_string()))?;
    check_ctx(resp, &format!("clear edges {}", beat.id.to_sql()))?;

    if beat.status != STATUS_COMMITTED {
        return Ok(());
    }

    for p in beat.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
        if !character_exists(db, &p.entity_id).await {
            continue;
        }
        let resp = db
            .query("RELATE $c->participates_in->$s SET role = $role")
            .bind(("c", rec("character", p.entity_id.as_str())))
            .bind(("s", scene.clone()))
            .bind(("role", p.role.clone()))
            .await
            .map_err(|e| NarraError::Database(e.to_string()))?;
        check_ctx(resp, &format!("participates_in {} {}", p.entity_id, beat.id))?;
    }

    for k in &beat.knowledge_writes {
        if !character_exists(db, &k.person_id).await {
            continue;
        }
        let kid = knowledge_id(&k.person_id, &beat.id, &k.fact);
        let resp = db
            .query("UPSERT $kid SET character = $c, fact = $fact")
            .bind(("kid", rec("knowledge", kid.as_str())))
            .bind(("c", rec("character", k.person_id.as_str())))
            .bind(("fact", k.fact.clone()))
            .await
            .map_err(|e| NarraError::Database(e.to_string()))?;
        check_ctx(resp, &format!("knowledge {}", kid))?;
        let cert = k.certainty_or_knows().to_string();
        let method = k
            .method
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "discovered".into());
        let resp = db
            .query(
                "RELATE $c->knows->$kid SET certainty = $cert, learning_method = $method, event = $ev, scene = $s, clock_from = $cf, commit_seq = $seq, truth_value = $tv",
            )
            .bind(("c", rec("character", k.person_id.as_str())))
            .bind(("kid", rec("knowledge", kid.as_str())))
            .bind(("cert", cert))
            .bind(("method", method))
            .bind(("ev", ev.clone()))
            .bind(("s", scene.clone()))
            .bind(("cf", beat.clock_from))
            .bind(("seq", beat.commit_seq))
            .bind(("tv", k.truth_value.clone()))
            .await
            .map_err(|e| NarraError::Database(e.to_string()))?;
        check_ctx(resp, &format!("knows {} {}", k.person_id, beat.id))?;
    }

    for d in &beat.deltas {
        let wid = window_id(&beat.id, d);
        let resp = db
            .query(
                "UPSERT $wid SET entity = $e, attr = $a, value = $v, clock_from = $cf, clock_to = $ct, commit_seq = $seq, source_beat = $b",
            )
            .bind(("wid", rec("setting_window", wid.as_str())))
            .bind(("e", rec("setting_entity", d.entity_id.as_str())))
            .bind(("a", d.attr.clone()))
            .bind(("v", d.value.clone()))
            .bind(("cf", d.clock_from))
            .bind(("ct", d.clock_to))
            .bind(("seq", beat.commit_seq))
            .bind(("b", beat_rid.clone()))
            .await
            .map_err(|e| NarraError::Database(e.to_string()))?;
        check_ctx(resp, &format!("window {}", wid))?;
    }
    Ok(())
}

pub async fn sync_official(db: &NarraDb, canon: &Canon) -> Result<(), NarraError> {
    for e in &canon.entities {
        mirror_entity(db, e).await?;
    }
    for c in &canon.columns {
        mirror_column(db, c).await?;
    }
    let resp = db
        .query("DELETE setting_window")
        .await
        .map_err(|e| NarraError::Database(e.to_string()))?;
    check_ctx(resp, "delete setting_window")?;
    for b in &canon.beats {
        let col = canon.columns.iter().find(|c| c.id == b.column_id);
        mirror_beat(db, b, col).await?;
    }
    Ok(())
}
