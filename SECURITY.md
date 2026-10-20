# 安全策略 (Security Policy)

## 支持的版本 (Supported Versions)

目前 **设定图 (She-Ding-Tu)** 的安全更新仅维护在 `main` 主分支的最新版本上：

| 版本 / 分支 (Version / Branch) | 支持状态 (Supported) |
| :--- | :--- |
| `main` (Latest) | ✅ 支持 (Supported) |
| `archive/*` (历史归档) | ❌ 不支持 (Not Supported) |

---

## 部署与配置安全准则 (Deployment & Configuration Security)

1. **环境变量与密钥隔离 (Secret Isolation)**：
   - 模型协作接口（`SETTING_LLM_API_KEY`、`SETTING_LLM_BASE_URL`）仅通过环境变量或本地未入库的 `.env` 文件读取。
   - **严禁**将任何真实 API Key、Bearer Token、Basic Auth 密码、私有服务器 IP 或个人机器绝对路径硬编码并提交至 Git 仓库。
2. **默认本地回环绑定 (Default Loopback Binding)**：
   - 后端服务 `setting-api` 默认监听 `127.0.0.1:8787`（可通过 `SETTING_BIND` 配置），默认面向本机单用户创作工作台，不直接暴露至公网。
   - 如需在团队或云端环境部署访问，**必须**在前端置放反向代理（如 Nginx / Caddy），启用 HTTPS (TLS) 与访问认证（如 Basic Auth / OAuth2 Proxy），切勿将未鉴权的 API 端口直接暴露到公网。
3. **数据目录与路径安全 (Data Directory Safety)**：
   - 书目数据默认存储在 `SETTING_DATA`（默认 `./data/books`）下，每本书拥有独立的嵌入式 SurrealDB 实例目录与元数据文件。后端对书名、实体 ID 与属性键名均执行严格的输入校验（参见 `vendor/narra/src/utils/sanitize.rs`），防范路径穿越与 SurrealQL 注入。

---

## 报告安全漏洞 (Reporting a Vulnerability)

如果你在 **She-Ding-Tu (设定图)** 中发现了潜在的安全漏洞（例如：路径穿越、SurrealQL 注入、XSS 跨站脚本或敏感信息泄露）：

1. **请勿直接公开创建 GitHub Issue** 披露未修复的漏洞细节。
2. 请通过 GitHub 仓库的 **Private Vulnerability Reporting (Security Advisories)** 功能提交报告，或发送邮件至仓库维护者（见 Git 提交历史中的维护者邮箱）。
3. 报告中请尽量包含：
   - 漏洞类型与影响范围（组件路径、API 路由或前端模块）；
   - 最小可复现步骤（PoC 请求或测试脚本）；
   - 建议的修复方案（如有）。

我们会在收到报告后的 **72 小时内** 确认受理，并在完成评估与补丁修复后第一时间公布修复进展。
