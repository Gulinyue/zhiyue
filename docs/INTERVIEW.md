# 实时面试 · 1.1 预览

开发者：gulinyue。Bug 反馈：linyue_clawbot001@163.com。

## 使用流程

在连接与设置中配置文字问答模型和语音服务后，点击侧栏“实时面试”或“开始面试”。应用立即启动系统收音，进入与笔试相同的半透明、鼠标穿透、不可点击且不抢焦点的悬浮窗；不再需要第二次点击开始。默认不透明度 52%，面试定制中可修改，并显式选择显示或隐藏快捷键提示栏。

系统播放设备 → Electron Windows loopback → 16 kHz 单声道音频 → 本机能量门限与停顿检测 → 内存 WAV 片段 → 语音转写 → 已配置的文字模型 → 流式参考回答。

不请求麦克风，不上传屏幕图像。Chromium 返回的视频轨道会立即停止，只处理音频。Ctrl+Shift+Z 或 Ctrl+3 结束收音、转写和回答，并恢复设置界面；隐藏后也能退出。Ctrl+Shift+H 隐藏，Ctrl+Shift+E 恢复显示，恢复后仍保持穿透。从历史记录选择继续面试也会启动收音。

主窗口和快捷键提示栏均使用 Windows WDA_EXCLUDEFROMCAPTURE；进入前确认退出快捷键可用。捕获排除不可用时拒绝进入，运行期间定期检查并尝试恢复保护。该机制只覆盖支持它的系统捕获路径。

## 服务与配置

提供 OpenAI、Groq、硅基流动、Together AI、本机 Whisper 兼容服务及自定义接口预设。切换服务商自动填充地址和模型候选；可获取模型列表、选择模型或手动填写 ID。预设不保证账号有权限，建议测试后保存。模型列表不可用时仍可直接填写模型。

采用 OpenAI 兼容的 POST /audio/transcriptions，上传 file、model，通常附带 response_format=json、可选 language 与 prompt；硅基流动按其文档只发送 file/model，界面禁用不支持的语言和热词设置。服务需支持 16 kHz PCM WAV，并返回 JSON text。本机接口可以无认证，远端必须使用 HTTPS 和独立 Key。ChatGPT 套餐授权不用于语音转写。

“测试并保存”发送 0.5 秒合成音验证上传和响应，不访问音频设备，服务商可能计费；只在成功后保存，失败保留原配置。该测试不评估真实语音识别质量，也可选择直接保存。

连接与系统加密的密钥保存在 speech-service.json；普通设置、连接快照或会话文件没有明文密钥。渲染器只读取元数据与密钥末四位。更换地址不会把旧地址的 Key 发送给新服务。请求不跟随重定向，错误消息不回显上游正文。

停顿默认 1.1 秒，可在 0.5–2.5 秒间调整；静音和短促声音不提交。长问题每 20 秒分段，停顿后合并回答。转写和回答队列有数量上限，落后过多时结束收音并返回设置，避免无界堆积。

支持回答语言、回答提示词和本地知识库。关闭自动回答后，转写保留在悬浮窗底部，按 Alt+C 提交当前问题。音频不自动落盘，只持久化文本问题和回答。只有启用且匹配的知识片段进入请求。

## 验证与体验

单元测试覆盖 WAV、分句、长问题合并、取消、队列、地址、错误脱敏、服务商迁移及参数差异。Electron 集成测试使用真实 AudioWorklet、合成音源和本机模拟服务，验证自动进入、原生窗口捕获排除和穿透、保护恢复、快捷键、提示栏开关、模型发现、连接测试与失败保留配置、自动/手动回答、历史和退出释放。

未在用户的真实音频设备、真实面试声音或付费语音服务上验收。背景音乐、音量和网络延迟影响识别和回答，可调整灵敏度、停顿时长或使用手动提交。

接口依据：[OpenAI](https://developers.openai.com/api/docs/guides/speech-to-text)、[Groq](https://console.groq.com/docs/speech-to-text)、[硅基流动](https://docs.siliconflow.cn/docs/api/audio-transcriptions-post)、[Together AI](https://docs.together.ai/docs/inference/transcription/overview)、[Electron 系统收音](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)。
