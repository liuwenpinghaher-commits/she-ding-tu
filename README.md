# 设定图

单独写设定的系统。打开是一张分场条：一行一场戏，按故事时排。顶上一根时间标尺，点列看「这一刻」。实体泳道不是默认主面。

分场条代码在 `apps/stripboard/`。点「模型填下一场」会真调模型（要配 `.env` 里的 `SETTING_LLM_*`）；没密钥会明确失败，不会假装通过。建设清单不要按全绿理解，以 [`docs/plans/2026-08-31-审计核实与改造方案.md`](docs/plans/2026-08-31-审计核实与改造方案.md) 为准。

产品面真源：[`docs/设定图-v1.md`](docs/设定图-v1.md)。世界引擎做什么：[`docs/世界引擎.md`](docs/世界引擎.md)。讨论过程：[`docs/plans/2026-08-29-world-graph-setting.md`](docs/plans/2026-08-29-world-graph-setting.md)。

本仓和铜炉（写作 3.0）是两个项目。不要在铜炉仓里继续谈设定图。不要 `import scribe3`。
