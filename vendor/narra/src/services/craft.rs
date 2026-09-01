//! 书级章法：主脑、章界、回目。挂在书上，不进算出这一刻，不指挥每一场。

use crate::services::world::Column;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

fn default_true() -> bool {
    true
}

fn default_tick() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct BookCraft {
    /// 一句前提。空则导出不写主脑。
    #[serde(default)]
    pub premise: String,
    #[serde(default)]
    pub chapters: Vec<CraftChapter>,
    /// 故事时间零点怎么写给人看，例如「第一天 20:00」。
    #[serde(default)]
    pub clock_origin_label: String,
    /// t=0 对应一天里的哪一分钟（20:00 = 1200）。
    #[serde(default)]
    pub clock_origin_minute: i64,
    /// 一格多少分钟。只影响显示，不算进算出这一刻。
    #[serde(default = "default_tick")]
    pub minutes_per_tick: i64,
    /// day_clock / label / minutes
    #[serde(default)]
    pub clock_format: String,
    #[serde(default = "default_true")]
    pub export_include_draft: bool,
    #[serde(default)]
    pub export_order: String,
    #[serde(default)]
    pub export_extras: String,
}

impl BookCraft {
    /// 把分钟整数显示成人话。不算进算出这一刻。
    pub fn format_clock(&self, t: i64) -> String {
        let fmt = if self.clock_format.trim().is_empty() {
            "day_clock"
        } else {
            self.clock_format.trim()
        };
        match fmt {
            "minutes" => t.to_string(),
            "label" => {
                let lab = self.clock_origin_label.trim();
                if lab.is_empty() {
                    t.to_string()
                } else if t == 0 {
                    lab.to_string()
                } else {
                    format!("{lab} +{t}分")
                }
            }
            _ => {
                let start = if self.clock_origin_minute > 0 {
                    self.clock_origin_minute
                } else {
                    parse_hm_offset(&self.clock_origin_label)
                };
                let abs = start + t;
                let day = if abs >= 0 {
                    abs / 1440 + 1
                } else {
                    abs.div_euclid(1440) + 1
                };
                let of = abs.rem_euclid(1440);
                format!("第{day}天 {:02}:{:02}", of / 60, of % 60)
            }
        }
    }

    pub fn format_span(&self, from: i64, to: i64) -> String {
        format!("{}–{}", self.format_clock(from), self.format_clock(to))
    }
}

pub fn parse_hm_offset(label: &str) -> i64 {
    let bytes = label.as_bytes();
    let mut i = 0;
    while i + 4 < bytes.len() {
        if bytes[i].is_ascii_digit()
            && bytes[i + 1].is_ascii_digit()
            && bytes[i + 2] == b':'
            && bytes[i + 3].is_ascii_digit()
            && bytes[i + 4].is_ascii_digit()
        {
            let h = std::str::from_utf8(&bytes[i..i + 2])
                .ok()
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            let m = std::str::from_utf8(&bytes[i + 3..i + 5])
                .ok()
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            return h * 60 + m;
        }
        i += 1;
    }
    0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct CraftChapter {
    #[serde(default)]
    pub id: String,
    /// 回目。
    #[serde(default)]
    pub title: String,
    /// 章界：从这一列起，直到下一章。
    #[serde(default, alias = "from_col")]
    pub start_column: String,
}

#[derive(Debug, Clone)]
pub struct ExportBeat {
    pub column_id: String,
    pub clock: i64,
    pub telling: i64,
    pub seq: i64,
    pub block: String,
}

pub fn sorted_chapters<'a>(
    craft: &'a BookCraft,
    columns: &[Column],
) -> Vec<(i64, &'a CraftChapter)> {
    let mut out: Vec<(i64, &CraftChapter)> = craft
        .chapters
        .iter()
        .filter(|ch| !ch.start_column.is_empty())
        .filter_map(|ch| {
            columns
                .iter()
                .find(|c| c.id == ch.start_column)
                .map(|c| (c.display_ord, ch))
        })
        .collect();
    out.sort_by_key(|(ord, _)| *ord);
    out
}

pub fn chapter_for_column<'a>(
    craft: &'a BookCraft,
    columns: &[Column],
    column_id: &str,
) -> Option<&'a CraftChapter> {
    let ord = columns.iter().find(|c| c.id == column_id)?.display_ord;
    sorted_chapters(craft, columns)
        .into_iter()
        .rev()
        .find(|(o, _)| *o <= ord)
        .map(|(_, ch)| ch)
}

/// 导出 Markdown。有章则按章分段；无章则一场接一场。不含节拍指令。
pub fn export_markdown(
    book: &str,
    craft: &BookCraft,
    columns: &[Column],
    mut beats: Vec<ExportBeat>,
    reading_order: bool,
) -> String {
    if reading_order {
        beats.sort_by_key(|r| (r.telling, r.clock, r.seq));
    } else {
        beats.sort_by_key(|r| (r.clock, r.seq));
    }
    let mut md = format!("# {book}\n\n");
    let premise = craft.premise.trim();
    if !premise.is_empty() {
        md.push_str("> 主脑：");
        md.push_str(premise);
        md.push_str("\n\n");
    }
    let chs = sorted_chapters(craft, columns);
    let mut last_ch: Option<String> = None;
    let mut ch_n: usize = 0;
    for b in &beats {
        let ch = chapter_for_column(craft, columns, &b.column_id);
        let ch_id = ch.map(|c| c.id.clone()).unwrap_or_default();
        if !chs.is_empty() && last_ch.as_deref() != Some(ch_id.as_str()) {
            last_ch = Some(ch_id);
            ch_n += 1;
            let title = ch
                .map(|c| {
                    let t = c.title.trim();
                    if t.is_empty() {
                        "未名回"
                    } else {
                        t
                    }
                })
                .unwrap_or("未分章");
            md.push_str(&format!("# 第{ch_n}回 {title}\n\n"));
        }
        md.push_str(&b.block);
    }
    md
}

