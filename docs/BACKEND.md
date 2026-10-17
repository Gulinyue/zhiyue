# 原云端接口索引

默认后端与门户均为 `https://workclimb.top`。REST 请求保留 `X-Climb-Client-Version: 3.0.1`、平台与架构请求头；带账号的请求保留 Bearer token 和刷新机制。WebSocket 从同一后端地址派生 WSS URL。

以下路径来自恢复代码，不代表服务端实现或全部请求字段已独立验证。

| 领域 | 路径 |
| --- | --- |
| 版本 | `GET /v1/client/version` |
| 账号 | `/v1/auth/login`、`refresh`、`register`、`resend-verification`、`forgot-password`、`reset-password` |
| 订阅 | `GET /v1/subscription/status` |
| 云端问答 | `POST /v1/llm/chat`（SSE） |
| 语音 | `WS /v1/asr/stream`、`WS /v1/voice/assistant-stream` |
| 用量会话 | `/v1/usage-session/start`、`/{id}/heartbeat`、`/{id}/stop` |
| 自有模型授权 | `/v1/byok/entitlements`，以及主进程中对应的授权验证请求 |
| 远控 | `/v1/remote-control/pairings` 及其子路径、`WS /v1/remote-control`，保留账号在线/配对协议 |
| 简历 | `/v1/resume`、`/v1/resume/items`、`/v1/resume/confirm`、`/v1/resume/items/confirm` |
| 演练 | `/v1/practice/jobs/*`、`documents/parse`、`discovery/*`、`sessions/*`、`speech/*` |

客户端能力与原订阅/配额策略保持耦合。配置个人模型并不会绕过云端授权。若以后迁移自己的服务端，需要按代码中的实际 payload 和响应解析逐项对接。

2026-10-17（新加坡时间）只读检查：公开版本接口带上原版请求头返回 HTTP 200，`currentVersion=3.0.1`、`latestVersion=3.0.2`、`forceUpdate=false`。不带版本头会返回 426。响应副本存放在本地验证输出 `artifacts/backend-version-response.txt`，没有据此替换或下载新客户端。
