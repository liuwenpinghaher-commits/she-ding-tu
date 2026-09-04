//! 本场规定情境。不含伏笔建议、不含结构建议。

use crate::services::world::{
    Beat, BeatDraft, Canon, World, ROLE_PRESENT, STATUS_COMMITTED, BEAT_SCENE, BEAT_ELLIPSIS,
};
use surrealdb::types::SurrealValue;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default, SurrealValue)]
pub struct OpenPromise {
    pub id: String,
    pub name: String,
    pub plant_clock: Option<i64>,
    pub deadline_clock: Option<i64>,
    pub red_herring: bool,
    #[serde(default)]
    pub related: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default, SurrealValue)]
pub struct ScenePacket {
    pub intent: String,
    pub stakes: Vec<String>,
    pub knowledge_gaps: Vec<String>,
    pub default_witnesses: Vec<String>,
    pub open_promises: Vec<OpenPromise>,
    pub last_value_shift: Option<String>,
    /// 读者沿讲述序已读到的当众/叙述事实。不算进算出这一刻。
    #[serde(default)]
    pub reader_knows: Vec<String>,
    /// 读者有、本场某在场者没有。不算进算出这一刻。
    #[serde(default)]
    pub reader_irony: Vec<String>,
    /// 本场在场者信错了什么。不算进算出这一刻。
    #[serde(default)]
    pub wrong_beliefs: Vec<String>,
}

/// 给人看，不进 ScenePacket。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, SurrealValue)]
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
            related: p.related.clone(),
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
        let Some((left, value)) = s.split_once('=') else { continue };
        let Some((ent, attr)) = left.split_once('.') else { continue };
        for p in draft.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
            if attr == "where" && ent == p.entity_id {
                continue;
            }
            if attr == "where"
                && draft
                    .presences
                    .iter()
                    .any(|x| x.role == ROLE_PRESENT && x.entity_id == ent)
                && draft.place_id.as_deref() == Some(value)
            {
                continue;
            }
            let known = world
                .knows
                .get(&p.entity_id)
                .map(|fs| {
                    fs.iter().any(|f| {
                        f.contains(s)
                            || (f.contains(ent) && f.contains(value))
                            || (attr == "where" && f.contains(ent) && f.contains('在'))
                            || (attr == "holder" && f.contains(ent) && (f.contains(value) || f.contains("拿")))
                    })
                })
                .unwrap_or(false);
            if !known {
                gaps.push(format!("{} 不知道 {}", p.entity_id, s));
            }
        }
    }
    gaps.sort();
    gaps.dedup();

    let opens = select_open_promises(world, draft);
    let reader_knows = reader_facts(canon, None);
    let mut reader_irony = Vec::new();
    for p in draft.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
        for fact in &reader_knows {
            if !fact_touches_scene(fact, draft, &opens) {
                continue;
            }
            if !person_knows_fact(world, &p.entity_id, fact) {
                reader_irony.push(format!("读者知道「{fact}」，{}不知道", p.entity_id));
            }
        }
    }
    reader_irony.sort();
    reader_irony.dedup();
    reader_irony.truncate(8);

    let mut wrong_beliefs = Vec::new();
    for p in draft.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
        for b in world.beliefs.iter().filter(|b| b.person_id == p.entity_id && b.is_wrong()) {
            let actual = b.truth_value.as_deref().filter(|s| !s.is_empty()).unwrap_or("未知");
            wrong_beliefs.push(format!("{} 信错「{}」（实际：{}）", p.entity_id, b.fact, actual));
        }
    }
    wrong_beliefs.sort();
    wrong_beliefs.dedup();

    ScenePacket {
        intent: draft.intent.clone(),
        stakes,
        knowledge_gaps: gaps,
        default_witnesses: witnesses,
        open_promises: opens,
        last_value_shift: last_shift(canon),
        reader_knows: reader_knows.into_iter().take(12).collect(),
        reader_irony,
        wrong_beliefs,
    }
}