pub fn contains_beat_advice(text: &str) -> bool {
    text.contains("你现在应该写中点")
        || text.contains("Save the Cat")
        || text.contains("英雄之旅")
        || text.contains("十五拍")
}

pub fn forbids_beat_advice(text: &str) -> bool {
    !contains_beat_advice(text)
}

/// 去空回、补 id；同一列只留最后一回。不写 Narra，不算进算出这一刻。
pub fn normalize(mut craft: BookCraft) -> BookCraft {
    craft.premise = craft.premise.trim().to_string();
    let mut seen: HashSet<String> = HashSet::new();
    let mut chapters: Vec<CraftChapter> = Vec::new();
    for (i, mut ch) in craft.chapters.into_iter().enumerate() {
        ch.title = ch.title.trim().to_string();
        ch.start_column = ch.start_column.trim().to_string();
        if ch.title.is_empty() && ch.start_column.is_empty() {
            continue;
        }
        if ch.id.trim().is_empty() {
            ch.id = format!("ch{}", i + 1);
        }
        if !ch.start_column.is_empty() && !seen.insert(ch.start_column.clone()) {
            if let Some(pos) = chapters
                .iter()
                .position(|x| x.start_column == ch.start_column)
            {
                chapters[pos] = ch;
                continue;
            }
        }
        chapters.push(ch);
    }
    craft.chapters = chapters;
    craft
}

#[cfg(test)]
mod tests {
    use super::*;

    fn col(id: &str, ord: i64) -> Column {
        Column {
            id: id.into(),
            clock_from: ord * 60,
            clock_to: ord * 60 + 60,
            display_ord: ord,
        }
    }

    fn beat(col: &str, seq: i64, intent: &str) -> ExportBeat {
        ExportBeat {
            column_id: col.into(),
            clock: (seq - 1) * 60,
            telling: seq,
            seq,
            block: format!("## 场 · {intent}\n状态：正史\n\n"),
        }
    }

    #[test]
    fn export_groups_by_chapter_and_writes_premise() {
        let craft = BookCraft {
            premise: "铜牌三日，刀在抽屉。".into(),
            chapters: vec![
                CraftChapter {
                    id: "ch1".into(),
                    title: "发现".into(),
                    start_column: "col0".into(),
                },
                CraftChapter {
                    id: "ch2".into(),
                    title: "来找".into(),
                    start_column: "col1".into(),
                },
            ],
            ..Default::default()
        };
        let columns = vec![col("col0", 0), col("col1", 1)];
        let md = export_markdown(
            "渡口",
            &craft,
            &columns,
            vec![
                beat("col0", 1, "阿福发现刀"),
                beat("col1", 2, "阿莲来找东西"),
            ],
            false,
        );
        assert!(md.starts_with("# 渡口\n"));
        assert!(md.contains("> 主脑：铜牌三日，刀在抽屉。"));
        assert!(md.contains("# 第1回 发现"));
        assert!(md.contains("# 第2回 来找"));
        assert!(md.find("# 第1回").unwrap() < md.find("阿福发现刀").unwrap());
        assert!(md.find("阿福发现刀").unwrap() < md.find("# 第2回").unwrap());
        assert!(!contains_beat_advice(&md));
    }

    #[test]
    fn format_clock_day_from_label() {
        let craft = BookCraft {
            clock_origin_label: "第一天 20:00".into(),
            ..Default::default()
        };
        assert_eq!(craft.format_clock(0), "第1天 20:00");
        assert_eq!(craft.format_clock(50), "第1天 20:50");
        assert_eq!(craft.format_clock(240), "第2天 00:00");
    }

    #[test]
    fn no_chapters_is_flat_export() {
        let craft = BookCraft {
            premise: String::new(),
            chapters: vec![],
            ..Default::default()
        };
        let md = export_markdown(
            "渡口",
            &craft,
            &[col("col0", 0)],
            vec![beat("col0", 1, "阿福发现刀")],
            false,
        );
        assert!(!md.contains("主脑"));
        assert!(!md.contains("# 第1回"));
        assert!(md.contains("## 场 · 阿福发现刀"));
    }

    #[test]
    fn from_col_alias_and_normalize_dedupes() {
        let raw: BookCraft = serde_json::from_str(
            r#"{"premise":" 一句 ","chapters":[
                {"title":"甲","from_col":"col0"},
                {"id":"keep","title":"乙","start_column":"col0"},
                {"title":"","start_column":""}
            ]}"#,
        )
        .unwrap();
        let n = normalize(raw);
        assert_eq!(n.premise, "一句");
        assert_eq!(n.chapters.len(), 1);
        assert_eq!(n.chapters[0].title, "乙");
        assert_eq!(n.chapters[0].start_column, "col0");
        assert_eq!(n.chapters[0].id, "keep");
    }

    #[test]
    fn beat_advice_strings() {
        assert!(contains_beat_advice("你现在应该写中点"));
        assert!(forbids_beat_advice("阿莲翻柜面"));
    }
}
