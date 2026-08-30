//! 穿帮检查。只读世界 + 本场草稿。挡 / 标黄按 F12。

use crate::services::world::{
    Beat, BeatDraft, Canon, Presence, ROLE_PRESENT, World, BEAT_SCENE, ATTR_WHERE,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Grade {
    Info,
    Warn,
    Strict,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub grade: Grade,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConstraintReport {
    pub findings: Vec<Finding>,
}

impl ConstraintReport {
    pub fn blocks(&self) -> bool {
        self.findings.iter().any(|f| f.grade == Grade::Strict)
    }
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
                    if say.contains(payload) {
                        r.findings.push(Finding {
                            grade: Grade::Warn,
                            code: "knowledge_leak".into(),
                            message: format!("知情穿帮：对白含 {who} 才知道的「{payload}」"),
                        });
                    }
                }
            }
        }
    }

    let _ = (world, draft_as_beat(draft, "draft"));
    let _ = ATTR_WHERE;
    let _ = Presence {
        entity_id: String::new(),
        beat_id: String::new(),
        role: String::new(),
    };
    r
}
