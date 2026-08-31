//! 模型填场：组嘱咐、读回稿。真正 HTTP 出站只在 setting-api。

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::services::circumstances::ScenePacket;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct FillFields {
    pub do_text: Option<String>,
    pub say_text: Option<String>,
    pub think_text: Option<String>,
    pub value_shift: Option<String>,
}

impl FillFields {
    pub fn is_empty(&self) -> bool {
        fn blank(s: &Option<String>) -> bool {
            s.as_deref().map(|t| t.trim().is_empty()).unwrap_or(true)
        }
        blank(&self.do_text) && blank(&self.say_text) && blank(&self.think_text)
    }
}

pub fn fill_system_prompt() -> &'static str {
    "你在给一场戏填草稿，不是写入历史。\
只根据本场任务和规定情境写这一场的动作、对白、内心。\
稿子里要发生一件事：价值转折，或知情差被用上，或对伏笔做一件事。不要复述世界清单。\
不要指定下一场。不要说已经写入正史。\
只输出一个 JSON 对象，键为 do_text、say_text、think_text、value_shift。不要Markdown围栏外的解释。"
}

pub fn fill_user_prompt(intent: &str, pkt: &ScenePacket) -> Result<String, String> {
    if intent.trim().is_empty() {
        return Err("没有本场任务不准填".into());
    }
    let pkt_json = serde_json::to_string_pretty(pkt).map_err(|e| e.to_string())?;
    Ok(format!(
        "本场任务：{intent}\n\n本场规定情境（JSON）：\n{pkt_json}\n"
    ))
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
    let fields = FillFields {
        do_text: pick("do_text"),
        say_text: pick("say_text"),
        think_text: pick("think_text"),
        value_shift: pick("value_shift"),
    };
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
}
