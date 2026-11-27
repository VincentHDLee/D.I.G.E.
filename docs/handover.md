# v1.12.0 维护交接

应用规范版本：v1.12.0（社区维护分支；游戏 1.7 口径）
本轮开发文档：v1.12.0.1｜日期：2026-11-27｜[版本规则](dev-history/VERSIONING.md)（不自动改包版本）

本文给后续维护者：产品与代码现状、关键接口、设计取舍与已知坑。

## 一、仓库状态

| 项 | 值 |
| --- | --- |
| 上游仓库 | `https://github.com/djkcyl/D.I.G.E.`（基线 `2b454a5`，游戏 1.5 之前的口径） |
| 本项目 | `https://github.com/VincentHDLee/D.I.G.E.` |
| `package.json` | `dige@1.12.0` |
| 演示站 | Cloudflare Pages 静态部署，构建命令 `pnpm build`，产物 `dist` |

分支：

| 分支 | 用途 |
| --- | --- |
| `main` | 开发主干，也是部署源 |
| `upstream-pr` | 上游 [PR #18](https://github.com/djkcyl/D.I.G.E./pull/18) 的源分支：由 `main` 过滤掉 `docs/` 机械生成，**只带代码、README、CI，不带 `docs/`，禁止手工提交** |
| `archive/*`（tag） | 历史分支归档：`feature-input-rate-limiter`（原 PR #17，已关闭）、`chore-dev-selftests-2026-08-17`（M1/M2/M3/OOM/limiter 时期自测脚本）等 |

> `docs/`（含 dev-history）只在本 fork `main` 维护，不随 PR 发给上游。从方案、开发、推 `main` 到过滤生成 `upstream-pr` 与提 PR 的完整步骤见[开发与上游同步流程](dev-workflow.md)。

## 二、v1.12.0 落地内容

| 分类 | 内容 |
| --- | --- |
| 燃料 | 新增 `wulingHigh`（高容武陵电池，6400W / 40s），只能追加在 `FUELS` 末尾；UI 顺序走 `FUEL_DISPLAY_ORDER` |
| 区域规则 | `WULING_BATTERY_FUELS` 增加 `wulingHigh`（谷地不可限速 + 跨区提示） |
| 电网码 | `FUEL_TO_CODE` 增加 `wulingHigh: "WH"` |
| 图标 | `public/fuels/wulingHigh.webp`（由社区提供的 256×256 官方素材缩到 64×64） |
| 移除 | 早期研究用的「分流工作台」（`components/splitter/`、`utils/splitter/`、`Sidebar/` 入口、54 个 `splitter*` i18n key） |
| 站点配置 | GitHub / Issues / 群 / 教程 / 域名集中到 `src/config/site.ts`；README 重写为功能说明；新增 `docs/architecture.md` |
| 站点 | `CANONICAL_WEB_ORIGIN`、`index.html`（canonical/og/hreflang/JSON-LD）、蓝图导出默认网址统一为 `https://dige-2st.pages.dev` |
| 版本 | `factory-designer@1.11.1` → `dige@1.12.0`；changelog 新增 `v1.12.0` 小节（8 语言） |
| 工程 | Biome 配置对齐既有风格 + 修复 lint；新增 CI 工作流（typecheck / lint / 自测 / build） |
| 功率口径 | `MAX_TARGET_POWER` 32767 → **65535**；分享码历史 15 bit 槽保留，超出部分写尾部 `targetPowerWide`（16 bit，可选，老码字节不变） |
| 震荡池基建 | 新增 `src/utils/oscBudget.ts`：设备容量（3/5/1/1，限速器 1，默认整方案 48）、设备上限→最大分母、传送带每 30 分钟吞 1 个的损耗边界、单支区间（口径 B）、瓦数↔投料速率、档位吸附；配套 `scripts/selftest-osc-budget.mjs` |

## 三、设计取舍：九宫格从 4×5 收敛到 3×3

最初的方案是 **4×5** 电网数独，迭代后产品与代码均为 **3×3 九宫格**：

| 维度 | 早期方案 (4×5) | 现行实现 (3×3) |
| --- | --- | --- |
| Y 轴 | 1~4 取货口 | **1~3 路**（`branchCount=0` 映射 row0；`>3` 不入盘） |
| X 轴 | ≤20 / 20–100 / 100–300 / 300–800 / >800 | **≤100 / 100–500 / >500** |
| 废解 | (Y=4, X=5) | **(row=2, col=2) = 3 路 × 千瓦** |
| 搜索窗 | `maxWaste=1000`（或 1200） | 求解器内部 `SEARCH_MAX_WASTE = 1200` |
| 电池底线 | 5% | `MIN_BATTERY_CUTOFF = 5` |
| 内部枚举 | 1~4 路 | 仍 `PARAM_LIMITS.MAX_BRANCHES = 4` |
| 移动端 | Bottom Sheet | 居中 `DecisionMatrixModal` |
| 侧栏 | 去掉三大约束 | `ConstraintsField.tsx` 已删；高级区只留相位差 |

分享码仍锁历史槽位：`maxWaste=1000`、`minBatteryPercent=5`、`maxBranches=4`。求解器使用内部 5% 电量底线与 4 路枚举；`maxWaste` 默认以 1200 为基准，**有限且大于 1200 的外部值会实际生效**，见[池预检调整链语义](pool-adjust-chain.md)。

## 四、核心数据流

```text
Sidebar 精简参数
  → App.runCalculation → factoryDesigner.worker
    → solveWithPoolAdjustChain（初次 + 预检剔光后的有限重试）
      → FactoryDesigner.solveCandidates()
         Track A: autoPlanBasePools=true
         Track B: autoPlanBasePools=false
         merge by _buildOutputSignature
      → filterByPoolBattery（完整候选）
      → buildSudokuDecisionMatrix()
    → { solutions, matrix, defaultSelection }
  → SolutionList
       PC: 左 3×3 + 右 Dashboard；滚过 sentinel 后 38px StickyHud + Popover
       Mobile: 顶栏 StickyHud；点开居中 Modal
```

## 五、关键接口

### 求解器宽窗 + 双轨

`src/utils/FactoryDesigner.ts`

- 电量底线固定 `MIN_BATTERY_CUTOFF(5)`，内部枚举 4 路。`maxWaste` 默认 = 1200，只接受有限且 >1200 的显式外部值；不是继续忽略更大的冗余上限参数。
- `solveCandidates()`：先 `autoPlanBasePools=true` 再 `false`，合并签名去重；`solve()` 再建盘，不自行跑 worker 的预检调整链。
- `solveWithPoolAdjustChain`：仅预检剔光时按固定 `[2000,3000]` → 降投料 → 升投料重试；首个有解即停。输入投料和计划档位统一 ≤1.5/分，计划至多 17 步（另加 initial）。详见[专章](pool-adjust-chain.md)。
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

- `manualBaseLines`（`{ id, fuelId, count }`）由侧栏 `BasePowerBuilder` 编辑；分享尾部 `_hasBase + baseN Fuel/Count` 已覆盖，老码缺失时走默认；profile 参数透传保存。
- `autoPlanBasePools`：`true` 自动补齐、`false` 不补、`undefined` 走旧 floor 语义。

### 主题

`src/utils/useTheme.ts`：`dige_theme`，未手动覆盖时 6:00–18:00 light，否则 dark；切主题必须让 Chart.js 重绘。

## 六、测试与检查

```bash
pnpm run i18n translate                             # 8 语言同步（314 keys）
pnpm run typecheck                                  # 两套 tsconfig 均 0 错
pnpm run lint                                       # Biome 0 错
pnpm exec tsx scripts/selftest-matrix-7665.mjs      # 7665W 九宫格回归
pnpm exec tsx scripts/selftest-gate-burst.mjs       # 准入口格位 + 池脉冲正反场景
pnpm exec tsx scripts/selftest-pool-adjust-chain.mjs # 调整链、真实窗口与投料边界
pnpm exec tsx --test src/utils/poolFeedSplit.test.ts src/utils/poolAdjustChain.test.ts src/utils/poolChartSegments.test.ts src/utils/poolPulseRegression.test.ts src/utils/poolOverSupplyRegression.test.ts
pnpm build                                          # 产物 dist/
```

期望（武陵 + 中容武陵，7665W）：默认格约 **7666.7W / +1.7W / 1 路**；右上 (0,2) **9800W / +2135W / 0 路**；右下 (2,2) 空。

## 七、自测脚本与不入库项

自测统一放在 `scripts/selftest-*.mjs`（v1.12.0 起废掉 `_` 前缀约定）。**现有 12 个自测均入库并由 CI 执行**；新增自测不能只落文件不接 CI：

| 脚本 | 覆盖 |
| --- | --- |
| `selftest-grid-code.mjs` | 电网码往返 + 燃料编码下标锚定 |
| `selftest-region-limiter.mjs` | 地区 × 燃料限速矩阵 |
| `selftest-i18n-grid-keys.mjs` | 电网码/公告 i18n key 完整性 |
| `selftest-matrix-7665.mjs` | 7665W 九宫格回归（默认格 / 右上硬顶 / 右下废解） |
| `selftest-osc-budget.mjs` / `selftest-osc-scenarios.mjs` | 设备预算、档位吸附与震荡池场景 |
| `selftest-stage-matrix.mjs` | 9 组阶段场景 + 独立电池仿真 |
| `selftest-gate-burst.mjs` | 准入口成串放行、池脉冲正反场景 |
| `selftest-power-integration.mjs` | 秒级燃烧段与功率积分 |
| `selftest-pool-precheck.mjs` | 池预检、富余阈值与诊断 |
| `selftest-solve-timeout.mjs` | worker 超时、取消与 App 接线 |
| `selftest-pool-adjust-chain.mjs` | 固定冗余档、升降档、真实窗口与投料边界 |

`src/utils/` 的 `poolFeedSplit` / `poolAdjustChain` / `poolChartSegments` / `poolPulseRegression` / `poolOverSupplyRegression` 五个 `.test.ts` 也已用 `tsx --test` 接入 CI。

| 路径 | 说明 |
| --- | --- |
| `android/` 工程 | 可不提交；CI 在无目录时 `cap add android` |

## 八、已知坑

1. **`SEARCH_MAX_WASTE`（1200）≠ 分享锁值 `maxWaste`（1000）**。默认基准在 `src/types/matrix.ts`；显式放宽由 FactoryDesigner 采用，固定重试档在 `poolAdjustChain.ts`。不要把三者混成分享协议变更。
2. **`solve()` 返回 `SudokuDecisionMatrix`**，不是数组；旁路脚本必须读 `.solutions` / `.matrix`。
3. 双轨是串行两次 `runOscillationPipelines()`；不要在 4 路全枚举上再叠无剪枝搜索（OOM）。
4. 矩阵格与 `solutions[]` 靠**对象引用**对应；Worker 结构化克隆后不能再次深拷贝。
5. 蓝图导出打印分享锁值，真实浪费看 `solution.waste`。
6. `html.light` / Chart：切主题必须走 `useTheme` 总线并强制 `update`。
7. 高功率燃料（高容武陵 6400W）在「目标落在两台之间」时只能出硬顶解（例：7300W → 2×6400+200 = 13000W），属物理限制，不是 bug。
8. Biome：仓库历史代码是双引号 + 80 列，配置已按此对齐；不要单方面改成单引号，否则全仓 diff 爆炸。
9. 新脚本要接 CI、开发文档要记日期与四位版本；待议文件不是开工批准。详见[版本规则](dev-history/VERSIONING.md)和[边界待议](dev-history/2026-11-27_池预检调整链边界_待议.md)。

## 九、待办

当前轮次 v1.12.0.1 已收口，过程见[任务文档](dev-history/2026-11-27_CI修复与池调整语义固化方案.md)；更早的二开记录见[合订日志](dev-history/2026-11-26_二开早期开发日志合订.md)。

1. **图表黄色池曲线**：仍缺与游戏内波形的人工对照；程序自测不能冒称完整游戏验收；
2. 移动端决策盘悬浮化、决策盘「重置位置」入口（低优先级）；
3. 多池联合调参、严格超时与错误诊断边缘见[待议清单](dev-history/2026-11-27_池预检调整链边界_待议.md)，开工前先审批。
4. **周期图表拨档开关**：默认左档「周期显示」按 0.5 + 1 + 0.5 显示 2 个周期；右档「时间显示」对齐游戏本体 10min / 30min / 2h / 12h / 1day / 7days。见[待议](dev-history/2026-11-27_周期图表拨档开关_待议.md)，开工前先审批。

## 十、相关文档

- [`README.md`](../README.md) — 功能概览、与上游差异、快速开始
- [`docs/architecture.md`](architecture.md) — 模块与求解链路
- [`docs/grid-code.md`](grid-code.md) — DIGE 电网码 B
- [`docs/docker-apk.md`](docker-apk.md) — 容器与 APK
- [`docs/pool-adjust-chain.md`](pool-adjust-chain.md) — 固定冗余档、升降档、预检与 UI 语义
- [`docs/dev-workflow.md`](dev-workflow.md) — fork `main` 开发 → 过滤 `docs/` 生成 `upstream-pr` → 上游 PR 的流程
- [`dev-history/VERSIONING.md`](dev-history/VERSIONING.md) — 开发文档日期、四位版本及升级规则
- [`dev-history/README.md`](dev-history/README.md) — 任务书、验收报告、待议清单的日期版本索引

## 十一、自定义震荡热能池（v1.12.0 新增）

- 侧栏 `OscillationPoolField` 管理 `params.oscPools[]`（`fuelId` / `enabled` / `deviceLimit` / `maxPerMin`）。
- 求解器构造时把每个池拆成「满速带 + 余量震荡」：`oscBudget.poolPowerForRate()`。满速带每满 1.5 个/分（源矿 7.5）一台，结构为取货口 + 3 分器串联 + 热能池，**不放存货口**；余量按 `2^a·3^b` 吸附成一条震荡支路。
- 池功率从 `targetPower` 里扣除，`deviceBudget = 48 − 池设备占用` 留给系统震荡；分支枚举与排序都受该预算约束。
- 结果后处理：把池功率加回 `avgPower`/`powerLog`；纯常驻 + 池方案会按各池周期 LCM（封顶 600s）合成 `powerLog`/`batteryLog`，`poolPowerLog` 与 `powerLog` 同长同索引，图表按同一套重采样绘制。
- 燃料 BOM 计入池消耗（`poolBandCount` / `poolOscRatePerMin`），「每天节省」按满带满载 + 余量震荡折算，池只贡献消耗不吞掉节省。
- 分享码尾部可选组：`_hasPools` + 4×(燃料 5 / 投料量 10 / 设备 7 / 启用 2)，以及 `_hasBase` + 4×(燃料 5 / 台数 4)。

## 十二、上游 issue 处理情况

本项目用**功能覆盖**而不是逐条回复的方式处理上游 issue：

| 上游 issue | 诉求 | 当前实现 |
| --- | --- | --- |
| [#16](https://github.com/djkcyl/D.I.G.E./issues/16) 希望增加一个主燃料多选功能 | 想让常驻/震荡同时吃多种电池 | **已由「自定义常驻热能池」实现**：多行、每行独立选电池与台数，配合「自定义震荡热能池」可再指定一种电池做震荡 |
| [#13](https://github.com/djkcyl/D.I.G.E./issues/13) max Fuel/hr 与第三燃料 | 想限制每小时耗料、并加第三种燃料 | **已由「自定义常驻 + 自定义震荡热能池」实现**：主/副/自定义常驻/自定义震荡可同时存在，投料量按个/分钟直接设定 |
| [#14](https://github.com/djkcyl/D.I.G.E./issues/14) 常驻燃料上限 | 想把基础供电限制成指定的燃料与台数 | **已由「自定义常驻热能池」实现**：每行独立指定燃料与台数，例如「基础只放 1× 高容谷地」直接照排即可 |
| [#2](https://github.com/djkcyl/D.I.G.E./issues/2) 回灌分流 / 能量泄漏 | 用 loopback 实现任意 1/x 精度 | **暂不实现**：调研与取舍记录在 [`docs/upstream-issue-2-loopback.md`](upstream-issue-2-loopback.md) |
| [#9](https://github.com/djkcyl/D.I.G.E./issues/9) 赞助渠道 | 想赞助项目 | 不属于代码范畴，未处理 |
