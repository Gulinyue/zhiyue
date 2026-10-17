# 知跃 · 模型接入与悬浮窗

开发者：gulinyue。社区免费使用，暂不开源授权。

## 接入方式

“连接与设置”中的文字和截图模型分别选择服务商、接口协议、模型 ID。预设提供接口地址；可直接修改地址接入代理、私有部署或其他兼容服务。密钥按用途和 Base URL 绑定，修改地址后需要填写对应密钥。首次保存不发送推理请求；获取模型列表和连接测试会联网。模型列表可能只包含服务商返回的首批结果，也可手动输入 ID；列表中的模型未必支持图片，截图用途请使用“测试并保存”验证视觉输入。

实现四种协议，而非只替换 OpenAI 地址：

| 协议 | 推理端点 | 认证 | 图片与系统提示词 |
| --- | --- | --- | --- |
| Chat Completions | `/chat/completions` | Bearer；Azure 用 `api-key` | OpenAI 消息结构 |
| Responses | `/responses` | Bearer；Azure 用 `api-key` | Responses 输入结构 |
| Anthropic Messages | `/messages` | `x-api-key`、版本头 | base64 图片；顶层 system |
| Gemini | `/models/{id}:streamGenerateContent?alt=sse` | `x-goog-api-key` | inlineData；systemInstruction |

Azure 的模型 ID 是部署名，模型发现接口可能不提供部署列表。Qwen 预设保留兼容域名，新账号应改用工作空间专属地址。Ollama / LM Studio 需要先在本机启动模型服务；客户端不包含权重。其他账号订阅的第三方登录认证未实现，不把会员 Cookie 当作 API Key 使用。

## ChatGPT 官方授权

这是使用用户本人的账号，客户端不提供共享账号、内置令牌或 Codex 会话凭据。个人本地使用按官方 Sign in with ChatGPT 流程接入；闭源社区发行尚未确认公开分发的接入资格，不能把免费使用许可等同于 OpenAI 接入许可；是否开放套餐使用及具体额度，以授权页面和账号返回结果为准。

1. 点击 **Continue with ChatGPT**，在系统浏览器完成官方登录和授权。
2. 确认获得套餐使用权限。只有身份登录成功不足以进行推理。
3. 模型来源选择“ChatGPT 账号授权”，获取账号模型列表，选取模型并保存文字或截图连接。
4. 通过“查看 ChatGPT 用量”管理用量；可重新授权、更换账号、返回已保存账号或退出授权。

主进程生成稳定 host ID，每次登录使用随机 state、nonce、PKCE S256，以及临时 `127.0.0.1` 回调监听。首次使用动态客户端注册；保存并复用颁发的 client ID。通过 OpenID discovery 和 jose 校验 ID token 的签名、issuer、audience、时效、nonce 和返回账号身份。注册记录与当前令牌经操作系统安全存储加密，不向界面返回令牌。

刷新按会话串行处理，保存轮换 refresh token。退出或账号切换会终止正在使用旧会话的推理；退出清除本机令牌并尝试撤销远端会话，若网络阻止确认撤销，界面明确提示去 ChatGPT 设置中断开。

OAuth 令牌固定发送到官方 `https://api.openai.com/v1`，不能用于用户自定义地址。使用 Responses、`store:false`、`stream:true`，将系统提示词转换为 instructions，只在收到完整 `response.completed` 时成功。当前只接入文字和图片，不接入该授权流的语音或工具调用。服务端使用限制、失败和中断均作为失败返回。

## 悬浮窗

点击侧栏“笔试模式”或“笔试定制”里的“开始笔试”，立即打开鼠标穿透、不可点击且禁止激活的半透明悬浮窗。默认不透明度 52%，可在进入前于笔试定制中调整到 15%–85%。按 Ctrl+Shift+Z 退出并恢复可点击设置页，隐藏状态下也能退出。普通“专注窗口”继续支持手动交互。顶部始终显示不透明度滑块；右下角手柄拖动缩放；标题栏拖动移动。交互与鼠标穿透分别记住不透明度。内容向上滚动后，后续流式文字不会强行拉回底部；滚回底部或发送新问题后继续跟随输出。

