# 给阿里云 Grok 的交接（可整份粘贴）

下面从「你是谁」起到文末，复制给阿里云上的 Grok 即可。对人说话用 [`设定图-v1.md`](./设定图-v1.md)「用语」右列。

---

你在阿里云开发机上接着做「设定图」。这是单独写小说设定的产品，打开是分场条：一行一场戏，按故事时排。**不是铜炉（写作 3.0 / scribe3）。** 禁止 `import scribe3`，禁止读铜炉 Surreal，禁止复用 `SCRIBE3_*` / `s3_*`，禁止在铜炉仓里改设定图。

## 先读这些（按这个顺序）

1. 仓根 `AGENTS.md`
2. `docs/SESSION.md`
3. `docs/设定图-v1.md`（产品九条、用语）
4. `docs/plans/2026-09-01-设定图-前端完整方案.md`（前端合同现行稿；第 12 节是已落地 / 未落地对照）

世界库与算出这一刻仍认：`docs/plans/2026-08-30-设定图-Narra底座.md`、`docs/世界引擎.md`。两份较早的 9/1 稿（`前端架构-正史与逻辑线`、`界面与交互彻底重构`）是过程稿，不再当现行合同。

## 产品红线（不要改口）

- 产品入口只有 `apps/web`（Vite + React + TypeScript）。`archive/stripboard/` 是废入口，禁止救活，禁止再当备用路由写正史。
- Narra（`vendor/narra`）是唯一世界库。改正史只在分场条那一行和场页。点了「写入正史」才变成后面能用的历史；必须人点。
- 逻辑线不算进算出这一刻。看法（时间轴 / 总表 / 出场 / 白板等）不改正史。分场条关不掉。
- 本场任务必填才准写下一场。结构改动点「确认变更」才写 Narra。
- 算出这一刻必须是纯函数。禁止为了 e2e 绿灯改松它。e2e 打新前端，`workers: 1`（见 `e2e/playwright.config.ts`）。

## GitHub（Mac 已推成功）

- 仓库：https://github.com/liuwenpinghaher-commits/she-ding-tu
- 分支：`main`
- 前端+三份方案：`7c454312b9c88102eba74a72ecc74276d67a0881`
- 交接文档 + SESSION 部署句：`0d1475f`（本文件进仓的那次；push 后以 `origin/main` 为准）
- 必须已在远程的方案：`docs/plans/2026-09-01-设定图-前端完整方案.md`、`docs/plans/2026-09-01-设定图-前端架构-正史与逻辑线.md`、`docs/plans/2026-09-01-设定图-界面与交互彻底重构.md`、`docs/SESSION.md`、本文件。
- 你在阿里云：`git clone` / `git pull` 这个 GitHub 仓干活。不要在铜炉仓里改。改完 commit + `git push origin HEAD`。不要 `--force`，不要 skip hooks，不要提交 `.env`、`data/books/`、`vendor/narra/target/`、`node_modules`。

## 腾讯部署（验收机，不是你这台阿里云）

- SSH 主机：`<deploy-host>`（`<deploy-user>@<deploy-host>`）。本机 `~/.ssh/config` 绑网卡 `en0`。
- 仓路径：`<repo-root>`。**不是** `/opt/scribe3`，**不是** `<legacy-repo-root>`。
- 服务：入口 `127.0.0.1:8787`（nginx），后面是 `setting-api` `127.0.0.1:8788`。未挂公网。打开页面：本机或阿里云 `ssh -L 8787:127.0.0.1:8787 <deploy-host>`，再访 `http://127.0.0.1:8787`。应看到 Vite `#root` + `/assets/*`，书架能打开《渡口》（五场已正史 + 一场草稿），卡上有最后一场名。
- 重启：`<repo-root>/logs/restart.sh`（只在机上）。
- 构建：`apps/web` 里 `npm ci && npm run build`，再在 `vendor/narra` 编 `setting-api`（crates 走中科大镜像即可，不要让腾讯直连 GitHub）。
- **腾讯不要直连 GitHub**（慢/不稳）。代码更新由 Mac 跳板：Mac 先 `git push` 到 GitHub，再 `rsync` 或 `git bundle` 经 SSH 送到腾讯；不要在腾讯 `git pull github.com`。不要动腾讯上已有的 `127.0.0.1:1088`（去阿里云的跳板）和 `127.0.0.1:18080`。
- `.env` 只在各机上，不进 git。数据按书隔离在 `data/books/<书名>/`。不要覆盖/删《渡口》正史。

## 你怎么干活

1. 在阿里云 clone/pull `https://github.com/liuwenpinghaher-commits/she-ding-tu`，工作目录不要放进铜炉仓。
2. 本地起：仓根有 `.env`（密钥不提交）；`apps/web` 构建；`cargo run --release --bin setting-api`（在 `vendor/narra`，默认 `127.0.0.1:8787`）。或 `SETTING_WEB_DEV=1` 时 API 会转到 Vite 开发服务。
3. 改完 commit + push。需要看部署效果：SSH 腾讯机或本机 `8787`。
4. 对人说话用 v1 用语右列：分场条、写入正史、算出这一刻、本场任务、确认变更。不要用左列内部词当结论。

## 已落地（新壳能点到；脚手架不算交付）

对照完整方案第 12.1 节，不要把空页写成已交付：

- 打开 8787 只出 Vite 新壳（`#root` + `/assets/*`）。旧单文件在 `archive/stripboard/`，产品路径已死。
- 书架 / 新建书 / 打开书；空书进分场条本页 1 列。
- 写下一场 → 写入此框 → 写入正史（本场任务必填；必须人点）。
- 本页 1–6：疏/中/密 = 2/4/6；−＋到边界灰。
- 左栏拖在场。逻辑线：场页可贴、过滤是薄条、不算进算出这一刻、看法不卸分场条。
- 加列 / 拖钟 / 删已正史：建议清单 + 人点确认变更。
- 看法侧开，分场条仍在。白板默认关、只引用场、不写正史。
- 导出默认含草稿并标注。多书可切。

## 未齐

无。第 11 节二十六条已在腾讯 `127.0.0.1:8787` 点测全绿（`e2e/playwright/contract26.spec.ts`，`workers: 1`）。

## 下一刀

打开书即合同。e2e 打新前端，`workers: 1`。禁止为绿灯改松算出这一刻。禁止救活 `archive/stripboard/`。做完一项就 commit 并 push。
