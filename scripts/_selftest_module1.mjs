import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";
import { encodeShareParams, decodeShareParams } from "../src/utils/shareParams.ts";

const base = {
  targetPower: 2656,
  minBatteryPercent: 5,
  maxWaste: 30,
  maxBranches: 3,
  primaryFuelId: "wulingLow",
  secondaryFuelId: "none",
  inputSourceId: "warehouse",
  excludeBelt: true,
  excludeItemGateLimiter: false,
};

function summarize(sols) {
  return sols.slice(0, 3).map((s) => ({
    avg: s.avgPower,
    waste: s.waste,
    base: s.baseConfig?.totalPower,
    gens: s.baseConfig?.generators,
    branches: s.branchCount,
    splitters: s.totalSplitters,
    hasBom: Array.isArray(s.fuelBOM) && s.fuelBOM.length > 0,
    hasDetails: !!s.baseDetails,
    auto: s.baseDetails?.autoBaseCount,
    core: s.baseDetails?.corePower,
    manualN: s.baseDetails?.manualLines?.length ?? 0,
  }));
}

let failed = 0;
function check(name, cond) {
  if (cond) console.log("PASS", name);
  else {
    console.log("FAIL", name);
    failed += 1;
  }
}

const legacy = new FactoryDesigner(base).solve();
console.log("LEGACY count", legacy.length);
console.log("LEGACY top", JSON.stringify(summarize(legacy)));
check("legacy has solutions", legacy.length > 0);
check("legacy has baseDetails", !!legacy[0]?.baseDetails);
check("legacy has fuelBOM", Array.isArray(legacy[0]?.fuelBOM));
check("legacy core 200", legacy[0]?.baseDetails?.corePower === 200);

const noAuto = new FactoryDesigner({ ...base, autoPlanBasePools: false }).solve();
console.log("NO_AUTO count", noAuto.length);
console.log("NO_AUTO top", JSON.stringify(summarize(noAuto)));
check("noAuto solves", noAuto.length > 0);
check(
  "noAuto autoBaseCount 0 on layered path",
  (noAuto[0]?.baseDetails?.autoBaseCount ?? 0) === 0 ||
    noAuto[0]?.baseDetails?.manualLines?.length === 0
);

const manual = new FactoryDesigner({
  ...base,
  autoPlanBasePools: false,
  manualBaseLines: [{ id: "t1", fuelId: "wulingLow", count: 1 }],
}).solve();
console.log("MANUAL count", manual.length);
console.log("MANUAL top", JSON.stringify(summarize(manual)));
if (manual[0]?.baseDetails) {
  console.log(
    "MANUAL details",
    JSON.stringify({
      core: manual[0].baseDetails.corePower,
      total: manual[0].baseDetails.totalBasePower,
      manual: manual[0].baseDetails.manualLines.map((l) => ({
        c: l.count,
        p: l.power,
        f: l.fuel.id,
      })),
      auto: manual[0].baseDetails.autoBaseCount,
    })
  );
}
check("manual solves", manual.length > 0);
check("manual total includes 200+1600", manual[0]?.baseDetails?.totalBasePower === 1800);
check("manual auto 0", manual[0]?.baseDetails?.autoBaseCount === 0);
check("manual one line", manual[0]?.baseDetails?.manualLines?.length === 1);

const encTrue = encodeShareParams({ ...base, autoPlanBasePools: true });
const decTrue = decodeShareParams(encTrue);
const encFalse = encodeShareParams({ ...base, autoPlanBasePools: false });
const decFalse = decodeShareParams(encFalse);
const encMiss = encodeShareParams({ ...base });
const decMiss = decodeShareParams(encMiss);
console.log("SHARE true", decTrue?.autoPlanBasePools);
console.log("SHARE false", decFalse?.autoPlanBasePools);
console.log(
  "SHARE miss hasKey",
  Object.prototype.hasOwnProperty.call(decMiss || {}, "autoPlanBasePools"),
  "val",
  decMiss?.autoPlanBasePools
);
check("share true", decTrue?.autoPlanBasePools === true);
check("share false", decFalse?.autoPlanBasePools === false);
check(
  "share missing stays undefined",
  !Object.prototype.hasOwnProperty.call(decMiss || {}, "autoPlanBasePools")
);

const oldish = encodeShareParams({
  targetPower: 2656,
  minBatteryPercent: 5,
  maxWaste: 30,
  primaryFuelId: "wulingLow",
  secondaryFuelId: "none",
  inputSourceId: "warehouse",
});
const decOld = decodeShareParams(oldish);
check("old share decodes", !!decOld);
check(
  "old share no auto key",
  !Object.prototype.hasOwnProperty.call(decOld || {}, "autoPlanBasePools")
);

console.log(failed === 0 ? "\n=== ALL PASS ===" : `\n=== ${failed} FAILED ===`);
process.exit(failed === 0 ? 0 : 1);
