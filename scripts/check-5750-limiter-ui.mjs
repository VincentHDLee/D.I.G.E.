import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// Prefer compiled-free ts via tsx dynamic import path used by other selftests
async function main() {
  const { FactoryDesigner } = await import(
    pathToFileURL(path.join(root, 'src/utils/FactoryDesigner.ts')).href
  );

  const designer = new FactoryDesigner({
    targetPower: 5750,
    minBatteryPercent: 20,
    maxWaste: 50,
    maxBranches: 4,
    branchPhaseOffset: 0,
    excludeBelt: true,
    primaryFuelId: 'originium_ore',
    secondaryFuelId: null,
    inputSourceId: 'warehouse',
  });

  const solutions = designer.calculate();
  console.log('solutions:', solutions.length);
  for (let i = 0; i < Math.min(5, solutions.length); i++) {
    const s = solutions[i];
    const osc = s.oscillating || [];
    const limited = osc.filter((b) => b.requiresLimiter && b.limiterSpeed != null);
    const speeds = [...new Set(limited.map((b) => b.limiterSpeed))].sort((a, b) => a - b);
    const summary = speeds.length ? speeds.join('/') : null;
    console.log(
      `sol${i}: base=${s.baseConfig?.totalPower ?? '?'} oscN=${osc.length} limiterSummary=${summary} branches=` +
        osc
          .map(
            (b) =>
              `1/${b.denominator}@${Math.round(b.power)}W` +
              (b.requiresLimiter ? `[L${b.limiterSpeed}]` : '')
          )
          .join(' | ')
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
