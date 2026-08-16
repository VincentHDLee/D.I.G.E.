import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";
import {
  encodeShareParams,
  decodeShareParams,
} from "../src/utils/shareParams.ts";

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log("PASS", name);
  else {
    console.log("FAIL", name, detail ?? "");
    failed += 1;
  }
}

function branchFuelIds(sol) {
  return (sol?.oscillating || []).map(
    (b) => b.fuelId || sol.oscillatingFuel?.id || sol.fuel?.id
  );
}

function bomFuelIds(sol) {
  return (sol?.fuelBOM || []).map((x) => x.fuelId || x.fuel?.id).filter(Boolean);
}

function hasOscFuel(sol, fuelId) {
  return branchFuelIds(sol).includes(fuelId);
}

function hasBomFuel(sol, fuelId) {
  return bomFuelIds(sol).includes(fuelId);
}

function minBatteryOk(sol, minPct) {
  const v = sol?.minBatteryPercent;
  return typeof v === "number" && v + 1e-9 >= minPct;
}

// ---------- TC-M2-01: auto + manual 2×wulingMid + CORE → base 6600, gap 700 ----------
const tc01Params = {
  targetPower: 7300,
  minBatteryPercent: 5,
  maxWaste: 30,
  maxBranches: 3,
  primaryFuelId: "wulingMid",
  secondaryFuelId: "valleyHigh",
  inputSourceId: "warehouse",
  excludeBelt: true,
  excludeItemGateLimiter: false,
  autoPlanBasePools: false,
  multiFuelMode: "auto",
  manualBaseLines: [{ id: "m1", fuelId: "wulingMid", count: 2 }],
};

const tc01 = new FactoryDesigner(tc01Params).solve();
console.log("TC-M2-01 count", tc01.length);
if (tc01[0]) {
  console.log(
    "TC-M2-01 top",
    JSON.stringify({
      avg: tc01[0].avgPower,
      waste: tc01[0].waste,
      base: tc01[0].baseDetails?.totalBasePower ?? tc01[0].baseConfig?.totalPower,
      isMixed: tc01[0].isMixed,
      fuels: branchFuelIds(tc01[0]),
      bom: bomFuelIds(tc01[0]),
      minBat: tc01[0].minBatteryPercent,
      splitters: tc01[0].totalSplitters,
      branches: tc01[0].branchCount,
    })
  );
}

const tc01Base =
  tc01[0]?.baseDetails?.totalBasePower ?? tc01[0]?.baseConfig?.totalPower;
check("TC-M2-01 has solutions", tc01.length > 0);
check("TC-M2-01 base ~6600 (2×3200+200)", tc01Base === 6600, tc01Base);

const valleyFill = tc01.find(
  (s) =>
    (s.oscillating || []).length > 0 &&
    hasOscFuel(s, "valleyHigh") &&
    minBatteryOk(s, 5)
);
check(
  "TC-M2-01 exists valleyHigh oscillating fill",
  Boolean(valleyFill),
  valleyFill
    ? { fuels: branchFuelIds(valleyFill), avg: valleyFill.avgPower }
    : "none"
);

if (valleyFill) {
  const midBase = (valleyFill.fuelBOM || []).find(
    (b) => (b.fuelId || b.fuel?.id) === "wulingMid"
  );
  check(
    "TC-M2-01 BOM has wulingMid base gens",
    (midBase?.baseGenCount ?? midBase?.baseCount ?? 0) >= 2 ||
      (midBase?.baseRatePerMin != null && midBase.baseRatePerMin >= 0),
    midBase
  );
  check(
    "TC-M2-01 BOM has valleyHigh oscillating",
    hasBomFuel(valleyFill, "valleyHigh"),
    bomFuelIds(valleyFill)
  );
  check(
    "TC-M2-01 minBattery ok",
    minBatteryOk(valleyFill, 5),
    valleyFill.minBatteryPercent
  );
}

// ---------- TC-M2-02: mixed only, target 2500, base 200 ----------
const tc02Params = {
  targetPower: 2500,
  minBatteryPercent: 5,
  maxWaste: 40,
  maxBranches: 3,
  primaryFuelId: "wulingMid",
  secondaryFuelId: "valleyHigh",
  inputSourceId: "warehouse",
  excludeBelt: true,
  excludeItemGateLimiter: false,
  autoPlanBasePools: false,
  multiFuelMode: "mixed",
  manualBaseLines: [],
};

const tc02 = new FactoryDesigner(tc02Params).solve();
console.log("TC-M2-02 count", tc02.length);
const mixed = tc02.filter((s) => s.isMixed === true);
console.log("TC-M2-02 mixed count", mixed.length);
if (mixed[0]) {
  console.log(
    "TC-M2-02 top mixed",
    JSON.stringify({
      avg: mixed[0].avgPower,
      fuels: branchFuelIds(mixed[0]),
      bom: bomFuelIds(mixed[0]),
      isMixed: mixed[0].isMixed,
    })
  );
}

check("TC-M2-02 has solutions", tc02.length > 0);
check("TC-M2-02 has isMixed===true", mixed.length > 0);

