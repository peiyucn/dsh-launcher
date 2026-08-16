# 项目指令 — dsh-launcher-panel

## 语言

* **始终用简体中文回复**

***

## 项目概况

VS Code 扩展「DSH Launcher Panel」：启动 DeepSeek Harness（dsh），并在 VS Code 内置浏览器中打开它的 Web UI。

* TypeScript 实现，源码在 `src/`；编译产物 `out/` 与打包产物 `*.vsix` 均不入库（见 `.gitignore`）
* 本地验证打包 = `npm run compile` + `npm run package` 全部成功（package 由 `@vscode/vsce` 完成）
* 主要模块：`extension.ts`（激活与状态栏）、`server.ts`（服务生命周期与检测）、`actions.ts`（启动/停止/浏览器）、`panel.ts`（Dashboard webview）、`ds.ts`（DeepSeek 状态与余额）、`common.ts`（常量与工具）

***

## Git 规范

### Commit

* commit 描述用**中文**，类型前缀保留英文：`feat:`、`fix:`、`refactor:`、`chore:`、`docs:` 等
* 例：`feat: source 模式未配置 checkout 时 path 行显示提示`、`fix: 模式切换取消后仍会切换的问题`
* **逐项提交**：每完成一个独立任务**必须**单独 `git commit`，禁止多个任务混在一个 commit
* **诚实原则**：不确定的事直接说"不确定"，禁止编造事实性信息

### Push

* push 前**必须**先验证打包（`npm run compile` + `npm run package`），成功才允许推送
* 推送目标分支：`master`（主分支，也是 CI 触发分支）

### 发布（Tag 触发）

发布走 **git tag** 触发 GitHub Actions 自动发布（见 `.github/workflows/release.yml`），流程：

```
改代码 → commit → 验证打包 → push master → 打 tag → push tag 触发 release
```

**严格顺序：**

1. **确认改动已提交并推送**到 `master`
2. **更新 `package.json` 版本号**（`version` 字段）
3. **更新 `README.md` + `README.zh-CN.md`**：如有功能变更，同步更新文档
4. **再次验证打包**：`npm run compile` + `npm run package`
5. **commit 版本更新**：`docs: 发布 vX.Y.Z` 或 `chore: bump version to X.Y.Z`
6. **push**：`git push origin master`
7. **打 tag 触发发布**：`git tag -a vX.Y.Z -m "vX.Y.Z: <简述>" && git push origin vX.Y.Z`

> tag 推送后 GitHub Actions 自动：打包 VSIX → 发布到 VS Code Marketplace → 创建 GitHub Release 并附上 VSIX。

***

## CI 自动化

| Workflow | 触发 | 作用 |
| :--- | :--- | :--- |
| `.github/workflows/ci.yml` | push / PR 到 `master` | `npm ci` + `tsc` 编译 + 验证 `vsce package` 打包成功 |
| `.github/workflows/release.yml` | 推送 `v*.*.*` tag | 打包 + 发布市场 + GitHub Release |

* 发布需要仓库配置 `VSCE_PAT` Secret（VS Code Marketplace 发布令牌）
* 发布令牌获取：VS Code 市场管理页 → Personal Access Tokens → 创建 `Marketplace: Manage` 权限的 token
