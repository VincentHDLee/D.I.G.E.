# 架构与代码说明

面向接手维护的人：这个工具由哪几块拼起来、求解是怎么算的、哪些东西**不能动**。
版本基线：v1.11.1（游戏 1.7 口径）。

## 一、整体数据流

```text
CalcParams（侧栏 / 分享码 / 存档）
  ↓  App.runCalculation
  ↓  Web Worker: factoryDesigner.worker.ts
FactoryDesigner.solve()
  ├─ Track A：autoPlanBasePools = true   （常驻自动补齐）
  ├─ Track B：autoPlanBasePools = false  （纯震荡 / 手动常驻）
  ├─ 两条轨道合并 → _buildOutputSignature 去重
  └─ buildSudokuDecisionMatrix() → 3×3 格 + defaultSelection
  ↓  { solutions, matrix, defaultSelection }
SolutionList / SolutionChart / SolutionDiagram（蓝图 PNG 导出）
```

参数来源有三条，优先级从高到低：URL / 电网码导入 → 本地存档 → `DEFAULT_PARAMS`。

## 二、求解内核（`src/utils/FactoryDesigner.ts`）

**输入被强制归一化。** 构造函数忽略外部传来的 `maxWaste` / `minBatteryPercent` / `maxBranches`，固定用内部宽窗：

- `SEARCH_MAX_WASTE = 1200`（`src/types/matrix.ts`）
- `MIN_BATTERY_CUTOFF = 5`
- `PARAM_LIMITS.MAX_BRANCHES = 4`

UI 和分享码里的 1000 / 5 / 4 只是历史槽位，不参与求解。

**常驻层（base）** 由 `calculateBasePower()` 产出：

1. 核心 200W 恒定；
2. 手动常驻行（`manualBaseLines`，每行一种燃料 + 台数）；
3. 自动补齐：`floor((target - core - manual) / 主燃料功率)`。

**震荡层（oscillating）** 以 `base` 为底，枚举 `gap = target - base` 之内的分支：

- 分支功率 = `燃料功率 × 燃烧时长 ÷ (输入间隔 × 分母)`；
- 分母只取 `2^a × 3^b`（二分器/三分器串联），限速器把等效分母扩成 `5·2^a·3^b / k`；
- 每路分支再叠相位差（0~16 格）；
- 组合数按路数设池子（1 路 48 / 2 路 36 / 3 路 20 / 4 路 12）防止爆炸。

**仿真校验**（`PowerCycleSimulator`）：逐秒推进电池电量（容量 100000J），要求全程不低于 5%、不出现提前耗尽，并输出周期、均值功率、方差、最小蓄电量。

**排序 / 分桶**（`src/utils/decisionMatrix.ts`）：浪费（5W 容差）→ 分流器数 → 分支数 → 副燃料震荡速率 → 方差。行 = 1~3 路取货口，列 = ≤100W / 100~500W / >500W；右下角（3 路 × 千瓦）是物理废解，永不填。

## 三、燃料与规则

- 燃料表在 `src/utils/constants.ts` 的 `FUELS`。**新增燃料只能追加到末尾**：`shareParams` 用数组下标做 5 bit 编码，插队会让老分享码静默解成别的燃料。
- 下拉顺序由 `FUEL_DISPLAY_ORDER` / `*_DISPLAY` 单独控制，与编码顺序解耦。
- 地区规则在 `regionLimiter.ts`：`free` 全放行；`wuling` 全放行；`valley` 只允许源矿 + 谷地电池 + 自定义燃料使用准入口限速，武陵电池仅满速分流并给跨区提示。

## 三之二、自定义震荡热能池

「自定义震荡热能池」是把玩家自己规划的震荡池当作**一条特殊常驻**接进求解器：功率从目标缺口里扣除，但**不改变**主/副燃料的枚举逻辑。

### 数据流

```
侧栏 OscillationPoolField（oscPools[]）
  → FactoryDesigner 构造器逐个 poolPowerForRate()
      ├─ 满速带：每满 1.5 个/分（40s 电池）算 1 台满速热能池
      ├─ 余量：剩余投料量按 2^a·3^b 吸附成一条震荡支路
      ├─ poolPower / poolDeviceCost / poolSegments / poolFuelStats
  → targetPower -= poolPower，deviceBudget = 48 − poolDeviceCost
  → solve() 结果里把池功率按「满带常量 + 余量方波」加回展示值
  → BOM / 燃料消耗表 / 流程图 / 周期图表
```

### 满速带的设备口径

- 每满 1.5 个/分（源矿 7.5 个/分）= 1 台满速热能池，**不放存货口**；
- 结构：取货口 1 + 3 分器串联 n 个 + 热能池 m 台，`n = ceil((m−1)/2)`（三分器带左右 + 前，n 个带 2n+1 台）；
- 单取货口理论最多喂 20 台（30 个/分 ÷ 1.5），超过就拆多条取货口；
- 设备占用：取货口 1 + n 个分流器 + m 台热能池（满速带不放存货口）。

### 余量震荡支路

- 余量投料按 `2^a·3^b` 吸附到可运行的最近档位（可运行下限见 `oscBudget.singleBranchRange`）；
- 设备占用按实体计：取货口 1 + 存货口（用三分器 2 个 / 全二分器 1 个）+ 热能池 1 + 二分器 ×3 + 三分器 ×5 + 汇流器 ×1（限速器 +1）。

