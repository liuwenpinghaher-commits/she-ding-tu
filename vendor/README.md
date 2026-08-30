# vendor/ · 对照仓（不当本产品代码）

本目录是 Git 浅克隆，给分析用。禁止 `import` 进设定图。`narra/` 源码入库（不含 `target/` 与嵌套 `.git`）；其余对照仓仍被根目录 `.gitignore` 忽略。

## 第 1 组 · 你点名要合的三件（2026-08-29 克隆）

| 目录 | 上游 | 规划里借什么 |
|------|------|----------------|
| `NarrativeNode/` | https://github.com/netzkontrast/NarrativeNode | fold：戏上记变更，往后算状态 |
| `narra/` | https://github.com/florinutz/narra | 知情账、规矩闸 |
| `obsidian-storyline/` | https://github.com/spv2008/obsidian-storyline | 横时间、竖可换道 |

## 第 2 组 · 规划里写了 GitHub 的对照（2026-08-29 克隆）

| 目录 | 上游 | 规划里借什么 |
|------|------|----------------|
| `yggsii/` | https://github.com/monty-builds/yggsii | 揭示账 + 同场；体检不是写作面 |
| `novalist/` | https://github.com/Drommedhar/novalist-official | 情节网格 + 年代时间线 |
| `vis-timeline/` | https://github.com/visjs/vis-timeline | v1 泳道控件 |

Fonte 没有 GitHub，只有网站：https://www.ricolandia.com/en/free-screenplay-editor/

## 第 3 组 · Agent 记忆层（2026-08-29 克隆）

| 目录 | 上游 | 分析结论（详见讨论） |
|------|------|----------------------|
| `EverOS/` | https://github.com/EverMind-AI/EverOS | Markdown 日日志 + 抽事实；没有人—人边 |
| `HyperMem/` | https://github.com/EverMind-AI/HyperMem | 话题→对话片段→事实句；检索用 |
| `graphiti/` | https://github.com/getzep/graphiti | 能存带有效期的关系；主路是 `add_episode` 抽取 |
| `semantica/` | https://github.com/semantica-agi/semantica | 双时态关系 dict；企业 KG |
| `TiMem/` | https://github.com/TiMEM-AI/timem | 对话向上巩固成画像；历史被摘要掉 |
