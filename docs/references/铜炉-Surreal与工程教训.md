# 铜炉 Surreal 与工程教训（机制摘录）

设定图**不** `import scribe3`、不连铜炉库、不复用 `SCRIBE3_*` / `s3_*`。本文只列机制与路径，供 fork Narra 时对照。产品面仍认 [`../设定图-v1.md`](../设定图-v1.md)。落地认 [`../plans/2026-08-30-设定图-Narra底座.md`](../plans/2026-08-30-设定图-Narra底座.md) 与完整方案 §8.13。

铜炉根：`<scribe3-repo>`。官方文档副本：同仓 `docs/external/surrealdb-docs/`。

---

## 该吸收的机制（不要抄源码）

| 机制 | 路径 | 设定图怎么用 |
|---|---|---|
| 多语句必须逐条校验；Python SDK `query()` 只看第一条，后面 ERR 被吞 | `scribe3/store/connection.py` `_query_all_checked` / `_context_tx`；`scribe3/tests/test_store.py` | Narra / HTTP 薄包：多语句看全部 statement；禁止只 `take(0)` |
| 事务拼成**一条** `BEGIN TRANSACTION; …; COMMIT`（SDK 不跨多次 `query()` 维持事务） | `connection.py` `transaction()` / `_commit_transaction`；`docs/改进方案/G-可靠性与代码质量.md` | 写入正史 / 确认变更走 F60 / F61 |
| 官方：每条语句默认自己一笔事务；要一起成败必须手动事务；提交时写–写冲突须重试 | `docs/external/surrealdb-docs/pages/transactions-and-isolation.md`；`…/language-primitives/transactions.md` | `commit_seq = max+1` 撞冲突则整笔重试，不要静默后写覆盖 |
| 3.x 全文是 `FULLTEXT ANALYZER`，不是旧 `SEARCH ANALYZER` | `scribe3/tests/test_migrations_surreal3.py`；官方 `…/define/indexes.md` | Narra `004_phase4_search.surql` 现为 `SEARCH`，开工改 |
| 中文 BM25：先切 token 写入 `tokens`，分析器走 blank；jieba 单字漏「铜炉」要补 CJK bigram | `scribe3/text_tokens.py`；`migrations/119_hybrid_search_config.surql` | **只**给左栏搜全书（F63）。禁止用 BM25 排规定情境 / 未收伏笔 |
| 边必须 `TYPE RELATION` + SCHEMAFULL，禁止隐式 SCHEMALESS 边表 | `migrations/166_material_relates.surql`；`001_ontology.surql` `knows` | 在场 / 知情 / 所属走 RELATE（F62） |
| 图边要索引，否则按人删边 / 时间门全表扫 | `docs/系统架构/03-问题诊断与整改方案.md` P05；`docs/plans/2026-08-27-setting-scale.md` `idx_knows_in`；Narra `008` 已有 `participates_in.in` | 补 `clock_from/to`、`commit_seq`、`knows` 出边与 `scene_id` |
| 按 name 幂等：先查出真实 id 再 MERGE；禁止 `UPSERT type::record(表, $name)`（老行 id≠name 会新建撞 UNIQUE） | `store/facts_knowledge.py` `add_faction` | 档案改名不换 record id；UNIQUE 在 `name` |
| DELETE+CREATE 整行覆盖会清未传字段 / 私密 / 状态史 | `facts_knowledge.py` 注释；`设计文档/2026-07-03-全系统架构与业务闭环审计.md` P1-9；`tests/test_codex_faction.py` | 档案 PATCH；正史作废用 `superseded`，不删同 id 再建 |
| 更正链：新 id CREATE + RELATE + 旧行改状态，单事务；不复用旧 id | `facts_knowledge.py` `supersede_memory` | 删已正史 = 该场 `superseded` + 新补洞场新 id（F50 / F61） |
| 查询失败不准假装「0 引用可删」 | `connection.py` `_safe_count` | 影响清单查询失败 → 挡住确认变更，不许当「无影响」 |
| SCHEMAFULL 嵌套 object 校验导致合同/节拍改存 JSON 串，库内查不了 | `migrations/117_beats_meta.surql` 等头注释；`docs/evidence/system-audit-20260813/audit-surreal.md` F-S06 | 在场 / 知情 / 钟 / 伏笔状态必须是可查询字段或边，不当 `option<string>` JSON 袋 |
| 故事时自建 int，不要用插入墙钟冒充 | `migrations/001_ontology.surql` `valid_from` TYPE int；`ontology.py` | 故事时间 = `clock_from/to`；第几次 = `commit_seq`；`created_at` / `learned_at` 不当「哪一场学会」 |
| 一书一库文件，正典不与账号表混 | `docs/CURRENT_ARCHITECTURE.md`；`docs/evidence/.../audit-surreal.md` F-S01 | 设定图：一书一 Narra 文件（F51）。不吸收铜炉 `_reg` / 登录 |
| 参与者必须当时写成边；事后抽正文经常不带 effects，知情图是空的 | `store/events.py` `add_event`；审计 F-S03 | 点「写入正史」当场 RELATE 在场 / 知情，禁止等「抽整章」 |
| 建了 RELATE 却只 `SELECT FROM 边表`、组装写作上下文不用图 | 审计 F-S04；早期 `06-SurrealDB使用深度诊断.md` | 边是真源；算出这一刻仍走 `world_at`，禁止另写前端 JOIN 当这一刻 |
| 并发：先读 rev 再写无 CAS → 后写覆盖 | `docs/plans/2026-08-23-tonglu-round2-spec.md` `save_chapter`；`tonglu-optimization-spec.md` PRM-02 | 写入正史用事务内 `commit_seq` + 写–写冲突重试 |
| 嵌入式默认 + 逐书 export 备份 | Narra `src/db/connection.rs` `DbConfig::Embedded`；铜炉 `scribe3/DEPLOY.md` `surreal_backup.sh` | 单用户本机；备份按书文件拷贝 / export，不连铜炉进程 |
| 失败让人看见哪一步（假 0 / 静默半迁移会写成错戏） | `_safe_count`；`apply_schema` 失败不标 `_migration` | 写入正史失败：界面写清挡在穿帮检查 / 分配第几次 / 写边 / 提交 |

