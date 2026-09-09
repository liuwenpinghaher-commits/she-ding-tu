//! 章级拼写器：只重排已入正史的句子，不增事实、不删事实、不写回正史。

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

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

/// 对白汉字 / 全汉字，百分数一位小数。汉字为 0 时返回 0.0。
pub fn dialogue_ratio_pct(s: &str) -> f64 {
    let h = hanzi_count(s);
    if h == 0 {
        0.0
    } else {
        ((dialogue_hanzi(s) as f64 / h as f64) * 1000.0).round() / 10.0
    }
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
禁止增加新人物、新地点、新器物、新事件、新知情。\
禁止删掉已给的对白原文：「」里的字必须原样出现。\
场面靠对白推进，过场才用叙述；字数不够时把本场已开口的人把话说开，不要用说明书式旁白铺字。\
全章对白比锚定四成五左右（带宽约正负十个百分点，下限约三成六），不要写成每拍定额。\
可以把动作、对白、内心按时间织在一起；衔接只能用这些句子里已经出现过的词。\
禁止把同一句或同一段原样重复。禁止短句连打。字数不够时换一种说法写开，不得靠复读凑字。\
禁止套话：「淡淡道」「嘴角微微」。\
不要分栏标题，不要 Markdown，不要说「正史」「格子」。\
不要指定下一场。不要输出 JSON。"
}

pub fn polish_user_prompt(b: &SourceBeat, min_hanzi: usize) -> String {
    format!(
        "本场任务：{}\n地点：{}\n价值转折：{}\n种类：{}\n目标汉字不少于 {min_hanzi}（用已有感官词衔接，禁止新事实，禁止复读；场面靠对白推进，过场才用叙述）。\n\n正史句子（必须全部用上）：\n{}",
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

/// 整段（≥20 汉字、空行分段）出现次数 >2，或短句（≤20 汉字）连打 ≥3。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RepeatReport {
    pub para_over_2: Vec<(String, usize)>,
    pub consec_short_ge_3: Vec<(String, usize)>,
}

impl RepeatReport {
    pub fn ok(&self) -> bool {
        self.para_over_2.is_empty() && self.consec_short_ge_3.is_empty()
    }
}

pub fn split_paragraphs(s: &str) -> Vec<String> {
    s.split("\n\n")
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty() && hanzi_count(p) >= 20)
        .collect()
}

pub fn split_sentences(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for ch in s.chars() {
        cur.push(ch);
        if matches!(ch, '。' | '！' | '？') {
            let t = cur.trim().to_string();
            if !t.is_empty() {
                out.push(t);
            }
            cur.clear();
        }
    }
    let t = cur.trim().to_string();
    if !t.is_empty() {
        out.push(t);
    }
    out
}

pub fn repeat_scan(s: &str) -> RepeatReport {
    let mut para_counts: BTreeMap<String, usize> = BTreeMap::new();
    for p in split_paragraphs(s) {
        *para_counts.entry(p).or_default() += 1;
    }
    let para_over_2: Vec<(String, usize)> = para_counts.into_iter().filter(|(_, c)| *c > 2).collect();

    let sents = split_sentences(s);
    let mut consec_short_ge_3 = Vec::new();
    let mut i = 0;
    while i < sents.len() {
        let t = sents[i].trim();
        let mut j = i + 1;
        while j < sents.len() && sents[j].trim() == t && !t.is_empty() {
            j += 1;
        }
        let run = j - i;
        let h = hanzi_count(t);
        if run >= 3 && (1..=20).contains(&h) {
            consec_short_ge_3.push((t.to_string(), run));
        }
        i = j;
    }
    RepeatReport {
        para_over_2,
        consec_short_ge_3,
    }
}

pub fn has_repeat_violation(s: &str) -> bool {
    !repeat_scan(s).ok()
}

/// 评测禁用套话。仓内无现成 BAN 表；与 `~/notes/sdt-novel-score.py` 对齐，本轮只拦这两条。
pub const BAN_PHRASES: &[&str] = &["淡淡道", "嘴角微微"];

pub fn ban_scan(s: &str) -> Vec<String> {
    BAN_PHRASES
        .iter()
        .filter(|p| s.contains(*p))
        .map(|p| (*p).to_string())
        .collect()
}

pub fn has_ban_violation(s: &str) -> bool {
    !ban_scan(s).is_empty()
}

