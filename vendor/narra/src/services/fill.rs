//! 模型填场：组嘱咐、读回稿。真正 HTTP 出站只在 setting-api。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use surrealdb::types::SurrealValue;

use crate::services::circumstances::ScenePacket;
use crate::services::world::{flatten_tracks, PersonTrack};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, SurrealValue)]
pub struct FillFields {
    pub do_text: Option<String>,
    pub say_text: Option<String>,
    pub think_text: Option<String>,
    pub value_shift: Option<String>,
    #[serde(default)]
    pub tracks: Vec<PersonTrack>,
}

impl FillFields {
    pub fn is_empty(&self) -> bool {
        fn blank(s: &Option<String>) -> bool {
            s.as_deref().map(|t| t.trim().is_empty()).unwrap_or(true)
        }
        blank(&self.do_text) && blank(&self.say_text) && blank(&self.think_text) && self.tracks.is_empty()
    }
}

pub fn fill_system_prompt() -> &'static str {
    "你在给一场戏填草稿，不是写入历史。\
只根据本场任务和规定情境写这一场。按在场人物分轨：每个人自己的动作、对白、内心。\
道具、器物（thing）不分轨：不要把它们写成 tracks 里的 person_id，不要给它们对白或内心；它们只可以出现在人物的动作里被拿、被看见。\
稿子里要发生一件事：价值转折，或知情差被用上，或对伏笔做一件事。不要复述世界清单。\
禁止复述世界账。必须写出价值转折、或一次伏笔操作、或一处知情差对戏。\
不要指定下一场。不要说已经写入正史。\
只输出一个 JSON 对象，键为 tracks（数组，每项 person_id、do_text、say_text、think_text）、value_shift。也可附 do_text/say_text/think_text 整场摘要。不要Markdown围栏外的解释。"
}

/// 道具名/id（锡牌、铁尺、鼓罐等）命中则这条轨丢掉。
pub fn is_thing_track_id(person_id: &str, thing_keys: &std::collections::HashSet<String>) -> bool {
    let id = person_id.trim();
    if id.is_empty() {
        return false;
    }
    thing_keys.contains(id)
}

pub fn drop_thing_tracks(
    tracks: Vec<PersonTrack>,
    thing_keys: &std::collections::HashSet<String>,
) -> Vec<PersonTrack> {
    tracks
        .into_iter()
        .filter(|t| !is_thing_track_id(&t.person_id, thing_keys))
        .collect()
}

pub fn strip_thing_prefixed_lines(
    text: &str,
    thing_keys: &std::collections::HashSet<String>,
) -> Option<String> {
    let kept: Vec<&str> = text
        .lines()
        .filter(|line| {
            let prefix = line.split('：').next().unwrap_or("").trim();
            prefix.is_empty() || !is_thing_track_id(prefix, thing_keys)
        })
        .collect();
    let s = kept.join("\n");
    if s.trim().is_empty() {
        None
    } else {
        Some(s)
    }
}

/// 丢掉道具分轨，并清掉已拍扁文本里「铁尺：…」这种行。
pub fn scrub_thing_fields(fields: &mut FillFields, thing_keys: &std::collections::HashSet<String>) {
    if thing_keys.is_empty() {
        return;
    }
    fields.tracks = drop_thing_tracks(std::mem::take(&mut fields.tracks), thing_keys);
    if let Some(t) = &fields.do_text {
        fields.do_text = strip_thing_prefixed_lines(t, thing_keys);
    }
    if let Some(t) = &fields.say_text {
        fields.say_text = strip_thing_prefixed_lines(t, thing_keys);
    }
    if let Some(t) = &fields.think_text {
        fields.think_text = strip_thing_prefixed_lines(t, thing_keys);
    }
    if fields.do_text.is_none()
        && fields.say_text.is_none()
        && fields.think_text.is_none()
        && !fields.tracks.is_empty()
    {
        let (d, s, th) = flatten_tracks(&fields.tracks);
        fields.do_text = d;
        fields.say_text = s;
        fields.think_text = th;
    }
}