/// 读者账：已正史按讲述序累加的叙述事实。不是 fold，不进世界上为真。
/// `telling_upto` 有值时只收到该读序（含），与「按读序排」透镜对齐。
pub fn reader_facts(canon: &Canon, telling_upto: Option<i64>) -> Vec<String> {
    let mut beats: Vec<&Beat> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED)
        .collect();
    beats.sort_by_key(|b| (b.telling_ord.unwrap_or(b.commit_seq), b.commit_seq));
    let mut out = Vec::new();
    for b in beats {
        let ord = b.telling_ord.unwrap_or(b.commit_seq);
        if telling_upto.map(|u| ord > u).unwrap_or(false) {
            continue;
        }
        if b.kind == BEAT_ELLIPSIS {
            for d in &b.deltas {
                out.push(format!("{}.{}={}", d.entity_id, d.attr, d.value));
            }
            continue;
        }
        for k in &b.knowledge_writes {
            if !k.fact.trim().is_empty() {
                out.push(k.fact.clone());
            }
        }
        for d in &b.deltas {
            out.push(format!("{}.{}={}", d.entity_id, d.attr, d.value));
        }
        if b.knowledge_writes.is_empty() && b.deltas.is_empty() {
            if let Some(do_t) = b.do_text.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                out.push(do_t.chars().take(40).collect());
            }
        }
    }
    let mut seen = std::collections::BTreeSet::new();
    out.retain(|x| seen.insert(x.clone()));
    out
}

/// 人物透镜：侧栏人物账只留此人；世界账仍是全知情状。不算进算出这一刻。
pub fn apply_person_lens(mut pkt: ScenePacket, world: &World, person: &str) -> ScenePacket {
    pkt.stakes = world
        .states
        .iter()
        .map(|s| format!("{}.{}={}", s.entity_id, s.attr, s.value))
        .collect();
    pkt.stakes.sort();
    pkt.stakes.dedup();
    let mut gaps = Vec::new();
    for s in &pkt.stakes {
        if s.starts_with(&format!("{person}.where=")) {
            continue;
        }
        if !person_knows_fact(world, person, s) {
            gaps.push(format!("{person} 不知道 {s}"));
        }
    }
    gaps.sort();
    gaps.dedup();
    pkt.knowledge_gaps = gaps;
    pkt.wrong_beliefs = world
        .beliefs
        .iter()
        .filter(|b| b.person_id == person && b.is_wrong())
        .map(|b| {
            let actual = b
                .truth_value
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("未知");
            format!("{person} 信错「{}」（实际：{actual}）", b.fact)
        })
        .collect();
    pkt.wrong_beliefs.sort();
    pkt.wrong_beliefs.dedup();
    let mut irony = Vec::new();
    for fact in &pkt.reader_knows {
        if !person_knows_fact(world, person, fact) {
            irony.push(format!("读者知道「{fact}」，{person}不知道"));
        }
    }
    irony.truncate(8);
    pkt.reader_irony = irony;
    pkt
}

fn fact_touches_scene(fact: &str, draft: &BeatDraft, opens: &[OpenPromise]) -> bool {
    if fact.contains('刀') || fact.contains("铜牌") {
        return true;
    }
    if let Some(pl) = &draft.place_id {
        if fact.contains(pl) {
            return true;
        }
    }
    if draft
        .presences
        .iter()
        .any(|p| p.role == ROLE_PRESENT && fact.contains(&p.entity_id))
    {
        return true;
    }
    opens.iter().any(|p| {
        fact.contains(&p.name) || p.related.iter().any(|r| fact.contains(r))
    })
}

fn person_knows_fact(world: &World, person: &str, fact: &str) -> bool {
    let Some(fs) = world.knows.get(person) else {
        return false;
    };
    if let Some((left, value)) = fact.split_once('=') {
        if let Some((ent, attr)) = left.split_once('.') {
            return fs.iter().any(|f| {
                f.contains(fact)
                    || (f.contains(ent) && f.contains(value))
                    || (attr == "where" && f.contains(ent) && f.contains('在'))
                    || (attr == "holder" && f.contains(ent))
            });
        }
    }
    fs.iter().any(|f| f.contains(fact) || (f.contains('刀') && fact.contains('刀') && f.contains("抽屉") && fact.contains("抽屉")))
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
