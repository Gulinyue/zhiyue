# 实时面试 · 1.1 预览

开发者：gulinyue。Bug 反馈：linyue_clawbot001@163.com。

## 使用流程

在连接与设置中配置文字问答模型和语音服务后，点击侧栏“实时面试”或“开始面试”。应用立即启动系统收音，进入与笔试相同的半透明、鼠标穿透、不可点击且不抢焦点的悬浮窗；不再需要第二次点击开始。默认不透明度 52%，面试定制中可修改，并显式选择显示或隐藏快捷键提示栏。

系统播放设备 → Electron Windows loopback → 16 kHz 单声道音频 → 本机能量门限与停顿检测 → 内存 WAV 片段 → 语音转写 → 已配置的文字模型 → 流式参考回答。

已开启局域网互通并经电脑批准配对的手机，可同步接收问题和流式回答。Ctrl+↑ / Ctrl+↓ 滚动手机知跃答案页；手机可以滚动电脑答案或退出面试。面试进行中手机截图请求会被拒绝，需先退出面试。连接步骤与网络要求见 [LAN.md](LAN.md)。

不请求麦克风，不上传屏幕图像。Chromium 返回的视频轨道会立即停止，只处理音频。Ctrl+Shift+Z 或 Ctrl+3 结束收音、转写和回答，并恢复设置界面；隐藏后也能退出。Ctrl+Shift+H 隐藏，Ctrl+Shift+E 恢复显示，恢复后仍保持穿透。从历史记录选择继续面试也会启动收音。

Windows 快捷键提示栏与答案在同一原生窗口绘制，共用鼠标穿透和 WDA_EXCLUDEFROMCAPTURE，避免额外透明提示窗产生捕获黑框；显示/隐藏开关保留。进入前确认退出快捷键可用。捕获排除不可用时拒绝进入，运行期间定期检查并尝试恢复保护。该机制只覆盖支持它的系统捕获路径。

## 服务与配置

提供千问百炼（北京/新加坡）、智谱 GLM-ASR、硅基流动、OpenAI、Groq、Together AI、本机 Whisper 兼容服务及自定义接口预设。切换服务商自动填充地址和模型候选；可获取模型列表、选择模型或手动填写 ID。预设不保证账号有权限，建议测试后保存。模型列表不可用时仍可直接填写模型。

各服务按自己的语音协议调用：

- 千问百炼：qwen3-asr-flash，使用 compatible-mode/v1/chat/completions，内存 WAV 编码为 Base64 音频输入；语言通过 asr_options 发送，热词作为识别上下文。北京和新加坡分别使用对应地域的 Key，也支持控制台提供的业务空间专属地址。模型列表排除异步 Filetrans 等不适用型号。
- 智谱：glm-asr-2512，使用 api/paas/v4/audio/transcriptions，发送 file、model、stream=false 及可选 prompt；自动识别语言，单片最多 21 秒，低于其 30 秒限制。使用标准 API Key 和语音模型权限，不使用 Coding Plan 专用接口。
- 硅基流动：只发送 file/model，界面禁用不支持的语言和热词设置。
- 其余兼容服务：POST /audio/transcriptions，上传 file、model、response_format=json，可选 language 与 prompt，读取 JSON text。

服务需接受 16 kHz PCM WAV。本机接口可无认证，远端须 HTTPS 和独立 Key；ChatGPT 套餐授权不用于语音转写。

“测试并保存”发送 0.5 秒合成音验证上传和响应，不访问音频设备，服务商可能计费；只在成功后保存，失败保留原配置。该测试不评估真实语音识别质量，也可选择直接保存。

连接与系统加密的密钥保存在 speech-service.json；普通设置、连接快照或会话文件没有明文密钥。渲染器只读取元数据与密钥末四位。更换地址不会把旧地址的 Key 发送给新服务。请求不跟随重定向，错误消息不回显上游正文。

新用户停顿默认 0.7 秒，可在 0.5–2.5 秒间调整；静音和短促声音不提交。快速模式每 6 秒提前转写长问题，稳健模式每 20 秒分段；停顿后合并回答，不在问题未结束时抢答。仅保留末尾 150 ms 静音，减少上传和识别负担。转写和回答队列有数量上限，落后过多时结束收音并返回设置，避免无界堆积。

默认口述稿：以应聘者第一人称、通常100至180字的短段落直接回答，不输出网页教程式前言、标题、列表和附加追问；无真实资料时不编造项目经历。可切换为简短回答加关键要点。快速模式仅带最近三轮有界上下文和2500字资料，输出限制640 tokens，并为 DeepSeek 设置 reasoning_effort=none；稳健模式保留较长上下文与1200 tokens。

设置提供“应用快速口述推荐”按钮，为升级用户应用口述稿、快速模式、0.7秒停顿和自动回答，其他偏好保留。悬浮窗展示当前问题与最新回答，完整历史仍持久化。最近一片转写耗时与回答首字耗时在悬浮窗显示，首字耗时不含停顿、转写和队列等待。

支持回答语言、回答提示词和本地知识库。关闭自动回答后，转写保留在悬浮窗底部，按 Alt+C 提交当前问题。音频不自动落盘，只持久化文本问题和回答。只有启用且匹配的知识片段进入请求。

## 验证与体验

单元测试覆盖 WAV、分句、长问题合并、取消、队列、地址、错误脱敏、服务商迁移、千问 Base64 音频请求、智谱原生字段及参数差异。Electron 集成测试使用真实 AudioWorklet、合成音源和本机模拟服务，验证自动进入、原生窗口捕获排除和穿透、保护恢复、快捷键、提示栏开关、千问/智谱原生协议的模拟请求、模型发现、连接测试与失败保留配置、自动/手动回答、历史和退出释放。

口述格式通过请求指令验证，速度链路通过合成音与模拟服务验证；并未对付费模型回答质量或公网耗时做实测。

未在用户的真实音频设备、真实面试声音或付费语音服务上验收。背景音乐、音量和网络延迟影响识别和回答，可调整灵敏度、停顿时长或使用手动提交。

接口依据：[千问百炼](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)、[智谱 GLM-ASR](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-asr-2512)、[OpenAI](https://developers.openai.com/api/docs/guides/speech-to-text)、[Groq](https://console.groq.com/docs/speech-to-text)、[硅基流动](https://docs.siliconflow.cn/docs/api/audio-transcriptions-post)、[Together AI](https://docs.together.ai/docs/inference/transcription/overview)、[Electron 系统收音](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)。

## 个人简历参考

在侧栏“个人简历”导入或粘贴真实经历，核对并保存，打开“面试中参考这份简历”。新的面试问题会按问题检索简历，快速模式最多约 6000 字、稳健模式最多约 12000 字；个人经历问题优先使用简历事实，简历外的任职、项目和指标不会被要求编造。常见联系方式会遮蔽后发送到所配置模型；原文仍保存在本机，开关不影响已有会话。
