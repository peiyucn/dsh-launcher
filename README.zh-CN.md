# DSH Launcher

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-launcher?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-dsh--launcher-blue?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher)
[![License](https://img.shields.io/github/license/peiyucn/dsh-launcher?style=for-the-badge)](https://github.com/peiyucn/dsh-launcher/blob/master/LICENSE)

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-launcher)

在 VS Code 内启动 **DeepSeek Harness**（dsh），并在内置浏览器中打开它的 Web UI。

> 本扩展**不**附带任何 LLM 模型、DeepSeek Harness 本身，或 DeepSeek API Key。它只负责启动你已经装好的 dsh 并打开它的 Web UI。请先阅读[前置条件](#前置条件)。

## 功能

* **启动 / 停止** — 自动检测 dsh（npx 或 git 克隆），启动它，并在就绪后打开 Web UI。
* **仪表盘面板** — 服务状态、实时控制台、DeepSeek 官方 API 状态，以及你的账户余额。
* **DSH 更新** — 源码检出时执行 `git pull`；npx 方式无需手动更新。
* **浏览器选择** — 用 VS Code 内置浏览器或系统浏览器打开 UI。
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

### DeepSeek Harness（DSH）

两种方式任选其一。

#### 通过 npm 运行

先安装 Node.js，然后运行：

```sh
npx @deepseek-ai/dsh web
```

这会启动 Web UI，默认服务在 `http://127.0.0.1:3080`。参见 [Web UI 指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md)。

#### 从源码运行

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

从源码检出运行时，把 `dsh.path` 设为检出目录（或通过 source 模式的文件夹选择器选择）。如果检出尚未初始化，扩展会提供一键 `pnpm install` + `pnpm run build`。

## 使用方法

1. 安装扩展并重载窗口。
2. 点击活动栏的鲸鱼图标。
3. 点击 **Start** — 如有需要会先启动 dsh，然后打开 UI。

状态圆点：绿色 = 运行中 / 红色 = 已停止 / 黄色闪烁 = 启动中。

## 设置

设置 → 搜索 "dsh"：

| 键 | 默认值 | 说明 |
|---|---|---|
| dsh.mode | auto | auto = 优先源码检出，其次 npx；npm = 强制 `npx @deepseek-ai/dsh web`；source = 强制通过 tsx 运行 git 克隆 |
| dsh.browser | built-in | built-in 或 external |
| dsh.hideConsole | true | 在 Windows 上隐藏控制台 |
| dsh.path | 空 | 源码检出路径（必须包含 apps/cli/src/bin.ts） |
| dsh.nodePath | 空 | node.exe 路径；留空则使用 PATH 上的 node |
| dsh.port | 3080 | Web UI 端口 |
| dsh.host | 127.0.0.1 | Web UI 监听地址 |

## 命令

* DSH Launcher: Start
* DSH Launcher: Stop service
* DSH Launcher: DSH Update

## 说明

* 启动/停止是幂等的：会先探测端口，不会重复启动。
* 关闭 VS Code 不会停止服务；请从面板或命令面板停止。
* 日志文件：`%APPDATA%\Code\User\globalStorage\peiyucn.dsh-launcher\dsh.log`

## License

MIT
