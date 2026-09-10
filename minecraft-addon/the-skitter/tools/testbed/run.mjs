/**
 * Boots the behaviour pack against the stub in mc_stub.mjs and runs a few
 * thousand ticks of a full hunt, so import errors, typos and runtime faults
 * surface here instead of in the game's content log.
 *
 *   node tools/testbed/run.mjs
 */
import { mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sandbox = path.join(root, ".testbed");

rmSync(sandbox, { recursive: true, force: true });
mkdirSync(path.join(sandbox, "node_modules/@minecraft/server"), { recursive: true });
cpSync(path.join(root, "the_skitter_BP/scripts"), path.join(sandbox, "scripts"), { recursive: true });
cpSync(path.join(here, "mc_stub.mjs"), path.join(sandbox, "node_modules/@minecraft/server/index.mjs"));
writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(path.join(sandbox, "node_modules/@minecraft/server/package.json"),
              JSON.stringify({ name: "@minecraft/server", type: "module", main: "index.mjs" }));

const stub = await import(path.join(sandbox, "node_modules/@minecraft/server/index.mjs"));

const failures = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  const text = args.join(" ");
  if (/failed|could not|error/i.test(text) && !/could not subscribe/.test(text)) {
    failures.push(text);
  }
  originalWarn("      ", text);
};

const { world, system, Player, overworldDimension, stats } = stub;

// A small arena: solid ground up to y=63, air above.
const player = new Player({ x: 0.5, y: 64, z: 0.5 }, overworldDimension);
overworldDimension._entities.add(player);
const cow = overworldDimension.spawnEntity("minecraft:cow", { x: 6, y: 64, z: 4 });

await import(path.join(sandbox, "scripts/main.js"));
const stateModule = await import(path.join(sandbox, "scripts/state.js"));
const skitterState = () => stateModule.AppState;

function fire(id, message = "") {
  system.afterEvents.scriptEventReceive._fire({ id, message, sourceEntity: player });
}

let ticks = 0;
function run(count) {
  for (let i = 0; i < count; i++) {
    // Keep the prey alive, otherwise the creature correctly loses its target
    // and burrows away long before the checks below run.
    player._health.currentValue = 20;
    system._tick();
    ticks++;
  }
}

console.log("booting…");
run(30);

console.log("summoning at phase 1…");
fire("skitter:summon", "1");
run(1);
run(400);

const skitters = overworldDimension.getEntities({ type: "skitter:skitter" });
console.log(`  skitter entities alive: ${skitters.length}`);
if (skitters.length !== 1) failures.push(`expected exactly one skitter entity, got ${skitters.length}`);
else {
  const props = skitters[0].properties;
  console.log(`  properties: ${[...props].map(([k, v]) => `${k}=${v}`).join(", ")}`);
  for (const required of ["skitter:scale", "skitter:state", "skitter:speed", "skitter:phase", "skitter:style"]) {
    if (!props.has(required)) failures.push(`entity never received ${required}`);
  }
}

console.log("status / config / cosmetic / scale / phase…");
fire("skitter:status");
console.log(`  ${player.lastMessage}`);
fire("skitter:debug");
console.log(`  ${String(player.lastMessage).split("\n").join("\n  ")}`);
fire("skitter:config", "poisonChance 0.9");
console.log(`  ${player.lastMessage}`);
fire("skitter:cosmetic", "husk");
console.log(`  ${player.lastMessage}`);
fire("skitter:scale", "2.5");
console.log(`  ${player.lastMessage}`);
fire("skitter:phase", "5");
console.log(`  ${player.lastMessage}`);
run(200);

console.log("damaging the creature…");
const { diagnostics } = await import(path.join(sandbox, "scripts/entity_link.js"));
const healthBefore = overworldDimension.getEntities({ type: "skitter:skitter" }).length;
const target = overworldDimension.getEntities({ type: "skitter:skitter" })[0];
if (target) {
  for (let i = 0; i < 40; i++) {
    world._fireHurt(target, 12, player);
    run(11);
  }
}
run(200);
console.log(`  damage events: seen ${diagnostics.hurtEvents}, applied ${diagnostics.applied}, ` +
            `ignored (no attacker) ${diagnostics.ignoredNoAttacker}`);
if (diagnostics.applied === 0) failures.push("player damage never reached the simulation");
console.log(`  skitters after the kill: ${overworldDimension.getEntities({ type: "skitter:skitter" }).length}`);
void healthBefore;

const minis = overworldDimension.getEntities({ type: "skitter:skitter" });
console.log(`  brood spawned by the phase-5 death: ${minis.length}`);
if (minis.length < 3) failures.push(`phase 5 death should scatter a brood, saw ${minis.length}`);
run(400);
fire("skitter:remove");
run(20);

