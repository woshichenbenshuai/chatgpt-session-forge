# ChatGPT Session Forge

[English](README.en.md)

一个本地运行的 ChatGPT 会话管理工具，用于导入 Outlook 账号、自动获取 OpenAI 邮箱验证码、批量完成 ChatGPT 登录，并导出 CPA / sub2api / Cockpit 可用的凭证 JSON。

这个项目适合需要集中管理多个 ChatGPT Web Session 的本地工作流。所有账号数据、登录结果和导出文件都保存在本机，不需要外部数据库。

## 功能特性

- 支持批量导入 Outlook 账号
- 支持 IMAP 与 Microsoft Graph 双协议取件
- 支持外部邮箱 Provider：Cloudflare Temp Email / Cloud Mail
- 自动从邮箱中提取 OpenAI 验证码
- 支持批量 ChatGPT 登录，并可设置并发数
- 登录进度、状态和日志实时刷新
- 自动识别账号停用 / 删除类错误
- CPA 导出：一个账号一个 JSON 文件
- sub2api 导出：生成包含 `accounts` 数组的聚合 JSON
- Cockpit 导出：生成 `cockpit-tools` 可直接导入的扁平 Codex token JSON 数组
- CPA 仓管：扫描 CLIProxyAPI 401 凭证，自动重登获取新 CPA，封号时删除旧凭证
- Codex-Manager 对接：把本地已登录成功的 ChatGPT Session 批量导入 Codex-Manager 账号池
- 支持粘贴原始 `https://chatgpt.com/api/auth/session` JSON 并转换
- 支持通过环境变量或 Windows 系统代理配置后端出站代理

## 环境要求

- Node.js 18 或更高版本
- Outlook 账号 OAuth 数据：
  - 邮箱
  - 密码
  - Microsoft OAuth Client ID
  - Refresh Token
- 可选：自建 Cloudflare Temp Email / Cloud Mail 收件 API
- 可以访问以下服务：
  - `chatgpt.com`
  - `auth.openai.com`
  - `outlook.office365.com`
  - `graph.microsoft.com`

## 安装

```bash
npm install
```

## Docker 部署

项目已内置 `Dockerfile` 和 `docker-compose.yml`，服务器部署参考 [DOCKER.md](DOCKER.md)。

快速启动：

```bash
cp .env.example .env
docker compose up -d --build
```

默认监听 `0.0.0.0:16010`，允许外部访问。请先在 `.env` 中设置强 `BASIC_AUTH_PASSWORD`，并配合服务器防火墙或反向代理使用。

## 启动

```bash
npm start
```

然后打开：

```text
http://localhost:3000
```

默认端口是 `3000`。也可以指定端口：

```bash
PORT=8080 npm start
```

Windows PowerShell：

```powershell
$env:PORT = "8080"
npm start
```

## 代理配置

后端出站请求使用 `undici`，代理配置在 `config.js` 中：

```js
proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || 'auto'
```

默认值 `auto` 会尝试读取 Windows 当前用户代理。也可以手动指定：

```bash
HTTPS_PROXY=http://127.0.0.1:7897 npm start
```

如果不想使用代理，可以在 `config.js` 中设置为 `direct` 或 `none`。

## 使用方法

1. 打开 Web UI。
2. 在“邮箱取件”页点击“批量导入邮箱”。默认使用 Outlook，格式如下：

   ```text
   user@outlook.com----password----client-id----refresh-token
   ```

   如果验证码邮件不是 Outlook 收件，而是自建 Cloudflare Temp Email / Cloud Mail，可以在导入弹窗顶部选择对应邮箱服务并填写配置。导入时会自动把 Provider 配置附加到账号行，配置会保存在本机浏览器里。

   也可以手动追加 provider：

   ```text
   user@example.com----password----client-id----refresh-token----cloudflare-temp-mail----baseUrl=https://mail.example.com;adminAuth=your-admin-auth
   user@example.com----password----client-id----refresh-token----cloud-mail----baseUrl=https://mail.example.com;token=your-token
   ```

   `providerConfig` 也支持 JSON：

   ```text
   user@example.com----password----client-id----refresh-token----cloud-mail----{"baseUrl":"https://mail.example.com","adminEmail":"admin@example.com","adminPassword":"password"}
   ```

