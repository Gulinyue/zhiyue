# Climb Local

不依赖 Climb 服务器的桌面工作区。启动后直接使用，无需账号、订阅或旧云端授权。文字与截图问答直接连接你自己配置的模型，本机保存资料和会话。

当前分支：`codex/local-standalone`。之前的原云端恢复版保存在 `codex/cloud-recovered`，可随时对照。

## 启动

当前目录已安装依赖，在 PowerShell 中运行：

```powershell
npm.cmd start
```

新环境需要 Node.js 22 或更新版本，先执行 `npm.cmd ci`。

首次使用打开“连接与设置”，选择模型来源。可填写服务商的 API Key，或点击 **Continue with ChatGPT** 在浏览器中授权自己的 ChatGPT 账号，然后选择“ChatGPT 账号授权”来源、获取模型列表并保存。ChatGPT 套餐是否可用、模型和额度取决于账号的实际授权。

预设覆盖 OpenAI、Claude、Gemini、Azure、Grok、DeepSeek、Mistral、Groq、OpenRouter、通义千问、硅基流动、Kimi、GLM、Together、Fireworks、Perplexity，以及本机 Ollama / LM Studio；可手动调整 Base URL 和模型 ID。支持四种实际协议：Chat Completions、Responses、Anthropic Messages、Gemini。远程地址使用 HTTPS，本机支持 `http://localhost`、`http://127.0.0.1`；无认证本机服务的 Key 可留空。Azure 填写资源地址和模型部署名；阿里云新账号使用控制台提供的工作空间域名。

文字模型与截图模型可分别配置，也可填写相同连接。只有截图模型时，文字问答也可使用该连接；截图分析要求模型支持图片输入。保存连接不会发起模型请求；“测试并保存”和发送提问才会调用模型。

**本地独立不等于所有模型都离线。** 使用在线模型仍需联网；使用已运行的本机模型服务时不需要 Climb 云端。此工程不附带模型权重或模型服务。

## 当前功能

- **文字问答**：Markdown、代码与公式，支持流式输出和停止生成。
- **截图分析**：多屏选择、最多 4 张图片，专注状态下可用 `Ctrl+Q` 截图并提问、`Ctrl+Shift+Q` 滚动截图并提问。
- **文字模拟面试**：通过自己的模型逐题提问和反馈。
- **本机知识库**：粘贴或导入 TXT / Markdown，按问题关键词挑选相关片段作为上下文。
- **会话记录**：自动保存文字对话、继续会话、删除记录。原始截图不写入会话 JSON，可单独开启本机截图归档。
- **桌面能力**：专注窗口、置顶、透明度、鼠标穿透、托盘和快捷键；隐身窗口模式重启后生效。

悬浮窗顶部有不透明度滑块，右下角可拖动缩放。默认 `Ctrl+Shift+H` 隐藏、`Ctrl+Shift+E` 解除隐藏并恢复鼠标操作、`Ctrl+Shift+方向键` 移动窗口、`Ctrl+Win+↑/↓` 滚动内容、`Ctrl+Alt+Shift+←/→` 横向滚动代码、`Ctrl+Shift+[` / `]` 调整不透明度。设置页可修改快捷键并查看注册状态。详见 [模型接入与窗口操作](docs/MODELS-WINDOW.md)。

语音识别、手机远控、原云端的职位推荐、简历解析和结构化演练报告尚未接入。原服务器数据无法从这个客户端恢复。

## 数据与密钥

开发启动使用独立目录 `.runtime/local-dev/`，不复用恢复版的 `.runtime/dev/` 或已安装原版的数据。API Key 和用户主动登录获得的 ChatGPT 令牌使用操作系统安全存储加密，模型配置、资料和对话保存在本机。不会启动旧 Climb 登录、订阅、版本检查或远控请求。

渲染进程的网络连接由 CSP 禁止；模型请求通过受限 IPC 在主进程中发出。发送时，当前提问、所附截图、最近的文字上下文和匹配的资料片段会交给所配置的模型服务商。知识库不需要云端索引或 embedding 服务。

## 验证

```powershell
npm.cmd run verify      # 源码检查、41 项测试、构建
npm.cmd run test:smoke  # 实际 Electron + 本机模拟模型的端到端检查
npm.cmd run test:auth-smoke  # 实际 Electron + 模拟 OAuth / 签名 JWT / 加密存储
```

冒烟测试阻断所有非本机模拟模型请求，检查免登录启动、配置保存、资料检索、文字与图片流式回答、取消、记录重开、截图快捷键、专注窗口和浮层权限。截图操作在冒烟测试中使用应用自身图像作为替身；真实桌面捕获的调度与安全门另有单元测试，未进行会议软件共享兼容验收。

验证输出：`artifacts/local-smoke-report.json`、`auth-smoke-report.json`、`local-workspace.png`、`local-settings.png`、`local-chat.png`、`local-floating-window.png`。授权测试使用模拟服务和测试令牌；尚未使用用户真实 ChatGPT 账号或 API Key 对外部服务商验收。

## 源码

| 位置 | 职责 |
| --- | --- |
| `src/renderer/local/` | 本地工作台、模型设置、知识库、会话、提示词、浮层 |
| `src/main/models/` | 直接模型调用、参数校验、SSE、取消与密钥加密 |
| `src/main/store/workspace*.mjs` | 本地会话结构与持久化 |
| `src/shared/local-profile.mjs` | 固定的本机文件命名空间，不是云端账号 |
| `src/main/capture/`、`windows/`、`security/` | 原生截图、窗口和 IPC 安全 |

旧的云端界面源码仍保留用于对照，但不在本地版构建入口中。更详细的变更与限制见 [docs/LOCAL.md](docs/LOCAL.md)。