pub fn ban_reject_reason(s: &str) -> String {
    let hits = ban_scan(s);
    if hits.is_empty() {
        "ban".into()
    } else {
        format!("ban:{}", hits.join("|"))
    }
}

pub fn repeat_reject_reason(s: &str) -> String {
    let r = repeat_scan(s);
    let mut parts = Vec::new();
    if let Some((p, c)) = r.para_over_2.iter().max_by_key(|(_, c)| *c) {
        let clip: String = p.chars().take(24).collect();
        parts.push(format!("para_repeat {c}x:{clip}"));
    }
    if let Some((p, c)) = r.consec_short_ge_3.iter().max_by_key(|(_, c)| *c) {
        parts.push(format!("consec_short {c}x:{p}"));
    }
    if parts.is_empty() {
        "repeat".into()
    } else {
        parts.join("; ")
    }
}

pub fn expand_system_prompt() -> &'static str {
    "你是设定图的章级拼写器（兜底扩写）。\
只重排、扩展已给的正史句子的措辞，写成可当小说读的连贯段落。\
禁止增加新人物、新地点、新器物、新事件、新知情。\
禁止删掉已给的对白原文：「」里的字必须原样出现。\
场面靠对白推进，过场才用叙述；字数不够时把本场已开口的人把话说开，不要用说明书式旁白铺字。\
全章对白比锚定四成五左右（带宽约正负十个百分点，下限约三成六），不要写成每拍定额。\
禁止把同一句或同一段原样重复两遍以上。禁止短句连打。\
字数不够时，把本场已给句子里出现过的感官、动作、关系换成另一种说法写开，不得靠复读凑字，不得引入未编号句子里没有的事实。\
可以参考「章内已过审」段落的织法，但不得抄那些段落的句子，也不得把本场正史里没有的实体写进来。\
禁止套话：「淡淡道」「嘴角微微」。\
不要分栏标题，不要 Markdown，不要说「正史」「格子」。不要输出 JSON。"
}

