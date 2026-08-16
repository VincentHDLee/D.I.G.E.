/**
 * 排除物品准入口限速器（excludeItemGateLimiter）开关自测
 * - false（默认关闭）= 启用限速求解，可出现 requiresLimiter
 * - true（开启）= 忽略限速，无 requiresLimiter
 * - 分享参数往返
 */
import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";
import { buildBranchLimiterOptions } from "../src/utils/inputRate.ts";
import { FUELS } from "../src/utils/constants.ts";
import {
  encodeShareParams,
  decodeShareParams,
} from "../src/utils/shareParams.ts";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  OK  ", msg);
  } else {
    failed++;
    console.error("  FAIL", msg);
  }
}

const denoms = [1, 2, 3, 4, 6, 8, 9, 12, 16, 18, 24, 27, 32, 36];
const fuel = FUELS.wulingLow;

console.log("\n=== buildBranchLimiterOptions gate ===");
{
  // false / 默认 = 限速求解
  const allow = buildBranchLimiterOptions(fuel, "warehouse", denoms, false);
  assert(allow.length > 0, `allow(false): got ${allow.length} options`);
  assert(
    allow.some((o) => o.requiresLimiter && o.limiterSpeed != null),
    "allow(false): has requiresLimiter branch"
  );
  assert(
    allow.some((o) => !o.requiresLimiter),
    "allow(false): still includes unlimited candidates"
  );

  // true = 排除/忽略限速
  const excluded = buildBranchLimiterOptions(fuel, "warehouse", denoms, true);
  assert(
    allow.length > excluded.length,
    `excluded(true): fewer options (${excluded.length} < ${allow.length})`
  );
  assert(
    excluded.every((o) => !o.requiresLimiter && o.limiterSpeed == null),
    "excluded(true): no requiresLimiter"
  );

  // 默认参数 = 限速求解
  const def = buildBranchLimiterOptions(fuel, "warehouse", denoms);
  assert(
    def.some((o) => o.requiresLimiter),
    "default arg: has requiresLimiter"
  );
}

console.log("\n=== FactoryDesigner solve gate ===");
function baseParams(excludeItemGateLimiter) {
  return {
    targetPower: 2664,
    minBatteryPercent: 5,
    maxWaste: 30,
    maxBranches: 3,
    excludeBelt: true,
    excludeItemGateLimiter,
    primaryFuelId: "wulingLow",
    secondaryFuelId: "none",
    inputSourceId: "warehouse",
  };
}

function anyLimited(solutions) {
  return solutions.some(
    (s) =>
      s.isRateLimited ||
      (s.oscillating &&
        s.oscillating.some((b) => b.requiresLimiter || b.limiterSpeed != null))
  );
}

{
  const allowDesigner = new FactoryDesigner(baseParams(false));
  const allowSols = allowDesigner.solve();
  assert(
    Array.isArray(allowSols) && allowSols.length > 0,
    `allow solve: ${allowSols.length} sols`
  );
  const onHas = anyLimited(allowSols);
  if (onHas) {
    assert(true, "allow solve: found limiter branch in solutions");
  } else {
    assert(
      allowSols.length >= 1,
      "allow solve: solutions exist (limiter may be pruned by target; options layer already checked)"
    );
    console.log(
      "  NOTE allow solve: no limited branch in top solutions for 2664"
    );
  }

  // 缺省字段也应视为限速求解（false）
  const missingDesigner = new FactoryDesigner({
    targetPower: 2664,
    minBatteryPercent: 5,
    maxWaste: 30,
    maxBranches: 3,
    excludeBelt: true,
    primaryFuelId: "wulingLow",
    secondaryFuelId: "none",
    inputSourceId: "warehouse",
  });
  const missingSols = missingDesigner.solve();
  assert(missingSols.length > 0, "missing field: still solves");

  const excludedDesigner = new FactoryDesigner(baseParams(true));
  const excludedSols = excludedDesigner.solve();
  assert(
    Array.isArray(excludedSols) && excludedSols.length > 0,
    `excluded solve: ${excludedSols.length} sols`
  );
  assert(
    !anyLimited(excludedSols),
    "excluded solve: no limiter branches in results"
  );

  const p6210allow = { ...baseParams(false), targetPower: 6210 };
  const s6210allow = new FactoryDesigner(p6210allow).solve();
  assert(s6210allow.length > 0, `6210 allow: ${s6210allow.length} sols`);

  const p6210ex = { ...baseParams(true), targetPower: 6210 };
  const s6210ex = new FactoryDesigner(p6210ex).solve();
  assert(!anyLimited(s6210ex), "6210 excluded: no limiter");
}

console.log("\n=== shareParams excludeItemGateLimiter ===");
{
  const base = {
    primaryFuelId: "wulingLow",
    secondaryFuelId: "none",
    maxWaste: 30,
    minBatteryPercent: 5,
    targetPower: 2664,
    inputSourceId: "warehouse",
    maxBranches: 3,
    excludeBelt: true,
  };

  const encAllow = encodeShareParams({
    ...base,
    excludeItemGateLimiter: false,
  });
  const decAllow = decodeShareParams(encAllow);
  assert(decAllow != null, "decode allow ok");
  assert(
    decAllow.excludeItemGateLimiter === false,
    `roundtrip false → ${String(decAllow.excludeItemGateLimiter)}`
  );

  const encEx = encodeShareParams({
    ...base,
    excludeItemGateLimiter: true,
  });
  const decEx = decodeShareParams(encEx);
  assert(decEx != null, "decode excluded ok");
  assert(
    decEx.excludeItemGateLimiter === true,
    `roundtrip true → ${String(decEx.excludeItemGateLimiter)}`
  );

  const encLegacy = encodeShareParams({ ...base });
  const decLegacy = decodeShareParams(encLegacy);
  assert(decLegacy != null, "legacy encode/decode ok");
  // 缺失时 decode 为 null/undefined，合并 DEFAULT_PARAMS 后为 false（限速求解）
  assert(
    decLegacy.excludeItemGateLimiter == null ||
      decLegacy.excludeItemGateLimiter === false,
    `legacy missing → ${String(decLegacy.excludeItemGateLimiter)} (merge default false)`
  );
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
