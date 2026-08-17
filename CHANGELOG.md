# Changelog

All notable changes to this project will be documented in this file.

## [0.1.4] - 2026-08-18

- Fixed: the balance query now parses `.credentials.yaml` in flow style (`{ KEY: value }`) as well as block style, so it no longer reports "no key" after model settings are re-saved.
- Added npm to the Requirements card (version + availability), with a bounded probe so a hung npm can't freeze the panel.
- Start no longer gives up after a fixed timeout: it waits indefinitely, and when npx installs a new/first dsh version the console announces the version number and warns that the first start takes longer.

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
