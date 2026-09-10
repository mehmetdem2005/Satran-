/**
 * Numeric parity check: every derived value the Java mod computes (Hunt's
 * per-phase curves and LimbLayout's gait constants) is printed from the ported
 * JavaScript and compared against the values written straight out of the Java
 * source in tools/testbed/parity_expected.json.
 *
 *   node tools/testbed/parity.mjs
 */
import { mkdirSync, cpSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sandbox = path.join(root, ".testbed-parity");

rmSync(sandbox, { recursive: true, force: true });
mkdirSync(path.join(sandbox, "node_modules/@minecraft/server"), { recursive: true });
cpSync(path.join(root, "the_skitter_BP/scripts"), path.join(sandbox, "scripts"), { recursive: true });
cpSync(path.join(here, "mc_stub.mjs"), path.join(sandbox, "node_modules/@minecraft/server/index.mjs"));
writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(path.join(sandbox, "node_modules/@minecraft/server/package.json"),
              JSON.stringify({ name: "@minecraft/server", type: "module", main: "index.mjs" }));

const { Hunt } = await import(path.join(sandbox, "scripts/hunt.js"));
const { LimbLayout } = await import(path.join(sandbox, "scripts/creature.js"));
const { cfg, DEFAULTS } = await import(path.join(sandbox, "scripts/config.js"));

const actual = { config: { ...DEFAULTS }, hunt: {}, layout: {} };

for (let phase = 1; phase <= 5; phase++) {
  actual.hunt[phase] = {
    scale: Hunt.scaleForPhase(phase),
    sizeBlocks: Hunt.sizeBlocks(phase),
    detectionRadius: Hunt.detectionRadius(phase),
    killsToAdvance: Hunt.killsToAdvance(phase),
    attackDamage: Hunt.attackDamage(phase),
    attackRange: Hunt.attackRange(phase),
    attackVerticalRange: Hunt.attackVerticalRange(phase),
    speedMultiplier: Hunt.speedMultiplier(phase),
    healthForPhase: Hunt.healthForPhase(phase),
  };
}

const LAYOUT_FIELDS = [
  "walkSpeed", "gallopSpeed", "acceleration", "walkTurnRate", "gallopTurnRate",
  "rideHeight", "heightLerp", "tiltLerp", "gravity", "walkStepTrigger",
  "gallopStepTrigger", "walkStepTicksMin", "walkStepTicksMax",
  "gallopStepTicksMin", "gallopStepTicksMax", "walkStepLift", "gallopStepLift",
  "maxReach",
];

for (const [name, scale, boost] of [["main", 1.0, 1.0], ["mini", cfg.miniScale, cfg.miniSpeedBoost]]) {
  const layout = new LimbLayout(scale, boost);
  const entry = {};
  for (const field of LAYOUT_FIELDS) entry[field] = layout[field];
  entry.limbs = layout.limbs.map((limb) => ({
    hip: [limb.hip.x, limb.hip.y, limb.hip.z],
    home: [limb.home.x, limb.home.y, limb.home.z],
    segmentLengths: limb.segmentLengths,
    walkGroup: limb.walkGroup,
    gallopGroup: limb.gallopGroup,
  }));
  actual.layout[name] = entry;
}

const expected = JSON.parse(readFileSync(path.join(here, "parity_expected.json"), "utf8"));

const problems = [];
function compare(pathName, a, b) {
  if (typeof b === "number" && typeof a === "number") {
    if (Math.abs(a - b) > 1e-9) problems.push(`${pathName}: port=${a} java=${b}`);
    return;
  }
  if (Array.isArray(b)) {
    if (!Array.isArray(a) || a.length !== b.length) {
      problems.push(`${pathName}: length ${a?.length} != ${b.length}`);
      return;
    }
    b.forEach((value, index) => compare(`${pathName}[${index}]`, a[index], value));
    return;
  }
  if (b !== null && typeof b === "object") {
    for (const key of Object.keys(b)) compare(`${pathName}.${key}`, a?.[key], b[key]);
    return;
  }
  if (a !== b) problems.push(`${pathName}: port=${JSON.stringify(a)} java=${JSON.stringify(b)}`);
}

compare("", actual, expected);

if (process.argv.includes("--dump")) {
  console.log(JSON.stringify(actual, null, 2));
}

console.log(`compared ${countLeaves(expected)} values from the Java source`);
if (problems.length) {
  console.error(`\n${problems.length} mismatch(es):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("OK - every derived value matches the Java mod");

function countLeaves(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countLeaves(item), 0);
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce((sum, item) => sum + countLeaves(item), 0);
  }
  return 1;
}
