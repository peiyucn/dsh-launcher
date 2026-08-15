# DSH Launcher

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-launcher?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-dsh--launcher-blue?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher)
[![License](https://img.shields.io/github/license/peiyucn/dsh-launcher?style=for-the-badge)](https://github.com/peiyucn/dsh-launcher/blob/master/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-launcher)

Start **DeepSeek Harness** (dsh) inside VS Code and open its web UI in the built-in browser.

> This extension does **not** ship an LLM model, DeepSeek Harness itself, or a DeepSeek API key. It only starts a dsh you already have and opens its web UI. See [Prerequisites](#prerequisites).

## Features

* **Start / Stop** — runs dsh via `npx` and opens the web UI once it is up.
* **Dashboard panel** — server status, a live console, and the official DeepSeek API status with your account balance.
* **DSH Update** — `git pull` for a source checkout.
* **Browser choice** — built-in or system browser.
* **No console flash** on Windows (hidden console).

## Prerequisites

These are your responsibility — the extension will not install them.

### DeepSeek API key

<https://platform.deepseek.com> (the web UI needs it to run agents)

### Node.js

22.19+ (or >= 24): <https://nodejs.org>

```sh
# Windows
winget install OpenJS.NodeJS.LTS

# macOS
brew install node
```

### Source-run mode (optional)

By default the extension runs dsh via `npx @deepseek-ai/dsh web` — no dsh install needed. To run from a local checkout instead, set `dsh.path` to the checkout folder (must contain `apps/cli/src/bin.ts`), or pick it with the source-mode folder picker.

## Usage

Click the DSH Launcher icon in the activity bar, then click **Start**.

<img src="resources/icon.png" width="40" alt="DSH Launcher activity bar icon">

## Settings

Settings → search "dsh":

| Key | Default | Description |
|---|---|---|
| dsh.mode | auto | auto/npm run `npx @deepseek-ai/dsh web`; source runs a local checkout via tsx |
| dsh.browser | built-in | built-in or external |
| dsh.hideConsole | true | Hide the console on Windows |
| dsh.path | empty | Source-checkout path for source mode (must contain apps/cli/src/bin.ts) |
| dsh.nodePath | empty | Path to node.exe; empty uses the node on PATH |
| dsh.port | 3080 | Web UI port |
| dsh.host | 127.0.0.1 | Web UI host |

## Commands

* DSH Launcher: Start
* DSH Launcher: Stop service
* DSH Launcher: DSH Update

## Notes

* Start/stop is idempotent: it probes the port first and does not start twice.
* Closing VS Code does not stop the server; stop it from the panel or command palette.
* The **DeepSeek API Status** card supports DeepSeek only for now — it is hidden unless DeepSeek is configured as a model (or a DeepSeek API key is present).
* Log file: `%APPDATA%\Code\User\globalStorage\peiyucn.dsh-launcher\dsh.log`

## License

MIT