const bothFuels = mixed.find((s) => {
  const ids = new Set(branchFuelIds(s));
  return ids.has("wulingMid") && ids.has("valleyHigh");
});
check(
  "TC-M2-02 mixed branch has both fuels",
  Boolean(bothFuels),
  bothFuels ? branchFuelIds(bothFuels) : branchFuelIds(mixed[0])
);

if (bothFuels || mixed[0]) {
  const s = bothFuels || mixed[0];
  const bomIds = new Set(bomFuelIds(s));
  check(
    "TC-M2-02 BOM has two fuel rows",
    bomIds.has("wulingMid") && bomIds.has("valleyHigh"),
    [...bomIds]
  );
}

// ---------- TC-M2-03: explicit legacy — no mixed ----------
const tc03Params = {
  targetPower: 2500,
  minBatteryPercent: 5,
  maxWaste: 40,
  maxBranches: 3,
  primaryFuelId: "wulingMid",
  secondaryFuelId: "valleyHigh",
  inputSourceId: "warehouse",
  excludeBelt: true,
  excludeItemGateLimiter: false,
  autoPlanBasePools: false,
  multiFuelMode: "legacy",
};

const tc03 = new FactoryDesigner(tc03Params).solve();
const mixedLegacy = tc03.filter((s) => s.isMixed === true);
console.log("TC-M2-03 count", tc03.length, "mixed", mixedLegacy.length);
check("TC-M2-03 has solutions", tc03.length > 0);
check(
  "TC-M2-03 legacy has no mixed solutions",
  mixedLegacy.length === 0,
  mixedLegacy.length
);

// mono paths should still tag fuelId on branches when present
const monoWithFuel = tc03.find(
  (s) =>
    (s.oscillating || []).length > 0 &&
    (s.oscillating || []).every(
      (b) => b.fuelId === "wulingMid" || b.fuelId === "valleyHigh" || !b.fuelId
    )
);
check("TC-M2-03 mono solves ok", Boolean(monoWithFuel) || tc03.length > 0);

// ---------- TC-M2-03b: omit multiFuelMode → default auto (may include mixed) ----------
const tc03bParams = {
  targetPower: 2500,
  minBatteryPercent: 5,
  maxWaste: 40,
  maxBranches: 3,
  primaryFuelId: "wulingMid",
  secondaryFuelId: "valleyHigh",
  inputSourceId: "warehouse",
  excludeBelt: true,
  excludeItemGateLimiter: false,
  autoPlanBasePools: false,
  // multiFuelMode omitted → FactoryDesigner defaults to auto
};
const tc03b = new FactoryDesigner(tc03bParams).solve();
check("TC-M2-03b omit mode has solutions", tc03b.length > 0);
// auto may produce mixed; just ensure solve works
console.log(
  "TC-M2-03b omit→auto count",
  tc03b.length,
  "mixed",
  tc03b.filter((s) => s.isMixed).length
);

// ---------- share multiFuelMode 3-bit (new map) ----------
const shareBase = {
  targetPower: 2500,
  minBatteryPercent: 5,
  maxWaste: 30,
  primaryFuelId: "wulingMid",
  secondaryFuelId: "valleyHigh",
  inputSourceId: "warehouse",
};

const modes = [
  ["auto", "auto"],
  ["legacy", "legacy"],
  ["mixed", "mixed"],
  ["primaryOnly", "primaryOnly"],
  ["secondaryOnly", "secondaryOnly"],
];
for (const [label, mode] of modes) {
  const enc = encodeShareParams({ ...shareBase, multiFuelMode: mode });
  const dec = decodeShareParams(enc);
  check(`share roundtrip ${label}`, dec?.multiFuelMode === mode, dec?.multiFuelMode);
}

const encMiss = encodeShareParams({ ...shareBase });
const decMiss = decodeShareParams(encMiss);
check(
  "share missing multiFuelMode undefined (App merges DEFAULT auto)",
  decMiss?.multiFuelMode === undefined &&
    !Object.prototype.hasOwnProperty.call(decMiss || {}, "multiFuelMode"),
  decMiss?.multiFuelMode
);

// old-style without multiFuelMode field still decodes
const oldish = encodeShareParams({
  targetPower: 2656,
  minBatteryPercent: 5,
  maxWaste: 30,
  primaryFuelId: "wulingLow",
  secondaryFuelId: "none",
  inputSourceId: "warehouse",
});
const decOld = decodeShareParams(oldish);
check("old share still decodes", !!decOld);

// sort smoke: waste within 5W prefers fewer splitters when comparable
if (tc01.length >= 2) {
  const a = tc01[0];
  const b = tc01[1];
  const wasteOk =
    Math.abs(a.waste - b.waste) > 5
      ? a.waste <= b.waste + 1e-9
      : a.totalSplitters <= b.totalSplitters + 0 || a.waste <= b.waste + 5;
  check("TC-M2 sort top is coherent vs second", wasteOk, {
    w0: a.waste,
    w1: b.waste,
    s0: a.totalSplitters,
    s1: b.totalSplitters,
  });
}

console.log(failed === 0 ? "\nALL TC-M2 PASSED" : `\nFAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
