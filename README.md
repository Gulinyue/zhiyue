# 知跃 · Zhiyue

知有所向，思有跃迁。

由 **gulinyue** 开发的社区免费桌面助手，支持笔试截图出答案、文字问答、文字模拟面试、本机知识库与会话记录。无需应用账号，直接连接自己的模型服务。

![知跃 Logo](resources/logo.svg)

## 笔试模式

1. 在“连接与设置”中配置一个支持图片输入的截图模型。
2. 点击侧栏“笔试模式”，打开题目所在页面。
3. 按 **Ctrl+Q** 截图，自动识题并生成答案，无需另点发送。
4. 长题按 **Ctrl+Shift+Q** 滚动截图；也可用页面按钮。

支持选择题、简答题、编程题；先给答案，再给必要解析，编程题包含代码和复杂度。新截图独立解题，文字追问继续当前上下文；模糊题干会要求补充。答案和笔试模式会保存在本机，可从会话记录继续。按键可在设置中修改。

## 模型连接

预设覆盖 OpenAI、Claude、Gemini、Azure、Grok、DeepSeek、Mistral、Groq、OpenRouter、通义千问、硅基流动、Kimi、GLM、Together、Fireworks、Perplexity，以及本机 Ollama / LM Studio。支持自定义 Base URL、模型 ID、模型列表发现和四种推理协议。

可通过 **Continue with ChatGPT** 在浏览器中授权自己的账号，使用符合账号权限的 ChatGPT 套餐模型。ChatGPT 授权是面向个人本地使用的预览集成；闭源社区版本公开分发前需另行确认产品的接入资格。应用本身免费，外部模型服务可能收费，额度和权限以服务商为准。使用本机模型需要自行运行对应服务。

## 悬浮窗与快捷键

“专注窗口”提供置顶、1%–100% 不透明度、拖动缩放和鼠标穿透。普通笔试页面也可直接使用截图快捷键。

| 操作 | 默认快捷键 |
| --- | --- |
| 截图并直接出答案 | Ctrl+Q（笔试模式 / 专注窗口） |
| 滚动截图并直接出答案 | Ctrl+Shift+Q |
| 移动窗口 | Ctrl+Shift+方向键 |
| 上下滚动回答 | Ctrl+Win+↑ / ↓ |
| 横向滚动代码 / 表格 | Ctrl+Alt+Shift+← / → |
| 隐藏 | Ctrl+Shift+H |
| 解除隐藏并恢复操作 | Ctrl+Shift+E |
| 调整不透明度 | Ctrl+Shift+[ / ] |
| 鼠标穿透切换 | Ctrl+Shift+X |

## 作者工作区运行

需要 Node.js 22 或更新版本。已安装依赖时运行：

```powershell
npm.cmd start
```

新环境安装依赖使用 `npm.cmd ci`。开发数据保存在 `.runtime/local-dev/`。密钥及账号令牌使用操作系统安全存储加密，资料与文字会话保存在本机；原始截图不写入会话 JSON，可选择单独归档。渲染进程禁用网络连接，模型请求通过受限 IPC 在主进程中发送。

## 验证

```powershell
npm.cmd run verify          # 源码检查、43 项测试、构建
npm.cmd run test:smoke      # 实际 Electron：笔试截图直答、窗口与模型链路
npm.cmd run test:auth-smoke # 实际 Electron：模拟 OAuth、签名校验、加密存储
npm.cmd run assets:logo     # 从矢量母版重建 PNG / ICO
```

模型服务、OAuth 服务和截图图像在冒烟测试中使用模拟数据；不访问真实账号或付费模型。截图调度、多显示器选择、取消与超时另有测试。真实模型的识题质量取决于所选模型和截图清晰度。语音识别与手机远控尚未接入。

## 许可与开发者标识

**社区免费使用，暂不开源授权。** 具体使用范围见 [LICENSE](LICENSE)。开发者为 **gulinyue**，署名位于界面关于区域、源码品牌配置、Logo 元数据和构建产物文件头，详见 [DEVELOPER.md](DEVELOPER.md)。第三方依赖许可保留。

[模型与窗口说明](docs/MODELS-WINDOW.md) · [本机架构与存储](docs/LOCAL.md)
