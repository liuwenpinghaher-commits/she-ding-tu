//! 章级拼写器：只重排已入正史的句子，不增事实、不删事实、不写回正史。

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SourceBeat {
    pub id: String,
    pub kind: String,
    pub intent: String,
    pub place: String,
    pub do_text: String,
    pub say_text: String,
    pub think_text: String,
    pub value_shift: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct FactReport {
    pub ok: bool,
    pub added_entities: Vec<String>,
    pub missing_quotes: Vec<String>,
    pub added_quotes: Vec<String>,
}

const HAN_MIN: char = '\u{4e00}';
const HAN_MAX: char = '\u{9fff}';

pub fn hanzi_count(s: &str) -> usize {
    s.chars().filter(|c| *c >= HAN_MIN && *c <= HAN_MAX).count()
}

pub fn dialogue_hanzi(s: &str) -> usize {
    let pairs = [('「', '」'), ('“', '”'), ('『', '』')];
    let mut n = 0;
    for (a, b) in pairs {
        let mut i = 0;
        let chars: Vec<char> = s.chars().collect();
        while i < chars.len() {
            if chars[i] == a {
                if let Some(j) = chars[i + 1..].iter().position(|c| *c == b) {
                    let inner: String = chars[i + 1..i + 1 + j].iter().collect();
                    n += hanzi_count(&inner);
                    i = i + 1 + j + 1;
                    continue;
                }
            }
            i += 1;
        }
    }
    n
}

pub fn extract_quotes(s: &str) -> Vec<String> {
    let pairs = [('「', '」'), ('“', '”'), ('『', '』')];
    let mut out = Vec::new();
    for (a, b) in pairs {
        let mut i = 0;
        let chars: Vec<char> = s.chars().collect();
        while i < chars.len() {
            if chars[i] == a {
                if let Some(j) = chars[i + 1..].iter().position(|c| *c == b) {
                    let inner: String = chars[i + 1..i + 1 + j].iter().collect();
                    let t = inner.trim().to_string();
                    if !t.is_empty() {
                        out.push(t);
                    }
                    i = i + 1 + j + 1;
                    continue;
                }
            }
            i += 1;
        }
    }
    out
}

pub fn source_blob(b: &SourceBeat) -> String {
    let mut s = String::new();
    for part in [
        &b.intent,
        &b.place,
        &b.do_text,
        &b.say_text,
        &b.think_text,
        &b.value_shift,
    ] {
        if !part.is_empty() {
            s.push_str(part);
            s.push('\n');
        }
    }
    s
}

pub fn entity_mentions(text: &str, names: &[String]) -> BTreeSet<String> {
    names
        .iter()
        .filter(|n| {
            let n = n.trim();
            n.chars().count() >= 2 && text.contains(n)
        })
        .cloned()
        .collect()
}

pub fn fact_check(source: &str, prose: &str, entity_names: &[String]) -> FactReport {
    let src_q: BTreeSet<String> = extract_quotes(source).into_iter().collect();
    let out_q: BTreeSet<String> = extract_quotes(prose).into_iter().collect();
    let missing_quotes: Vec<String> = src_q
        .iter()
        .filter(|q| !prose.contains(q.as_str()))
        .cloned()
        .collect();
    let added_quotes: Vec<String> = out_q.difference(&src_q).cloned().collect();
    let src_e = entity_mentions(source, entity_names);
    let out_e = entity_mentions(prose, entity_names);
    let added_entities: Vec<String> = out_e.difference(&src_e).cloned().collect();
    let ok = added_entities.is_empty() && added_quotes.is_empty() && missing_quotes.is_empty();
    FactReport {
        ok,
        added_entities,
        missing_quotes,
        added_quotes,
    }
}

impl FactReport {
    /// 拼章润色过审：无漏引语、无增实体。允许 added_quotes（内层改写）。
    pub fn polish_pass(&self) -> bool {
        self.added_entities.is_empty() && self.missing_quotes.is_empty()
    }
}

pub fn weave_beat(b: &SourceBeat) -> String {
    let mut out = String::new();
    let push = |out: &mut String, t: &str| {
        let t = t.trim();
        if t.is_empty() {
            return;
        }
        out.push_str(t);
        if !t.ends_with('\n') {
            out.push('\n');
        }
    };
    if b.kind == "ellipsis" {
        push(&mut out, &b.intent);
        return out;
    }
    push(&mut out, &b.do_text);
    push(&mut out, &b.say_text);
    push(&mut out, &b.think_text);
    out
}

pub fn numbered_sentences(b: &SourceBeat) -> String {
    let mut n = 0;
    let mut out = String::new();
    for part in [&b.do_text, &b.say_text, &b.think_text] {
        for raw in part.split('\n') {
            let t = raw.trim();
            if t.is_empty() {
                continue;
            }
            n += 1;
            out.push_str(&format!("{n}. {t}\n"));
        }
    }
    if n == 0 && !b.intent.trim().is_empty() {
        out.push_str(&format!("1. {}\n", b.intent.trim()));
    }
    out
}

pub fn polish_system_prompt() -> &'static str {
    "你是设定图的章级拼写器。\
只重排已给的正史句子，写成可当小说读的连贯段落。\
禁止增加新人物、新地点、新器物、新事件、新对白、新知情。\
禁止删掉已给的对白原文：「」里的字必须原样出现。\
可以把动作、对白、内心按时间织在一起；衔接只能用这些句子里已经出现过的词。\
不要分栏标题，不要 Markdown，不要说「正史」「格子」。\
不要指定下一场。不要输出 JSON。"
}

