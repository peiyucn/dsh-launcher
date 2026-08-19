# DSH Launcher Panel

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-launcher-panel?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher-panel)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-dsh--launcher--panel-blue?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher-panel)
[![License](https://img.shields.io/github/license/peiyucn/dsh-launcher-panel?style=for-the-badge)](https://github.com/peiyucn/dsh-launcher-panel/blob/master/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-launcher-panel)

Start **DeepSeek Harness** (dsh) inside VS Code and open its web UI in the built-in browser.

![DSH Launcher Panel](https://raw.githubusercontent.com/peiyucn/dsh-launcher-panel/dev/resources/dsh-launcher-panel.png)

> This extension does **not** ship an LLM model, DeepSeek Harness itself, or a DeepSeek API key.

## Principles

* **Loose coupling** — the extension only starts dsh through its public entry point (`npx` or a source checkout) and opens the web UI, never depending on dsh internals — so the dsh plugins you configure keep working as-is.
* **Resilient to fast change** — it launches with the official command and reads only stable `~/.dsh` data, so it keeps working across upgrades.

## Features

* **Start / Stop** — runs dsh via `npx` and opens the web UI once it is ready.
* **Source run (optional)** — run from a local checkout: set `dsh.path` to a deepseek-harness git clone. A fresh clone works — on first start the extension offers to run `pnpm install` + build for you.
* **Dashboard panel** — server status, a live console (with clickable log files), the official DeepSeek API status with Peak / Off-peak pricing, and your account balance.
* **DSH Update** — source run only: click the refresh button (⟳) to check for updates; when one is available, an Update button labeled with the new version appears, and clicking it pulls the update.
* **Browser choice** — built-in or system browser.

## Usage

Click the 🐳DSH WebUI whale icon in the activity bar, then click **Start**.

## Settings

Settings → search "dsh":

| Key | Default | Description |
|---|---|---|
| dsh.mode | npx | `npx` runs `npx @deepseek-ai/dsh web`; `source` runs a local checkout via tsx |
| dsh.browser | built-in | `built-in` uses VS Code's Simple Browser; `external` opens the system browser |
| dsh.hideConsole | true | Hide the server console window on Windows |
| dsh.path | empty | Path to a deepseek-harness git clone for source mode (first start offers to build it) |
| dsh.nodePath | empty | Path to node.exe; empty uses the node on PATH |
| dsh.port | 3080 | Web UI port |
| dsh.sourceDebug | false | Print module-loading progress in source mode (NODE_DEBUG=module, very verbose; console shows a periodic count, full detail in the server log) |
| dsh.clearServerLogOnStart | true | Clear the server log file at the start of each launch so it only contains the current run |

## Notes

* Start/stop is idempotent: it probes the port first and does not start twice.
* Closing VS Code does not stop the server; stop it from the panel or command palette.
* The **API Status** card supports DeepSeek only for now — it only shows when a DeepSeek model is configured in dsh.
* Log files: `%TEMP%\dsh-launcher-panel\client.log` (launcher activity) and `%TEMP%\dsh-launcher-panel\server.log` (server output); both are clickable in the panel.
* DSH cannot run "minimal mode" properly on Windows for now.

## Environment

* **Node.js** — 22.19+ (or >= 24)
* **VS Code** — 1.85+
* **PowerShell 7** — optional; recommended on Windows

## License

MIT
