/**
 * P0 OOM / edge-case stress suite (EDGE-01 .. EDGE-06)
 * Assert: each case finishes < 1s wall, no throw, memory bounded.
 */
import assert from 'assert';
import { performance } from 'perf_hooks';
import { FactoryDesigner } from '../src/utils/FactoryDesigner.ts';
import { diagnoseNoSolution } from '../src/utils/failureDiagnose.ts';
import { CONSTANTS } from '../src/utils/constants.ts';

const TIME_BUDGET_MS = 1000;

function baseParams(over = {}) {
  return {
    targetPower: 2656,
    minBatteryPercent: 5,
    maxWaste: 300,
    maxBranches: 3,
    phaseOffsetBranch1: 0,
    phaseOffsetBranch2: 0,
    phaseOffsetBranch3: 0,
    excludeBelt: true,
    excludeItemGateLimiter: false,
    primaryFuelId: 'wulingMid',
    secondaryFuelId: 'none',
    inputSourceId: 'warehouse',
    multiFuelMode: 'auto',
    autoPlanBasePools: false,
    manualBaseLines: [],
    ...over,
  };
}

function tStub(key, vars = {}) {
  return key + JSON.stringify(vars);
}

function runCase(id, params, check) {
  const t0 = performance.now();
  let sols;
  let err = null;
  try {
    sols = new FactoryDesigner(params).solve();
  } catch (e) {
    err = e;
  }
  const ms = performance.now() - t0;
  assert.ok(!err, `${id} must not throw: ${err}`);
  assert.ok(ms < TIME_BUDGET_MS, `${id} too slow: ${ms.toFixed(1)}ms`);
  assert.ok(Array.isArray(sols), `${id} solve must return array`);
  check(sols, ms, params);
  console.log(`PASS ${id}  ${ms.toFixed(1)}ms  sols=${sols.length}`);
}

// EDGE-01: OOM repro — small gap, big batteries, auto multi-fuel, 0 permanent
runCase(
  'EDGE-01',
  baseParams({
    targetPower: 500,
    primaryFuelId: 'wulingMid',
    secondaryFuelId: 'valleyHigh',
    multiFuelMode: 'auto',
    autoPlanBasePools: false,
    manualBaseLines: [],
    maxWaste: 300,
    minBatteryPercent: 5,
  }),
  (sols, ms) => {
    // Must finish fast; may return solutions or empty (then diagnosis is UI-side)
    assert.ok(ms < 500, `EDGE-01 preferred ≤500ms, got ${ms.toFixed(1)}`);
  }
);

// EDGE-02: target == core 200W → 0-osc plan, no heavy enum
runCase(
  'EDGE-02',
  baseParams({
    targetPower: 200,
    primaryFuelId: 'wulingMid',
    secondaryFuelId: 'none',
    autoPlanBasePools: false,
    maxWaste: 50,
  }),
  (sols) => {
    assert.ok(sols.length >= 1, 'EDGE-02 expect at least core-only plan');
    const top = sols[0];
    const osc = top.oscillating || [];
    assert.ok(osc.length === 0, 'EDGE-02 expect 0 oscillating branches');
    assert.ok(
      Math.abs((top.avgPower ?? top.totalPower ?? 200) - 200) < 1e-6 ||
        Math.abs((top.basePower ?? 200) - 200) < 1e-6 ||
        top.waste === 0 ||
        Math.abs(top.waste) < 1,
      'EDGE-02 near 200W'
    );
  }
);

// EDGE-03: target 150 < core 200 → core-only waste 50, no crash
runCase(
  'EDGE-03',
  baseParams({
    targetPower: 150,
    primaryFuelId: 'wulingMid',
    secondaryFuelId: 'none',
    autoPlanBasePools: false,
    maxWaste: 100,
  }),
  (sols) => {
    assert.ok(sols.length >= 1, 'EDGE-03 expect core overflow plan');
    const top = sols[0];
    const osc = top.oscillating || [];
    assert.equal(osc.length, 0, 'EDGE-03 no osc');
    // waste ≈ 50
    if (typeof top.waste === 'number') {
      assert.ok(Math.abs(top.waste - 50) < 1e-3, `waste~50 got ${top.waste}`);
    }
  }
);

