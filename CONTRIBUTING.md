# 贡献指南 (Contributing to She-Ding-Tu)

感谢你对 **设定图 (She-Ding-Tu)** 的关注与贡献！本文档说明了项目架构红线、本地开发环境搭建、代码规范以及提交 Pull Request 的标准流程。

Thank you for your interest in contributing to **She-Ding-Tu (设定图)**! This document outlines the architectural invariants, local development workflow, testing requirements, and pull request guidelines.

---

## 1. 核心架构与产品红线 (Core Architectural Invariants)

在提交代码前，请务必理解并遵守以下设计原则（详见 [`docs/设定图-v1.md`](docs/设定图-v1.md) 与 [`docs/世界引擎.md`](docs/世界引擎.md)）：

1. **双时态与人工确认写入正史 (Human-in-the-Loop Canon)**：
   - 草稿（Draft）与白板便笺默认不进入正史（Canon）。只有用户在分场条或场页显式点击 **「写入正史」**，事实才会写入底层 `Narra`（SurrealDB）世界库并参与后续推导。
   - 影响既有正史的结构性改动（如改钟、删已正史场、正史加在场）必须先展示影响预览并经 **「确认变更」** 确认。
2. **「算出这一刻」必须是纯函数 (`world_at`)**：
   - 给定故事时间 `t`（及可选的人物透镜），世界状态折叠计算（谁在哪、谁拿着什么、谁知道什么、谁信错了什么、哪些伏笔待兑现）必须完全由正史场次确定性折算，不得掺入未提交草稿或非正史视图状态。
3. **视图正交 (Orthogonal Views)**：
   - **分场条 (Stripboard)** 是默认主工作面（本页可见列数固定钳制在 `1–6` 列）；**时间轴 (Timeline)**、**总表 (Spreadsheet)**、**关系/出场格 (Matrix)**、**轨迹 (Tracks)**、**讲述序 (Telling Order)** 与 **白板 (Whiteboard)** 均为同级看法（View），切换看法绝不篡改底层故事时间或正史事实。
4. **界面用语自然化 (Author-Centric Terminology)**：
   - 面向作者的界面文案使用自然创作语言（如「分场条」「写入正史」「算出这一刻」「本场任务」「规定情境」「确认变更」），禁止将内部数据库键名（如 `entity.attr=value`、`world_at`、`bitemporal`）直接暴露在 UI 上。

---

## 2. 本地开发环境准备 (Development Setup)

### 环境依赖 (Prerequisites)
- **Rust**: `1.80+`（含 `cargo`，用于编译 `vendor/narra` 下的 `setting-api`）
- **Node.js**: `20+`（推荐 `22+`，含 `npm`）
- **Python**: `3.10+`（可选，用于运行演示数据种子脚本 `scripts/rebuild_ferry.py`）

### 构建与启动 (Build & Run)

```bash
# 1. 构建前端静态资源
cd apps/web
npm ci
npm test
npm run build

# 2. 编译并启动后端服务（默认监听 127.0.0.1:8787）
cd ../../vendor/narra
cargo build --release --bin setting-api
SETTING_BIND=127.0.0.1:8787 \
SETTING_DATA=../../data/books \
SETTING_WEB_DIR=../../apps/web/dist \
./target/release/setting-api
```

若需前端热更新开发模式（Vite Dev Server）：
```bash
# 终端 1：启动后端 API（127.0.0.1:8787）
cd vendor/narra && cargo run --release --bin setting-api

# 终端 2：启动 Vite 开发服务（127.0.0.1:5173，自动代理 /api 与 /health 到 8787）
cd apps/web && npm run dev
```

---

## 3. 提交前必跑检查 (Pre-PR Verification Checklist)

任何代码修改在提交 Pull Request 前，必须通过以下全部检查：

1. **代码边界与脱敏检查**：
   ```bash
   bash scripts/boundary_scan.sh
   ```
   确保未引入外部项目耦合符号，且未硬编码任何 API Key、私人路径或服务器 IP。

2. **前端单测与生产构建**：
   ```bash
   cd apps/web && npm test && npm run build
   ```

3. **后端编译与单元/集成测试**：
   ```bash
   cd vendor/narra
   cargo check --bin setting-api
   cargo test --lib
   ```

4. **Playwright 全量真实业务 E2E 测试**：
   在独立端口与测试数据目录拉起服务，初始化《渡口》基准书并运行全量 E2E：
   ```bash
   SETTING_URL=http://127.0.0.1:18787 python3 scripts/rebuild_ferry.py
   cd e2e && SETTING_URL=http://127.0.0.1:18787 npx playwright test --workers=1
   ```

---

## 4. Commit 与 Pull Request 规范 (Commit & PR Guidelines)

- 使用语义化 Commit Message，例如：
  - `feat(board): 支持分场条卡片拖拽改动预览`
  - `fix(scene): 修复人物信错在规定情境中的展示文案`
  - `test(e2e): 补充白板灵感折入草稿端到端断言`
  - `docs(readme): 更新环境变量与快速启动文档`
- 请勿提交 `.env`、`data/books/`、`vendor/narra/target/`、`apps/web/dist/`、`e2e/test-results/` 等本地运行产物。
- PR 描述中请附上：修改动机、影响范围，以及前端构建与 Playwright E2E 测试通过的结果摘要。
