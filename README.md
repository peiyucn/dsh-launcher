# DSH Launcher

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-launcher?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher-vscode)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-dsh--launcher--vscode-blue?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher-vscode)
[![License](https://img.shields.io/github/license/peiyucn/dsh-launcher?style=for-the-badge)](https://github.com/peiyucn/dsh-launcher/blob/master/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-launcher)

Start **DeepSeek Harness** (dsh) inside VS Code and open its web UI in the built-in browser.

> This extension does **not** ship an LLM model, DeepSeek Harness itself, or a DeepSeek API key. See [Prerequisites](#prerequisites).

## Principles

* **Loose coupling** — dsh is treated as a black box: the extension starts it through its public entry point (`npx` or a source checkout) and opens the web UI, never depending on dsh internals.
* **Resilient to fast change** — dsh moves quickly; by launching it with official commands and reading only stable `~/.dsh` data, the extension keeps working across upgrades.
* **Native Windows** — runs on plain Windows with Node.js + npm; no WSL or extra Linux tooling required.

## Features

* **Start / Stop** — runs dsh via `npx` and opens the web UI once it is up.
* **Source run (optional)** — run from a local checkout: set `dsh.path` to the checkout folder (must contain `apps/cli/src/bin.ts`).
* **Dashboard panel** — server status, a live console, and the official DeepSeek API status with your account balance.
* **DSH Update** — source-run only: an Update button checks the upstream and pulls when newer commits are found.
* **Browser choice** — built-in or system browser.
* **No console flash** on Windows (hidden console).

## Prerequisites

### DeepSeek API key

<https://platform.deepseek.com> (the web UI needs it to run agents)

## Usage

Click the DSH Launcher icon in the activity bar, then click **Start**.

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

## Notes

* Start/stop is idempotent: it probes the port first and does not start twice.
* Closing VS Code does not stop the server; stop it from the panel or command palette.
* The **API Status** card supports DeepSeek only for now — it is hidden unless a DeepSeek model is configured in dsh.
* Log file: `%APPDATA%\Code\User\globalStorage\peiyucn.dsh-launcher-vscode\dsh.log`

## Environment

* **Node.js** — 22.19+ (or >= 24)
* **VS Code** — 1.85+

## License

MIT
