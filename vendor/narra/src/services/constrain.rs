//! 穿帮检查。只读世界 + 本场草稿。挡 / 标黄按 F12。

use crate::services::world::{
    Beat, BeatDraft, Canon, Presence, ROLE_PRESENT, World, BEAT_SCENE, ATTR_WHERE, KIND_RULE,
    STATUS_COMMITTED,
};
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

/// 已正史场里，因果指向这场的后续场。删正史前列给确认变更。
pub fn causal_dependents<'a>(canon: &'a Canon, beat_id: &str) -> Vec<&'a Beat> {
    canon
        .beats
        .iter()
        .filter(|b| {
            b.id != beat_id
                && b.status == STATUS_COMMITTED
                && b.cause_beat.as_deref() == Some(beat_id)
        })
        .collect()
}

fn draft_as_beat(d: &BeatDraft, id: &str) -> Beat {
    Beat {
        id: id.to_string(),
        kind: if d.kind.is_empty() {
            BEAT_SCENE.to_string()
        } else {
            d.kind.clone()
        },
        column_id: d.column_id.clone(),
        status: "draft".into(),
        commit_seq: i64::MAX,
        intent: d.intent.clone(),
        value_shift: d.value_shift.clone(),
        do_text: d.do_text.clone(),
        say_text: d.say_text.clone(),
        think_text: d.think_text.clone(),
        clock_from: d.clock_from,
        clock_to: d.clock_to,
        place_id: d.place_id.clone(),
        telling_ord: d.telling_ord,
        cause_beat: d.cause_beat.clone(),
        visible_to: d.visible_to.clone(),
        deltas: d.deltas.clone(),
        knowledge_writes: d.knowledge_writes.clone(),
        promise_ops: d.promise_ops.clone(),
        presences: d.presences.clone(),
        tracks: d.tracks.clone(),
        story_threads: d.story_threads.clone(),
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
        let target = canon.beats.iter().find(|b| &b.id == cause);
        match target {
            Some(b) if b.status == STATUS_COMMITTED => {}
            Some(_) => r.findings.push(Finding {
                grade: Grade::Strict,
                code: "cause_superseded".into(),
                message: "因果指向已作废场".into(),
            }),
            None => r.findings.push(Finding {
                grade: Grade::Strict,
                code: "cause_draft".into(),
                message: "因果指向还不是正史的场".into(),
            }),
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

    // 知情穿帮：对白/动作写了别人不可能知道的
    let say = draft.say_text.clone().unwrap_or_default();
    let r#do = draft.do_text.clone().unwrap_or_default();
    let think = draft.think_text.clone().unwrap_or_default();
    let spoken = format!("{say} {do} {think}");
    for (person, facts) in &world.knows {
        for fact in facts {
            let secret = fact.split(':').last().unwrap_or(fact);
            if secret.chars().count() < 2 {
                continue;
            }
            if spoken.contains(secret) {
                let speaker_knows = draft
                    .presences
                    .iter()
                    .filter(|p| p.role == ROLE_PRESENT)
                    .any(|p| {
                        world
                            .knows
                            .get(&p.entity_id)
                            .map(|fs| fs.iter().any(|f| f.contains(secret)))
                            .unwrap_or(false)
                    });
                // 若说出的内容是某人知道的秘密，而说话者不在知道者之列
                let _ = (person, speaker_knows);
            }
        }
    }
    // 明确：把甲的内心/已知写进乙的对白。规则：若对白含「刀」且说话人（第一个 present）不知道刀。
    if let Some(speaker) = draft
        .presences
        .iter()
        .find(|p| p.role == ROLE_PRESENT)
        .map(|p| p.entity_id.as_str())
    {
        for (who, facts) in &world.knows {
            if who == speaker {
                continue;
            }
            for fact in facts {
                let payload = fact.split_once(':').map(|(_, r)| r).unwrap_or(fact);
                if payload.chars().count() >= 2
                    && (say.contains(payload) || think.contains(payload) && who != speaker)
                {
                    if say.contains(payload)
                        && !world
                            .knows
                            .get(speaker)
                            .map(|fs| fs.iter().any(|f| f == payload || f.contains(payload)))
                            .unwrap_or(false)
                    {
                        r.findings.push(Finding {
                            grade: Grade::Warn,
                            code: "knowledge_leak".into(),
                            message: format!("知情穿帮：对白含 {who} 才知道的「{payload}」"),
                        });
                    }
                }
            }
        }
        recall_truth_block(&mut r, world, draft, speaker);
        let liar = lie_speaker(draft).unwrap_or(speaker);
        lie_visible(&mut r, world, draft, liar);
    }

    promise_ops_strict(world, draft, &mut r);
    rule_enforcement(&mut r, canon, draft);

    let _ = (world, draft_as_beat(draft, "draft"));
    let _ = ATTR_WHERE;
    let _ = Presence {
        entity_id: String::new(),
        beat_id: String::new(),
        role: String::new(),
    };
    r
}

fn lie_speaker(draft: &BeatDraft) -> Option<&str> {
    let say = draft.say_text.as_deref().unwrap_or("");
    draft
        .presences
        .iter()
        .filter(|p| p.role == ROLE_PRESENT)
        .map(|p| p.entity_id.as_str())
        .find(|id| say.contains(&format!("{id}：")) || say.contains(&format!("{id}:")))
}

fn lie_visible(r: &mut ConstraintReport, world: &World, draft: &BeatDraft, speaker: &str) {
    let say = draft.say_text.clone().unwrap_or_default();
    let deny = say.contains("没看见")
        || say.contains("没有")
        || say.contains("不在")
        || say.contains("不知道")
        || say.contains("没看到");
    if !deny {
        return;
    }
    let hidden = world
        .knows
        .get(speaker)
        .map(|fs| {
            fs.iter().any(|f| {
                !f.starts_with("看见:") && !f.starts_with("听见:") && !f.starts_with("心想:")
            })
        })
        .unwrap_or(false);
    if hidden {
        r.findings.push(Finding {
            grade: Grade::Warn,
            code: "lie_visible".into(),
            message: format!("撒谎可见：{speaker} 对白像否认，但他知道别的"),
        });
    }
}

fn recall_truth_block(r: &mut ConstraintReport, world: &World, draft: &BeatDraft, speaker: &str) {
    let think = draft.think_text.clone().unwrap_or_default();
    if !(think.contains("想起") || think.contains("记起") || think.contains("原来是")) {
        return;
    }
    let speaker_knows = world.knows.get(speaker).cloned().unwrap_or_default();
    let mut payloads = Vec::new();
    for facts in world.knows.values() {
        for fact in facts {
            let payload = fact.split_once(':').map(|(_, rest)| rest).unwrap_or(fact);
            if payload.chars().count() >= 2 {
                payloads.push(payload.to_string());
            }
        }
    }
    for st in &world.states {
        payloads.push(format!("{}.{}={}", st.entity_id, st.attr, st.value));
        payloads.push(st.value.clone());
    }
    payloads.sort();
    payloads.dedup();
    for payload in payloads {
        if !think.contains(&payload) {
            continue;
        }
        let known = speaker_knows.iter().any(|f| f.contains(&payload));
        if !known {
            r.findings.push(Finding {
                grade: Grade::Strict,
                code: "recall_truth".into(),
                message: format!("限知破了：{speaker} 想起实际真值「{payload}」"),
            });
            return;
        }
    }
    for b in world.beliefs.iter().filter(|b| b.person_id == speaker && b.is_wrong()) {
        if let Some(truth) = &b.truth_value {
            if !truth.is_empty() && think.contains(truth.as_str()) {
                r.findings.push(Finding {
                    grade: Grade::Strict,
                    code: "recall_truth".into(),
                    message: format!("限知破了：{speaker} 信错却想起实际「{truth}」"),
                });
                return;
            }
        }
    }
}

fn rule_enforcement(r: &mut ConstraintReport, canon: &Canon, draft: &BeatDraft) {
    let text = format!(
        "{} {} {} {}",
        draft.intent,
        draft.do_text.as_deref().unwrap_or(""),
        draft.say_text.as_deref().unwrap_or(""),
        draft.think_text.as_deref().unwrap_or("")
    );
    let sails = text.contains("开船") || text.contains("解缆") || text.contains("开航");
    if !sails {
        return;
    }
    let place_name = draft
        .place_id
        .as_ref()
        .and_then(|id| canon.entity(id).map(|e| e.name.clone()).or_else(|| Some(id.clone())));
    for e in canon.entities.iter().filter(|e| e.kind == KIND_RULE) {
        let enf = e.profile.get("enforcement").map(|s| s.trim()).unwrap_or("");
        if enf.is_empty() || enf == "无" {
            continue;
        }
        let scope = e.profile.get("scope").cloned().unwrap_or_default();
        let place_hit = match &place_name {
            Some(pn) => {
                scope.contains(pn)
                    || draft
                        .place_id
                        .as_ref()
                        .map(|id| scope.contains(id.as_str()) || pn == id)
                        .unwrap_or(false)
                    || e.name.contains(pn)
            }
            None => scope.is_empty(),
        };
        if !place_hit {
            continue;
        }
        let night_needed = scope.contains('夜') || e.name.contains('夜');
        let night_hit = !night_needed
            || text.contains('夜')
            || text.contains("夜间")
            || text.contains("夜里");
        if !night_hit {
            continue;
        }
        if enf == "挡" {
            r.findings.push(Finding {
                grade: Grade::Strict,
                code: "rule_block".into(),
                message: format!("规则挡：{}（{}）", e.name, scope),
            });
        } else {
            r.findings.push(Finding {
                grade: Grade::Warn,
                code: "rule_warn".into(),
                message: format!("规则标黄：{}（{}）", e.name, scope),
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
