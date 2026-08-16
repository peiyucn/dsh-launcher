# DSH Launcher Panel

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-launcher-panel?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher-panel)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-dsh--launcher--panel-blue?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher-panel)
[![License](https://img.shields.io/github/license/peiyucn/dsh-launcher-panel?style=for-the-badge)](https://github.com/peiyucn/dsh-launcher-panel/blob/master/LICENSE)

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-launcher-panel)

在 VS Code 内启动 **DeepSeek Harness**（dsh），并在内置浏览器中打开它的 Web UI。

> 本扩展**不**附带任何 LLM 模型、DeepSeek Harness 本身，或 DeepSeek API Key。

## 设计原则

* **松耦合** — 扩展只通过它的公开入口（`npx` 或源码检出）启动它并打开 Web UI，不依赖 dsh 的内部实现——所以你配的 dsh 插件照常生效。
* **适应快速变化** — 用官方命令启动、只读稳定的 `~/.dsh` 数据，升级后也能继续工作。

## 功能

* **启动 / 停止** — 通过 `npx` 运行 dsh，并在就绪后打开 Web UI。
* **源码运行（可选）** — 从本地仓库检出运行：把 `dsh.path` 设为检出目录（需包含 `apps/cli/src/bin.ts`）。
* **仪表盘面板** — 服务状态、实时控制台、DeepSeek 官方 API 状态以及你的账户余额。
* **DSH 更新** — 仅源码运行：点击 Update 按钮检查上游，发现新提交时拉取。
* **浏览器选择** — 内置浏览器或系统浏览器。

## 使用方法

点击活动栏中的 DSH Launcher Panel 小鲸鱼图标，然后点击 **Start**。

## 设置

设置 → 搜索 "dsh"：

| 键               | 默认值       | 说明                                                          |
| --------------- | --------- | ----------------------------------------------------------- |
| dsh.browser     | built-in  | built-in 或 external                                         |
| dsh.hideConsole | true      | 在 Windows 上隐藏控制台                                            |
| dsh.path        | 空         | source 模式的源码检出路径（必须包含 apps/cli/src/bin.ts）                  |
| dsh.nodePath    | 空         | node.exe 路径；留空则使用 PATH 上的 node                              |
| dsh.port        | 3080      | Web UI 端口                                                   |
| dsh.host        | 127.0.0.1 | Web UI 监听地址                                                 |

## 说明

* 启动/停止是幂等的：会先探测端口，不会重复启动。
* 关闭 VS Code 不会停止服务；请从面板或命令面板停止。
* **API Status** 卡片目前仅支持 DeepSeek — 只有在dsh里配置了 DeepSeek 模型时才会显示。
* 日志文件：`%TEMP%\dsh-launcher-panel.log`
* DSH在Windows下暂无法正常运行“极简模式”。

## 环境

* **Node.js** — 22.19+（或 >= 24）
* **VS Code** — 1.85+
* **PowerShell 7** — 可选；Windows 下推荐安装

## License

MIT
