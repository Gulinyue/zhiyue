# Climb 3.0.1 恢复工程

根据设计文档与目录中残留的构建产物，恢复的 Electron 桌面客户端。保留原版中文界面、登录订阅、云端模型与语音、手机远控、个人模型、本地知识库和记录。默认仍连接 `https://workclimb.top`。

这次恢复得到的是可编辑的 JavaScript ES Modules 工程。原始 TypeScript 类型、TSX 和服务端源码没有出现在提供的文件中，不能从中还原出来。React 组件保留了构建后的 `jsxRuntime` 写法；第三方库的原版构建快照位于 `src/renderer/vendor/`。

## 启动

需要 Node.js 22 或更新版本。当前目录已装好依赖，可直接在 PowerShell 中运行：

```powershell
npm.cmd start
```

重新获取项目后，先执行 `npm.cmd ci`。开发启动使用独立数据目录 `.runtime/dev/`，与已安装原版的配置、账号和记录分开。关闭窗口后应用保留在托盘，可从托盘退出；`Ctrl+E` 显示或隐藏窗口。

```powershell
npm.cmd run check       # 源码语法和未声明引用
npm.cmd test            # 21 项核心行为测试
npm.cmd run build       # 从 src 重新生成 out
npm.cmd run test:smoke  # 实际启动 Electron，使用本地模拟服务验证
npm.cmd run verify     # 源码检查、测试、构建
```

冒烟测试不会向原云端提交测试账号。它会短暂打开测试窗口，测试结束后关闭，截图和报告写入 `artifacts/`。

## 配置原云端或自己的部署

复制 `.env.example` 为 `.env`，修改以下公开地址后重新构建：

```dotenv
CLIMB_BACKEND_URL=https://workclimb.top
CLIMB_WEB_URL=https://workclimb.top
```

两个地址分别用于 REST/WSS 与网页门户。个人模型的 Base URL 和 API Key 在应用的“准备中心 → API KEY 管理”中设置。密钥通过操作系统加密后保存，不放入 `.env`。原版个人模型调用仍保留后端授权校验，需要原服务和有效账号。

调试窗口可在启动前设置 `$env:DEBUG_WINDOW="1"`，此模式会关闭窗口内容保护，仅用于开发。正常启动保留原版透明置顶、穿透、保护读回、令牌握手与浮层保护流程。

## 源码位置

| 目录 | 内容 |
| --- | --- |
| `src/main/security/`、`windows/` | 原生内容保护、窗口尺寸和 reveal 协议辅助模块 |
| `src/main/capture/` | 多屏选择、捕获调度、可见性租约、滚动截图 |
| `src/main/models/` | 参数校验、凭据、SSE、Chat Completions / Responses 适配器 |
| `src/main/store/` | 设置、登录状态、知识库、本地记录 |
| `src/main/ipc/`、`src/shared/` | IPC 权限网关与共用通道 |
| `src/main/index.mjs` | 生命周期、窗口协调、热键和 IPC 业务编排 |
| `src/preload/` | 渲染层 API 桥 |
| `src/renderer/features/`、`stores/`、`services/` | 界面组件、状态、原云端协议与任务链路 |

主进程编排和语音/远控运行时仍有较大模块，保留它们是为了让恢复后的行为能够与原版核对。详细恢复说明与验证边界见 [docs/RECOVERY.md](docs/RECOVERY.md)，接口索引见 [docs/BACKEND.md](docs/BACKEND.md)。

## 已完成的验证

- 21 项测试通过：截图轮转与清理、滚动安全门、流式解析与取消、记录重开、账号隔离、凭据和更新完整性。
- Windows Electron 实际启动，通过本地模拟登录进入工作台，并验证设置、知识库、模型凭据、窗口切换令牌和快捷键浮层。
- 在当前 Windows 环境中，主窗与浮层的 `GetWindowDisplayAffinity` 均读回 `17`（exclude）。这不等同于所有会议/录屏软件的兼容验收。
- 2026-10-17（新加坡时间），原后端公开版本接口使用 3.0.1 客户端头返回 HTTP 200，报告最新版本 3.0.2、`forceUpdate: false`。

真实账号登录、付费配额、云端 ASR/回答、手机配对与远控、macOS 窗口行为尚未端到端验证。服务端源码不在本工程内。

## 更新行为

原版的“仅校验文件魔数”下载流程已增加可信 SHA-256 校验。发布前需在 `src/shared/trusted-updates.json` 中维护确切安装包 URL 与摘要；当前没有可核验的发布摘要，因此保留打开官网下载页的回退方式。不会把未经摘要校验的安装包保存为可安装更新。

原始损坏文件备份在 `recovery/`，原依赖保留在 `node_modules.damaged/`；正常构建和运行都不依赖这两个目录。
