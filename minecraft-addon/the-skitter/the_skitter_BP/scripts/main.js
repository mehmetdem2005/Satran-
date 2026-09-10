/**
 * The Skitter - Bedrock port of the Fabric mod "The Skitter" (spiderhunt) by
 * Adalances. Entry point; mirrors com.dogukan.spiderhunt.SpiderHuntMod.
 */
import { world, system } from "@minecraft/server";
import { loadConfig, cfg } from "./config.js";
import { tickScheduler, resetCommandBudget } from "./world_util.js";
import { IdleBrain } from "./creature.js";
import { Hunt } from "./hunt.js";
import { AppState, WorldState, closeCreature } from "./state.js";
import { GameMaster } from "./gamemaster.js";
import { HunterBrain, MiniHunterBrain } from "./brains.js";
import { damageCreature, die } from "./hunting.js";
import { refreshPlayerFilters } from "./players.js";
import {
  creatureForEntity, syncEntity, cullOrphans, isSkitterEntity, isOwnedEntity,
  forgetEntity, diagnostics,
} from "./entity_link.js";
import { Vec } from "./vec.js";
import { registerCommands } from "./commands.js";

const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const SAVE_INTERVAL_TICKS = 200;
const ORPHAN_SCAN_INTERVAL_TICKS = 100;

let saveTimer = SAVE_INTERVAL_TICKS;
let orphanTimer = ORPHAN_SCAN_INTERVAL_TICKS;
let started = false;

/* --------------------------------------------------------------- main loop */

function tickAll() {
  resetCommandBudget();
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
    if (creature.outOfBounds) {
      console.warn("[skitter] creature left the world, despawning it");
      GameMaster.despawn(creature, cfg.respawnCooldownTicks);
    } else if (!creature.dead && AppState.creature === creature) {
      syncEntity(creature);
    }
  }

  for (const mini of [...AppState.minis]) {
    if (mini.dead) continue;
    if (!(mini.brain instanceof MiniHunterBrain)) mini.setBrain(new MiniHunterBrain(mini));
    mini.update();
    if (mini.outOfBounds) {
      const index = AppState.minis.indexOf(mini);
      if (index >= 0) AppState.minis.splice(index, 1);
      closeCreature(mini);
    } else if (!mini.dead) {
      syncEntity(mini);
    }
  }

  GameMaster.tick();

  if (--orphanTimer <= 0) {
    orphanTimer = ORPHAN_SCAN_INTERVAL_TICKS;
    // Java culls tagged leftovers in ServerEntityEvents.ENTITY_LOAD, which
    // covers every dimension; do the same rather than only where a creature
    // happens to live right now.
    for (const id of DIMENSIONS) {
      try {
        cullOrphans(world.getDimension(id));
      } catch {
        /* dimension not loaded on this world */
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
    diagnostics.hurtEvents++;

    // Java only routes damage into the creature when the source has a living
    // attacker (ServerLivingEntityEvents.ALLOW_DAMAGE checks
    // `source.getEntity() instanceof LivingEntity`), so anonymous damage -
    // explosions, cacti, the void - is ignored outright.
    const attacker = event.damageSource?.damagingEntity;
    if (!attacker) {
      diagnostics.ignoredNoAttacker++;
      return;
    }
    // A creature can never wound another creature (Java: the decoy check).
    if (isSkitterEntity(attacker)) {
      diagnostics.ignoredSelfInflicted++;
      return;
    }

    const amount = event.damage;
    if (!(amount > 0)) return;
    diagnostics.applied++;
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
    forgetEntity(event.deadEntity);
    creature.entity = null;
    creature.health = 0;
    die(creature);
  }, "entityDie");

  // Java has no spawn egg; Bedrock creates one automatically for a summonable
  // entity, and a bare body with no simulation behind it would just stand
  // there. Treat it as `/spider summon` instead so the egg does what a player
  // expects, and drop the extra body when a creature already exists (Java
  // only ever runs one).
  subscribe(() => world.afterEvents.entitySpawn, (event) => {
    const entity = event.entity;
    if (!isSkitterEntity(entity) || isOwnedEntity(entity)) return;
    let cause = "";
    let location;
    let dimension;
    let rotation = 0;
    try {
      cause = String(event.cause ?? "");
      location = new Vec(entity.location.x, entity.location.y, entity.location.z);
      dimension = entity.dimension;
      rotation = entity.getRotation().y;
    } catch {
      return;
    }
    if (cause === "Loaded") return;   // leftovers from a reload: let the cull take them
    system.run(() => {
      try {
        entity.remove();
      } catch {
        /* already gone */
      }
      if (AppState.creature !== null) return;
      Hunt.start(Hunt.phase);
      AppState.createCreature(dimension, location, rotation);
    });
  }, "entitySpawn");

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
