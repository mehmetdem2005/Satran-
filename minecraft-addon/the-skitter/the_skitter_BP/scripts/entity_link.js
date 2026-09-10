/**
 * Bridges a simulated `Creature` to the Bedrock entity that renders it.
 *
 * In the Java mod the visible creature is a swarm of block-display entities
 * plus an `Interaction` hitbox and a hidden silverfish "decoy" that exists so
 * mob AI and damage sources have something to point at. Bedrock has none of
 * those, but it does have real custom entities, so all three roles collapse
 * into one `skitter:skitter` entity: it is the model, the hitbox and the
 * damage source.
 */
import { EntityDamageCause } from "@minecraft/server";
import { isValidEntity } from "./entity_info.js";
import { toDegrees, clamp } from "./vec.js";
import { cfg } from "./config.js";

export const SKITTER_ID = "skitter:skitter";

/** Growth factor and phase count, mirrored from Hunt/ConfigData. */
const GROWTH_FACTOR = 1.4;
const MAX_PHASE = 5;
const MINI_SCALE = 0.25;

/**
 * Bedrock can only change a collision box by swapping component groups, so the
 * box that best matches the creature's *actual* scale is picked here. That
 * keeps the hitbox in step with `/spider scale` too, not just with the phase.
 */
function collisionGroupFor(creature) {
  if (creature.isMini) return "skitter:set_mini";
  const scale = creature.scale;
  if (scale <= MINI_SCALE * 1.5) return "skitter:set_mini";
  let best = 1;
  let bestError = Infinity;
  for (let phase = 1; phase <= MAX_PHASE; phase++) {
    const error = Math.abs(Math.pow(GROWTH_FACTOR, phase - 1) - scale);
    if (error < bestError) {
      bestError = error;
      best = phase;
    }
  }
  return `skitter:set_phase_${best}`;
}

/** Enum member names differ between @minecraft/server 1.x and 2.x. */
const ATTACK_CAUSE =
  EntityDamageCause?.entityAttack ?? EntityDamageCause?.EntityAttack ?? "entityAttack";
export const CREATURE_TAG = "skitter.creature";
export const MINI_TAG = "skitter.mini";

/** entity.id -> Creature, so damage events can find the simulation. */
const byEntityId = new Map();

/**
 * Counters for `/scriptevent skitter:debug`. They make it possible to tell
 * "my hits never reach the server" apart from "my hits land but the creature
 * ignores them" without attaching a debugger.
 */
export const diagnostics = {
  hurtEvents: 0,
  ignoredNoAttacker: 0,
  ignoredSelfInflicted: 0,
  applied: 0,
};

export function creatureForEntity(entity) {
  if (!entity) return undefined;
  try {
    return byEntityId.get(entity.id);
  } catch {
    return undefined;
  }
}

export function isSkitterEntity(entity) {
  try {
    return entity?.typeId === SKITTER_ID;
  } catch {
    return false;
  }
}

/**
 * Java hangs the Interaction hitbox at `position + (0, -0.65 * scale, 0)` and
 * an Interaction entity's position IS the bottom of its box, so the box is
 * centred on the body rather than resting on the ground. Bedrock anchors a
 * collision box at the entity's location, so the entity goes to that same
 * height and the model is drawn 0.35 * scale lower to compensate.
 */
const HITBOX_BOTTOM_BELOW_BODY = 0.65;

function entityLocation(creature) {
  return {
    x: creature.position.x,
    y: creature.position.y - HITBOX_BOTTOM_BELOW_BODY * creature.scale,
    z: creature.position.z,
  };
}

/** Spawns the render entity for a freshly created creature. */
export function attachEntity(creature, phase) {
  detachEntity(creature);
  let entity;
  try {
    entity = creature.dimension.spawnEntity(SKITTER_ID, entityLocation(creature));
  } catch (error) {
    console.warn(`[skitter] could not spawn render entity: ${error}`);
    return undefined;
  }
  creature.entity = entity;
  try {
    byEntityId.set(entity.id, creature);
    entity.addTag(creature.isMini ? MINI_TAG : CREATURE_TAG);
    entity.nameTag = "";
    entity.triggerEvent(collisionGroupFor(creature));
    setProperty(entity, "skitter:phase", clamp(phase | 0, 1, 5));
    setProperty(entity, "skitter:style", cfg.cosmetic === "husk" ? "husk" : "widow");
    setProperty(entity, "skitter:scale", clamp(creature.scale, 0.05, 20.0));
  } catch (error) {
    console.warn(`[skitter] could not configure render entity: ${error}`);
  }
  creature._properties = {};
  syncEntity(creature);
  return entity;
}

export function detachEntity(creature) {
  const entity = creature.entity;
  creature.entity = null;
  if (!entity) return;
  try {
    byEntityId.delete(entity.id);
  } catch {
    /* entity handle already invalid */
  }
  try {
    if (isValidEntity(entity)) entity.remove();
  } catch {
    /* already gone */
  }
}