| 操作 | 默认快捷键 |
| --- | --- |
| 显示 / 隐藏切换 | Ctrl+E |
| 隐藏 | Ctrl+Shift+H |
| 显示窗口（笔试中保持穿透） | Ctrl+Shift+E |
| 移动窗口 | Ctrl+Shift+↑ / ↓ / ← / → |
| 移动窗口备用组合 | Alt+Shift+↑ / ↓ / ← / → |
| 滚动回答 | Ctrl+Win+↑ / ↓ |
| 横向滚动当前可见代码或表格 | Ctrl+Alt+Shift+← / → |
| 降低 / 提高不透明度 | Ctrl+Shift+[ / ] |
| 普通窗口穿透切换（笔试中锁定） | Ctrl+Shift+X |
| 截图并提问（笔试模式 / 专注窗口） | Ctrl+Q |
| 滚动截图并提问（专注窗口） | Ctrl+Shift+Q |
| 退出笔试 / 专注 | Ctrl+Shift+Z |

窗口操作在普通页面和专注窗口都有效；回答滚动在工作台和笔试模式启用，鼠标穿透时仍可用。Windows 的 Ctrl+Win+←/→ 用于虚拟桌面，故不用作内容滚动。设置页允许修改、禁用部分组合，保留解除隐藏键，并显示注册结果；冲突时也可用托盘恢复窗口。

## 验证与界限

55 项 Node 测试覆盖模型协议、流和图片转换、OAuth state/PKCE/签名/nonce/身份与权限、刷新轮换及退出竞态，以及实时面试的分句、转写格式与队列。三组真实 Electron 冒烟测试验证 UI、受限 IPC、OS 加密、模型配置持久化、原生 Claude/Gemini 模拟请求、OAuth 模拟登录到回答再到退出、音频到面试回答的完整链路，以及实际注册的窗口快捷键回调、透明度、穿透恢复、四方向内容滚动和缩放手柄。

测试不会登录真实账号或请求真实付费模型；模型推理和 OAuth 服务使用模拟响应，JWT 使用测试签名，音频为合成音源。真实账号授权、系统音频设备和语音服务仍需用户实际体验。手机远控尚未实现。实时面试采用独立的语音转写接口，见 INTERVIEW.md。

## 官方协议来源（核对日期：2026-10-17）

- [OpenAI 注册登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[会话与刷新](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create)、[Gemini generateContent](https://ai.google.dev/api/generate-content)、[Azure OpenAI v1](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle)
- [xAI](https://docs.x.ai/developers/rest-api-reference/inference/responses)、[DeepSeek](https://api-docs.deepseek.com/)、[Mistral](https://docs.mistral.ai/api/)、[Groq](https://console.groq.com/docs/openai)、[OpenRouter](https://openrouter.ai/docs/api-reference/overview)
- [Qwen](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope)、[硅基流动](https://docs.siliconflow.cn/docs/userguide/quickstart)、[Kimi](https://platform.kimi.ai/docs/overview)、[Z.ai](https://docs.z.ai/guides/capabilities/mcp-call)
- [Together](https://docs.together.ai/docs/inference/openai-compatibility)、[Fireworks](https://docs.fireworks.ai/tools-sdks/openai-compatibility)、[Perplexity](https://docs.perplexity.ai/docs/getting-started/quickstart)、[Ollama](https://docs.ollama.com/api/openai-compatibility)、[LM Studio](https://lmstudio.ai/docs/developer/openai-compat)


## 笔试定制与 Windows 捕获排除

设置页提供笔试专属编程语言、回答语言和最多 4000 字提示词，与通用回答偏好分开保存。知识库可使用全部已启用资料、只选指定资料或关闭。截图问题附加所选资料的限长文本片段；文字问题按关键词检索；没有勾选时不自动回退到全部资料。

笔试启动在 Windows 主窗口与快捷键提示浮层上应用 SetWindowDisplayAffinity(hwnd, 0x11)，读回必须为 WDA_EXCLUDEFROMCAPTURE，不使用 WDA_MONITOR 作为成功替代。切换、显示与定期检查均维护排除状态；无法确认时不进入或退出笔试。退出先隐藏答案，再恢复普通窗口策略。

实际 Electron 冒烟测试读取 User32 的 WS_EX_TRANSPARENT、WS_EX_NOACTIVATE 和 GetWindowDisplayAffinity，验证两扇窗口的真实状态，也验证退出键缺失、隐藏退出、排除状态恢复、迟到截图丢弃与生成取消。模型响应和截图内容仍为模拟数据。

Windows 10 2004 起支持真正排除；此 API 仅覆盖支持显示亲和性的系统捕获路径，不是对所有录屏方式的保证。参见 [Microsoft SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)。


笔试定制顶部的“快捷键提示栏”区域提供“显示提示栏”和“隐藏提示栏”按钮，并标明当前状态，默认开启。关闭后不创建独立快捷键浮层，也不显示窗口内快捷键提示条及欢迎页按键提示；截图、滚动和退出快捷键保持有效。偏好保存到本机，下次进入继续使用。
