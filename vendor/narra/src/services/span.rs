//! 两列之间用得上的那一截世界。不落库、不进填场输入。

use crate::services::circumstances::{select_open_promises, OpenPromise};
use crate::services::world::{BeatDraft, Canon, World, ROLE_PRESENT, STATUS_COMMITTED};
use serde::{Deserialize, Serialize};
use surrealdb::types::SurrealValue;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, SurrealValue)]
pub struct SpanPacket {
    pub clock_from: i64,
    pub clock_to: i64,
    pub open_promises: Vec<OpenPromise>,
    pub states: Vec<String>,
    pub knowledge_gaps: Vec<String>,
    pub beats_between: Vec<String>,
}

pub fn span_circumstances(
    world_before: &World,
    canon: &Canon,
    from: i64,
    to: i64,
    goal: &BeatDraft,
) -> SpanPacket {
    let mut dummy = goal.clone();
    dummy.clock_from = from;
    let open: Vec<OpenPromise> = select_open_promises(world_before, &dummy)
        .into_iter()
        .filter(|p| {
            p.deadline_clock
                .map(|d| d <= to)
                .unwrap_or(false)
        })
        .collect();

    let mut states = Vec::new();
    for s in &world_before.states {
        let related_person = goal
            .presences
            .iter()
            .any(|p| p.role == ROLE_PRESENT && p.entity_id == s.entity_id);
        let related_place = goal.place_id.as_deref() == Some(s.entity_id.as_str())
            || goal.place_id.as_deref() == Some(s.value.as_str());
        let related_goal_text = goal.intent.contains(&s.entity_id) || goal.intent.contains(&s.value);
        if related_person || related_place || related_goal_text {
            states.push(format!("{}.{}={}", s.entity_id, s.attr, s.value));
        }
    }

    let mut gaps = Vec::new();
    for s in &states {
        for p in goal.presences.iter().filter(|p| p.role == ROLE_PRESENT) {
            let known = world_before
                .knows
                .get(&p.entity_id)
                .map(|fs| fs.iter().any(|f| s.contains(f) || f.contains(s)))
                .unwrap_or(false);
            if !known {
                gaps.push(format!("{} 不知道 {}", p.entity_id, s));
            }
        }
    }
    gaps.sort();
    gaps.dedup();

    let mut beats_between: Vec<String> = canon
        .beats
        .iter()
        .filter(|b| b.status == STATUS_COMMITTED && b.clock_from >= from && b.clock_from < to)
        .map(|b| format!("{}:{}", b.id, b.intent))
        .collect();
    beats_between.sort();

    SpanPacket {
        clock_from: from,
        clock_to: to,
        open_promises: open,
        states,
        knowledge_gaps: gaps,
        beats_between,
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, SurrealValue)]
pub struct PlanBone {
    pub serial: bool,
    pub intent: String,
    pub presence: Vec<String>,
    pub promise_op: Option<String>,
    pub necessity: String,
    pub meet: Option<String>,
}

fn block_or_empty(parts: &[String]) -> String {
    let joined = parts
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("；");
    if joined.is_empty() {
        "（空）".into()
    } else {
        joined
    }
}

/// 铺场嘱咐只列区间人话，禁止把 SpanPacket / world_at JSON 整包塞进去。
pub fn plan_user_prompt(goal_intent: &str, facts: &[String], span: &SpanPacket) -> String {
    let fact_list = facts
        .iter()
        .filter(|f| !f.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");
    let promises: Vec<String> = span.open_promises.iter().map(|p| p.name.clone()).collect();
    format!(
        "目标场任务：{goal_intent}\n\
这一截已经为真、正在起作用的事（总述必须说到其中一件正在起作用的事，用这件事本身说，不要空喊加强冲突）：\n{fact_list}\n\
区间规定情境（只列人话，禁止整份 world_at JSON）：\n\
1. 区间：{}–{}\n\
2. 世界账：{}\n\
3. 知情差：{}\n\
4. 未收伏笔：{}\n\
5. 中间已有场：{}\n",
        span.clock_from,
        span.clock_to,
        block_or_empty(&span.states),
        block_or_empty(&span.knowledge_gaps),
        block_or_empty(&promises),
        block_or_empty(&span.beats_between),
    )
}

pub fn plan_system_prompt() -> &'static str {
    "你在建议两场之间要加几场戏。不要指定必须写哪一场。不要生成对白。建议不进历史。\
每个骨架必须写三格：这场没有则目标场塌在哪（necessity）、串或并（serial）、与哪一场相撞（meet；并必填，串可空）。\
不要预生成对白细稿。细稿若另生成必须标明按旧世界生成。\
总述必须锚着区间规定情境里的事实。空话不要。\
只输出 JSON：{\"summary\":\"...\",\"bones\":[{\"serial\":true,\"intent\":\"本场任务\",\"presence\":[\"人名\"],\"promise_op\":null,\"necessity\":\"这场没有则目标场塌在哪\",\"meet\":null}]}"
}

