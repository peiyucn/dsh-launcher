# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-08-16

- Initial release: start DeepSeek Harness (dsh) from VS Code and open its web UI.
- Dashboard panel with live server status, console log, DeepSeek API status, and account balance.
- npx / source run-mode toggle: asks before restarting a running server, and stays in sync with the dsh.mode / dsh.path settings.
- dsh detection via npx (npm) or a local git clone (source), with one-click checkout setup.
- DSH Update (git pull) for source checkouts.
- Built-in / external browser choice for the web UI.
- Hidden console on Windows to avoid cmd window flashes.