pub fn polish_user_prompt(b: &SourceBeat, min_hanzi: usize) -> String {
    format!(
        "本场任务：{}\n地点：{}\n价值转折：{}\n种类：{}\n目标汉字不少于 {min_hanzi}（用已有感官词衔接，禁止新事实）。\n\n正史句子（必须全部用上）：\n{}",
        b.intent,
        b.place,
        b.value_shift,
        if b.kind == "ellipsis" {
            "省略场"
        } else {
            "场面"
        },
        numbered_sentences(b)
    )
}

pub fn scene_heading(b: &SourceBeat) -> String {
    let kind = if b.kind == "ellipsis" {
        "省略场"
    } else {
        "场"
    };
    format!(
        "## {kind} · {}\n状态：正史\n本场任务：{}\n地点：{}\n价值转折：{}\n{}\n",
        b.intent,
        b.intent,
        if b.place.is_empty() {
            "（未标）"
        } else {
            &b.place
        },
        if b.value_shift.is_empty() {
            "（无）"
        } else {
            &b.value_shift
        },
        weave_beat(b).trim_end()
    )
}

pub fn export_composed(book: &str, premise: &str, chapter_title: &str, bodies: &[(SourceBeat, String)]) -> String {
    let mut md = format!("# {book}\n\n");
    let p = premise.trim();
    if !p.is_empty() {
        md.push_str("> 主脑：");
        md.push_str(p);
        md.push_str("\n\n");
    }
    let title = chapter_title.trim();
    if !title.is_empty() {
        md.push_str("# ");
        if title.starts_with('第') {
            md.push_str(title);
        } else {
            md.push_str("第1回 ");
            md.push_str(title);
        }
        md.push_str("\n\n");
    }
    for (b, body) in bodies {
        let kind = if b.kind == "ellipsis" {
            "省略场"
        } else {
            "场"
        };
        md.push_str(&format!(
            "## {kind} · {}\n状态：正史\n本场任务：{}\n地点：{}\n价值转折：{}\n{}\n\n",
            b.intent,
            b.intent,
            if b.place.is_empty() {
                "（未标）"
            } else {
                &b.place
            },
            if b.value_shift.is_empty() {
                "（无）"
            } else {
                &b.value_shift
            },
            body.trim_end()
        ));
    }
    md
}

/// 章级目标汉字如何摊到每一拍。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MinHanziMode {
    /// 按拍长平方加权分摊盈余：长拍多摊、短拍少摊。
    Weighted,
    /// 每拍源汉字 × 1.15。
    Ratio115,
}

impl MinHanziMode {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "ratio_115" | "ratio115" | "1.15" | "flat" => Self::Ratio115,
            _ => Self::Weighted,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Weighted => "weighted",
            Self::Ratio115 => "ratio_115",
        }
    }
}

pub fn beat_source_hanzi(b: &SourceBeat) -> usize {
    hanzi_count(&source_blob(b))
}

/// 拍长权重：源汉字平方，使短拍扩张比低于章均。
pub fn beat_weight(src_hanzi: usize) -> u64 {
    let s = src_hanzi as u64;
    s.saturating_mul(s)
}

