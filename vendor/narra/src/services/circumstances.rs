//! 本场规定情境。不含伏笔建议、不含结构建议。

use crate::services::world::{
    BeatDraft, Canon, World, ROLE_PRESENT, STATUS_COMMITTED, BEAT_SCENE,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct OpenPromise {
    pub id: String,
    pub name: String,
    pub plant_clock: Option<i64>,
    pub deadline_clock: Option<i64>,
    pub red_herring: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ScenePacket {
    pub intent: String,
    pub stakes: Vec<String>,
    pub knowledge_gaps: Vec<String>,
    pub default_witnesses: Vec<String>,
    pub open_promises: Vec<OpenPromise>,
    pub last_value_shift: Option<String>,
}

/// 给人看，不进 ScenePacket。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PromiseSuggestion {
    pub promise_id: String,
    pub op: String,
}

pub fn select_open_promises(world: &World, draft: &BeatDraft) -> Vec<OpenPromise> {
    if draft.place_id.is_none()
        && !draft
            .presences
            .iter()
            .any(|p| p.role == ROLE_PRESENT)
    {
        return vec![];
    }
    let mut related: Vec<OpenPromise> = world
        .promises
        .iter()
        .filter(|p| p.status == "open")
        .filter(|p| {
            let mut ids = p.related.clone();
            ids.push(p.id.clone());
            let place_ok = draft
                .place_id
                .as_ref()
                .map(|pl| ids.iter().any(|x| x == pl) || p.related.is_empty())
                .unwrap_or(false);
            let people_ok = draft
                .presences
                .iter()
                .filter(|pr| pr.role == ROLE_PRESENT)
                .any(|pr| ids.iter().any(|x| x == &pr.entity_id));
            place_ok || people_ok
        })
        .map(|p| OpenPromise {
            id: p.id.clone(),
            name: p.name.clone(),
            plant_clock: p.plant_clock,
            deadline_clock: p.deadline_clock,
            red_herring: p.red_herring,
        })
        .collect();

    related.sort_by(|a, b| {
        let da = deadline_rank(a.deadline_clock, draft.clock_from);
        let db = deadline_rank(b.deadline_clock, draft.clock_from);
        da.cmp(&db).then(
            b.plant_clock
                .unwrap_or(i64::MIN)
                .cmp(&a.plant_clock.unwrap_or(i64::MIN)),
        )
    });
    related.truncate(5);
    related
}

fn deadline_rank(deadline: Option<i64>, t: i64) -> i64 {
    match deadline {
        Some(d) if d <= t => d,          // 到期/过期优先（越早越前）
        Some(d) => 1_000_000 + d,        // 未到期靠后
        None => 9_000_000,
    }
}

pub fn suggest_promise_op(open: &[OpenPromise], draft: &BeatDraft) -> Option<PromiseSuggestion> {
    let due: Vec<&OpenPromise> = open
        .iter()
        .filter(|p| {
            !p.red_herring
                && p.deadline_clock
                    .map(|d| d <= draft.clock_from)
                    .unwrap_or(false)
        })
        .collect();
    if let Some(p) = due.into_iter().min_by_key(|p| p.deadline_clock.unwrap_or(0)) {
        return Some(PromiseSuggestion {
            promise_id: p.id.clone(),
            op: "payoff".into(),
        });
    }
    open.first().map(|p| PromiseSuggestion {
        promise_id: p.id.clone(),
        op: "advance".into(),
    })
}

pub fn given_circumstances(world: &World, canon: &Canon, draft: &BeatDraft) -> ScenePacket {
    let people_empty = !draft.presences.iter().any(|p| p.role == ROLE_PRESENT);
    let place_empty = draft.place_id.is_none();
    if people_empty && place_empty {
        return ScenePacket {
            intent: draft.intent.clone(),
            last_value_shift: last_shift(canon),
            ..ScenePacket::default()
        };
    }

    let mut stakes = Vec::new();
    for s in &world.states {
        let related_person = draft
            .presences
            .iter()
            .any(|p| p.role == ROLE_PRESENT && p.entity_id == s.entity_id);
        let related_place = draft.place_id.as_deref() == Some(s.entity_id.as_str())
            || draft.place_id.as_deref() == Some(s.value.as_str());
        if related_person || related_place {
            stakes.push(format!("{}.{}={}", s.entity_id, s.attr, s.value));
        }
    }

    let witnesses: Vec<String> = if let Some(vis) = &draft.visible_to {
        vis.clone()
    } else {
        draft
            .presences
            .iter()
            .filter(|p| p.role == ROLE_PRESENT)
            .map(|p| p.entity_id.clone())
            .collect()
    };

    let mut gaps = Vec::new();
    for s in &stakes {
        for p in draft.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
            let known = world
                .knows
                .get(&p.entity_id)
                .map(|fs| fs.iter().any(|f| s.contains(f) || f.contains(&s.split('=').nth(1).unwrap_or(""))))
                .unwrap_or(false);
            if !known {
                gaps.push(format!("{} 不知道 {}", p.entity_id, s));
            }
        }
    }
    gaps.sort();
    gaps.dedup();

    ScenePacket {
        intent: draft.intent.clone(),
        stakes,
        knowledge_gaps: gaps,
        default_witnesses: witnesses,
        open_promises: select_open_promises(world, draft),
        last_value_shift: last_shift(canon),
    }
}

fn last_shift(canon: &Canon) -> Option<String> {
    let mut scenes: Vec<_> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED && b.kind == BEAT_SCENE)
        .collect();
    scenes.sort_by_key(|b| (b.clock_from, b.commit_seq));
    scenes
        .into_iter()
        .rev()
        .find_map(|b| b.value_shift.clone().filter(|s| !s.is_empty()))
}
