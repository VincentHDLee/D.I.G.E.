# 2026-11-27 dige：池脉冲电池仿真修复推送 fork / PR #17 + AGENTS.md 补两条

> 状态：草案，待拍板（A / B / C / O）。拍板前不推送、不改 AGENTS.md。

## 0. 项目定调
求解器的底线是「算出来的解在游戏里真能跑」，这次是正确性 bug → 主属性 **高可用 > 高性能 > 高并发**。

## 1. 现状（只读核实，2026-11-27 10:58）
- 本地 `main = a2d940a`；`fork/main = fork/feature/input-rate-limiter = 251065f`，两者都是 `a2d940a` 的祖先 → **两处都能快进，不需要 force push**，只多 1 个提交。
- PR #17：`VincentHDLee:feature/input-rate-limiter → djkcyl:main`，upstream 未合并。
- 本地 `feature/input-rate-limiter` 分支是旧的（`c9d05be`，相对 fork 落后 13、领先 1，那条 docs 提交已被 `1c73341` 取代）→ **不推这个本地分支**，用 refspec 直接把 `a2d940a` 推到远端分支名。
- `gh` 未登录、GitHub API 匿名限流 → PR 评论无法代发，只能核对远端 sha + PR 网页。

## 2. 待推送提交 a2d940a（12 文件 +254 −148）
链条：项目 `dige` —— 模块 求解器 —— 包 —— 类 —— 方法

| 包 | 类 / 文件 | 方法 / 内容 |
|---|---|---|
| `src/utils` | `FactoryDesigner` | `_simulate()` 用原始目标；`_applyPoolSimulation()` 满速带→恒定供给、零头→脉冲分支（燃料额定功率、周期 2D）；`runOscillationPipelines()` 纯常驻+池也仿真；删 `_poolCyclePeriod()`、删合成曲线兜底 |
| `src/utils` | `failureDiagnose` | `diagnoseNoSolution()` 新增场景 C「池零头间歇供电」 |
| `src/components/solution` | `SolutionList` | 1 行（诊断文案接入） |
| `src/i18n` | `locales.*.json` ×8 | 新 key `diagPoolBatteryDrain` |
| `scripts` | `selftest-osc-scenarios.mjs` | 场景 2 断言组成 + 5% 底线；场景 3 锁 5965W + 0.5/分 断电案例 |

需知情：场景 2「组成之和 = 平均功率」容差从 1W 放宽到 60W（逐秒仿真整秒对齐燃烧窗口的离散误差，实测差 28W）。

## 3. AGENTS.md 补两条（落点：顶层 `D:\SoftwareDevelopCase\AGENTS.md`，跨项目通用）
1. 「一、沟通与汇报」追加：
   > 拍板后分步执行、每步汇报，不一股脑跑完；汇报定位精确到「项目 —— 模块 —— 包 —— 类 —— 方法」链条中的**包**（例：`dige —— 求解器 —— src/utils —— FactoryDesigner —— _simulate`）。
2. 「六、自动化红线」追加：
   > cmd / PowerShell 一律静默：不弹前台窗口、不抢鼠标焦点。子进程用 `Start-Process -WindowStyle Hidden` 或 `-NoNewWindow`；git 推送前设 `GIT_TERMINAL_PROMPT=0`、`GCM_INTERACTIVE=never`，凭据缺失直接失败并汇报，不弹登录框；不用 `start` / `explorer` / `Invoke-Item` 打开东西。

## 4. 方案 A（推荐）：快进推送 fork/main + PR #17
1. 改 AGENTS.md（上面两条）→ 报告 diff。
2. 静默推送：
```powershell
$env:GIT_TERMINAL_PROMPT='0'; $env:GCM_INTERACTIVE='never'
git -c http.sslBackend=openssl push fork main
git -c http.sslBackend=openssl push fork a2d940a:refs/heads/feature/input-rate-limiter
```
3. 验收：`git ls-remote --heads fork` 两个分支都 = `a2d940a`；PR #17 commits 页出现该提交。
4. 本地 `feature/input-rate-limiter` 指针跟上：`git branch -f feature/input-rate-limiter a2d940a`（只动本地）。

回滚：`git push fork 251065f:main --force-with-lease=main:a2d940a`（PR 分支同理）。

## 5. 方案 B：PR #17 之上叠一个独立修复 PR
新分支 `fix/solver-pool-battery-sim` = `a2d940a`，推 fork 后开新 PR（需你在网页上开，gh 未登录），描述写明依赖 #17。

## 6. 方案 C：只推 fork/main，PR #17 暂不追加
等 upstream 维护者对 #17 有回复后再追加。
