# v1.12.0 交接与 Git 管理

规范版本：v1.12.0（社区维护分支；游戏 1.7 口径）

本文给后续维护者 / Agent：仓库状态、分支与推送规则、产品与代码现状、关键接口、已知坑。

## 一、仓库状态

| 项 | 值 |
| --- | --- |
| 工作目录 | `D:\SoftwareDevelopCase\dige` |
| 当前分支 | `main`（跟踪 `origin/main`，本地 ahead 15） |
| `origin`（上游，只读） | `https://github.com/djkcyl/D.I.G.E.` |
| `fork`（本仓库，推送目标） | `https://github.com/VincentHDLee/D.I.G.E.` |
| `package.json` | `dige@1.12.0` |
| 站点 | `https://dige-2st.pages.dev`（Cloudflare Pages，随 `main` 自动部署） |

**推送规则**：只推 `fork`，绝不推 `origin`（上游）。上游 `origin/main` 顶端仍是 `2b454a5`（2026-04-21），此后无提交、issue 无回复。

**本地分支**：

| 分支 | 状态 | 处置 |
| --- | --- | --- |
| `main` | 开发主干 | 保留，部署源 |
| `feature/input-rate-limiter` | 比 main 多 1 个骨干文档提交 | 保留：`docs/upstream-issue-2-loopback.md`（上游 issue #2 回灌/能量泄漏议题的调研与"暂不实现"结论），main 上不复制细节 |
| `chore/dev-selftests-2026-08-17` | 比 main 多 10 个提交、落后 1 | **保留**：含 M1/M2/M3/OOM/limiter 共 12 个归档自测脚本，main 上没有 |

**远端残留**（可删，需 push 授权）：`fork/feat/add-wuling-mid-battery`（已并入上游主线）、`fork/chore/dev-selftests-2026-08-17` 之外的旧分支。

**工作区当前状态**：v1.12.0 的改动**尚未提交**（电池接入、工作台移除、品牌化、文档、lint 治理）。按计划先内测，测通再分组提交。

## 二、v1.12.0 落地内容

| 分类 | 内容 |
| --- | --- |
| 燃料 | 新增 `wulingHigh`（高容武陵电池，6400W / 40s），只能追加在 `FUELS` 末尾；UI 顺序走 `FUEL_DISPLAY_ORDER` |
| 区域规则 | `WULING_BATTERY_FUELS` 增加 `wulingHigh`（谷地不可限速 + 跨区提示） |
| 电网码 | `FUEL_TO_CODE` 增加 `wulingHigh: "WH"` |
| 图标 | `public/fuels/wulingHigh.webp`（由社区提供的 256×256 官方素材缩到 64×64） |
| 移除 | 早期研究用的「分流工作台」（`components/splitter/`、`utils/splitter/`、`Sidebar/` 入口、54 个 `splitter*` i18n key） |
| 品牌 | GitHub 链接全量指向 fork；公告 8 语言插入"社区维护版"说明；README 重写并对比上游；新增 `docs/architecture.md` |
| 站点 | `CANONICAL_WEB_ORIGIN`、`index.html`（canonical/og/hreflang/JSON-LD）、蓝图导出默认网址统一为 `https://dige-2st.pages.dev` |
| 版本 | `factory-designer@1.11.1` → `dige@1.12.0`；changelog 新增 `v1.12.0` 小节（8 语言） |
| 工程 | Biome 配置对齐既有风格 + 修复 lint；新增 CI 工作流（typecheck / lint / 自测 / build） |
| 功率口径 | `MAX_TARGET_POWER` 32767 → **65535**；分享码历史 15 bit 槽保留，超出部分写尾部 `targetPowerWide`（16 bit，可选，老码字节不变） |
| 震荡池基建 | 新增 `src/utils/oscBudget.ts`：设备容量（3/5/1/1，限速器 1，默认整方案 48）、设备上限→最大分母、传送带每 30 分钟吞 1 个的损耗边界、单支区间（口径 B）、瓦数↔投料速率、档位吸附；配套 `scripts/selftest-osc-budget.mjs` |