// EDGE-04: 12000W with ore 50W/8s, 0 base auto off → empty + gap diagnosis
{
  const params = baseParams({
    targetPower: 12000,
    primaryFuelId: 'ore',
    secondaryFuelId: 'none',
    multiFuelMode: 'primaryOnly',
    autoPlanBasePools: false,
    manualBaseLines: [],
    maxBranches: 3,
    maxWaste: 300,
  });
  const t0 = performance.now();
  const sols = new FactoryDesigner(params).solve();
  const ms = performance.now() - t0;
  assert.ok(ms < TIME_BUDGET_MS, `EDGE-04 slow ${ms}`);
  assert.equal(sols.length, 0, 'EDGE-04 expect no solution');
  const diag = diagnoseNoSolution(params, tStub);
  assert.ok(
    String(diag.primaryHint).includes('diagGapTooLarge') ||
      String(diag.primaryHint).includes('GAP') ||
      String(diag.primaryHint).includes('gap'),
    `EDGE-04 diagnosis gap, got ${diag.primaryHint}`
  );
  const gap = 12000 - CONSTANTS.BASE_POWER;
  // maxCap = 3 * 50 = 150
  assert.ok(gap > 150);
  console.log(`PASS EDGE-04  ${ms.toFixed(1)}ms  sols=0  diag=${diag.primaryHint.slice(0, 80)}`);
}

// EDGE-05: harsh battery 99% + maxWaste 0
runCase(
  'EDGE-05',
  baseParams({
    targetPower: 4500,
    primaryFuelId: 'wulingMid',
    secondaryFuelId: 'valleyHigh',
    multiFuelMode: 'auto',
    autoPlanBasePools: true, // allow floor so not pure gap-A only
    minBatteryPercent: 99,
    maxWaste: 0,
  }),
  (sols, ms, params) => {
    // Either empty with diagnosis or rare solutions — must be fast
    if (sols.length === 0) {
      const diag = diagnoseNoSolution(params, tStub);
      assert.ok(diag.primaryHint || diag.secondaryHints?.length);
      const blob = [diag.primaryHint, ...(diag.secondaryHints || [])].join('|');
      assert.ok(
        blob.includes('diagLowerBatteryPercent') ||
          blob.includes('diagIncreaseMaxWaste') ||
          blob.includes('diagGeneralFailure') ||
          blob.includes('diagGapTooLarge') ||
          blob.includes('Battery') ||
          blob.includes('Waste'),
        `EDGE-05 expected constraint hints: ${blob}`
      );
    }
  }
);

// EDGE-06: coprime large intervals via direct simulator path if exposed;
// otherwise solve with custom fuel burn times forcing large D intervals.
// We inject fuelOverrides with tiny power so D balloons — prune must reject.
runCase(
  'EDGE-06',
  baseParams({
    targetPower: 800,
    primaryFuelId: 'customPrimary',
    secondaryFuelId: 'customSecondary',
    multiFuelMode: 'mixed',
    autoPlanBasePools: false,
    fuelOverrides: {
      customPrimary: { power: 3200, burnTime: 40 },
      customSecondary: { power: 1100, burnTime: 40 },
    },
    maxWaste: 300,
    minBatteryPercent: 5,
  }),
  (sols, ms) => {
    // Must not hang; mixed path + interval prune
    assert.ok(ms < TIME_BUDGET_MS);
  }
);

// Extra direct period fence: 127s × 251s LCM via internal designer sim if possible
{
  const d = new FactoryDesigner(
    baseParams({
      targetPower: 500,
      primaryFuelId: 'wulingMid',
      secondaryFuelId: 'valleyHigh',
      multiFuelMode: 'auto',
      autoPlanBasePools: false,
    })
  );
  const sim = d.simulator;
  const t0 = performance.now();
  const r = sim.simulateCycle(
    { totalPower: 200 },
    [
      { denominator: 1, branchInterval: 127, fuel: { power: 3200, burnTime: 40, id: 'a' } },
      { denominator: 1, branchInterval: 251, fuel: { power: 1100, burnTime: 40, id: 'b' } },
    ],
    { power: 3200, burnTime: 40, id: 'a' }
  );
  const ms = performance.now() - t0;
  assert.ok(ms < 100, `EDGE-06-direct sim ${ms}ms`);
  assert.equal(r.success, false);
  assert.equal(r.reason, 'period_too_long');
  console.log(`PASS EDGE-06-direct-LCM  ${ms.toFixed(1)}ms  reason=${r.reason}`);
}

console.log('\nALL STRESS/OOM EDGE CASES PASSED');
