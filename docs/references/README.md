# 对照资料（不是本产品的真源）

这里是从铜炉仓拷出来的快照，用来对照「不要再做成什么样」。**改设定图，不要改这些文件。** 铜炉原件仍在 `<scribe3-repo>`。

| 文件 | 讨论里拿它说明什么 |
|------|-------------------|
| `tonglu/AGENTIC_BOUNDARY_DECISION.md` | 铜炉决策乙：作者不能在设定表上改，只能跟主编聊再批。设定图**不抄这条**。格子就是作品，人要直接改。 |
| `tonglu/TimelineView.jsx` | 铜炉已有 vis-timeline 泳道，但是只读 +「让主编写」。借控件经验，禁止 import。 |
| `tonglu/ontology.py` | 持续体 / 发生体 / 命题 / 知情边。思想近亲，绑在章号和限知渲染上。 |
| `tonglu/01-本体与数据模型.md` | 铜炉设定模型全文。派生体裂表、三套关系，是新项目要避开的债。 |
| `tonglu/2026-08-24-surface-ownership.md` | 铜炉把世界拆成总纲/图谱/时间线等多个只读面。新项目不要再拆三个可写面。 |
| `tonglu/门槛2-设定圣经.md` | 铜炉「设定圣经当后台真理源、人只提意见」。产品方向相反。 |
| `tonglu/2026-06-21-设定库重构文档-codex-2.0.md` | 铜炉 Codex 分类夹路线。 |
| `铜炉-Surreal与工程教训.md` | **机制摘录**（事务、逐条校验、中文全文、MERGE、同 id 删建）。吸收进 §8.13，**不**抄源码、不连铜炉库。产品仍禁止设定圣经/主编/五表。 |

开源对照：

- NarrativeNode — **借怎么点、怎么看，不借他们怎么算出每一刻。源码禁止进产品。** 全文 [`narrative-node.md`](./narrative-node.md)。
- [narra](https://github.com/florinutz/narra) — **唯一世界库（fork `vendor/narra` 后改）**。落地 [`../plans/2026-08-30-设定图-Narra底座.md`](../plans/2026-08-30-设定图-Narra底座.md)。对照 [`narra.md`](./narra.md)。
- [Obsidian StoryLine](https://github.com/spv2008/obsidian-storyline) — 借纵轴切换的看法，不把 Obsidian 当真源
- [vis-timeline](https://github.com/visjs/vis-timeline) — 铜炉用过的泳道控件；设定图 v1 **不绑**，不当数据模型
