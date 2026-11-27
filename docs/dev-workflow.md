# 开发与上游同步流程（fork → upstream-pr → PR）

> 记录日期：2026-11-27｜适用：本 fork 全部后续开发轮次｜状态：**现行有效**
> 依据：2026-11-27 本地演练——从 `main`（`eb0fad0`）重新过滤 `docs/`，得到的提交与 `fork/upstream-pr` 完全相同（`7983227`），证明过滤结果可复现。
> 纯流程文档，不单独递增四位版本（见 [VERSIONING.md](dev-history/VERSIONING.md) 第二节第 5 条）。

## 一、远端与分支

| 名称 | 指向 | 用途 |
| --- | --- | --- |
| `origin` | `https://github.com/djkcyl/D.I.G.E.` | 上游，只读；基线 `origin/main` |
| `fork` | `https://github.com/VincentHDLee/D.I.G.E.` | 本项目，开发与部署 |
| `main`（本地 / `fork/main`） | 开发主干 + Cloudflare Pages 部署源 | **含 `docs/`**；所有开发都先落在这里 |
| `upstream-pr`（本地 / `fork/upstream-pr`） | 上游 PR 的源分支 | 由 `main` 机械过滤掉 `docs/` 生成，**禁止手工提交** |
| `archive/*` tag | 历史分支归档 | `feature-input-rate-limiter`（原 PR #17）、`chore-dev-selftests-2026-08-17` 等，只读 |

当前上游 PR：[#18](https://github.com/djkcyl/D.I.G.E./pull/18)（`VincentHDLee:upstream-pr` → `djkcyl:main`）。#17 已关闭，源分支归档为 tag。

`docs/`（含 `dev-history/`）**只在 fork `main` 维护，不发给上游**；README、代码、`scripts/`、CI 随 PR 走。README 等随 PR 的文件不得链接到 `docs/` 内文件（上游没有这些路径）。

## 二、一轮开发的完整步骤

### 1. 方案与批准（在 `main`）

1. 在 `docs/dev-history/` 新建 `YYYY-MM-DD_主题.md`，头部写记录日期、四位版本、状态 `待审批`、代码基线；在 [索引](dev-history/README.md) 登记。
2. 用户批准后状态改为 `已批准·执行中`，再动代码。待议文档不是开工授权。

### 2. 编码与本地验收（在 `main`）

1. 按 `CLAUDE.md`：i18n 只用 `pnpm run i18n translate add …`，8 语言齐全；changelog 追加到当前小版本小节。
2. 新断言 / 新自测脚本必须接入 `.github/workflows/ci.yml`。
3. 本地跑一遍与 CI 相同的检查（typecheck / lint / 自测 / build，命令以 `ci.yml` 为准）以及 `pnpm run i18n translate`，全部通过才提交。
4. 提交用 Conventional Commits（英文小写）。**代码改动和 `docs/` 改动尽量分开提交**：纯 docs 的提交会在过滤时被整条剔除，混合提交则只保留代码部分，但提交说明原样带到上游。

### 3. 收口并推 fork `main`

1. 把结果摘要、验收命令、交付 commit、`已验收` 状态写回任务文档并更新索引（单独一个 `docs:` 提交）。
2. `git push fork main`，确认 fork 上 CI（`push: main` 触发）通过、Pages 部署正常。
3. **已推送的 `main` 历史不再 rebase / amend / squash。** 否则重新过滤出来的提交 SHA 会变，`upstream-pr` 只能强推，PR 里的评审上下文也会断。

### 4. 生成 `upstream-pr`（过滤 `docs/`）

在仓库根目录（PowerShell）执行。Windows 上过滤 40 个提交约需 4 分钟，建议放到后台跑：

```powershell
git fetch origin --prune; git fetch fork --prune
if (git status --porcelain) { throw 'worktree not clean' }

git branch -f _upr main
$env:FILTER_BRANCH_SQUELCH_WARNING = '1'
git filter-branch -f --index-filter "git rm -r -q --cached --ignore-unmatch docs" --prune-empty -- origin/main.._upr

# 校验 1：不含 docs/
(git ls-tree -r --name-only _upr -- docs | Measure-Object).Count   # 必须为 0
# 校验 2：与 main 的差异只有 docs/
git diff --stat main _upr -- . ':(exclude)docs'                    # 必须为空
# 校验 3：是否只在旧 upstream-pr 之上追加
git merge-base --is-ancestor fork/upstream-pr _upr; $LASTEXITCODE    # 0 = 可快进
```

过滤范围固定为 `origin/main.._upr`：只改写上游没有的提交，上游基线以下的历史不动。同样的输入总会得到同样的 SHA，所以只要 `main` 只是往后追加，新结果一定是旧 `upstream-pr` 的后代。

### 5. 推送 `upstream-pr`

```powershell
# 校验 3 为 0（常规情况）：普通推送，不强推
git push fork _upr:upstream-pr

# 校验 3 非 0（main 历史被改写，或上游 main 前进后 main 做了 rebase）：带租约强推
$old = git rev-parse fork/upstream-pr
git push --force-with-lease=upstream-pr:$old fork _upr:upstream-pr

# 收尾：同步本地分支、清理临时引用
git branch -f upstream-pr _upr
git update-ref -d refs/original/refs/heads/_upr
git branch -D _upr
```

### 6. 上游 PR

- **已有 PR 打开时（当前为 #18）**：推送 `upstream-pr` 后 PR 自动更新，不需要新开。功能范围有变化时同步改 PR 描述：`gh pr edit 18 --repo djkcyl/D.I.G.E. --body-file <文件>`。
- **没有打开的 PR 时**：

  ```powershell
  gh pr create --repo djkcyl/D.I.G.E. --base main --head VincentHDLee:upstream-pr --title "<标题>" --body-file <文件>
  ```

- PR 描述面向上游维护者：写用户可见的变化、兼容性（分享码 / 电网码是否保持向后兼容）和验收方式，不引用 `docs/` 路径。
- 推送后用 `gh pr checks <号> --repo djkcyl/D.I.G.E.` 查看 CI。显示 `no checks reported` 时，通常是上游需要批准来自 fork 的工作流运行，不代表失败。

## 三、特殊情况

| 情况 | 处理 |
| --- | --- |
| 上游 `origin/main` 前进（合并了 PR 或有新提交） | 先在 `main` 上同步上游（merge `origin/main` 优先，保留已推送历史）；再按第四步重新过滤。若选择 rebase，第五步必须走带租约强推，并在 PR 中说明 |
| 上游合并了 #18 | 以合并后的 `origin/main` 为新基线；下一轮 `origin/main.._upr` 只剩新提交。旧 PR 关闭后按第六步新开 |
| 某个提交只改 `docs/` | 过滤时整条消失（`--prune-empty`），属于预期行为。因此 `main` 领先 `origin/main` 的提交数会多于 `upstream-pr` |
| 误在 `upstream-pr` 上手工提交 | 不要推送；按第四步从 `main` 重新生成并覆盖本地分支 |
| 过滤结果里出现 `docs/` 文件 | 停止推送，检查是否有提交把 `docs` 改成其他大小写或路径 |

## 四、一页速查

```text
方案(dev-history, 待审批) → 批准 → main 编码 → 本地全检查 → 提交 → 写回验收 → push fork main
→ 过滤 origin/main..main 去 docs/ → 三项校验 → push fork upstream-pr（常规快进）→ PR 自动更新 / 新开 PR
```
