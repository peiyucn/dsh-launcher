# 项目指令 — dsh-launcher-panel

## 语言

* **始终用简体中文回复**

***

## 项目概况

VS Code 扩展「DSH Launcher Panel」：启动 DeepSeek Harness（dsh），并在 VS Code 内置浏览器中打开它的 Web UI。

* TypeScript 实现，源码在 `src/`；编译产物 `out/` 与打包产物 `*.vsix` 均不入库（见 `.gitignore`）
* 本地验证 = `npm run verify`（编译 + 测试 + 打包）全部成功，打包由 `@vscode/vsce` 完成
* 测试：`npm test`（tsx 直跑 Node 内置 test runner），用例在 `test/*.test.ts`，覆盖不依赖 vscode 的纯逻辑模块（`common`、`ds`）；依赖 `vscode` 的链路暂由集成测试覆盖（后续版本）
* 主要模块：`extension.ts`（激活与状态栏）、`server.ts`（服务生命周期与检测）、`actions.ts`（启动/停止/浏览器）、`panel.ts`（Dashboard webview）、`ds.ts`（DeepSeek 状态与余额）、`common.ts`（常量与工具）

***

## Git 规范

### Commit

* commit 描述用**中文**，类型前缀保留英文：`feat:`、`fix:`、`refactor:`、`chore:`、`docs:` 等
* 例：`feat: source 模式未配置 checkout 时 path 行显示提示`、`fix: 模式切换取消后仍会切换的问题`
* **逐项提交**：每完成一个独立任务**必须**单独 `git commit`，禁止多个任务混在一个 commit
* **诚实原则**：不确定的事直接说"不确定"，禁止编造事实性信息

### 分支

* **日常开发一律在 `dev` 分支**（仓库默认分支）
* `master` 只接受发布合并，不直接在上面开发

### Push

* push 前**必须**先跑 `npm run verify`（测试 + 打包），成功才允许推送
* 日常推送目标：`dev`

### 发布前全面检查

发布前（或用户要求全面检查时）按以下清单逐项过一遍：

* **文档对齐**：README（中英）Settings 表与 `package.json` 的 `contributes.configuration` 一一对应；文件路径、日志文件、行为描述与当前实现一致；CHANGELOG 当前版本条目覆盖本版本全部用户可感知改动
* **死代码**：grep 每个导出符号与常量，确认有调用方；删除未使用的 import/导出/变量
* **职责与封装**：模块/函数单一职责（生命周期、检测、UI、状态各归其位）；可变状态经函数封装，不散落裸全局；命名表达意图（动作动词开头、is/has 表布尔、类型/接口名清晰）；同类代码结构对称一致
* **魔法数字**：有语义的数字（超时/轮询间隔/阈值/步长/缓存时长）一律用命名常量（`*_MS` 等），不散落裸数字；字面量只在无复用语义的场合出现
* **资源清理**：定时器/AbortController/句柄在异常路径同样释放（finally）
* **鲁棒性**：外部调用（子进程/网络/文件）有超时或 best-effort 错误处理，失败不挂死、不崩；解析/格式化函数对异常输入（空、malformed、缺失字段）返回安全默认值、不抛；失败路径给用户可见反馈，不静默
* **并发与防御**：每个 UI 入口连点有防护（锁/debounce/disabled/幂等）；Start/Stop/切模式的竞态可被用户打断且状态一致；Windows 杀进程用 `taskkill /T`，不留孤儿 server
* **测试**：纯逻辑改动补 `test/*.test.ts` 用例（尤其回归点）；新增可测纯函数需 export
* **验证**：`npm run verify` 通过，`git diff --check` 无空白错误

### 发布（Tag 触发）

发布走 **git tag** 触发 GitHub Actions 自动发布（见 `.github/workflows/release.yml`），流程：

```
改代码 → commit → 验证（测试 + 打包）→ push dev → 合并 dev 到 master → push master → 打 tag → push tag 触发 release
```

**严格顺序：**

1. **确认改动已提交并推送**到 `dev`
2. **更新 `package.json` 版本号**（`version` 字段）
3. **更新 `README.md` + `README.zh-CN.md`**：如有功能变更，同步更新文档
4. **再次验证**：`npm run verify`（测试 + 打包）
5. **合并到 master**：`git checkout master && git merge dev`，提交版本更新：`docs: 发布 vX.Y.Z` 或 `chore: bump version to X.Y.Z`
6. **push**：`git push origin master`
7. **打 tag 触发发布**：`git tag -a vX.Y.Z -m "vX.Y.Z: <简述>" && git push origin vX.Y.Z`
8. **切回 dev 继续开发**：`git checkout dev`

> tag 推送后 GitHub Actions 自动：打包 VSIX → 发布到 VS Code Marketplace → 创建 GitHub Release 并附上 VSIX。

***

## CI 自动化

| Workflow | 触发 | 作用 |
| :--- | :--- | :--- |
| `.github/workflows/ci.yml` | push / PR 到 `master`、`dev` | `npm ci` + 测试（`npm test`，含 tsc 编译）+ 验证 `vsce package` 打包成功 |
| `.github/workflows/release.yml` | 推送 `v*.*.*` tag | 打包 + 发布市场 + GitHub Release |

* 发布需要仓库配置 `VSCE_PAT` Secret（VS Code Marketplace 发布令牌）
* 发布令牌获取：VS Code 市场管理页 → Personal Access Tokens → 创建 `Marketplace: Manage` 权限的 token