## 三、任务书 vs 实际落地（v1.11.1 遗留结论，仍然有效）

原任务书是 **4×5** 电网数独。迭代后产品与代码均为 **3×3 九宫格**。

| 维度 | 任务书 (4×5) | 实际 (3×3) |
| --- | --- | --- |
| Y 轴 | 1~4 取货口 | **1~3 路**（`branchCount=0` 映射 row0；`>3` 不入盘） |
| X 轴 | ≤20 / 20–100 / 100–300 / 300–800 / >800 | **≤100 / 100–500 / >500** |
| 废解 | (Y=4, X=5) | **(row=2, col=2) = 3 路 × 千瓦** |
| 搜索窗 | `maxWaste=1000`（或 1200） | 求解器内部 `SEARCH_MAX_WASTE = 1200` |
| 电池底线 | 5% | `MIN_BATTERY_CUTOFF = 5` |
| 内部枚举 | 1~4 路 | 仍 `PARAM_LIMITS.MAX_BRANCHES = 4` |
| 移动端 | Bottom Sheet | 居中 `DecisionMatrixModal` |
| 侧栏 | 去掉三大约束 | `ConstraintsField.tsx` 已删；高级区只留相位差 |

分享码仍锁历史槽位：`maxWaste=1000`、`minBatteryPercent=5`、`maxBranches=4`。求解器**忽略**这些 UI/分享值，改用内部宽窗。

## 四、核心数据流

```text
Sidebar 精简参数
  → App.runCalculation → factoryDesigner.worker
    → FactoryDesigner.solve()
         Track A: autoPlanBasePools=true
         Track B: autoPlanBasePools=false
         merge by _buildOutputSignature
         → buildSudokuDecisionMatrix()
    → { solutions, matrix, defaultSelection }
  → SolutionList
       PC: 左 3×3 + 右 Dashboard；滚过 sentinel 后 38px StickyHud + Popover
       Mobile: 顶栏 StickyHud；点开居中 Modal
```

## 五、关键接口

### 求解器宽窗 + 双轨

`src/utils/FactoryDesigner.ts`

- 构造时忽略外部紧窗：`minBatteryPercent = MIN_BATTERY_CUTOFF(5)`、`maxWaste = SEARCH_MAX_WASTE(1200)`、`maxBranches = 4`。
- `solve()`：先 `autoPlanBasePools=true` 再 `false`，签名去重后 `buildSudokuDecisionMatrix`。
- `_getDirectBaseConfigs`：覆盖硬顶（covering hard-top）即使浪费 > 1200 也发出，供右上角纯常驻格。
- `calculateBasePower()`：核心 200W + 手动常驻行 + 自动补齐（`floor(剩余/主燃料功率)`）。

### 分桶

`src/utils/decisionMatrix.ts`：浪费 5W 容差 → 分流器数 → 分支数 → 副燃料震荡速率 → 方差；右上 (0,2) 纯常驻特权格；右下 (2,2) 永不填。

### 分享码

`src/utils/shareParams.ts`

- 编解码后强制 `maxWaste=1000` / `minBatteryPercent=5` / `maxBranches=4`。
- 字段顺序与 bit 宽度**不可改**，只能末尾追加可选字段（`phaseOffsetBranch4`、`inputRateLimitPerMin`、`excludeItemGateLimiter`、`autoPlanBasePools`、`multiFuelMode`、`factoryRegion`）。
- 燃料用**数组下标**编码：新燃料只能追加到 `FUELS` 末尾，`selftest-grid-code.mjs` 有硬断言。

### 常驻层

- `manualBaseLines`（`{ id, fuelId, count }`）当前**不进分享码、不进存档**，只在内存里；侧栏 `BasePowerBuilder` 编辑。
- `autoPlanBasePools`：`true` 自动补齐、`false` 不补、`undefined` 走旧 floor 语义。

### 主题

