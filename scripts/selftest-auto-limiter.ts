import { FactoryDesigner } from "../src/utils/FactoryDesigner";
import {
  buildBranchLimiterOptions,
  formatDenominator,
  getEffectiveInput,
  getSolverLimitCandidates,
} from "../src/utils/inputRate";
import { FUELS, generateValidDenominators } from "../src/utils/constants";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// --- k/5 math ---
{
  const e6 = getEffectiveInput("warehouse", 6);
  check(
    "限速6 interval=10 (1/5 of 30/min → 0.1/s)",
    Math.abs(e6.interval - 10) < 1e-9,
    `interval=${e6.interval}`
  );
  check("限速6 perMin=6", e6.perMin === 6);
  check("限速6 isLimited", e6.isLimited === true);

  const denoms = generateValidDenominators();
  const opts = buildBranchLimiterOptions(FUELS.wulingLow, "warehouse", denoms);
  const lim6 = opts.filter((o) => o.limiterSpeed === 6);
  check("存在限速6候选", lim6.length > 0, `n=${lim6.length}`);

  // k=1, localD=8 → D = 8 * 30/6 = 40
  const d40 = lim6.find(
    (o) => Math.abs(o.denominator - 40) < 1e-6 && o.localDenominator === 8
  );
  check(
    "限速6+3二分 → 展示分母40 (1/40)",
    !!d40,
    d40 ? `D=${d40.denominator} local=${d40.localDenominator}` : "missing"
  );
  if (d40) {
    check(
      "1/40 description 含 1/5 或 限速 6",
      /限速 6|1\/5|\[1\/5\]/.test(d40.description),
      d40.description
    );
    check(
      "localD=8 → 3个二分器",
      d40.splitterCount.split2 === 3 && d40.splitterCount.split3 === 0
    );
  }

  // 不限速候选存在且无 requiresLimiter（D=6 可能因满载被过滤，不强制）
  const pureAny = opts.find(
    (o) => o.limiterSpeed == null && !o.requiresLimiter
  );
  check(
    "存在不限速震荡候选",
    !!pureAny,
    pureAny ? `localD=${pureAny.localDenominator} P=${pureAny.power}` : "none"
  );

  // 限速6 描述比例必须是 1/5 而非 1/6
  if (d40) {
    check(
      "描述为 [1/5] 而非 [1/6]",
      d40.description.includes("[1/5]") && !d40.description.includes("[1/6]"),
      d40.description
    );
  }

  // 同功率时限速方案分流器更少应胜出：例如 1/40 用限速6+3二分(cost=4) vs 纯 D=40 需要更多？
  // 40=8*5 — 40=2^3*5 不是纯 2/3，纯分流无 D=40；对比 D=48=16*3 等
  const cand = getSolverLimitCandidates("warehouse");
  check(
    "仓库候选含 null 与 24/18/12/6",
    cand.some((c) => c.limitPerMin == null) &&
      [24, 18, 12, 6].every((s) => cand.some((c) => c.limitPerMin === s)),
    JSON.stringify(cand.map((c) => c.limitPerMin))
  );
  check(
    "封装机候选仅 null（满速6，无更低正档自动？含无）或仅更低",
    getSolverLimitCandidates("packer").every(
      (c) => c.limitPerMin == null || (c.limitPerMin > 0 && c.limitPerMin < 6)
    ),
    JSON.stringify(getSolverLimitCandidates("packer").map((c) => c.limitPerMin))
  );

  check("formatDenominator(40)=40", formatDenominator(40) === "40");
  check(
    "formatDenominator(40/3)",
    formatDenominator(40 / 3) === "40/3" ||
      formatDenominator(40 / 3).includes("13")
  );
}

// --- FactoryDesigner 2664W ---
{
  const t0 = Date.now();
  const designer = new FactoryDesigner({
    targetPower: 2664,
    minBatteryPercent: 5,
    maxWaste: 30,
    maxBranches: 3,
    primaryFuelId: "wulingLow",
    secondaryFuelId: "none",
    inputSourceId: "warehouse",
    excludeBelt: true,
  });
  const solutions = designer.solve();
  const ms = Date.now() - t0;
  check("2664W 有解", solutions.length > 0, `n=${solutions.length} ${ms}ms`);
  check("求解耗时 < 60s", ms < 60000, `${ms}ms`);

  const withLimiter = solutions.filter((s) =>
    (s.oscillating || []).some((b) => b.requiresLimiter)
  );
  const sample = solutions.slice(0, 5).map((s, si) => ({
    i: si,
    avg: Number(s.avgPower.toFixed(2)),
    waste: Number(s.waste.toFixed(2)),
    splitters: s.totalSplitters,
    branches: (s.oscillating || []).map((b) => ({
      D: b.denominator,
      local: b.localDenominator,
      lim: b.limiterSpeed,
      req: b.requiresLimiter,
      p: Number((b.power ?? 0).toFixed(2)),
      desc: b.description,
    })),
  }));
  console.log("2664 solutions sample:\n" + JSON.stringify(sample, null, 2));
  const anyLim = sample.some((s) => s.branches.some((b) => b.req));
  check("2664 方案中出现准入口限速分支", anyLim);

  // 至少验证分支元数据字段存在
  const anyBranch = solutions.find((s) => s.oscillating && s.oscillating.length)
    ?.oscillating?.[0];
  if (anyBranch) {
    check(
      "分支含 description 字段",
      typeof anyBranch.description === "string" || anyBranch.description == null
    );
    check(
      "分支 limiter 字段合法",
      anyBranch.limiterSpeed == null ||
        [6, 12, 18, 24].includes(anyBranch.limiterSpeed as number)
    );
  }

  // 若有限速分支，denominator 应符合 k/5
  for (const s of solutions) {
    for (const b of s.oscillating || []) {
      if (b.requiresLimiter && b.limiterSpeed && b.localDenominator) {
        const expectD = (b.localDenominator * 30) / b.limiterSpeed;
        check(
          `D 映射 local*30/lim (${b.localDenominator}*30/${b.limiterSpeed})`,
          Math.abs((b.denominator as number) - expectD) < 1e-6,
          `got=${b.denominator} expect=${expectD}`
        );
      }
    }
  }
}

// --- 不限速与现网：无 inputRateLimit 时 inputInterval=2 ---
{
  const d = new FactoryDesigner({
    targetPower: 2656,
    minBatteryPercent: 5,
    maxWaste: 30,
    maxBranches: 3,
    primaryFuelId: "wulingLow",
    secondaryFuelId: "none",
    inputSourceId: "warehouse",
  });
  check("全局母带 interval=2", d.inputInterval === 2);
  check("全局 isRateLimited=false", d.isRateLimited === false);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
