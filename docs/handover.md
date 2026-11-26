# v1.12.0 维护交接

规范版本：v1.12.0（社区维护分支；游戏 1.7 口径）

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
| `feature/input-rate-limiter` | 资料分支：`docs/upstream-issue-2-loopback.md`（回灌分流 / 能量泄漏议题的调研与「暂不实现」结论） |
| `chore/dev-selftests-2026-08-17` | 归档分支：M1/M2/M3/OOM/limiter 时期的自测脚本备份 |

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

## 八、已知坑

1. **`SEARCH_MAX_WASTE`（1200）≠ 分享锁值 `maxWaste`（1000）**。改窗只动 `src/types/matrix.ts`。
2. **`solve()` 返回 `SudokuDecisionMatrix`**，不是数组；旁路脚本必须读 `.solutions` / `.matrix`。
3. 双轨是串行两次 `runOscillationPipelines()`；不要在 4 路全枚举上再叠无剪枝搜索（OOM）。
4. 矩阵格与 `solutions[]` 靠**对象引用**对应；Worker 结构化克隆后不能再次深拷贝。
5. 蓝图导出打印分享锁值，真实浪费看 `solution.waste`。
6. `html.light` / Chart：切主题必须走 `useTheme` 总线并强制 `update`。
7. 高功率燃料（高容武陵 6400W）在「目标落在两台之间」时只能出硬顶解（例：7300W → 2×6400+200 = 13000W），属物理限制，不是 bug。
8. Biome：仓库历史代码是双引号 + 80 列，配置已按此对齐；不要单方面改成单引号，否则全仓 diff 爆炸。

## 九、下一步

已完成（v1.12.0 内测）：自定义常驻/震荡热能池、池参数进分享码、设备预算合并、燃料消耗并入、
决策盘悬浮窗（双击居中）、常见问题补池相关条目、README 拆分（issue 说明移到本文档第十二节）。

待办：
1. **图表黄色池曲线**：已与 `powerData` 同源同重采样，仍需人工确认波形周期；
2. 移动端决策盘悬浮化、决策盘「重置位置」入口（低优先级）；
3. 上游 issue #2 的回灌分流路线暂不实现，资料保留在资料分支。

## 十、相关文档

- [`README.md`](../README.md) — 功能概览、与上游差异、快速开始
- [`docs/architecture.md`](architecture.md) — 模块与求解链路
- [`docs/grid-code.md`](grid-code.md) — DIGE 电网码 B
- [`docs/docker-apk.md`](docker-apk.md) — 容器与 APK

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
| [#14](https://github.com/djkcyl/D.I.G.E./issues/14) 常驻燃料上限 | 想限制常驻台数 | **不打算实现**：正常玩法下玩家不会铺超过 10 台热能池，用「自定义常驻热能池」手动排即可 |
| [#2](https://github.com/djkcyl/D.I.G.E./issues/2) 回灌分流 / 能量泄漏 | 用 loopback 实现任意 1/x 精度 | **暂不实现**：调研与评估记录在 `feature/input-rate-limiter` 分支的 `docs/upstream-issue-2-loopback.md` |
| [#9](https://github.com/djkcyl/D.I.G.E./issues/9) 赞助渠道 | 想赞助项目 | 不属于代码范畴，未处理 |
