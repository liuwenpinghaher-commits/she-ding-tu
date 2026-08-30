# Narra 对照

对照对象：本仓 `vendor/narra/`（MIT，fork 后当设定图唯一世界库）。  
产品面仍认 [`../设定图-v1.md`](../设定图-v1.md)。落地认 [`../plans/2026-08-30-设定图-Narra底座.md`](../plans/2026-08-30-设定图-Narra底座.md)。

官方是 CLI + MCP + 嵌入式 Surreal，没有分场条。本机对照页 `demos/narra-preview/` 不是设定图。

## 留下当库（要改）

| 官方 | 设定图怎么用 |
|---|---|
| `CertaintyLevel` / `LearningMethod` | 知情枚举，已写入 v1 |
| `KnowledgeState` 只追加；`source_character` / `premises` / `truth_value` | v1 要补上这些栏 |
| `EnforcementLevel` + `world validate` | 闸级；再加同人同列两地等规则 |
| `analyze asymmetries` | 侧栏知情差**列表**，不用 `dramatic_weight` |
| `character` / `location` / `scene`+`event` / `universe_fact` | 映射见底座文 |
| `protect` | 已出场不能从设定里删 |

## 必须加进 fork

三时钟、`commit_seq`、草稿、省略场、动作对白内心、情状开窗、伏笔、默认知情、规定情境、道具/组织。算法合同在 [`../世界引擎.md`](../世界引擎.md)。

## 引擎可留、产品不接

embedding 当弧、arc_snapshot、phase、annotation 情绪/主题分、`tension_level`、MCP **mutate** 当写入正史。只读查询可用 CLI `--json`。

## 禁止

- 官方 Narra 与设定图各开一份库并排写
- MCP 绕过「写入正史」直接 mutate
- 另写 Python `fold` 当第二真源