### 与求解器的边界

| 关系 | 说明 |
| --- | --- |
| 目标功率 | `targetPower` 先减去池功率，求解器只算剩下的缺口 |
| 设备预算 | `deviceBudget = 48 − 池占用`，系统震荡分支枚举与排序都受此约束 |
| 排序 | 分支候选先按设备占用、再按分流器数排序 |
| 结果展示 | `avgPower` / `powerLog` / `poolPowerLog` 都会加回池功率；waste 口径不变 |
| 纯常驻方案 | 系统无震荡分支时，用池的周期（各段 LCM，封顶 600s）合成 `powerLog` / `batteryLog`，否则图表只有一条直线 |

### 分享码字段（尾部可选组）

| 字段 | 位宽 | 说明 |
| --- | --- | --- |
| `_hasPools` | 2 | 是否存在池配置 |
| `poolN Fuel` | 5 | 燃料（数组下标，只能追加） |
| `poolN Rate` | 10 | 投料量 ×10（0.1 个/分精度，最大 102.3） |
| `poolN Limit` | 7 | 池的设备上限（最大 127） |
| `poolN Enabled` | 2 | 开关状态，关闭时保留配置 |
| `_hasBase` + `baseN Fuel/Count` | 2 + 4×(5+4) | 手动常驻行 |

老码不带这些位，解码时缺失即走默认。

---

## 四、分享与存档

| 通道 | 实现 | 兼容约束 |
| --- | --- | --- |
| URL `?p=<Base52>` | `shareParams.ts` 位域编解码 | 字段顺序与 bit 宽度不可改，只能末尾追加可选字段 |
| DIGE 电网码 | `gridCode.ts`：`DIGE + 地区 + 功率 + 主 + 副 + 模式 + 载荷` | 人读头仅展示，**载荷权威**；头与载荷不一致按载荷载入并提示 |
| 本地存档 | `profileStorage.ts`，多槽位 + 内置预设 | 存档名旧格式有归一化映射 |

`phaseOffsetBranch4`、`inputRateLimitPerMin`、`excludeItemGateLimiter`、`autoPlanBasePools`、`multiFuelMode`、`factoryRegion` 都是**末尾追加的可选字段**，缺失即走旧默认——这是兼容老链接的唯一手段。

## 五、UI 结构

```text
App.tsx
 ├─ layout/Header.tsx           顶栏：地区/主题/语言/帮助/分享/GitHub
 │   └─ HeaderMoreMenu.tsx      移动端折叠菜单
 ├─ layout/Sidebar/             控制台
 │   ├─ TargetPowerField        目标发电量
 │   ├─ FuelConfigField         主/副燃料 + 混编模式 + 跨区提示
 │   ├─ BasePowerBuilder        常驻分层（手动行 + 自动补齐开关）
 │   ├─ OtherSettingsField      建设地区 / 准入口限速
 │   └─ AdvancedSettingsField   相位差（折叠）
 ├─ solution/SolutionList/
 │   ├─ SudokuDecisionMatrix/   3×3 九宫格 + 仪表盘 + 移动端弹层
 │   ├─ FuelConsumptionTable    燃料 BOM（分/时/天）
 │   └─ ChartSection            周期图表
 └─ modals/                     公告 / 分享 / 导入 / 存档 / FAQ / 隐私
```

主题走 `useTheme.ts`（`dige_theme`，未手动覆盖时按 6:00–18:00 切白天）。切换主题后 Chart.js 必须强制重绘，只改 CSS class 不够。

## 六、i18n

- `zh` 是 source of truth；8 种语言（含 `id`）必须齐全。
- 只用 `scripts/i18n.ts`：`translate`（检查/增删）、`prune`、`changelog append`。
- 公告与更新日志在 `src/i18n/announcement/locales.*.json`，只往当前大版本小节追加条目。

## 七、测试

```bash
pnpm exec tsx scripts/selftest-grid-code.mjs        # 电网码往返 + 燃料下标锚定
pnpm exec tsx scripts/selftest-region-limiter.mjs   # 地区规则矩阵
pnpm exec tsx scripts/selftest-matrix-7665.mjs       # 7665W 九宫格回归
```

改分享码、燃料顺序、地区规则，必须同时改对应断言，否则等于没测。

## 八、已知坑（沿用上游交接结论）

1. `SEARCH_MAX_WASTE`（1200）≠ 分享锁值 `maxWaste`（1000），别为「对齐」去改 bit 语义。
2. `solve()` 返回 `SudokuDecisionMatrix`，不是数组；旁路调用要读 `.solutions` / `.matrix`。
3. 矩阵格与 `solutions[]` 靠**对象引用**对应；Worker 结构化克隆后不能再深拷贝一次。
4. 双轨是串行跑两次管线，不是并行；别在 4 路全枚举上再加一层无剪枝搜索（会 OOM）。
5. 蓝图导出打印的是分享锁值，真实浪费看 `solution.waste`。
6. 高功率燃料（如高容武陵 6400W）会让「目标落在两台之间」时只能出硬顶解，这是物理限制。
