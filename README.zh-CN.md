# DSH Launcher

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-launcher?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-dsh--launcher-blue?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher)
[![License](https://img.shields.io/github/license/peiyucn/dsh-launcher?style=for-the-badge)](https://github.com/peiyucn/dsh-launcher/blob/master/LICENSE)

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-launcher)

在 VS Code 内启动 **DeepSeek Harness**（dsh），并在内置浏览器中打开它的 Web UI。

> 本扩展**不**附带任何 LLM 模型、DeepSeek Harness 本身，或 DeepSeek API Key。请先阅读[前置条件](#前置条件)。

## 功能

* **启动 / 停止** — 通过 `npx` 运行 dsh，并在就绪后打开 Web UI。
* **仪表盘面板** — 服务状态、实时控制台、DeepSeek 官方 API 状态以及你的账户余额。
* **DSH 更新** — 源码检出时执行 `git pull`。
* **浏览器选择** — 内置浏览器或系统浏览器。
* **Windows 下无控制台闪烁**（隐藏控制台）。

## 前置条件

这些由你自行准备 — 扩展不会替你安装。

### DeepSeek API Key

<https://platform.deepseek.com>（运行 agent 时 Web UI 需要它）

### Node.js

22.19+（或 >= 24）：<https://nodejs.org>

```sh
# Windows
winget install OpenJS.NodeJS.LTS

# macOS
brew install node
```

### 源码运行模式（可选）

默认情况下扩展通过 `npx @deepseek-ai/dsh web` 运行 dsh — 无需单独安装 dsh。如果想改为从本地仓库检出运行，请把 `dsh.path` 设为检出目录（需包含 `apps/cli/src/bin.ts`），或通过 source 模式的文件夹选择器选择。

## 使用方法

点击活动栏中的 DSH Launcher 图标，然后点击 **Start**。

<img src="resources/icon.png" width="40" alt="DSH Launcher activity bar icon">

## 设置

设置 → 搜索 "dsh"：

| 键 | 默认值 | 说明 |
|---|---|---|
| dsh.mode | auto | auto/npm 运行 `npx @deepseek-ai/dsh web`；source 通过 tsx 运行本地检出 |
| dsh.browser | built-in | built-in 或 external |
| dsh.hideConsole | true | 在 Windows 上隐藏控制台 |
| dsh.path | 空 | source 模式的源码检出路径（必须包含 apps/cli/src/bin.ts） |
| dsh.nodePath | 空 | node.exe 路径；留空则使用 PATH 上的 node |
| dsh.port | 3080 | Web UI 端口 |
| dsh.host | 127.0.0.1 | Web UI 监听地址 |

## 说明

* 启动/停止是幂等的：会先探测端口，不会重复启动。
* 关闭 VS Code 不会停止服务；请从面板或命令面板停止。
* **DeepSeek API Status** 卡片目前仅支持 DeepSeek — 只有在配置了 DeepSeek 模型（或存在 DeepSeek API Key）时才会显示。
* 日志文件：`%APPDATA%\Code\User\globalStorage\peiyucn.dsh-launcher\dsh.log`

## License

MIT