pub fn fill_cast_suffix(speakers: &[String], props: &[String]) -> String {
    let people = if speakers.is_empty() {
        "（无）".to_string()
    } else {
        speakers.join("、")
    };
    let things = if props.is_empty() {
        "（无）".to_string()
    } else {
        props.join("、")
    };
    format!(
        "\n可分轨人物（只对这些人写 tracks.person_id）：{people}\n在场道具（可写进人物动作，禁止 person_id、禁止对白、禁止内心）：{things}\n"
    )
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

pub fn packet_six_blocks(intent: &str, pkt: &ScenePacket) -> String {
    let shift = pkt
        .last_value_shift
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("（空）");
    let world = block_or_empty(&pkt.stakes);
    let mut people = pkt.knowledge_gaps.clone();
    people.extend(pkt.wrong_beliefs.iter().cloned());
    let people_s = block_or_empty(&people);
    let mut reader = pkt.reader_knows.clone();
    reader.extend(pkt.reader_irony.iter().cloned());
    let reader_s = block_or_empty(&reader);
    let promises: Vec<String> = pkt.open_promises.iter().map(|p| p.name.clone()).collect();
    let promises_s = block_or_empty(&promises);
    format!(
        "本场规定情境（只这六块，禁止整份世界 JSON，禁止 world_at）：\n\
1. 本场任务：{intent}\n\
2. 上场价值转折：{shift}\n\
3. 世界账：{world}\n\
4. 人物账：{people_s}\n\
5. 读者账：{reader_s}\n\
6. 未收伏笔：{promises_s}\n"
    )
}

pub fn fill_user_prompt(intent: &str, pkt: &ScenePacket) -> Result<String, String> {
    if intent.trim().is_empty() {
        return Err("没有本场任务不准填".into());
    }
    Ok(format!("本场任务：{intent}\n\n{}", packet_six_blocks(intent, pkt)))
}

/// 模型稿像复述这一刻：没有价值转折、没有点到伏笔名、对白/内心也没碰到知情差。
/// 不挡生成，只给界面标黄。人直接手写正史仍走 L30。
pub fn literary_thin(fields: &FillFields, pkt: &ScenePacket) -> bool {
    let no_shift = fields
        .value_shift
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty();
    let blob = format!(
        "{}{}{}",
        fields.do_text.as_deref().unwrap_or(""),
        fields.say_text.as_deref().unwrap_or(""),
        fields.think_text.as_deref().unwrap_or("")
    );
    let no_promise = !pkt.open_promises.iter().any(|p| {
        (!p.name.trim().is_empty() && blob.contains(&p.name))
            || (!p.id.trim().is_empty() && blob.contains(&p.id))
    });
    let no_gap = !pkt
        .knowledge_gaps
        .iter()
        .chain(pkt.wrong_beliefs.iter())
        .any(|g| {
            let frag: String = g.chars().take(6).collect();
            frag.chars().count() >= 2 && blob.contains(&frag)
        });
    no_shift && no_promise && no_gap
}

pub fn parse_fill_content(raw: &str) -> Result<FillFields, String> {
    let t = raw.trim();
    let start = t.find('{').ok_or_else(|| "模型没返回对象".to_string())?;
    let end = t.rfind('}').ok_or_else(|| "模型没返回对象".to_string())?;
    if end < start {
        return Err("模型没返回对象".into());
    }
    let v: Value = serde_json::from_str(&t[start..=end]).map_err(|e| format!("稿不是对象：{e}"))?;
    let pick = |k: &str| {
        v.get(k)
            .and_then(|x| x.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };
    let mut tracks = Vec::new();
    if let Some(arr) = v.get("tracks").and_then(|x| x.as_array()) {
        for t in arr {
            let person_id = t
                .get("person_id")
                .or_else(|| t.get("who"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if person_id.is_empty() {
                continue;
            }
            let pick_t = |k: &str| {
                t.get(k)
                    .and_then(|x| x.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            };
            tracks.push(PersonTrack {
                person_id,
                do_text: pick_t("do_text").or_else(|| pick_t("do")),
                say_text: pick_t("say_text").or_else(|| pick_t("say")),
                think_text: pick_t("think_text").or_else(|| pick_t("think")),
            });
        }
    }
    let mut fields = FillFields {
        do_text: pick("do_text"),
        say_text: pick("say_text"),
        think_text: pick("think_text"),
        value_shift: pick("value_shift"),
        tracks,
    };
    if fields.do_text.is_none() && fields.say_text.is_none() && fields.think_text.is_none() && !fields.tracks.is_empty() {
        let (d, s, th) = flatten_tracks(&fields.tracks);
        fields.do_text = d;
        fields.say_text = s;
        fields.think_text = th;
    }
    if fields.is_empty() {
        return Err("模型没写出动作、对白或内心".into());
    }
    Ok(fields)
}

pub fn chat_completions_url(base: &str) -> String {
    let b = base.trim().trim_end_matches('/');
    if b.ends_with("/chat/completions") {
        b.to_string()
    } else {
        format!("{b}/chat/completions")
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, SurrealValue)]
pub struct TalkConcern {
    pub kind: String,
    pub message: String,
    pub anchor: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, SurrealValue)]
pub struct TalkOut {
    pub reply: String,
    pub concerns: Vec<TalkConcern>,
}

pub fn talk_system_prompt() -> &'static str {
    "你在和作者讨论这一场的任务，不是生成整场，也不是写入历史。\
只评这么写会不会穿帮、会不会塌。不要评价该不该写这场。不要输出成稿。\
只输出一个 JSON 对象：{\"reply\":\"对作者说的话\",\"concerns\":[{\"kind\":\"break|drama|option\",\"message\":\"人话\",\"anchor\":\"必须是规定情境里出现过的原文片段\"}]}。\
kind=break 是穿帮关切，drama 是平在哪，option 是可选方向。\
锚不出规定情境里的事实，就不要写进 concerns。讨论不是历史。"
}

pub fn talk_user_prompt(field: &str, draft_text: &str, pkt: &ScenePacket, presence: &[String]) -> String {
    format!(
        "正在讨论的格子：{field}\n当前草稿：{draft_text}\n在场：{}\n禁止整份世界 JSON，禁止 world_at。\n{}\n",
        presence.join("、"),
        packet_six_blocks(&pkt.intent, pkt)
    )
}

pub fn parse_talk_content(raw: &str, facts: &[String]) -> Result<TalkOut, String> {
    let t = raw.trim();
    let start = t.find('{').ok_or_else(|| "讨论没返回对象".to_string())?;
    let end = t.rfind('}').ok_or_else(|| "讨论没返回对象".to_string())?;
    if end < start {
        return Err("讨论没返回对象".into());
    }
    let v: Value = serde_json::from_str(&t[start..=end]).map_err(|e| format!("讨论稿不是对象：{e}"))?;
    let reply = v
        .get("reply")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let mut concerns = Vec::new();
    if let Some(arr) = v.get("concerns").and_then(|x| x.as_array()) {
        for c in arr {
            let kind = c
                .get("kind")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let message = c
                .get("message")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let anchor = c
                .get("anchor")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if message.is_empty() || anchor.chars().count() < 2 {
                continue;
            }
            if !facts.iter().any(|f| f.contains(&anchor) || anchor.contains(f)) {
                continue;
            }
            if !matches!(kind.as_str(), "break" | "drama" | "option") {
                continue;
            }
            concerns.push(TalkConcern {
                kind,
                message,
                anchor,
            });
        }
    }
    if reply.is_empty() && concerns.is_empty() {
        return Err("讨论没有可显示的内容".into());
    }
    Ok(TalkOut { reply, concerns })
}

pub fn packet_facts(pkt: &ScenePacket) -> Vec<String> {
    let mut facts = pkt.stakes.clone();
    facts.extend(pkt.knowledge_gaps.clone());
    facts.extend(pkt.default_witnesses.clone());
    if let Some(s) = &pkt.last_value_shift {
        facts.push(s.clone());
    }
    for p in &pkt.open_promises {
        facts.push(p.name.clone());
        facts.push(p.id.clone());
    }
    facts.push(pkt.intent.clone());
    facts
}

pub fn extract_chat_content(body: &Value) -> Result<String, String> {
    body.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "模型返回没有正文".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::circumstances::ScenePacket;

    #[test]
    fn parse_plain_object() {
        let f = parse_fill_content(
            r#"{"do_text":"推门","say_text":"东西呢","think_text":"别开抽屉","value_shift":"她还不知道"}"#,
        )
        .unwrap();
        assert_eq!(f.do_text.as_deref(), Some("推门"));
        assert!(!f.is_empty());
    }

    #[test]
    fn parse_fenced() {
        let f = parse_fill_content("```json\n{\"do_text\":\"走了一步\"}\n```").unwrap();
        assert_eq!(f.do_text.as_deref(), Some("走了一步"));
    }

    #[test]
    fn reject_empty() {
        assert!(parse_fill_content("{}").is_err());
        assert!(fill_user_prompt("  ", &ScenePacket::default()).is_err());
    }

    #[test]
    fn prompt_six_blocks_no_world_json() {
        let pkt = ScenePacket {
            intent: "找刀".into(),
            stakes: vec!["刀.holder=抽屉".into()],
            knowledge_gaps: vec!["阿莲 不知道 刀.holder=抽屉".into()],
            last_value_shift: Some("刀被阿福看见".into()),
            ..ScenePacket::default()
        };
        let p = fill_user_prompt("找刀", &pkt).unwrap();
        assert!(p.contains("1. 本场任务"));
        assert!(p.contains("2. 上场价值转折"));
        assert!(p.contains("3. 世界账"));
        assert!(p.contains("4. 人物账"));
        assert!(p.contains("5. 读者账"));
        assert!(p.contains("6. 未收伏笔"));
        assert!(!p.contains("world_at"));
        assert!(!p.contains("\"states\""));
        assert!(!p.contains("本场规定情境（JSON）"));
        assert!(fill_system_prompt().contains("禁止复述世界账"));
        let talk = talk_user_prompt("intent", "找刀", &pkt, &["阿莲".into()]);
        assert!(talk.contains("1. 本场任务"));
        assert!(talk.contains("禁止 world_at"));
        assert!(!talk.contains("本场规定情境（JSON）"));
        assert!(!talk.contains("\"stakes\""));
    }

    #[test]
    fn literary_thin_when_no_turn() {
        let pkt = ScenePacket {
            knowledge_gaps: vec!["阿莲 不知道 刀.holder=抽屉".into()],
            ..ScenePacket::default()
        };
        let thin = FillFields {
            do_text: Some("走进屋里".into()),
            ..FillFields::default()
        };
        assert!(literary_thin(&thin, &pkt));
        let ok = FillFields {
            do_text: Some("走进屋里".into()),
            value_shift: Some("信任→破裂".into()),
            ..FillFields::default()
        };
        assert!(!literary_thin(&ok, &pkt));
    }

    #[test]
    fn url_join() {
        assert_eq!(
            chat_completions_url("https://api.x.ai/v1/"),
            "https://api.x.ai/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("https://api.x.ai/v1/chat/completions"),
            "https://api.x.ai/v1/chat/completions"
        );
    }

    #[test]
    fn drop_unanchored_talk() {
        let raw = r#"{"reply":"会穿帮","concerns":[{"kind":"break","message":"空话加强冲突","anchor":"没有这条"},{"kind":"break","message":"她不该知道刀","anchor":"刀在抽屉"}]}"#;
        let out = parse_talk_content(raw, &["刀在抽屉".into()]).unwrap();
        assert_eq!(out.concerns.len(), 1);
        assert_eq!(out.concerns[0].anchor, "刀在抽屉");
    }

    #[test]
    fn parse_tracks_flattens_scene_text() {
        let f = parse_fill_content(
            r#"{"tracks":[{"person_id":"阿福","do_text":"挡住抽屉","say_text":"没有东西","think_text":"别让她看见刀"}],"value_shift":"把柄还在"}"#,
        )
        .unwrap();
        assert_eq!(f.tracks.len(), 1);
        assert_eq!(f.tracks[0].person_id, "阿福");
        assert_eq!(f.do_text.as_deref(), Some("阿福：挡住抽屉"));
        assert_eq!(f.say_text.as_deref(), Some("阿福：没有东西"));
        assert_eq!(f.value_shift.as_deref(), Some("把柄还在"));
        assert!(!f.is_empty());
    }

    #[test]
    fn drop_thing_tracks_keeps_people() {
        let mut keys = std::collections::HashSet::new();
        keys.insert("铁尺".into());
        keys.insert("锡牌".into());
        keys.insert("赛子龙鼓罐".into());
        let tracks = vec![
            PersonTrack {
                person_id: "吴定缘".into(),
                do_text: Some("亮牌".into()),
                say_text: Some("应天府的人".into()),
                think_text: None,
            },
            PersonTrack {
                person_id: "铁尺".into(),
                do_text: Some("试探旗兵".into()),
                say_text: Some("我是铁尺".into()),
                think_text: Some("我能说话".into()),
            },
            PersonTrack {
                person_id: "赛子龙鼓罐".into(),
                do_text: Some("罐壁有水气".into()),
                say_text: None,
                think_text: Some("它听见两千料".into()),
            },
        ];
        let kept = drop_thing_tracks(tracks, &keys);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].person_id, "吴定缘");
        assert_eq!(
            strip_thing_prefixed_lines("铁尺：我是铁尺\n吴定缘：应天府的人", &keys).as_deref(),
            Some("吴定缘：应天府的人")
        );
        let mut f = parse_fill_content(
            r#"{"tracks":[{"person_id":"朱瞻基","do_text":"扣虫","say_text":"拿住它"},{"person_id":"赛子龙鼓罐","do_text":"罐在案上","think_text":"它听见两千料"}],"value_shift":"玩兴"}"#,
        )
        .unwrap();
        scrub_thing_fields(&mut f, &keys);
        assert_eq!(f.tracks.len(), 1);
        assert_eq!(f.tracks[0].person_id, "朱瞻基");
        assert!(f.do_text.as_deref().unwrap().contains("朱瞻基"));
        assert!(!f.do_text.as_deref().unwrap().contains("赛子龙鼓罐"));
        assert!(f.think_text.is_none() || !f.think_text.as_deref().unwrap().contains("赛子龙鼓罐"));
        assert!(fill_system_prompt().contains("道具、器物（thing）不分轨"));
    }
}
