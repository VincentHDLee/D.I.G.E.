import { FactoryDesigner } from '../src/utils/FactoryDesigner';

const designer = new FactoryDesigner({
  targetPower: 5750,
  minBatteryPercent: 5,
  maxWaste: 50,
  maxBranches: 4,
  primaryFuelId: 'wulingLow',
  secondaryFuelId: 'none',
  inputSourceId: 'warehouse',
  excludeBelt: true,
});

const t0 = Date.now();
const solutions = designer.solve();
const ms = Date.now() - t0;
console.log(`solutions=${solutions.length} ${ms}ms`);

for (let i = 0; i < Math.min(5, solutions.length); i++) {
  const s = solutions[i];
  const osc = s.oscillating || [];
  const limited = osc.filter((b) => b.requiresLimiter && b.limiterSpeed != null);
  const speeds = [...new Set(limited.map((b) => b.limiterSpeed as number))].sort(
    (a, b) => a - b
  );
  const summary = speeds.length ? speeds.join('/') : null;
  console.log(
    `sol${i}: base=${s.baseConfig?.totalPower ?? '?'} avg=${s.avgPower?.toFixed?.(1)} limiterSummary=${summary}`
  );
  for (const b of osc) {
    console.log(
      `  1/${b.denominator} p=${Math.round(b.power)} lim=${b.limiterSpeed ?? '-'} req=${!!b.requiresLimiter} ${b.description ?? ''}`
    );
  }
}
