//! 穿帮检查。只读世界 + 本场草稿。挡 / 标黄按 F12。

use crate::services::world::{BeatDraft, Canon, ROLE_PRESENT, World, BEAT_SCENE};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Grade {
    Info,
    Warn,
    Strict,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Finding {
    pub grade: Grade,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConstraintReport {
    pub findings: Vec<Finding>,
}

impl ConstraintReport {
    pub fn blocks(&self) -> bool {
        self.findings.iter().any(|f| f.grade == Grade::Strict)
    }
}

/// `world` 是不含本场的算出（本场还是草稿）。
pub fn constrain(world: &World, canon: &Canon, draft: &BeatDraft) -> ConstraintReport {
    let mut r = ConstraintReport::default();
    for p in draft.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
        if canon
            .entity(&p.entity_id)
            .map(|e| e.kind == "rule")
            .unwrap_or(false)
        {
            r.findings.push(Finding {
                grade: Grade::Strict,
                code: "rule_not_present".into(),
                message: "规则不当在场".into(),
            });
        }
    }

    if draft.intent.trim().is_empty() {
        r.findings.push(Finding {
            grade: Grade::Strict,
            code: "empty_intent".into(),
            message: "没有本场任务不准写入正史".into(),
        });
    }

    let is_scene = draft.kind.is_empty() || draft.kind == BEAT_SCENE;
    let has_play = draft
        .do_text
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        || draft
            .say_text
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
        || draft
            .think_text
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
        || !draft.deltas.is_empty();
    if is_scene && !has_play {
        r.findings.push(Finding {
            grade: Grade::Strict,
            code: "empty_scene".into(),
            message: "场面既无动作对白内心也无本场变化".into(),
        });
    }

    if draft
        .value_shift
        .as_deref()
        .map(|s| s.trim().is_empty())
        .unwrap_or(true)
        && is_scene
    {
        r.findings.push(Finding {
            grade: Grade::Warn,
            code: "empty_value_shift".into(),
            message: "价值转折空，标黄仍可写入正史".into(),
        });
    }

    if let Some(cause) = &draft.cause_beat {
        let ok = canon
            .beats
            .iter()
            .any(|b| &b.id == cause && b.status == "committed");
        if !ok {
            r.findings.push(Finding {
                grade: Grade::Strict,
                code: "cause_draft".into(),
                message: "因果指向还不是正史的场".into(),
            });
        }
    }

    // 同人两地：本列已正史 present + 本场 present
    let mut place_of: Vec<(String, String)> = Vec::new();
    for b in canon.committed_beats(world.as_of) {
        if b.column_id != draft.column_id {
            continue;
        }
        if let Some(place) = &b.place_id {
            for p in b.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
                place_of.push((p.entity_id.clone(), place.clone()));
            }
        }
    }
    if let Some(place) = &draft.place_id {
        for p in draft.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
            place_of.push((p.entity_id.clone(), place.clone()));
        }
    }
    let mut by_person: std::collections::BTreeMap<String, std::collections::BTreeSet<String>> =
        std::collections::BTreeMap::new();
    for (person, place) in place_of {
        by_person.entry(person).or_default().insert(place);
    }
    for (person, places) in by_person {
        if places.len() > 1 {
            r.findings.push(Finding {
                grade: Grade::Strict,
                code: "two_places".into(),
                message: format!("{person} 同一列两个地点"),
            });
        }
    }

    knowledge_leak_warn(world, draft, &mut r);
    promise_ops_strict(world, draft, &mut r);
    r
}

fn speaker_knows(world: &World, speaker: &str, secret: &str) -> bool {
    world
        .knows
        .get(speaker)
        .map(|fs| fs.iter().any(|f| f == secret || f.contains(secret)))
        .unwrap_or(false)
}

fn knowledge_leak_warn(world: &World, draft: &BeatDraft, r: &mut ConstraintReport) {
    let say = draft.say_text.clone().unwrap_or_default();
    if say.trim().is_empty() {
        return;
    }
    let Some(speaker) = draft
        .presences
        .iter()
        .find(|p| p.role == ROLE_PRESENT)
        .map(|p| p.entity_id.as_str())
    else {
        return;
    };
    let mut seen = std::collections::BTreeSet::new();
    for (who, facts) in &world.knows {
        if who == speaker {
            continue;
        }
        for fact in facts {
            let payload = fact.split_once(':').map(|(_, rest)| rest).unwrap_or(fact);
            if payload.chars().count() < 2 {
                continue;
            }
            if !say.contains(payload) {
                continue;
            }
            if speaker_knows(world, speaker, payload) {
                continue;
            }
            let key = format!("{who}:{payload}");
            if !seen.insert(key) {
                continue;
            }
            r.findings.push(Finding {
                grade: Grade::Warn,
                code: "knowledge_leak".into(),
                message: format!("知情穿帮：对白含 {who} 才知道的「{payload}」"),
            });
        }
    }
}

fn promise_ops_strict(world: &World, draft: &BeatDraft, r: &mut ConstraintReport) {
    let mut st: std::collections::BTreeMap<String, String> = world
        .promises
        .iter()
        .map(|p| (p.id.clone(), p.status.clone()))
        .collect();
    for op in &draft.promise_ops {
        let cur = st.get(&op.promise_id).map(|s| s.as_str());
        match op.op.as_str() {
            "plant" => {
                if matches!(cur, Some("paid") | Some("discarded")) {
                    r.findings.push(Finding {
                        grade: Grade::Strict,
                        code: "promise_replant".into(),
                        message: format!("伏笔「{}」已经收了，不能再埋", op.promise_id),
                    });
                }
                st.insert(op.promise_id.clone(), "open".into());
            }
            "advance" => {
                if cur != Some("open") {
                    r.findings.push(Finding {
                        grade: Grade::Strict,
                        code: "promise_advance".into(),
                        message: format!("伏笔「{}」没在收着，不能推进", op.promise_id),
                    });
                }
            }
            "payoff" => {
                if cur != Some("open") {
                    r.findings.push(Finding {
                        grade: Grade::Strict,
                        code: "promise_payoff".into(),
                        message: format!("伏笔「{}」没埋着，不能兑现", op.promise_id),
                    });
                }
                st.insert(op.promise_id.clone(), "paid".into());
            }
            "discard" => {
                if cur != Some("open") {
                    r.findings.push(Finding {
                        grade: Grade::Strict,
                        code: "promise_discard".into(),
                        message: format!("伏笔「{}」没在收着，不能作废", op.promise_id),
                    });
                }
                st.insert(op.promise_id.clone(), "discarded".into());
            }
            _ => {}
        }
    }
}
