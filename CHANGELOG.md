# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6]

- Fixed: pnpm-mode starts no longer hang at pnpm's interactive "Choose which packages to build" prompt — the launcher passes `--allow-build=**` (pnpm ≥ 10.9) so native dependency builds are approved non-interactively.
- The pnpm/source mode toggle is now a compact vertical stack instead of a wide horizontal pill.
- Start now pins the resolved channel version into the dlx spec (`pnpm dlx @deepseek-ai/dsh@<version>`), so pnpm installs the latest release instead of silently reusing a stale cached one; when the registry is unreachable it falls back to the best cached version.
- When pnpm is missing, Start now logs it in the console and installs pnpm automatically without prompting (`npm install -g pnpm` in a visible terminal), then continues the start; detection also checks the Windows npm-global and pnpm standalone shim locations.
- Replaced the npx run mode with pnpm: `pnpm` (default) runs `pnpm dlx @deepseek-ai/dsh web`, because npm's peer resolver can hang indefinitely on dsh's dependency graph while pnpm is the tool the dsh repo itself uses. `dsh.mode` is now `pnpm` / `source`, and the panel offers clear guidance when pnpm is missing.
- Fixed: source-mode setup (`pnpm install` + build) now counts as "starting" — the panel shows progress and the Start button stays disabled instead of looking clickable mid-build.
- Fixed: Stop pressed during setup is honoured — no server is started afterwards (with an accurate "Setup interrupted" message).
- Tests are now TypeScript (run via tsx against the source directly); the repository no longer contains JavaScript.

## [0.1.5]

- dsh ≥ rc.8 passes `--no-open`, keeping the panel's `dsh.browser` choice as the only opener (rc.8 opens the system browser on its own).
- Added `dsh.channel` (`latest` / `next`) so npx can follow the prerelease channel — rc.8 is published to `next`; set it to `next` to run rc.8 via npx.
- Update checks report network failures in the console instead of silently showing "no update".

## [0.1.4] - 2026-08-18

- Dashboard: both log files (launcher activity + server output) now appear as masked, clickable paths with their sizes, and the Clear button clears both.
- Added a `debug on/off` pill next to the Console title (source mode only) that toggles `dsh.sourceDebug` (`NODE_DEBUG=module`); module-loading noise is filtered out of the console and shown as a periodic count, with full detail kept in the server log.
- Added `dsh.clearServerLogOnStart` (default on) so each launch starts with a fresh server log instead of accumulating across runs.
- Requirements card now shows Node and DSH only (npm version removed — it always ships with Node).
- DeepSeek API Status card shows a Peak / Off-peak pricing pill (computed in UTC; tooltip shows local times).
- Start waits for the web server to actually serve a page before opening the browser, avoiding a blank tab, and reports how long it took once ready.
- Network-unreachable installs fail fast with a clear message; npx uses `--loglevel=http` so downloads stream into the console.
- Unified all spinners to the same braille dot-matrix style; activity entries are structured (busy flag) instead of string-matching icon characters.
- Log files now live in `%TEMP%\dsh-launcher-panel\` as `client.log` (launcher activity) and `server.log` (server output), keeping the lock-prone server log separate and shortening the paths shown in the panel.
- Panel title is now "🐳DSH WebUI: Dashboard".
- Fixed: the balance query parses `.credentials.yaml` in flow style (`{ KEY: value }`) as well as block style, so it no longer reports "no key" after model settings are re-saved.
- Fixed: Stop now interrupts an in-flight start (it was previously ignored while starting), and stopping kills the whole process tree on Windows so the server cannot restart on its own.
- Added a unit test suite (`npm test`, Node's built-in test runner) covering the path-masking, credential-parsing and status-parsing helpers.

## [0.1.3] - 2026-08-17

- Fixed: the balance query now reads the DeepSeek API key from every location dsh does (env, `.credentials.yaml`, `.env`), so it no longer reports "no key" when dsh is already configured.
- Code cleanup: removed dead code and enabled stricter compiler flags.

## [0.1.2] - 2026-08-17

- Balance button: secondary style and instant feedback (disabled + "querying…" + a console log with the result).
- Removed the unused `dsh.host` setting; the extension always targets 127.0.0.1, where dsh binds.
- Docs: added a panel screenshot and corrected the source-run and update descriptions.

## [0.1.1] - 2026-08-16

- The "Starting…" status now reads "Starting DeepSeek Harness Web UI…".
- Removed pop-up notifications for the DSH Update action; results now appear only in the panel console.
- Improved the extension description and search keywords.

## [0.1.0] - 2026-08-16

- Initial release: start DeepSeek Harness (dsh) from VS Code and open its web UI.
- Dashboard panel with live server status, console log, DeepSeek API status, and account balance.
- npx / source run-mode toggle: asks before restarting a running server, and stays in sync with the dsh.mode / dsh.path settings.
- dsh detection via npx (npm) or a local git clone (source), with one-click checkout setup.
- DSH Update (git pull) for source checkouts.
- Built-in / external browser choice for the web UI.
- Hidden console on Windows to avoid cmd window flashes.