3. 进入“自动登录”页。
4. 选择需要登录的账号，并设置并发数。
5. 点击登录。
6. 登录成功后，选择成功账号并导出：
   - `CPA`：每个账号导出为一个 JSON 文件
   - `sub2api`：导出为一个聚合 JSON 文件
   - `Cockpit`：导出为一个 JSON 数组文件，可导入 [jlcodes99/cockpit-tools](https://github.com/jlcodes99/cockpit-tools)

## CPA 导出格式

CPA 导出采用“一个账号一个 JSON 文件”的形式。结构示例：

```json
{
  "type": "codex",
  "email": "user@example.com",
  "account_id": "00000000-0000-4000-9000-000000000000",
  "chatgpt_account_id": "00000000-0000-4000-9000-000000000000",
  "plan_type": "free",
  "chatgpt_plan_type": "free",
  "id_token": "header.payload.",
  "access_token": "real-access-token",
  "refresh_token": "",
  "session_token": "real-session-token",
  "last_refresh": "2026-05-24T00:00:00.000Z",
  "expired": "2026-08-22T00:00:00.000Z",
  "disabled": false,
  "id_token_synthetic": true
}
```

该格式由 ChatGPT Web Session 和 access token claims 派生生成。登录成功后程序不会主动退出 ChatGPT，因为退出可能导致 access token 失效。

## sub2api 导出格式

sub2api 导出为聚合结构：

```json
{
  "exported_at": "2026-05-24T00:00:00.000Z",
  "proxies": [],
  "accounts": []
}
```

每个账号会包含 OAuth 凭证、账号 ID、用户 ID、套餐类型、过期时间和额外元数据。

## Cockpit 导出格式

Cockpit 导出采用 `cockpit-tools` 当前导入逻辑支持的扁平 Codex token JSON 数组。结构示例：

```json
[
  {
    "type": "codex",
    "auth_mode": "oauth",
    "email": "user@example.com",
    "name": "user@example.com",
    "account_id": "00000000-0000-4000-9000-000000000000",
    "organization_id": "",
    "user_id": "user-example",
    "plan_type": "free",
    "id_token": "header.payload.",
    "access_token": "real-access-token",
    "refresh_token": "",
    "session_token": "real-session-token",
    "last_refresh": "2026-05-24T00:00:00.000Z",
    "expired": "2026-08-22T00:00:00.000Z",
    "source": "chatgpt_session_forge",
    "id_token_synthetic": true
  }
]
```

`cockpit-tools` 会读取 `id_token`、`access_token`、`account_id`，并在 `refresh_token` 为空时使用 `session_token` 作为回退字段。

## CPA 仓管

“CPA 仓管”页用于直接操作 CLIProxyAPI 的管理 API。处理流程：

```text
扫描 CPA auth-files
→ 发现 401 凭证
→ 用本地同邮箱账号重新登录 ChatGPT
→ 登录成功：生成 CPA JSON 并上传覆盖
→ 登录失败且账号已停用：删除 CPA 中的旧凭证
```

需要填写：

- CPA 地址，例如 `http://localhost:8317`
- 管理密钥，对应 CLIProxyAPI 管理 API 的 `Authorization: Bearer <key>`

本功能只会自动处理 `status/status_message` 中包含 `401` 或 `unauthorized` 的凭证。其他异常会跳过或记录失败，避免误删。

## Codex-Manager 对接

“仓管对接”页支持把本工具已登录成功的 ChatGPT Session 直接导入 Codex-Manager。

需要填写：

- Codex-Manager 地址，例如 `http://localhost:17000`
- RPC Token，对应 Codex-Manager 的 `codexmanager.rpc-token`
- Web 访问密码：如果 Codex-Manager Web 后台启用了访问密码，需要填写；如果直接填 service 端 `/rpc` 地址则不需要

Docker 部署时，如果 Codex-Manager 跑在宿主机 `17000` 端口，地址通常填写：

```text
http://host.docker.internal:17000
```

如果你直接对接 Codex-Manager service 端 RPC，例如 `http://host.docker.internal:48760/rpc`，则只需要 RPC Token，不走 Web 后台密码。

底层调用 Codex-Manager 的 JSON-RPC `account/import`，导入内容等价于把 `https://chatgpt.com/api/auth/session` JSON 粘贴到 Codex-Manager 批量导入。为避免重复账号，导入前会先按本地 `accountId/email` 去重，并默认读取 Codex-Manager 现有账号列表，跳过已存在的同邮箱账号。

## 外部邮箱 Provider

外部邮箱 Provider 只影响“获取验证码邮件”这一步，不会改变 ChatGPT 登录、CPA / sub2api / Cockpit 导出和 CPA 仓管逻辑。

导入弹窗已经内置可视化配置面板：

- Cloudflare Temp Email：支持 `TEMP API`、`ADMIN AUTH`、`CUSTOM AUTH`、查询方式、接收邮箱、随机子域和域名更新
- Cloud Mail：支持 `API 地址`、管理员邮箱、管理员密码和域名

当前支持：

- `cloudflare-temp-mail`：兼容 Cloudflare Temp Email 管理接口，读取 `/admin/mails`，可配置 `adminAuth` / `customAuth`
- `cloud-mail`：兼容 Cloud Mail 公共接口，读取 `/api/public/emailList`，可配置 `token`，或用 `adminEmail` + `adminPassword` 自动获取 token

该兼容层参考了 [FoundZiGu/GuJumpgate](https://github.com/FoundZiGu/GuJumpgate) 中 Cloudflare Temp Email / Cloud Mail 的接口思路；本项目没有合并它的仓管功能，只在取验证码邮件这层增加兼容。

## 致谢

- 感谢 [FoundZiGu/GuJumpgate](https://github.com/FoundZiGu/GuJumpgate) 提供 Cloudflare Temp Email 和 Cloud Mail 的接口思路。
- 感谢 [DanOps-1/Gpt-Agreement-Payment](https://github.com/DanOps-1/Gpt-Agreement-Payment) 提供 ChatGPT 协议登录流程参考。

## 本地数据

运行时账号数据保存在：

```text
data/accounts.json
```

日志保存在：

```text
logs/
```

这两个路径都已加入 `.gitignore`，不会被提交到仓库。

## 安全提醒

本项目会处理高度敏感的数据：

- Outlook 密码
- OAuth refresh token
- ChatGPT access token
- ChatGPT session token
- 导出的 CPA / sub2api / Cockpit 凭证文件

不要提交运行数据、日志、导出的 JSON / ZIP 文件，或任何包含 token 的截图。公开仓库前请务必检查：

```bash
git status --ignored
```

## 脚本

```bash
npm start
```

启动 Express 服务。

```bash
npm run dev
```

使用 Node watch mode 启动开发模式。

## 许可证

当前暂未选择许可证。如果你希望其他人复用或修改该项目，请在公开发布前添加合适的开源许可证。
