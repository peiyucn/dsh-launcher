# Changelog

All notable changes to this project will be documented in this file.

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
