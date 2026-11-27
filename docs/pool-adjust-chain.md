# 自定义池预检调整链：冗余阶梯与升降档语义

> 一句话定位：记录 Worker 在「自定义池预检把候选剔光」后如何做有限重试，供维护、验收与后续版本登记共用；不是全局调参搜索，也不是另一套求解器。
>
> 文档版本：**v1.12.0.1**｜记录日期：**2026-11-27**｜状态：现行有效
> 代码基线：`2fd2613`（CI 修复）+ `b57a6a5`（投料计划限幅）
> 版本规则：[开发文档版本与日期标记](dev-history/VERSIONING.md)

## 一、生产数据流与职责边界

主界面只走这一条链路：

```text
App.runCalculation
  → factoryDesigner.worker
    → solveWithPoolAdjustChain
        初次 / 每次重试：
        → new FactoryDesigner(本次参数)
        → solveCandidates()
            Track A：autoPlanBasePools=true
            Track B：autoPlanBasePools=false
            合并签名去重，保留完整候选
        → filterByPoolBattery()：完整候选上做池电池预检
        → buildSudokuDecisionMatrix()：建 3×3 决策盘
    → 有任一格可展示方案：采用本次尝试并停止
```

- `FactoryDesigner.solve()` = `solveCandidates()` + 建盘，**本身不走自动调整链**。直接实例化 FactoryDesigner 的自测不会自动重试；测本条链必须调用 `solveWithPoolAdjustChain`，或走 worker 入口。
- 这里不重新生成另一套方案：每次 attempt 都完整运行一次「求解 → 预检 → 建盘」。首个有解的 attempt 即采用，不合并其他 attempt 的解，也不补做全局最优比较。
- 这个机制处理的是**预检剔光**；不是用冗余窗口来重写功率仿真，也不能解决所有空候选场景。

## 二、什么时候会触发，什么时候不会

以下条件必须同时成立：

1. 能找到第一个 `isPoolActive` 的池：未显式禁用，燃料字段非空且不是 `none`，原投料折算成整数十分位后大于 0。此处的“活动”判断本身不额外 `resolveFuel`，正常表单路径保证燃料有效。
2. `initial.candidates.length > 0`：普通求解曾经给出原始候选。
3. `initial.kept.length === 0`：完整候选被池预检全部剔除。

不会进入调整链的情况：

- 原始候选本来就是空数组，包括被搜索窗口剪没的情况；
- 预检仍保留候选，即使这些候选建盘后因超过 3 路或右下死角而没有可展示格子；
- 初次预检异常：预检按 fail-open 保留原候选，不需要该重试；
- 没有符合第一个条件的活动池。

多池时只调整**第一个活动池**，其他池保持原值，不逐池轮转。旧 `solveWithPoolDowngrade` 的「每次选功率最大池、最多 400 次」没有生产调用，不适用本页语义。

## 三、绝对档位顺序，不做笛卡尔积

令：

```text
base = max(1200, params.maxWaste)
r0 = min(1.5, round(输入投料量 × 10) / 10) 个/分
```

| 顺序 | `kind` | 冗余上限 | 投料量 |
| --- | --- | --- | --- |
| 0 | `initial` | `base`，由 FactoryDesigner 归一化 | 原输入交给 FactoryDesigner解析 |
| 1 | `wasteRelax` | 先 2000，再 3000 | 保持 `r0` |
| 2 | `down` | 恢复 `base` | `r0−0.1 → … → 0` |
| 3 | `up` | 恢复 `base` | `r0+0.1 → … → upMax` |

关键语义：

1. 放宽档是**绝对上限**，不是 `base + 2000 + 3000`。`base = 2500` 时只再试 3000；`base ≥ 3000` 就不再尝试放宽。
2. 每格只试 `base < tier` 的档，不回退；降投料和升投料均回到用户原来的 `base`，不带着 2000/3000 继续组合。
3. 不尝试「冗余放宽 + 改变投料」的笛卡尔积。若必须同时改两者才有解，当前链条可能仍无解；这是已明确的边界，不应描述为全面自动调参。
4. 单池降到 0 就是一个合法停止条件：成功后不再执行升档。
5. 投料采用整数十分位，避免 `0.1 + 0.2` 一类浮点误差。常规 `0.1～1.5` 输入的档序不因本轮边界修复改变。
6. 计划数组最多 **17 步**（两档放宽 + 至多 15 个降/升档；另加一次 initial）。若跳档或 upMax 更小则更少，换成真实尝试次数由首个有解、0 档跳过预检与 deadline 决定。

### 原始投料 > 1.5/分时的归一化

FactoryDesigner 和 `splitPoolFeed` 一直把投料量四舍五入到 0.1，并截到 1.5/分。`v1.12.0.1` 起，调整链的 `fromTenths` 也先换十分位再截到 `POOL_FEED_MAX_TENTHS = 15`；`planPoolAdjustSteps()` 对直接传入的异常档位也限幅。

这避免：

- 在 deadline 生效之前，因超大输入预生成很长的降档数组；
- 例如输入 1.6 时，先按实际 1.5 求解，又把降到 1.5 当成另一次不同配置重复求解。