pub fn expand_user_prompt(b: &SourceBeat, min_hanzi: usize, approved: &str) -> String {
    let approved_block = if approved.trim().is_empty() {
        "（本章尚无已过审段落，只扩写本场正史句子。）".to_string()
    } else {
        approved.to_string()
    };
    format!(
        "本场任务：{}\n地点：{}\n价值转折：{}\n种类：{}\n目标汉字不少于 {min_hanzi}（只扩写已有句子的措辞，禁止新事实，禁止复读；场面靠对白推进，过场才用叙述）。\n\n正史句子（必须全部用上）：\n{}\n\n章内已过审段落（只可学织法，不可抄句、不可借实体）：\n{approved_block}",
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

/// 章级对白比硬 gate 线。与评测 B 锚 45.8%−10pp 对齐。只在章级触发，不逐拍定额。
pub const CHAPTER_DLG_MIN_PCT: f64 = 35.8;
/// 长叙述拍：正文汉字多于该值。
pub const DLG_REWRITE_LONG_HANZI: usize = 1500;
/// 优先改写：对白比低于该值。
pub const DLG_REWRITE_LOW_PCT: f64 = 20.0;
pub const DLG_REWRITE_MAX_BEATS: usize = 3;
pub const DLG_REWRITE_MAX_ROUNDS: u32 = 2;

#[derive(Debug, Clone, PartialEq)]
pub struct DlgBeatStat {
    pub index: usize,
    pub kind: String,
    pub hanzi: usize,
    pub dlg_pct: f64,
}

/// 挑最多 3 个拍做对白改写。优先 hanzi>1500 且 dlg<20%，再补其他长拍，仍不足 3 个按对白比从低到高补短场面。省略场与已过 35.8% 的拍不挑。
pub fn pick_dialogue_rewrite_targets(stats: &[DlgBeatStat], max_n: usize) -> Vec<usize> {
    let max_n = max_n.clamp(1, DLG_REWRITE_MAX_BEATS);
    let scenes: Vec<&DlgBeatStat> = stats
        .iter()
        .filter(|s| s.kind != "ellipsis" && s.hanzi > 0 && s.dlg_pct < CHAPTER_DLG_MIN_PCT)
        .collect();
    let sort_low_dlg = |a: &&DlgBeatStat, b: &&DlgBeatStat| {
        a.dlg_pct
            .partial_cmp(&b.dlg_pct)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.hanzi.cmp(&a.hanzi))
            .then_with(|| a.index.cmp(&b.index))
    };
    let mut preferred: Vec<&DlgBeatStat> = scenes
        .iter()
        .copied()
        .filter(|s| s.hanzi > DLG_REWRITE_LONG_HANZI && s.dlg_pct < DLG_REWRITE_LOW_PCT)
        .collect();
    preferred.sort_by(sort_low_dlg);
    let mut out: Vec<usize> = Vec::new();
    for s in preferred {
        if out.len() >= max_n {
            break;
        }
        out.push(s.index);
    }
    if out.len() >= max_n {
        return out;
    }
    let mut long: Vec<&DlgBeatStat> = scenes
        .iter()
        .copied()
        .filter(|s| s.hanzi > DLG_REWRITE_LONG_HANZI && !out.contains(&s.index))
        .collect();
    long.sort_by(sort_low_dlg);
    for s in long {
        if out.len() >= max_n {
            break;
        }
        out.push(s.index);
    }
    if out.len() >= max_n {
        return out;
    }
    let mut rest: Vec<&DlgBeatStat> = scenes
        .iter()
        .copied()
        .filter(|s| !out.contains(&s.index))
        .collect();
    rest.sort_by(sort_low_dlg);
    for s in rest {
        if out.len() >= max_n {
            break;
        }
        out.push(s.index);
    }
    out
}

/// 重写拍字数下限：正史源的 2/3。不要拿润色后的长叙述当下限——改成开口常会短。
pub fn dlg_rewrite_hanzi_floor(src_h: usize) -> usize {
    src_h.saturating_mul(2).saturating_div(3).max(1)
}

/// 弱改写：对白比仍低于 20% 且升幅不足 8pp。只用来触发同拍第二次 LLM，不是逐拍 35.8 硬闸。
pub fn dlg_rewrite_is_weak(before: f64, after: f64) -> bool {
    after < DLG_REWRITE_LOW_PCT && after < before + 8.0
}

/// 与 `~/notes/sdt-novel-score.py` `clean_export` 对齐。只供章级对白比自算，不改评分脚本。
pub fn clean_export_md(md: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for raw in md.lines() {
        let line = raw.trim_end();
        if line.starts_with("状态：") || line.starts_with("本场任务：") {
            continue;
        }
        if let Some(rest) = line.strip_prefix("地点：") {
            let loc = rest.trim();
            if !loc.is_empty() && loc != "（未标）" {
                lines.push(loc.to_string());
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("价值转折：") {
            let vs = rest.trim();
            if !vs.is_empty() && vs != "（无）" {
                lines.push(vs.to_string());
            }
            continue;
        }
        let mut stripped = false;
        for prefix in ["动作：", "对白：", "内心："] {
            if let Some(rest) = line.strip_prefix(prefix) {
                if !rest.is_empty() {
                    lines.push(rest.to_string());
                }
                stripped = true;
                break;
            }
        }
        if stripped {
            continue;
        }
        lines.push(line.to_string());
    }
    format!("{}\n", lines.join("\n").trim())
}

pub fn dialogue_rewrite_system_prompt() -> &'static str {
    "你是设定图的章级拼写器（对白改写）。\
本拍是长叙述拍。把叙述场面改成人物开口推进。\
禁止增加新人物、新地点、新器物、新事件、新知情。\
禁止删掉已给的对白原文：「」里的字必须原样出现。已给对白不得改写、不得删、不得换人说。\
可以把叙述里已经发生的动作、判断、知情改成在场人物用嘴说出来；说的内容必须能从已给正史句子推出来，不得发明新事实。\
禁止把同一句或同一段原样重复。禁止短句连打。不得靠复读凑对白比。\
禁止把旁白整段套进「」充对白。必须是在场人物轮流说话。\
篇幅可以短于当前叙述稿，正史句子与已给「」原文必须保留。\
禁止套话：「淡淡道」「嘴角微微」。\
不要分栏标题，不要 Markdown，不要说「正史」「格子」。不要输出 JSON。"
}

pub fn dialogue_rewrite_user_prompt(b: &SourceBeat, current: &str, min_hanzi: usize) -> String {
    let before = dialogue_ratio_pct(current);
    format!(
        "本场任务：{}\n地点：{}\n价值转折：{}\n种类：场面\n把下面这篇叙述场面改成人物开口推进。不增删事实，不动已给对白原文。「」内字必须原样出现。当前对白比 {before}%，本拍升到四成以上。汉字不少于 {min_hanzi}，篇幅可以短于当前叙述稿，不要为了凑字复读。禁止把旁白整段套进「」充对白。禁止套话「淡淡道」「嘴角微微」。\n\n正史句子（必须全部用上，对白原文不得改）：\n{}\n\n当前稿（叙述过多，请改成开口推进，保留已有「」原文）：\n{}",
        b.intent,
        b.place,
        b.value_shift,
        numbered_sentences(b),
        current.trim()
    )
}

/// 章内已过审正文摘录，供兜底扩写学织法。总长约 `limit` 字。
pub fn approved_excerpt(bodies: &[String], limit: usize) -> String {
    if bodies.is_empty() {
        return String::new();
    }
    let mut out = String::new();
    for (i, b) in bodies.iter().enumerate() {
        if out.chars().count() >= limit {
            break;
        }
        let clip: String = b.chars().take(360).collect();
        out.push_str(&format!("【已过审{}】\n{}\n\n", i + 1, clip));
    }
    out
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
        assert_eq!(dialogue_ratio_pct("朱瞻基：「何时可以不必拉纤？」"), 72.7);
        assert_eq!(dialogue_ratio_pct(""), 0.0);
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

    #[test]
    fn repeat_scan_allows_para_twice_rejects_thrice() {
        let p = "铅云压在篷上。雨不是洗尘的雨，是把漕河一线蒸熟的雨。朱瞻基负手看舷外闸关倒退。\n\n";
        let twice = format!("{p}{p}对白另起。");
        assert!(repeat_scan(&twice).ok(), "{:?}", repeat_scan(&twice));
        let thrice = format!("{p}{p}{p}对白另起。");
        let r = repeat_scan(&thrice);
        assert!(!r.ok(), "{r:?}");
        assert_eq!(r.para_over_2[0].1, 3);
    }

    #[test]
    fn repeat_scan_catches_consecutive_short() {
        let ok = "孝服雪白。吴定缘摸到发髻。不照不等于没有。";
        assert!(repeat_scan(ok).ok(), "{:?}", repeat_scan(ok));
        let bad = "孝服雪白。孝服雪白。孝服雪白。吴定缘摸到发髻。";
        let r = repeat_scan(bad);
        assert!(!r.ok(), "{r:?}");
        assert!(
            r.consec_short_ge_3.iter().any(|(s, c)| s.contains("孝服雪白") && *c == 3),
            "{r:?}"
        );
    }

    #[test]
    fn weave_beat_without_echo_is_clean() {
        let b = beat();
        let body = weave_beat(&b);
        assert!(repeat_scan(&body).ok(), "{:?}", repeat_scan(&body));
    }

    #[test]
    fn expand_prompt_forbids_echo_and_mentions_approved() {
        let b = beat();
        let sys = expand_system_prompt();
        assert!(sys.contains("兜底扩写"));
        assert!(sys.contains("禁止把同一句或同一段原样重复"));
        assert!(sys.contains("场面靠对白推进"));
        assert!(sys.contains("不要写成每拍定额"));
        assert!(sys.contains("淡淡道"));
        assert!(sys.contains("嘴角微微"));
        assert!(!sys.contains("新对白"));
        let user = expand_user_prompt(&b, 200, "【已过审1】\n雨打在油纸边。\n");
        assert!(user.contains("章内已过审"));
        assert!(user.contains("不可抄句"));
        assert!(user.contains("何时可以不必拉纤"));
        assert!(user.contains("场面靠对白推进"));
    }

    #[test]
    fn polish_prompt_asks_dialogue_not_quota() {
        let b = beat();
        let sys = polish_system_prompt();
        assert!(sys.contains("场面靠对白推进"));
        assert!(sys.contains("过场才用叙述"));
        assert!(sys.contains("不要写成每拍定额"));
        assert!(sys.contains("淡淡道"));
        assert!(sys.contains("嘴角微微"));
        assert!(!sys.contains("新对白"));
        let user = polish_user_prompt(&b, 200);
        assert!(user.contains("场面靠对白推进"));
        assert!(user.contains("何时可以不必拉纤"));
    }

    #[test]
    fn ban_scan_hits_stock_phrases() {
        let clean = "苏荆溪：「臣在舱外听雨。」唐赛儿点头。";
        assert!(ban_scan(clean).is_empty());
        assert!(!has_ban_violation(clean));
        let bad = "苏荆溪没有反驳，只是淡淡道：「臣在舱外听雨。」唐赛儿嘴角微微上扬。";
        let hits = ban_scan(bad);
        assert_eq!(hits, vec!["淡淡道".to_string(), "嘴角微微".to_string()]);
        assert!(has_ban_violation(bad));
        assert_eq!(ban_reject_reason(bad), "ban:淡淡道|嘴角微微");
    }

    #[test]
    fn approved_excerpt_clips() {
        let bodies = vec!["甲。".repeat(20), "乙。".repeat(20)];
        let s = approved_excerpt(&bodies, 80);
        assert!(s.contains("【已过审1】"));
        assert!(s.chars().count() < 500);
    }

    fn dlg_stat(index: usize, kind: &str, hanzi: usize, dlg_pct: f64) -> DlgBeatStat {
        DlgBeatStat {
            index,
            kind: kind.into(),
            hanzi,
            dlg_pct,
        }
    }

    #[test]
    fn dlg_pick_prefers_long_low_like_r5() {
        // r5：白莲线 10.9% / 民为贵 20.4% / 看水路图类 21.8%；短拍与已过线拍不挑。
        let stats = vec![
            dlg_stat(0, "ellipsis", 38, 0.0),
            dlg_stat(1, "ellipsis", 16, 0.0),
            dlg_stat(2, "ellipsis", 47, 0.0),
            dlg_stat(3, "ellipsis", 35, 0.0),
            dlg_stat(4, "scene", 2161, 20.4),
            dlg_stat(5, "scene", 1464, 15.2),
            dlg_stat(6, "scene", 1981, 21.8),
            dlg_stat(7, "scene", 3248, 10.9),
            dlg_stat(8, "scene", 1722, 30.3),
            dlg_stat(9, "scene", 1363, 23.0),
            dlg_stat(10, "scene", 956, 34.8),
            dlg_stat(11, "scene", 513, 53.6),
        ];
        let got = pick_dialogue_rewrite_targets(&stats, 3);
        assert_eq!(got, vec![7, 4, 6]);
        assert!(got.len() <= DLG_REWRITE_MAX_BEATS);
    }

    #[test]
    fn dlg_pick_caps_at_three_preferred() {
        let stats = vec![
            dlg_stat(0, "scene", 2000, 10.0),
            dlg_stat(1, "scene", 2100, 11.0),
            dlg_stat(2, "scene", 2200, 12.0),
            dlg_stat(3, "scene", 2300, 13.0),
        ];
        assert_eq!(pick_dialogue_rewrite_targets(&stats, 3), vec![0, 1, 2]);
    }

    #[test]
    fn dlg_pick_skips_over_line_and_ellipsis() {
        let stats = vec![
            dlg_stat(0, "ellipsis", 2000, 5.0),
            dlg_stat(1, "scene", 800, 53.6),
            dlg_stat(2, "scene", 900, 40.0),
        ];
        assert!(pick_dialogue_rewrite_targets(&stats, 3).is_empty());
    }

    #[test]
    fn dlg_pick_falls_to_short_when_no_long() {
        let stats = vec![
            dlg_stat(0, "scene", 800, 10.0),
            dlg_stat(1, "scene", 700, 5.0),
            dlg_stat(2, "scene", 900, 12.0),
        ];
        assert_eq!(pick_dialogue_rewrite_targets(&stats, 3), vec![1, 0, 2]);
    }

    #[test]
    fn dialogue_rewrite_prompt_converts_narrative_keeps_quotes_and_ban() {
        let b = beat();
        let sys = dialogue_rewrite_system_prompt();
        assert!(sys.contains("对白改写"));
        assert!(sys.contains("把叙述场面改成人物开口推进"));
        assert!(sys.contains("不得发明新事实"));
        assert!(sys.contains("已给对白不得改写"));
        assert!(sys.contains("不得靠复读凑对白比"));
        assert!(sys.contains("淡淡道"));
        assert!(sys.contains("嘴角微微"));
        assert!(sys.contains("禁止把旁白整段套进"));
        assert!(sys.contains("篇幅可以短于当前叙述稿"));
        let user = dialogue_rewrite_user_prompt(&b, "于谦把炭笔递给太子。舱里雨气很重。", 50);
        assert!(user.contains("把下面这篇叙述场面改成人物开口推进"));
        assert!(user.contains("不增删事实"));
        assert!(user.contains("不动已给对白原文"));
        assert!(user.contains("何时可以不必拉纤"));
        assert!(user.contains("当前稿"));
        assert!(user.contains("舱里雨气很重"));
        assert!(user.contains("淡淡道"));
        assert!(user.contains("当前对白比"));
        assert!(user.contains("篇幅可以短于当前叙述稿"));
        assert!(user.contains("禁止把旁白整段套进"));
    }

    #[test]
    fn dlg_pick_fills_to_three_with_short_scenes() {
        let stats = vec![
            dlg_stat(0, "ellipsis", 40, 0.0),
            dlg_stat(1, "scene", 2000, 14.7),
            dlg_stat(2, "scene", 1487, 22.9),
            dlg_stat(3, "scene", 1478, 21.4),
            dlg_stat(4, "scene", 513, 53.6),
        ];
        assert_eq!(pick_dialogue_rewrite_targets(&stats, 3), vec![1, 3, 2]);
    }

    #[test]
    fn dlg_rewrite_floor_uses_source_not_polished_body() {
        assert_eq!(dlg_rewrite_hanzi_floor(554), 369);
        assert!(540 >= dlg_rewrite_hanzi_floor(554));
        assert!(678 >= dlg_rewrite_hanzi_floor(554));
        assert!(540 < 554.max(1522 * 2 / 3), "r6a 旧 floor 会误拒 540");
    }

    #[test]
    fn dlg_rewrite_weak_retries_r6b_lowest_not_quota() {
        // r6b 最低拍 13.5→14.9 仍是长叙述，应再要一稿；16.1→47.6 已过线，不因逐拍定额重来。
        assert!(dlg_rewrite_is_weak(13.5, 14.9));
        assert!(!dlg_rewrite_is_weak(13.5, 22.0));
        assert!(!dlg_rewrite_is_weak(16.1, 47.6));
        assert!(!dlg_rewrite_is_weak(29.1, 33.1));
        assert!(!dlg_rewrite_is_weak(17.1, 43.3));
    }

    #[test]
    fn dlg_pick_round2_keeps_weak_rewritten_beat() {
        // r6b round2 若跳过已改写拍，14.9% 那拍不再入选，全章停在 31.8%。
        let stats = vec![
            dlg_stat(0, "ellipsis", 38, 0.0),
            dlg_stat(4, "scene", 1271, 47.6),
            dlg_stat(5, "scene", 1513, 14.9),
            dlg_stat(6, "scene", 1538, 29.1),
            dlg_stat(7, "scene", 1239, 43.3),
            dlg_stat(8, "scene", 1560, 33.4),
            dlg_stat(9, "scene", 941, 33.3),
            dlg_stat(10, "scene", 927, 35.9),
            dlg_stat(11, "scene", 930, 27.8),
        ];
        let got = pick_dialogue_rewrite_targets(&stats, 3);
        assert_eq!(got[0], 5, "{got:?}");
        assert!(got.contains(&5));
        assert!(!got.contains(&4));
        assert!(!got.contains(&7));
        assert!(!got.contains(&10));
    }

    #[test]
    fn clean_export_md_strips_markers_keeps_place_and_shift() {
        let b = beat();
        let md = export_composed("两京对标", "人与消息", "济南水程", &[(b.clone(), weave_beat(&b))]);
        let clean = clean_export_md(&md);
        assert!(!clean.contains("状态："));
        assert!(!clean.contains("本场任务："));
        assert!(!clean.contains("地点："));
        assert!(!clean.contains("价值转折："));
        assert!(clean.contains("漕河船舱"));
        assert!(clean.contains("嫌慢 → 看懂河脊"));
        assert!(clean.contains("何时可以不必拉纤"));
        let dlg = dialogue_ratio_pct(&clean);
        assert!(dlg > 0.0, "{dlg}");
        assert_eq!(CHAPTER_DLG_MIN_PCT, 35.8);
    }

    #[test]
    fn dlg_rewrite_fact_gate_ignores_added_quotes() {
        let b = beat();
        let src = source_blob(&b);
        let r = fact_check(
            &src,
            "于谦把炭笔递给太子。朱瞻基：「何时可以不必拉纤？」于谦：「殿下勿急。」朱瞻基：「雨还在下。」",
            &[],
        );
        assert!(r.polish_pass(), "{r:?}");
        assert!(!r.added_quotes.is_empty());
        assert!(r.missing_quotes.is_empty());
        assert!(r.added_entities.is_empty());
    }
}