---

## 明确不吸收

| 不吸收 | 路径（反例） |
|---|---|
| 主编流水线、丢整章 ingest 当正史、一改即历史 | AGENTS；完整方案 F32 |
| 设定圣经只读 + 对话改设定、五表死表 | `docs/references/tonglu/门槛2-设定圣经.md`；`01-本体与数据模型.md` |
| Graphiti / 过程记忆 `memory_item` 冒充正典 | 审计 F-S08；AGENTS 硬边界 |
| LIVE / CHANGEFEED / `DEFINE EVENT` 自动改正典 | `docs/ops/surreal-deep-use-runbook.md`；审计 F-S07（CDC 只打缓存都已偏） |
| 命题 hybrid / HNSW 当「此刻为真」或排未收伏笔 | 审计 F-S05 / F-S09 |
| `work_id` 在同一 Surreal 里横切多书 | 铜炉 `_reg` + 书库；设定图改为一书一文件 |
| `SCRIBE3_*` / `s3_*` / 连铜炉正在跑的实例 | AGENTS |

---

## 官方能力核对（副本，不要凭记忆）

| 能力 | 官方页（铜炉副本） | 对本仓 |
|---|---|---|
| 事务原子 + 快照隔离 + 同键后提交失败 | `pages/transactions-and-isolation.md` | 写入正史 / 确认变更必须手动事务 |
| Python 会话事务要 WebSocket；HTTP / 嵌入式用 SurQL `BEGIN` | `pages/reference/python/concepts/transactions.md` | Narra 嵌入式走 SurQL 事务块 |
| 3.0+ `FULLTEXT ANALYZER`；旧名 `SEARCH ANALYZER` | `pages/reference/query-language/statements/define/indexes.md` | 改 Narra 004 |
| RELATE 图边 | 查询语言 RELATE（副本同目录） | 在场 / 知情 / 所属 |
| 单语句默认一笔事务 | `pages/reference/query-language/language-primitives/transactions.md` | 多步写必须包起来 |

Narra 现状（本仓 `vendor/narra`）：有 SCHEMAFULL、record link、RELATE、部分索引、嵌入式、旧 `SEARCH` 英文 snowball；**无** `BEGIN/COMMIT`、无故事钟索引、知情 `fact` 仍是字符串、无 `commit_seq`。对照完整方案 §8.13。
