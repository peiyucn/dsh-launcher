# DSH Launcher

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-launcher?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-dsh--launcher-blue?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.dsh-launcher)
[![License](https://img.shields.io/github/license/peiyucn/dsh-launcher?style=for-the-badge)](https://github.com/peiyucn/dsh-launcher/blob/master/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-launcher)

Start **DeepSeek Harness** (dsh) inside VS Code and open its web UI in the built-in browser.

> This extension does **not** ship an LLM model, DeepSeek Harness itself, or a DeepSeek API key. It only starts a dsh you already have and opens its web UI. See [Prerequisites](#prerequisites).

## Features

* **Start / Stop** — detects dsh (npx or a git clone), starts it, and opens the web UI once it is up.
* **Dashboard panel** — server status, a live console, the official DeepSeek API status, and your account balance.
* **DSH Update** — `git pull` for a source checkout; the npx method needs no manual update.
* **Browser choice** — open the UI in VS Code's built-in browser or the system browser.
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

### DeepSeek Harness (DSH)

Either method works.

#### Run from npm

Install Node.js, then run:

```sh
npx @deepseek-ai/dsh web
```

This starts the web UI, served at `http://127.0.0.1:3080` by default. See the [Web UI guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md).

#### Run from source

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

When running from a checkout, set `dsh.path` to the checkout folder (or pick it with the source-mode folder picker). The extension offers a one-click `pnpm install` + `pnpm run build` if the checkout is not set up yet.

## Usage

1. Install the extension and reload the window.
2. Click the whale icon in the activity bar.
3. Click **Start** — it starts dsh if needed, then opens the UI.

Status dot: green = running / red = stopped / yellow pulsing = starting.

## Settings

Settings → search "dsh":

| Key | Default | Description |
|---|---|---|
| dsh.mode | auto | auto = prefer a source checkout, then npx; npm = force `npx @deepseek-ai/dsh web`; source = force a git clone via tsx |
| dsh.browser | built-in | built-in or external |
| dsh.hideConsole | true | Hide the console on Windows |
| dsh.path | empty | Source-checkout path (must contain apps/cli/src/bin.ts) |
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
* Log file: `%APPDATA%\Code\User\globalStorage\peiyucn.dsh-launcher\dsh.log`

## License

MIT