/// `surplus` = 章级 target − 全章源汉字；`weight_sum` = 参与摊派的拍 `beat_weight` 之和。
pub fn min_hanzi_for_beat(
    src_hanzi: usize,
    mode: MinHanziMode,
    weight_sum: u64,
    surplus: usize,
) -> usize {
    match mode {
        MinHanziMode::Ratio115 => {
            let scaled = ((src_hanzi as f64) * 1.15).ceil() as usize;
            scaled.max(src_hanzi)
        }
        MinHanziMode::Weighted => {
            if weight_sum == 0 {
                return src_hanzi;
            }
            let w = beat_weight(src_hanzi);
            let extra = ((surplus as u64)
                .saturating_mul(w)
                .saturating_add(weight_sum - 1)
                / weight_sum) as usize;
            src_hanzi.saturating_add(extra)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn beat() -> SourceBeat {
        SourceBeat {
            id: "b1".into(),
            kind: "scene".into(),
            intent: "看水路图".into(),
            place: "漕河船舱".into(),
            do_text: "于谦把炭笔递给太子。".into(),
            say_text: "朱瞻基：「何时可以不必拉纤？」\n于谦：「殿下勿急。」".into(),
            think_text: "朱瞻基：这图不是玩物。".into(),
            value_shift: "嫌慢 → 看懂河脊".into(),
        }
    }

    #[test]
    fn hanzi_matches_plan_a() {
        assert_eq!(hanzi_count("朱瞻基看图"), 5);
        assert_eq!(dialogue_hanzi("朱瞻基：「何时可以不必拉纤？」"), 8);
    }

    #[test]
    fn stitch_keeps_quotes_and_entities() {
        let b = beat();
        let body = weave_beat(&b);
        let src = source_blob(&b);
        let names = vec![
            "朱瞻基".into(),
            "于谦".into(),
            "苏荆溪".into(),
            "漕河船舱".into(),
        ];
        let r = fact_check(&src, &body, &names);
        assert!(r.ok, "{r:?}");
        assert!(body.contains("何时可以不必拉纤"));
        assert!(!body.contains("苏荆溪"));
    }

    #[test]
    fn new_name_is_new_fact() {
        let b = beat();
        let src = source_blob(&b);
        let names = vec!["朱瞻基".into(), "杨士奇".into()];
        let r = fact_check(&src, "杨士奇走进舱来。朱瞻基：「何时可以不必拉纤？」于谦：「殿下勿急。」", &names);
        assert!(!r.ok);
        assert!(r.added_entities.contains(&"杨士奇".into()));
    }

    #[test]
    fn new_quote_is_new_fact() {
        let b = beat();
        let src = source_blob(&b);
        let r = fact_check(
            &src,
            "朱瞻基：「何时可以不必拉纤？」\n于谦：「殿下勿急。」\n于谦：「臣有密诏。」",
            &[],
        );
        assert!(!r.ok);
        assert!(r.added_quotes.iter().any(|q| q.contains("密诏")));
    }

    #[test]
    fn missing_quote_is_deleted_fact() {
        let b = beat();
        let src = source_blob(&b);
        let r = fact_check(&src, "于谦把炭笔递给太子。", &[]);
        assert!(!r.ok);
        assert!(!r.missing_quotes.is_empty());
    }

    #[test]
    fn export_has_scene_markers() {
        let b = beat();
        let md = export_composed("两京对标", "人与消息", "济南水程", &[(b.clone(), weave_beat(&b))]);
        assert!(md.contains("## 场 · 看水路图"));
        assert!(md.contains("状态：正史"));
        assert!(md.contains("朱瞻基：「何时可以不必拉纤？」"));
    }

    #[test]
    fn polish_pass_allows_added_quotes() {
        let b = beat();
        let src = source_blob(&b);
        let r = fact_check(
            &src,
            "于谦把炭笔递给太子。朱瞻基：「何时可以不必拉纤？」于谦：「殿下勿急。」朱瞻基：「雨还在下。」",
            &[],
        );
        assert!(r.polish_pass(), "{r:?}");
        assert!(!r.added_quotes.is_empty());
        assert!(!r.ok);
    }

    #[test]
    fn polish_pass_rejects_missing_quote_or_new_entity() {
        let b = beat();
        let src = source_blob(&b);
        let missing = fact_check(&src, "于谦把炭笔递给太子。", &[]);
        assert!(!missing.polish_pass());
        let names = vec!["朱瞻基".into(), "杨士奇".into()];
        let added = fact_check(
            &src,
            "杨士奇走进舱来。朱瞻基：「何时可以不必拉纤？」于谦：「殿下勿急。」",
            &names,
        );
        assert!(!added.polish_pass());
        assert!(added.added_entities.contains(&"杨士奇".into()));
    }

    #[test]
    fn min_hanzi_ratio_115_is_flat() {
        assert_eq!(
            min_hanzi_for_beat(100, MinHanziMode::Ratio115, 0, 9999),
            115
        );
        assert_eq!(min_hanzi_for_beat(0, MinHanziMode::Ratio115, 0, 100), 0);
    }

    #[test]
    fn min_hanzi_weighted_gives_short_less_ratio() {
        let short = 80usize;
        let long = 800usize;
        let w = beat_weight(short) + beat_weight(long);
        let surplus = 2200usize;
        let s_min = min_hanzi_for_beat(short, MinHanziMode::Weighted, w, surplus);
        let l_min = min_hanzi_for_beat(long, MinHanziMode::Weighted, w, surplus);
        assert!(s_min >= short);
        assert!(l_min >= long);
        let s_ratio = s_min as f64 / short as f64;
        let l_ratio = l_min as f64 / long as f64;
        assert!(
            s_ratio < l_ratio,
            "short ratio {s_ratio} should be < long {l_ratio} (s={s_min} l={l_min})"
        );
        assert!(l_min > s_min);
        // 短拍不应再背 1.39× 均摊
        assert!(s_ratio < 1.39, "short ratio {s_ratio}");
    }
}