初次原参数仍交给 FactoryDesigner，已有的 `poolFeedClamp` 记录不动；链上的 `fromPerMin` 和各 attempt 投料量按实际采用的 ≤1.5 值记录，不能把异常原始输入当成真实采用量。

## 四、maxWaste 的真实生效规则

FactoryDesigner 构造器只接受**有限且大于 1200** 的外部 `params.maxWaste`；否则用内部基准 1200：

| 外部值 | 实际生效 | 后续放宽档 |
| ---: | --- | --- |
| 1000 / 1200 | 1200 | 2000、3000 |
| 1200.1 | 1200.1 | 2000、3000 |
| 2000 / 2500 | 原值 | 仅 3000 |
| 3000 / 更大的有限值 | 原值 | 无放宽阶段 |

- 不能把 1200 以下的历史值当成缩紧搜索；默认/分享的 1000 依然使用 1200 宽窗。
- 大于 1200 不是只改末端过滤，还会影响常驻台数枚举、震荡分支剪枝和仿真后接收。
- 无池纯常驻的 covering hard-top，以及带标记的 `poolOverSupply`，有各自的超限例外，不能用一句「全部解都 ≤maxWaste」概括。
- 预检可以近似理解为在窗口内寻找 `requiredWaste ≤ waste ≤ maxWaste` 的解；它不提供功率充足证明，仍由仿真校验最低电量。

### 与九宫格的三列不是一回事

≤100W / 100–500W / >500W 只是把方案放进决策盘列。搜索基准 1200、自动放宽的 2000/3000、列分桶三者互不改写；本轮无需改分享协议或九宫格结构。

### 升档上限

```text
upMax = min(
  不超过单台满速投料量（60 / burnTime）的整数十分位,
  15
)
```

40 秒电池为 1.5；源矿理论 7.5 也被全局上限压到 1.5；自定义慢燃料可以低于 1.5。满速不足 0.1 / 无燃料时不生成升档。

## 五、用户看到的调整、保存与异常

| 情况 | 提示与操作 |
| --- | --- |
| 只放宽冗余 | 黄色提示，显示实际生效 `base → used`；可套用到参数 |
| 降投料 | 黄色提示；降到 0 表示停用该池；可套用到参数 |
| 升投料 | 红色条件警告，需要实际产出达到该速率；不提供套用按钮 |
| 求解后仍无解 | 原诊断 + 不含 initial 的 trace，逐项显示类别 / 冗余 / 投料 / 候选前后数，末尾区分 exhausted / timeout |
| 求解成功 | 只显示当前选中解的摘要提示，不展开完整 trace |

「套用到参数」只改内存、标脏，**不自动重算**。分享编解码仍把 `maxWaste` 固定为 1000，放宽值不随分享码保留；本地 profile 则是透传保存。

链内预算为 App 10 秒超时的 80%（8 秒），只在 attempts 之间检查。初次或正在执行的单次求解不能被链内中断。链内求解、预检或建盘回调抛错时，按原结果退回；预检自身的 fail-open 语义不变。

线上建盘仍使用 `compareSolutions`，`comparePoolAdjust` 目前只有测试使用；不要再给生产排序另外拼一套未接线的优先级。

## 六、预检与仿真不是互相替代

`filterByPoolBattery` 的当前估计：

```text
E = 100000J × 95% = 95000J
cycle = 2D
Toff = cycle − min(burnTime, cycle)
Wneed = ΣremW − 95000 / max(Toff)
requiredWaste = Wneed + 20W  // Wneed > 0 时
```

先删除不能证明池支路真正进入仿真的候选，再执行富余检查。多池「总零头功率 + 最长熄火时间」是保守近似，不等于独立逐秒电量证明；相位影响与精确电量仍看 FactoryDesigner 与独立仿真回归。

## 七、回归位置与本轮不变约束

```bash
pnpm exec tsx scripts/selftest-pool-adjust-chain.mjs
pnpm exec tsx --test src/utils/poolAdjustChain.test.ts src/utils/poolFeedSplit.test.ts
pnpm exec tsx scripts/selftest-gate-burst.mjs
pnpm exec tsx scripts/selftest-matrix-7665.mjs
```

当前 CI 额外覆盖：

- 固定 `[2000,3000]`、跳档、降 / 升档顺序、首个成功即停、整数十分位；
- 真实 FactoryDesigner 的 1000 / 1200 / 1200.1 / 2000 / 3000 窗口边界；
- 1.5 / 1.6 / 10 / 100 / 超大投料输入的有限计划，不出现上限以上等效重复步；
- 超时、fail-open、关池、其他池仍在时的预检、建盘标签；
- `poolPulseRegression` / `poolOverSupplyRegression` 等 5 个 TypeScript 回归文件均接入 CI。

固定阶梯 **1200 → 2000 → 3000 已获用户确认够用**。本页没有授权设计更高冗余档、动态公式、多池全局组合、超时模型重构或分享协议扩展。

待议但不属于本修复轮工作：[池预检调整链边界待议](dev-history/2026-11-27_池预检调整链边界_待议.md)。
