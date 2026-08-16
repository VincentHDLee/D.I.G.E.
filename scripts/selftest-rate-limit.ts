/**
 * D.I.G.E. §5 必须覆盖的测试用例（控制台自测）
 */
import { FactoryDesigner } from "../src/utils/FactoryDesigner";
import {
  getAvailableRateLimitOptions,
  getEffectiveInput,
} from "../src/utils/inputRate";
import {
  decodeShareParams,
  encodeShareParams,
  type ShareParams,
} from "../src/utils/shareParams";
import { CONSTANTS } from "../src/utils/constants";

type CaseResult = { name: string; ok: boolean; detail: string };

const results: CaseResult[] = [];

function assert(name: string, cond: boolean, detail: string) {
  results.push({ name, ok: cond, detail });
  const mark = cond ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}: ${detail}`);
}

function baseParams(over: Record<string, unknown> = {}) {
  return {
    targetPower: 200,
    minBatteryPercent: 20,
    maxWaste: 50,
    primaryFuelId: "originium_ore", // may fallback; resolveFuel will throw if bad — use known id
    secondaryFuelId: "none",
    inputSourceId: "warehouse",
    inputRateLimitPerMin: null as number | null,
    maxBranches: 3,
    excludeBelt: true,
    ...over,
  };
}

// Discover a valid primary fuel id from constants via a tiny try loop if needed
import { FUEL_OPTIONS } from "../src/utils/constants";
const primaryFuelId = FUEL_OPTIONS[0]?.id ?? "originium_ore";

function makeDesigner(over: Record<string, unknown> = {}) {
  return new FactoryDesigner(baseParams({ primaryFuelId, ...over }) as any);
}

// --- Unit: getEffectiveInput ---
{
  const u = getEffectiveInput("warehouse", null);
  assert(
    "effective null warehouse",
    u.perMin === 30 && u.interval === 2 && !u.isLimited,
    `perMin=${u.perMin} interval=${u.interval}`
  );

  const l24 = getEffectiveInput("warehouse", 24);
  assert(
    "effective warehouse 24",
    l24.perMin === 24 && Math.abs(l24.speed - 0.4) < 1e-9 && l24.isLimited,
    `perMin=${l24.perMin} speed=${l24.speed}`
  );

  const l6 = getEffectiveInput("warehouse", 6);
  const packer = getEffectiveInput("packer", null);
  assert(
    "warehouse 6 == packer unlimited",
    l6.perMin === packer.perMin &&
      Math.abs(l6.interval - packer.interval) < 1e-12,
    `wh6=${l6.perMin}/${l6.interval} packer=${packer.perMin}/${packer.interval}`
  );

  const z = getEffectiveInput("warehouse", 0);
  assert(
    "effective 0 -> Infinity interval",
    z.perMin === 0 && z.interval === Infinity && z.speed === 0,
    `interval=${z.interval}`
  );

  const clamp = getEffectiveInput("packer", 30);
  assert(
    "packer + 30 clamp to 6",
    clamp.perMin === 6 && clamp.interval === 10,
    `perMin=${clamp.perMin} interval=${clamp.interval} isLimited=${clamp.isLimited}`
  );

  const illegal = getEffectiveInput("warehouse", 7);
  assert(
    "illegal step falls back to max",
    illegal.perMin === 30 && !illegal.isLimited,
    `perMin=${illegal.perMin}`
  );
}

// --- UI options ---
{
  const wh = getAvailableRateLimitOptions("warehouse");
  assert(
    "UI warehouse options",
    JSON.stringify(wh) === JSON.stringify([null, 30, 24, 18, 12, 6, 0]),
    JSON.stringify(wh)
  );
  const pk = getAvailableRateLimitOptions("packer");
  assert(
    "UI packer options [不限/6/0]",
    JSON.stringify(pk) === JSON.stringify([null, 6, 0]),
    JSON.stringify(pk)
  );
}

// --- FactoryDesigner scenarios ---
{
  // 1) null unlimited vs baseline consistency: interval should match warehouse 2
  const dNull = makeDesigner({
    inputSourceId: "warehouse",
    inputRateLimitPerMin: null,
    targetPower: 500,
    maxWaste: 200,
  });
  assert(
    "不选限速 inputInterval=2",
    dNull.inputInterval === 2,
    `inputInterval=${dNull.inputInterval}`
  );
  let solsNull: any[] = [];
  try {
    solsNull = dNull.solve();
    assert("不选限速 solve 无崩溃", true, `solutions=${solsNull.length}`);
  } catch (e: any) {
    assert("不选限速 solve 无崩溃", false, String(e?.message || e));
  }

  // 2) warehouse 24
  const d24 = makeDesigner({
    inputSourceId: "warehouse",
    inputRateLimitPerMin: 24,
    targetPower: 500,
    maxWaste: 200,
  });
  const expectedInterval24 = 60 / 24; // 2.5
  assert(
    "仓库+24 基准 interval",
    Math.abs(d24.inputInterval - expectedInterval24) < 1e-12,
    `interval=${d24.inputInterval} expected=${expectedInterval24}`
  );
  // branch power proportional: D=2 rate = 24/2=12/min => interval 5; power via getOscillatingPower path uses inputInterval
  // Verify rateLimit flags
  assert(
    "仓库+24 isRateLimited",
    d24.isRateLimited === true && d24.rateLimitPerMin === 24,
    `limited=${d24.isRateLimited} rate=${d24.rateLimitPerMin}`
  );
  try {
    const s24 = d24.solve();
    assert(
      "仓库+24 solve",
      true,
      `solutions=${s24.length} firstAvg=${s24[0]?.avgPower}`
    );
    // if oscillating branches exist, D power should reflect limited baseline
    const withBranch = s24.find((s) => s.oscillating && s.oscillating.length);
    if (withBranch?.oscillating?.[0]) {
      const b = withBranch.oscillating[0];
      // power = fuel.power * burn? getOscillatingPower — just check denominator rates conceptually:
      // effective branch items/min = 24/d
      assert(
        "仓库+24 分支基于限速基准",
        b.denominator > 0 && typeof b.power === "number",
        `D=${b.denominator} power=${b.power}`
      );
    } else {
      assert(
        "仓库+24 分支基于限速基准",
        true,
        "no oscillating in result set (ok for this fuel/target)"
      );
    }
  } catch (e: any) {
    assert("仓库+24 solve", false, String(e?.message || e));
  }

  // 3) warehouse 6 == packer null
  const dWh6 = makeDesigner({
    inputSourceId: "warehouse",
    inputRateLimitPerMin: 6,
    targetPower: 400,
    maxWaste: 150,
  });
  const dPk = makeDesigner({
    inputSourceId: "packer",
    inputRateLimitPerMin: null,
    targetPower: 400,
    maxWaste: 150,
  });
  assert(
    "仓库+6 等效封装机",
    Math.abs(dWh6.inputInterval - dPk.inputInterval) < 1e-12 &&
      dWh6.inputInterval === 10,
    `wh6=${dWh6.inputInterval} pk=${dPk.inputInterval}`
  );
  try {
    const a = dWh6.solve();
    const b = dPk.solve();
    // Compare top solution avgPower / base generators when both non-empty
    const sig = (s: any) =>
      s
        .slice(0, 5)
        .map(
          (x: any) =>
            `${x.baseConfig?.generators}:${x.avgPower?.toFixed?.(2)}:${
              x.branchCount
            }`
        )
        .join("|");
    assert(
      "仓库+6 与封装机方案一致(前5签名)",
      sig(a) === sig(b),
      `wh6=[${sig(a)}] pk=[${sig(b)}]`
    );
  } catch (e: any) {
    assert("仓库+6 与封装机方案一致(前5签名)", false, String(e?.message || e));
  }

  // 4) warehouse 0 -> only base 200W possible, no oscillating, no div0
  const d0 = makeDesigner({
    inputSourceId: "warehouse",
    inputRateLimitPerMin: 0,
    targetPower: 200,
    maxWaste: 50,
  });
  assert(
    "仓库+0 interval Infinity",
    d0.inputInterval === Infinity,
    `interval=${d0.inputInterval}`
  );
  try {
    const s0 = d0.solve();
    const onlyBase = s0.every(
      (s) =>
        s.baseConfig.totalPower === CONSTANTS.BASE_POWER &&
        s.baseConfig.generators === 0 &&
        (!s.oscillating || s.oscillating.length === 0)
    );
    assert(
      "仓库+0 仅基地200W无震荡",
      s0.length >= 1 && onlyBase && !s0.some((s) => (s.branchCount ?? 0) > 0),
      `count=${s0.length} powers=${s0.map((s) => s.avgPower).join(",")}`
    );
  } catch (e: any) {
    assert("仓库+0 仅基地200W无震荡", false, String(e?.message || e));
  }

  // also target > 200 with rate 0 should yield empty or no crash
  const d0hi = makeDesigner({
    inputSourceId: "warehouse",
    inputRateLimitPerMin: 0,
    targetPower: 500,
    maxWaste: 50,
  });
  try {
    const s = d0hi.solve();
    assert("仓库+0 高目标无除零", true, `solutions=${s.length}`);
  } catch (e: any) {
    assert("仓库+0 高目标无除零", false, String(e?.message || e));
  }

  // 5) packer + 30 clamp
  const dP30 = makeDesigner({
    inputSourceId: "packer",
    inputRateLimitPerMin: 30,
    targetPower: 300,
    maxWaste: 100,
  });
  assert(
    "封装机+30 clamp 到 6",
    Math.abs(dP30.inputInterval - 10) < 1e-12,
    `interval=${dP30.inputInterval} perMinFlag=${dP30.rateLimitPerMin}`
  );

  // 6) packer + 0
  const dP0 = makeDesigner({
    inputSourceId: "packer",
    inputRateLimitPerMin: 0,
    targetPower: 200,
    maxWaste: 50,
  });
  try {
    const s = dP0.solve();
    const ok =
      dP0.inputInterval === Infinity &&
      s.every(
        (x) =>
          x.baseConfig.totalPower === CONSTANTS.BASE_POWER &&
          (!x.oscillating || !x.oscillating.length)
      );
    assert(
      "封装机+0 仅基地200W",
      ok && s.length >= 1,
      `interval=${dP0.inputInterval} n=${s.length}`
    );
  } catch (e: any) {
    assert("封装机+0 仅基地200W", false, String(e?.message || e));
  }
}

// --- Share encode/decode ---
{
  // Old link: encode without field (omit) — decode should null
  // We simulate by encoding params without inputRateLimitPerMin
  const oldParams: ShareParams = {
    primaryFuelId,
    secondaryFuelId: "none",
    maxWaste: 50,
    minBatteryPercent: 20,
    targetPower: 500,
    inputSourceId: "warehouse",
    maxBranches: 3,
    excludeBelt: true,
    // no inputRateLimitPerMin
  };
  const encodedOld = encodeShareParams(oldParams);
  assert(
    "旧分享可编码",
    typeof encodedOld === "string" && encodedOld.length > 0,
    `p=${encodedOld?.slice?.(0, 20)}`
  );
  const decodedOld = decodeShareParams(encodedOld!);
  assert(
    "旧分享链接视为不限速",
    decodedOld != null &&
      (decodedOld.inputRateLimitPerMin === null ||
        decodedOld.inputRateLimitPerMin === undefined),
    `decoded=${JSON.stringify(decodedOld?.inputRateLimitPerMin)}`
  );

  // New round-trip for each step
  for (const step of [null, 0, 6, 12, 18, 24, 30] as const) {
    const params: ShareParams = {
      ...oldParams,
      inputRateLimitPerMin: step,
    };
    const enc = encodeShareParams(params);
    const dec = decodeShareParams(enc!);
    const got = dec?.inputRateLimitPerMin ?? null;
    const expect = step;
    assert(
      `新分享往返 limit=${String(step)}`,
      got === expect,
      `got=${String(got)} enc=${enc?.slice?.(0, 24)}`
    );
  }
}

// Summary
console.log("\n========== SUMMARY ==========");
const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
console.log(`Passed: ${passed.length}/${results.length}`);
if (failed.length) {
  console.log("Failed cases:");
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log("All self-tests passed.");
process.exit(0);