`src/utils/useTheme.ts`：`dige_theme`，未手动覆盖时 6:00–18:00 light，否则 dark；切主题必须让 Chart.js 重绘。

## 六、测试与检查

```bash
pnpm run i18n translate                             # 8 语言同步（270 keys）
pnpm run typecheck                                  # 0 错
pnpm run lint                                       # Biome（v1.12.0 起应为 0 错）
pnpm exec tsx scripts/selftest-grid-code.mjs       # 电网码往返 + 燃料下标锚定
pnpm exec tsx scripts/selftest-region-limiter.mjs  # 地区 × 燃料限速矩阵
pnpm exec tsx scripts/selftest-matrix-7665.mjs      # 7665W 九宫格回归
pnpm build                                          # 产物 dist/
```

期望（武陵 + 中容武陵，7665W）：默认格约 **7666.7W / +1.7W / 1 路**；右上 (0,2) **9800W / +2135W / 0 路**；右下 (2,2) 空。

## 七、自测脚本与不入库项

自测统一放在 `scripts/selftest-*.mjs`（v1.12.0 起废掉 `_` 前缀约定，全部入库并由 CI 执行）：

| 脚本 | 覆盖 |
| --- | --- |
| `selftest-grid-code.mjs` | 电网码往返 + 燃料编码下标锚定 |
| `selftest-region-limiter.mjs` | 地区 × 燃料限速矩阵 |
| `selftest-i18n-grid-keys.mjs` | 电网码/公告 i18n key 完整性 |
| `selftest-matrix-7665.mjs` | 7665W 九宫格回归（默认格 / 右上硬顶 / 右下废解） |

| 路径 | 说明 |
| --- | --- |
| `android/` 工程 | 可不提交；CI 在无目录时 `cap add android` |
| `.snow/` | 本地草稿（gitignore） |

## 八、已知坑

1. **`SEARCH_MAX_WASTE`（1200）≠ 分享锁值 `maxWaste`（1000）**。改窗只动 `src/types/matrix.ts`。
2. **`solve()` 返回 `SudokuDecisionMatrix`**，不是数组；旁路脚本必须读 `.solutions` / `.matrix`。
3. 双轨是串行两次 `runOscillationPipelines()`；不要在 4 路全枚举上再叠无剪枝搜索（OOM）。
4. 矩阵格与 `solutions[]` 靠**对象引用**对应；Worker 结构化克隆后不能再次深拷贝。
5. 蓝图导出打印分享锁值，真实浪费看 `solution.waste`。
6. `html.light` / Chart：切主题必须走 `useTheme` 总线并强制 `update`。
7. 高功率燃料（高容武陵 6400W）在「目标落在两台之间」时只能出硬顶解（例：7300W → 2×6400+200 = 13000W），属物理限制，不是 bug。
8. Biome：仓库历史代码是双引号 + 80 列，配置已按此对齐；不要单方面改成单引号，否则全仓 diff 爆炸。

## 九、下一步（讨论中，未开工）

> 本机任务书 `D:\dshStorage\任务书\08-二开收尾-交接与待开发清单.md` 记录了本期全部待办（7a/7b/7c/7d、11/13、17/18、16、19/20、21/22）与验证命令，接手先看那份。

- 用户自定义常驻池：多燃料常驻行 + 每小时投料预算 + 上限约束（对应上游 issue #14 / #16）。
- 用户自定义震荡池：复用震荡枚举，用户指定单一燃料与投料上下限，先算「该燃料能覆盖的震荡缺口区间」再求解（对应上游 issue #13）。
- 上游 issue #2（回灌 1/x 分流 / 能量泄漏）暂不实现，等产品决策。

## 十、相关文档

- [`README.md`](../README.md) — fork 定位、与上游差异、快速开始
- [`docs/architecture.md`](architecture.md) — 模块与求解链路
- [`docs/grid-code.md`](grid-code.md) — DIGE 电网码 B
- [`docs/docker-apk.md`](docker-apk.md) — 容器与 APK