function setProperty(entity, id, value) {
  try {
    entity.setProperty(id, value);
  } catch {
    /* property missing on an older pack version */
  }
}

function setCached(creature, entity, id, value, epsilon) {
  const cache = creature._properties || (creature._properties = {});
  const previous = cache[id];
  if (previous !== undefined && epsilon !== undefined && Math.abs(previous - value) < epsilon) return;
  if (previous === value) return;
  cache[id] = value;
  setProperty(entity, id, value);
}

function animationState(creature) {
  if (creature.burrowing) return "burrow";
  if (creature.climbing) return "climb";
  if (creature.falling) return "air";
  const speed = Math.hypot(creature.velocity.x, creature.velocity.z);
  if (speed < 0.004) return "idle";
  return creature.gallop ? "gallop" : "walk";
}

/** Pushes the simulation state onto the render entity. Called once per tick. */
export function syncEntity(creature) {
  const entity = creature.entity;
  if (!entity) return false;
  try {
    if (!isValidEntity(entity)) {
      byEntityId.delete(entity.id);
      creature.entity = null;
      return false;
    }
    const location = entityLocation(creature);
    if (!Number.isFinite(location.x) || !Number.isFinite(location.y) || !Number.isFinite(location.z)) {
      return true;
    }
    entity.teleport(location, {
      dimension: creature.dimension,
      rotation: { x: 0, y: toDegrees(creature.yaw) },
      keepVelocity: false,
    });

    const walkSpeed = Math.max(creature.layout.walkSpeed, 1e-6);
    const speed = clamp(Math.hypot(creature.velocity.x, creature.velocity.z) / walkSpeed, 0, 8);

    setCached(creature, entity, "skitter:scale", clamp(creature.scale, 0.05, 20.0), 0.001);
    setCached(creature, entity, "skitter:speed", Math.round(speed * 100) / 100, 0.02);
    setCached(creature, entity, "skitter:pitch", clamp(creature.pitch, -1.6, 1.6), 0.01);
    setCached(creature, entity, "skitter:roll", clamp(creature.roll, -1.6, 1.6), 0.01);
    setCached(creature, entity, "skitter:crouch", clamp(creature.crouch, 0, 1), 0.02);
    setCached(creature, entity, "skitter:strike", clamp(creature.strikeTicks / 6, 0, 1), 0.02);
    setCached(creature, entity, "skitter:state", animationState(creature));

    syncHealthBar(creature, entity);
    return true;
  } catch {
    // The handle went stale between the validity check and the teleport; the
    // next tick re-checks it.
    return true;
  }
}

/**
 * The simulation owns the health value (Java keeps it on the Creature object),
 * so the entity's own health is only a display mirror and must never reach 0
 * on its own.
 */
function syncHealthBar(creature, entity) {
  try {
    const health = entity.getComponent("minecraft:health");
    if (!health) return;
    const max = health.effectiveMax ?? health.defaultValue ?? 1024;
    const ratio = creature.maxHealth > 0 ? creature.health / creature.maxHealth : 1;
    const mirrored = clamp(ratio * max, 1, max);
    if (Math.abs(health.currentValue - mirrored) > 0.5) {
      health.setCurrentValue(mirrored);
    }
  } catch {
    /* health component unavailable */
  }
}

/** Damage source used for every bite the creature deals (`DecoyKt.attackDamageSource`). */
export function hurtEntity(creature, victim, amount) {
  try {
    victim.applyDamage(amount, {
      cause: ATTACK_CAUSE,
      damagingEntity: creature.entity ?? undefined,
    });
    return true;
  } catch {
    try {
      victim.applyDamage(amount, { cause: ATTACK_CAUSE });
      return true;
    } catch {
      return false;
    }
  }
}

/** True when this entity is the body of a live simulation. */
export function isOwnedEntity(entity) {
  try {
    return byEntityId.has(entity.id);
  } catch {
    return false;
  }
}

/**
 * Removes stray skitter entities that no live simulation owns any more - the
 * Bedrock stand-in for Java's ServerEntityEvents.ENTITY_LOAD cleanup.
 */
export function cullOrphans(dimension) {
  let entities;
  try {
    entities = dimension.getEntities({ type: SKITTER_ID });
  } catch {
    return;
  }
  for (const entity of entities) {
    if (isOwnedEntity(entity)) continue;
    try {
      entity.remove();
    } catch {
      /* already gone */
    }
  }
}

/** Drops a dead entity from the lookup so the map cannot grow unbounded. */
export function forgetEntity(entity) {
  try {
    byEntityId.delete(entity.id);
  } catch {
    /* handle already invalid */
  }
}

export function forgetAll() {
  byEntityId.clear();
}
