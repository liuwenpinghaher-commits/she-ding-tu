//! 物化：区间缓存，不是第二真源。与正史不一致则丢掉。

use crate::db::connection::NarraDb;
use crate::services::world::{world_at, worlds_equivalent, Canon, World};
use crate::NarraError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MatRow {
    clock_from: i64,
    clock_to: i64,
    as_of: Option<i64>,
    payload: String,
}

pub async fn lookup_interval(
    db: &NarraDb,
    t: i64,
    as_of: Option<i64>,
) -> Result<Option<World>, NarraError> {
    let mut res = db
        .query(
            "SELECT * FROM setting_materialize WHERE clock_from <= $t AND $t < clock_to AND as_of = $as_of",
        )
        .bind(("t", t))
        .bind(("as_of", as_of))
        .await?;
    let rows: Vec<MatRow> = res.take(0)?;
    if let Some(row) = rows.into_iter().next() {
        let w: World = serde_json::from_str(&row.payload)?;
        return Ok(Some(w));
    }
    // as_of None stored as none — try without equality if Surreal none mismatch
    if as_of.is_none() {
        let mut res = db
            .query(
                "SELECT * FROM setting_materialize WHERE clock_from <= $t AND $t < clock_to AND as_of = NONE",
            )
            .bind(("t", t))
            .await?;
        let rows: Vec<MatRow> = res.take(0)?;
        if let Some(row) = rows.into_iter().next() {
            let w: World = serde_json::from_str(&row.payload)?;
            return Ok(Some(w));
        }
    }
    Ok(None)
}

pub async fn put_interval(
    db: &NarraDb,
    clock_from: i64,
    clock_to: i64,
    as_of: Option<i64>,
    world: &World,
) -> Result<(), NarraError> {
    let payload = serde_json::to_string(world)?;
    db.query(
        "CREATE setting_materialize SET clock_from = $from, clock_to = $to, as_of = $as_of, payload = $p",
    )
    .bind(("from", clock_from))
    .bind(("to", clock_to))
    .bind(("as_of", as_of))
    .bind(("p", payload))
    .await?;
    Ok(())
}

pub async fn invalidate_interval(db: &NarraDb, clock_from: i64) -> Result<(), NarraError> {
    db.query("DELETE setting_materialize WHERE clock_to > $from OR clock_from >= $from")
        .bind(("from", clock_from))
        .await?;
    Ok(())
}

/// 命中必须等于全量；不等则当未命中并失效。
pub async fn world_at_cached(
    db: &NarraDb,
    canon: &Canon,
    t: i64,
    as_of: Option<i64>,
) -> Result<World, NarraError> {
    let full = world_at(canon, t, as_of).map_err(NarraError::Validation)?;
    if let Some(hit) = lookup_interval(db, t, as_of).await? {
        if worlds_equivalent(&hit, &full) {
            return Ok(hit);
        }
        invalidate_interval(db, t).await?;
    }
    let span_from = canon
        .columns
        .iter()
        .filter(|c| c.clock_from <= t && t < c.clock_to)
        .map(|c| c.clock_from)
        .min()
        .unwrap_or(t);
    let span_to = canon
        .columns
        .iter()
        .filter(|c| c.clock_from <= t && t < c.clock_to)
        .map(|c| c.clock_to)
        .max()
        .unwrap_or(t + 1);
    put_interval(db, span_from, span_to.max(span_from + 1), as_of, &full).await?;
    Ok(full)
}
