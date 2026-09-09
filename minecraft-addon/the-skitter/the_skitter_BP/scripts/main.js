/**
 * The Skitter - Bedrock port of the Fabric mod "The Skitter" (spiderhunt) by
 * Adalances. Entry point; mirrors com.dogukan.spiderhunt.SpiderHuntMod.
 */
import { world, system } from "@minecraft/server";
import { loadConfig } from "./config.js";
import { tickScheduler } from "./world_util.js";
import { IdleBrain } from "./creature.js";
import { Hunt } from "./hunt.js";
import { AppState, WorldState } from "./state.js";
import { GameMaster } from "./gamemaster.js";
import { HunterBrain, MiniHunterBrain } from "./brains.js";
import { damageCreature, die, refreshPlayerFilters } from "./hunting.js";
import { creatureForEntity, syncEntity, cullOrphans, isSkitterEntity } from "./entity_link.js";
import { registerCommands } from "./commands.js";

const SAVE_INTERVAL_TICKS = 200;
const ORPHAN_SCAN_INTERVAL_TICKS = 100;

let saveTimer = SAVE_INTERVAL_TICKS;
let orphanTimer = ORPHAN_SCAN_INTERVAL_TICKS;
let started = false;

/* --------------------------------------------------------------- main loop */

function tickAll() {
  refreshPlayerFilters();

  // Java order: WorldState.tick(server) -> Scheduler.tick() (which drives the
  // per-tick creature task registered by SpiderHuntMod.onInitialize).
  WorldState.tick();
  tickScheduler();

  const creature = AppState.creature;
  if (creature !== null && !creature.dead) {
    if (Hunt.enabled) {
      if (!(creature.brain instanceof HunterBrain)) creature.setBrain(new HunterBrain(creature));
    } else if (!(creature.brain instanceof IdleBrain)) {
      creature.setBrain(new IdleBrain());
    }
    creature.update();
    if (!creature.dead && AppState.creature === creature) syncEntity(creature);
  }

  for (const mini of [...AppState.minis]) {
    if (mini.dead) continue;
    if (!(mini.brain instanceof MiniHunterBrain)) mini.setBrain(new MiniHunterBrain(mini));
    mini.update();
    if (!mini.dead) syncEntity(mini);
  }

  GameMaster.tick();

  if (--orphanTimer <= 0) {
    orphanTimer = ORPHAN_SCAN_INTERVAL_TICKS;
    for (const creatureEntry of AppState.allCreatures()) {
      cullOrphans(creatureEntry.dimension);
    }
    if (AppState.allCreatures().length === 0) {
      try {
        cullOrphans(world.getDimension("minecraft:overworld"));
      } catch {
        /* dimension not ready */
      }
    }
  }

  if (--saveTimer <= 0) {
    saveTimer = SAVE_INTERVAL_TICKS;
    WorldState.save();
  }
}

/* ------------------------------------------------------------------ events */

function subscribe(getter, handler, label) {
  try {
    const event = getter();
    if (!event || typeof event.subscribe !== "function") return;
    event.subscribe(handler);
  } catch (error) {
    console.warn(`[skitter] could not subscribe to ${label}: ${error}`);
  }
}

function registerEvents() {
  // ServerLivingEntityEvents.ALLOW_DAMAGE + AttackEntityCallback: any damage
  // dealt to the creature's body feeds the simulated health pool.
  subscribe(() => world.afterEvents.entityHurt, (event) => {
    const creature = creatureForEntity(event.hurtEntity);
    if (!creature || creature.dead) return;

    const attacker = event.damageSource?.damagingEntity;
    // A creature can never wound another creature (Java: the decoy check).
    if (attacker && isSkitterEntity(attacker)) return;

    const amount = event.damage;
    if (!(amount > 0)) return;
    damageCreature(creature, amount);

    if (attacker) {
      try {
        if (attacker.typeId === "minecraft:player") {
          creature.grudgeTarget = attacker.id;
          creature.grudgeTicks = 600;
        }
      } catch {
        /* stale handle */
      }
    }
  }, "entityHurt");

  // The render entity is not supposed to be able to die on its own; if some
  // other mod or command kills it anyway, fold that back into the simulation.
  subscribe(() => world.afterEvents.entityDie, (event) => {
    const creature = creatureForEntity(event.deadEntity);
    if (!creature || creature.dead) return;
    creature.entity = null;
    creature.health = 0;
    die(creature);
  }, "entityDie");

  subscribe(() => world.afterEvents.playerLeave, () => {
    WorldState.save();
  }, "playerLeave");
}

/* ------------------------------------------------------------------- start */

function start() {
  if (started) return;
  started = true;
  loadConfig();
  WorldState.load();
  registerCommands();
  registerEvents();
  system.runInterval(() => {
    try {
      tickAll();
    } catch (error) {
      console.warn(`[skitter] tick failed: ${error}\n${error?.stack ?? ""}`);
    }
  }, 1);
  console.warn("[skitter] The Skitter loaded");
}

// worldInitialize fires before any dynamic property read is safe on some
// builds, so the real start-up is deferred by one tick.
try {
  world.afterEvents.worldLoad.subscribe(() => system.run(start));
} catch {
  /* older runtimes do not have worldLoad */
}
try {
  world.afterEvents.worldInitialize.subscribe(() => system.run(start));
} catch {
  /* newer runtimes replaced worldInitialize with worldLoad */
}
system.runTimeout(start, 20);