console.log("running an attended hunt through a wall for 2500 ticks…");
const blocksBefore = stats.getBlock;
const queriesBefore = stats.entityQueries;
// A stone wall between the creature and the player, to exercise BlockBreaker.
for (let y = 64; y < 70; y++) {
  for (let x = -8; x <= 8; x++) world._terrain.set(`${x},${y},12`, "minecraft:stone");
}
player.location = { x: 0.5, y: 64, z: 0.5 };
player._health.currentValue = 20;
fire("skitter:summon", "3");
run(1);
const hunter = overworldDimension.getEntities({ type: "skitter:skitter" })[0];
if (hunter) hunter.location = { x: 0.5, y: 64, z: 24 };
const seenStates = new Set();
for (let i = 0; i < 2500; i++) {
  run(1);
  const live = overworldDimension.getEntities({ type: "skitter:skitter" })[0];
  if (live) seenStates.add(live.getProperty("skitter:state"));
}
console.log(`  animation states observed: ${[...seenStates].sort().join(", ")}`);
console.log(`  getBlock calls: ${((stats.getBlock - blocksBefore) / 2500).toFixed(1)}/tick, ` +
            `entity queries: ${((stats.entityQueries - queriesBefore) / 2500).toFixed(2)}/tick`);
console.log(`  block commands issued: ${stats.commands.length}`);
if (!seenStates.has("walk") && !seenStates.has("gallop")) {
  failures.push("the creature never entered a moving animation state");
}

console.log("unloaded chunk / out of world guards…");
fire("skitter:remove");
run(20);
player.location = { x: 0.5, y: 64, z: 0.5 };
fire("skitter:summon", "1");
run(20);
const guarded = skitterState().creature;
const yBefore = guarded ? guarded.position.y : 0;
world._unloaded = () => true;          // every block query now fails
run(200);
world._unloaded = null;
const yAfter = skitterState().creature ? skitterState().creature.position.y : yBefore;
console.log(`  body y with no chunk loaded: ${yBefore.toFixed(2)} -> ${yAfter.toFixed(2)}`);
if (Math.abs(yAfter - yBefore) > 0.001) {
  failures.push(`the creature must hold still while its chunk is unloaded (moved ${(yAfter - yBefore).toFixed(2)})`);
}
run(40);
if (!skitterState().creature) failures.push("the creature vanished after the chunk came back");

// Force it out of the world and make sure it is retired rather than falling forever.
if (skitterState().creature) skitterState().creature.position.y = -500;
run(5);
console.log(`  after being pushed to y=-500: ${skitterState().creature ? "still simulated" : "despawned"}`);
if (skitterState().creature) failures.push("a body below the world floor should be despawned");

console.log("spawn egg / bare summon adoption…");
fire("skitter:remove");
run(30);
overworldDimension.spawnEntity("skitter:skitter", { x: 4, y: 64, z: 4 });
await new Promise((resolve) => setTimeout(resolve, 0));
run(5);
const adopted = overworldDimension.getEntities({ type: "skitter:skitter" });
console.log(`  bodies after a bare spawn: ${adopted.length}, simulated creature: ${skitterState().creature ? "yes" : "no"}`);
if (adopted.length !== 1) failures.push(`bare spawn should leave exactly one body, got ${adopted.length}`);
if (!skitterState().creature) failures.push("a bare spawn was not adopted into a simulated creature");

// A second bare body while a creature already exists must be discarded.
overworldDimension.spawnEntity("skitter:skitter", { x: 8, y: 64, z: 8 });
await new Promise((resolve) => setTimeout(resolve, 0));
run(5);
const afterSecond = overworldDimension.getEntities({ type: "skitter:skitter" }).length;
console.log(`  bodies after a second bare spawn: ${afterSecond}`);
if (afterSecond !== 1) failures.push(`a duplicate body should be removed, got ${afterSecond}`);

console.log("worst case: phase 5, prey 100 blocks away (long line-of-sight rays)…");
fire("skitter:remove");
run(20);
player.location = { x: 0.5, y: 64, z: 0.5 };
fire("skitter:summon", "5");
run(1);
// Move the prey far away instead of the creature: the simulation owns the
// creature's position, so this is what actually stretches the sight lines.
player.location = { x: 0.5, y: 64, z: 100 };
const stressBlocks = stats.getBlock;
const stressStart = Date.now();
for (let i = 0; i < 600; i++) run(1);
const elapsed = Date.now() - stressStart;
console.log(`  getBlock calls: ${((stats.getBlock - stressBlocks) / 600).toFixed(1)}/tick, ` +
            `wall clock ${(elapsed / 600).toFixed(2)} ms/tick (stubbed world)`);

fire("skitter:remove");
run(60);
fire("skitter:reload");
fire("skitter:hunt", "on");
fire("skitter:resetworld");
run(120);

console.log(`\nticks simulated: ${ticks}`);
console.log(`particles: ${stats.particles}, sounds: ${stats.sounds}, commands: ${stats.commands.length}`);
console.log(`entities spawned: ${stats.spawned.length}`);

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("\nOK - behaviour pack ran clean");
