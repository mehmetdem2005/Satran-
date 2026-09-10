/**
 * Port of com.dogukan.spiderhunt.misc.ConfigData / SpiderConfig.
 * Every field, name and default value is identical to the Java mod.
 * On Bedrock there is no config file on disk, so overrides live in a world
 * dynamic property and can be edited with `/scriptevent skitter:config`.
 */
import { world } from "@minecraft/server";

const STORAGE_KEY = "skitter:config";

export const DEFAULTS = Object.freeze({
  baseSizeBlocks: 3.0,
  growthFactor: 1.4,
  killsBase: 10,
  killsStep: 5,
  damageBase: 6.0,
  damageStep: 2.0,
  attackRangeBase: 0.9,
  attackRangeScale: 1.8,
  verticalRangeBase: 1.8,
  verticalRangeScale: 1.3,
  poisonChance: 0.45,
  poisonMinSeconds: 3.0,
  poisonMaxSeconds: 5.0,
  healthBase: 60.0,
  speedBase: 0.5,
  speedStep: 0.1,
  fleeSpeedMultiplier: 1.5,
  climbSpeedFactor: 0.8,
  visionPerBlock: 10.0,
  jumpCooldownTicks: 200,
  webPullCooldownTicks: 200,
  grabCooldownTicks: 400,
  despawnAfterLostTicks: 200,
  respawnCooldownTicks: 600,
  stuckDespawnTicks: 300,
  blockBreakingPhase: 3,
  maxBlockHardness: 25.0,
  ticksPerHardness: 5.0,
  cosmetic: "widow",
  retreatPounceChance: 0.1,
  silentPursuitChance: 0.15,
  mercyChance: 0.35,
  retreatChanceBase: 0.5,
  retreatChanceStep: 0.1,
  jumpPowerMultiplier: 1.0,
  jumpShakeMultiplier: 1.0,
  jumpGroundBreakMultiplier: 1.0,
  jumpSmashesBlocks: true,
  miniCountMin: 3,
  miniCountMax: 5,
  miniHealth: 12.0,
  miniDamage: 3.0,
  miniSpeedBoost: 2.8,
  miniScale: 0.25,
});

/** Live config object; mutate through `setConfigValue` so it persists. */
export const cfg = Object.assign({}, DEFAULTS);

export function loadConfig() {
  let raw;
  try {
    raw = world.getDynamicProperty(STORAGE_KEY);
  } catch {
    raw = undefined;
  }
  Object.assign(cfg, DEFAULTS);
  if (typeof raw !== "string" || raw.length === 0) return;
  try {
    const parsed = JSON.parse(raw);
    for (const key of Object.keys(DEFAULTS)) {
      if (parsed[key] !== undefined && typeof parsed[key] === typeof DEFAULTS[key]) {
        cfg[key] = parsed[key];
      }
    }
  } catch {
    /* corrupt override blob - fall back to defaults */
  }
}

export function saveConfig() {
  const diff = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (cfg[key] !== DEFAULTS[key]) diff[key] = cfg[key];
  }
  try {
    world.setDynamicProperty(STORAGE_KEY, JSON.stringify(diff));
  } catch {
    /* dynamic property budget exceeded - keep the in-memory value anyway */
  }
}

/** Returns an error string, or null when the value was applied. */
export function setConfigValue(key, rawValue) {
  if (!(key in DEFAULTS)) return `Unknown config key '${key}'`;
  const kind = typeof DEFAULTS[key];
  let value;
  if (kind === "number") {
    value = Number(rawValue);
    if (!Number.isFinite(value)) return `'${rawValue}' is not a number`;
    if (Number.isInteger(DEFAULTS[key])) value = Math.round(value);
  } else if (kind === "boolean") {
    if (rawValue !== "true" && rawValue !== "false") return `'${rawValue}' is not true/false`;
    value = rawValue === "true";
  } else {
    value = String(rawValue);
  }
  cfg[key] = value;
  saveConfig();
  return null;
}

export function resetConfig() {
  Object.assign(cfg, DEFAULTS);
  saveConfig();
}
