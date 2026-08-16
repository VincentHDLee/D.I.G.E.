/**
 * Module 3 selftest: failureDiagnose + structural smoke
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diagnoseNoSolution,
  estimateBasePower,
} from '../src/utils/failureDiagnose.ts';
import { CONSTANTS } from '../src/utils/constants.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const t = (key, vars = {}) => {
  const templates = {
    diagGapTooLarge: 'gap={{gap}} branches={{branches}} maxCap={{maxCap}}',
    diagEnableAutoBase: 'ENABLE_AUTO_BASE',
    diagAddManualBase: 'ADD_MANUAL_BASE',
    diagUpgradeFuel: 'UPGRADE_FUEL',
    diagGeneralFailure: 'GENERAL_FAILURE',
    diagLowerBatteryPercent: 'LOWER_BAT={{current}}',
    diagIncreaseMaxWaste: 'INC_WASTE={{current}}',
    diagTrySecondaryFuel: 'TRY_SECONDARY',
    diagSuggestionsHeader: 'SUGGESTIONS',
    errorSuggestion: 'FALLBACK',
  };
  const s = templates[key] || key;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
};

function pass(name) {
  console.log('PASS', name);
}

// TC-M3-01: target 5825W, auto off, 0 manual, valleyHigh 1100 × 3 branches
{
  const params = {
    targetPower: 5825,
    minBatteryPercent: 5,
    maxWaste: 30,
    maxBranches: 3,
    primaryFuelId: 'valleyHigh',
    secondaryFuelId: 'none',
    autoPlanBasePools: false,
    manualBaseLines: [],
  };
  const base = estimateBasePower(params);
  assert.equal(base, CONSTANTS.BASE_POWER, 'base should be core only when auto off');
  const gap = 5825 - 200;
  const maxCap = 3 * 1100;
  assert.ok(gap > maxCap, 'precondition gap > maxCap');

  const d = diagnoseNoSolution(params, t);
  assert.match(d.primaryHint, /gap=5625/);
  assert.match(d.primaryHint, /branches=3/);
  assert.match(d.primaryHint, /maxCap=3300/);
  assert.equal(
    d.secondaryHints[0],
    'ENABLE_AUTO_BASE',
    'first suggestion should enable auto base'
  );
  assert.ok(d.secondaryHints.includes('ADD_MANUAL_BASE'));
  assert.ok(d.secondaryHints.includes('UPGRADE_FUEL'));
  pass('TC-M3-01 gap diagnosis');
}

// estimateBasePower legacy default auto floor
{
  const params = {
    targetPower: 2500,
    primaryFuelId: 'wulingMid',
    secondaryFuelId: 'none',
  };
  assert.equal(estimateBasePower(params), 200);
  const params2 = {
    targetPower: 7000,
    primaryFuelId: 'wulingMid',
    secondaryFuelId: 'none',
  };
  assert.equal(estimateBasePower(params2), 6600);
  pass('estimateBasePower legacy auto');
}

// Scene B: tight constraints
{
  const params = {
    targetPower: 800,
    minBatteryPercent: 15,
    maxWaste: 30,
    maxBranches: 3,
    primaryFuelId: 'wulingMid',
    secondaryFuelId: 'none',
    autoPlanBasePools: true,
  };
  const d = diagnoseNoSolution(params, t);
  assert.equal(d.primaryHint, 'GENERAL_FAILURE');
  assert.ok(d.secondaryHints.some((h) => h.startsWith('LOWER_BAT')));
  assert.ok(d.secondaryHints.some((h) => h.startsWith('INC_WASTE')));
  assert.ok(d.secondaryHints.includes('TRY_SECONDARY'));
  pass('TC-M3 scene B hints');
}

// Structural: AdvancedSettingsField + slim Constraints
{
  const adv = fs.readFileSync(
    path.join(root, 'src/components/layout/Sidebar/AdvancedSettingsField.tsx'),
    'utf8'
  );
  assert.ok(adv.includes('useState(true)'), 'advanced default collapsed');
  assert.ok(adv.includes('maxWaste'));
  assert.ok(!adv.includes('excludeBelt'), 'excludeBelt moved out of Advanced');
  assert.ok(adv.includes('phaseOffsetBranch'));

  const cons = fs.readFileSync(
    path.join(root, 'src/components/layout/Sidebar/ConstraintsField.tsx'),
    'utf8'
  );
  assert.ok(cons.includes('minBatteryPercent'));
  assert.ok(cons.includes('maxBranches'));
  assert.ok(!cons.includes('maxWaste'), 'maxWaste moved out of Constraints');
  assert.ok(!cons.includes('excludeBelt'));

  const other = fs.readFileSync(
    path.join(root, 'src/components/layout/Sidebar/OtherSettingsField.tsx'),
    'utf8'
  );
  assert.ok(other.includes('excludeItemGateLimiter'));
  assert.ok(other.includes('excludeBelt'), 'excludeBelt in OtherSettings');

  const side = fs.readFileSync(
    path.join(root, 'src/components/layout/Sidebar/index.tsx'),
    'utf8'
  );
  assert.ok(side.includes('AdvancedSettingsField'));
  const fuelIdx = side.indexOf('<FuelConfigField');
  const baseIdx = side.indexOf('<BasePowerBuilder');
  const consIdx = side.indexOf('<ConstraintsField');
  const otherIdx = side.indexOf('<OtherSettingsField');
  const advIdx = side.indexOf('<AdvancedSettingsField');
  assert.ok(fuelIdx < baseIdx && baseIdx < consIdx, 'Fuel→Base→Constraints');
  assert.ok(otherIdx < advIdx, 'OtherSettings before Advanced');
  pass('TC-M3-02/03 sidebar structure');
}

// i18n keys present in all 8 locales
{
  const keys = [
    'advancedSettingsTitle',
    'diagSuggestionsHeader',
    'diagGeneralFailure',
    'diagGapTooLarge',
    'diagEnableAutoBase',
    'diagAddManualBase',
    'diagUpgradeFuel',
    'diagLowerBatteryPercent',
    'diagIncreaseMaxWaste',
    'diagTrySecondaryFuel',
  ];
  for (const lang of ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'ru', 'id']) {
    const obj = JSON.parse(
      fs.readFileSync(path.join(root, `src/i18n/locales.${lang}.json`), 'utf8')
    );
    for (const k of keys) {
      assert.ok(obj[k], `missing ${k} in ${lang}`);
    }
  }
  pass('i18n x8 keys');
}

console.log('ALL MODULE3 SELFTESTS PASSED');