pub fn parse_plan_content(raw: &str, facts: &[String]) -> Result<(String, Vec<PlanBone>), String> {
    let t = raw.trim();
    let start = t.find('{').ok_or_else(|| "铺场没返回对象".to_string())?;
    let end = t.rfind('}').ok_or_else(|| "铺场没返回对象".to_string())?;
    let v: serde_json::Value =
        serde_json::from_str(&t[start..=end]).map_err(|e| format!("铺场不是对象：{e}"))?;
    let summary = v
        .get("summary")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if !summary.is_empty() {
        let hit = facts.iter().any(|f| {
            let frag: String = f.chars().take(4).collect();
            frag.chars().count() >= 2 && summary.contains(&frag)
        });
        if !hit {
            return Err("总述没有锚着区间里的事实".into());
        }
    }
    let mut bones = Vec::new();
    if let Some(arr) = v.get("bones").and_then(|x| x.as_array()) {
        for b in arr {
            let intent = b
                .get("intent")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let necessity = b
                .get("necessity")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if intent.is_empty() || necessity.is_empty() {
                continue;
            }
            let serial = b.get("serial").and_then(|x| x.as_bool()).unwrap_or(true);
            let meet = b
                .get("meet")
                .and_then(|x| x.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            if !serial && meet.is_none() {
                continue;
            }
            let presence = b
                .get("presence")
                .and_then(|x| x.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let promise_op = b
                .get("promise_op")
                .and_then(|x| x.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            bones.push(PlanBone {
                serial,
                intent,
                presence,
                promise_op,
                necessity,
                meet,
            });
        }
    }
    if bones.is_empty() {
        return Err("没有可用的骨架（缺必要性或并行缺交汇点）".into());
    }
    Ok((summary, bones))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::world::World;

    #[test]
    fn empty_window_still_struct() {
        let w = World::default();
        let c = Canon::default();
        let g = BeatDraft {
            intent: "揭穿".into(),
            ..BeatDraft::default()
        };
        let s = span_circumstances(&w, &c, 0, 0, &g);
        assert_eq!(s.clock_from, 0);
        assert_eq!(s.clock_to, 0);
    }

    #[test]
    fn reject_empty_bones() {
        assert!(parse_plan_content("{\"summary\":\"刀\",\"bones\":[]}", &["刀在抽屉".into()]).is_err());
    }

    #[test]
    fn keep_bone_with_necessity() {
        let raw = r#"{"summary":"刀在抽屉还没被看见","bones":[{"serial":true,"intent":"阿莲路过灶边","presence":["阿莲"],"necessity":"这场没有，揭穿会变成她凭空知道刀在哪"}]}"#;
        let (summary, bones) = parse_plan_content(raw, &["刀在抽屉".into()]).unwrap();
        assert!(summary.contains("刀"));
        assert_eq!(bones.len(), 1);
        assert!(bones[0].necessity.contains("凭空知道"));
    }

    #[test]
    fn drop_parallel_without_meet() {
        let raw = r#"{"summary":"刀在抽屉","bones":[{"serial":false,"intent":"阿福走开","presence":["阿福"],"necessity":"没有这场目标会塌"}]}"#;
        assert!(parse_plan_content(raw, &["刀在抽屉".into()]).is_err());
    }

    #[test]
    fn plan_prompt_no_world_json() {
        let span = SpanPacket {
            clock_from: 10,
            clock_to: 20,
            states: vec!["刀.holder=抽屉".into()],
            knowledge_gaps: vec!["阿莲 不知道 刀.holder=抽屉".into()],
            beats_between: vec!["b1:阿福看见刀".into()],
            ..SpanPacket::default()
        };
        let p = plan_user_prompt("揭穿", &["刀.holder=抽屉".into()], &span);
        assert!(p.contains("1. 区间"));
        assert!(p.contains("2. 世界账"));
        assert!(p.contains("刀.holder=抽屉"));
        assert!(p.contains("禁止整份 world_at JSON"));
        assert!(!p.contains("\"states\""));
        assert!(!p.contains("区间规定情境：\n{"));
    }
}
