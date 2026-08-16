import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";

// 模拟用户场景：5825W，2×高谷 + 1×中武 手动常驻，高谷作主燃料震荡
const params = {
  targetPower: 5825,
  minBatteryPercent: 5,
  maxWaste: 50,
  maxBranches: 3,
  primaryFuelId: "valleyHigh",
  secondaryFuelId: "none",
  inputSourceId: "warehouse",
  excludeBelt: true,
  excludeItemGateLimiter: false,
  autoPlanBasePools: false,
  manualBaseLines: [
    { id: "m1", fuelId: "valleyHigh", count: 2 },
    { id: "m2", fuelId: "wulingMid", count: 1 },
  ],
};

const sols = new FactoryDesigner(params).solve();
console.log("solutions", sols.length);
if (!sols.length) {
  console.error("no solutions");
  process.exit(1);
}

let anySaved = false;
for (let i = 0; i < Math.min(5, sols.length); i++) {
  const s = sols[i];
  console.log("--- sol", i, "avg", s.avgPower, "base", s.baseConfig.totalPower);
  console.log(
    "branches",
    (s.oscillating || []).map((b) => ({
      p: b.power,
      D: b.denominator,
      lim: b.limiterSpeed,
    }))
  );
  for (const item of s.fuelBOM || []) {
    console.log("BOM",
      item.fuelId,
      "base", item.basePoolCount,
      "oscGens", item.oscGeneratorCount,
      "perMin", item.totalRatePerMin.toFixed(2),
      "perDay", item.totalRatePerDay.toFixed(0),
      "savedDay", item.savedRatePerDay.toFixed(0),
      "saved%", item.savedPercent.toFixed(1)
    );
    if (item.fuelId === "valleyHigh" && item.savedRatePerDay > 0.5) anySaved = true;
  }
}

if (!anySaved) {
  console.error("FAIL: valleyHigh savedRatePerDay still 0");
  process.exit(1);
}
console.log("PASS bom savings");
