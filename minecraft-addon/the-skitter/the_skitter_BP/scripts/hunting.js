/** Port of com.dogukan.spiderhunt.misc.HuntingKt. */
import { world, GameMode } from "@minecraft/server";
import { cfg } from "./config.js";
import { Vec, randomDouble, randomInt } from "./vec.js";
import {
  playSound, spawnParticle, getBlockSafe, setBlockType, SOUNDS, PARTICLES,
} from "./world_util.js";
import { AppState, closeCreature } from "./state.js";
import { Hunt, MAX_PHASE } from "./hunt.js";
import { SKITTER_ID } from "./entity_link.js";
import { isValidEntity } from "./entity_info.js";

/** Enum member names differ between @minecraft/server 1.x and 2.x. */
const CREATIVE = GameMode?.creative ?? GameMode?.Creative ?? "creative";
const SPECTATOR = GameMode?.spectator ?? GameMode?.Spectator ?? "spectator";

/* --------------------------------------------------------------- damage */

export function damageCreature(creature, amount) {
  if (creature.hurtCooldown > 0) return;
  creature.hurtCooldown = 10;
  creature.health -= amount;
  creature.hitCounter++;
  playSound(creature.dimension, creature.position, SOUNDS.SPIDER_HURT, 1.2, creature.isMini ? 1.4 : 0.7);
  spawnParticle(
    creature.dimension, PARTICLES.CRIT, creature.position, 12,
    0.4 * creature.scale, 0.4 * creature.scale, 0.4 * creature.scale,
  );
  if (creature.health <= 0.0) die(creature);
}

export function die(creature) {
  if (creature.isMini) {
    playSound(creature.dimension, creature.position, SOUNDS.SPIDER_DEATH, 1.0, 1.5);
    spawnParticle(creature.dimension, PARTICLES.POOF, creature.position, 12, 0.2, 0.2, 0.2);
    const index = AppState.minis.indexOf(creature);
    if (index >= 0) AppState.minis.splice(index, 1);
    closeCreature(creature);
    return;
  }

  playSound(creature.dimension, creature.position, SOUNDS.SPIDER_DEATH, 1.5, 0.6);
  spawnParticle(creature.dimension, PARTICLES.EXPLOSION_EMITTER, creature.position, 1, 0, 0, 0);

  if (Hunt.phase >= MAX_PHASE) {
    webExplosion(creature);
    spawnBrood(creature);
    Hunt.announce(creature, "The creature has been slain! Its brood scatters from the corpse!");
  } else {
    Hunt.announce(creature, "The creature has been slain!");
  }

  Hunt.enabled = false;
  AppState.setCreature(null);
}

function webExplosion(creature) {
  const dimension = creature.dimension;
  playSound(dimension, creature.position, SOUNDS.SLIME_BLOCK_BREAK, 1.5, 0.6);
  spawnParticle(dimension, PARTICLES.POOF, creature.position, 50, creature.scale, creature.scale * 0.5, creature.scale);
  spawnParticle(dimension, PARTICLES.SNOWFLAKE, creature.position, 60, creature.scale, creature.scale * 0.5, creature.scale);

  const radius = 1.5 * creature.scale + 1.5;
  const count = 10 + Math.trunc(5 * creature.scale);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * radius;
    const x = creature.position.x + Math.cos(angle) * distance;
    const z = creature.position.z + Math.sin(angle) * distance;
    let y = creature.position.y + Math.random() * 2.0;

    let bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    for (let drops = 0; drops < 8; drops++) {
      const here = getBlockSafe(dimension, bx, by, bz);
      const below = getBlockSafe(dimension, bx, by - 1, bz);
      if (!here || !below || !isAirBlock(here) || !isAirBlock(below)) break;
      by -= 1;
    }
    const target = getBlockSafe(dimension, bx, by, bz);
    if (!target || !isAirBlock(target)) continue;
    setBlockType(dimension, bx, by, bz, ["minecraft:web", "minecraft:cobweb"]);
  }
}

function isAirBlock(block) {
  try {
    return block.isAir === true || block.typeId === "minecraft:air";
  } catch {
    return false;
  }
}

function spawnBrood(creature) {
  const count = randomInt(cfg.miniCountMin, Math.max(cfg.miniCountMax, cfg.miniCountMin) + 1);
  for (let i = 0; i < count; i++) {
    const offset = new Vec(randomDouble(-1.5, 1.5), randomDouble(0.0, 0.5), randomDouble(-1.5, 1.5));
    AppState.createMini(creature.dimension, creature.position.clone().add(offset), Math.random() * 360.0);
  }
}

/* ------------------------------------------------------------ target tests */

/**
 * Bedrock has no per-player game-mode getter on every runtime, so the creative
 * and spectator sets are refreshed once per tick from a query.
 */
const excludedPlayers = new Set();

export function refreshPlayerFilters() {
  excludedPlayers.clear();
  for (const mode of [CREATIVE, SPECTATOR]) {
    let players;
    try {
      players = world.getPlayers({ gameMode: mode });
    } catch {
      continue;
    }
    for (const player of players) {
      try {
        excludedPlayers.add(player.id);
      } catch {
        /* stale handle */
      }
    }
  }
}

/** `HuntingKt.isHuntable(PlayerEntity)` */
export function isHuntable(player) {
  if (!isValidEntity(player)) return false;
  try {
    if (excludedPlayers.has(player.id)) return false;
    const health = player.getComponent("minecraft:health");
    if (health && health.currentValue <= 0) return false;
    return true;
  } catch {
    return false;
  }
}

const SHIELD_SLOTS = ["Offhand", "offhand", "Mainhand", "mainhand"];

/**
 * `HuntingKt.isShielding`. On Bedrock a shield only blocks while the player is
 * sneaking, so that replaces Java's `isBlocking()`; the 0.35 facing dot check is
 * unchanged.
 */
export function isShielding(player, creature) {
  let blocking = false;
  try {
    if (!player.isSneaking) return false;
    const equippable = player.getComponent("minecraft:equippable");
    if (!equippable) return false;
    for (const slot of SHIELD_SLOTS) {
      let item;
      try {
        item = equippable.getEquipment(slot);
      } catch {
        continue;
      }
      if (item && item.typeId === "minecraft:shield") {
        blocking = true;
        break;
      }
    }
  } catch {
    return false;
  }
  if (!blocking) return false;

  const toCreature = creature.position.clone().subtract(Vec.from(player.location)).setY(0.0);
  if (toCreature.lengthSquared() < 1e-8) return true;
  toCreature.normalize();

  let look;
  try {
    look = player.getViewDirection();
  } catch {
    return false;
  }
  const lookHorizontal = new Vec(look.x, 0.0, look.z);
  if (lookHorizontal.lengthSquared() < 1e-8) return false;
  lookHorizontal.normalize();
  return lookHorizontal.dot(toCreature) > 0.35;
}

/** Spawn groups the Java mod refuses to hunt, translated to Bedrock type ids. */
const AQUATIC = new Set([
  "minecraft:cod", "minecraft:salmon", "minecraft:tropicalfish", "minecraft:tropical_fish",
  "minecraft:pufferfish", "minecraft:squid", "minecraft:glow_squid", "minecraft:dolphin",
  "minecraft:guardian", "minecraft:elder_guardian", "minecraft:axolotl", "minecraft:tadpole",
]);

/** `HuntingKt.isHuntableMob(MobEntity)` */
export function isHuntableMob(entity) {
  if (!isValidEntity(entity)) return false;
  try {
    const typeId = entity.typeId;
    if (typeId === SKITTER_ID) return false;
    if (typeId === "minecraft:player") return false;
    if (AQUATIC.has(typeId)) return false;
    const health = entity.getComponent("minecraft:health");
    if (!health || health.currentValue <= 0) return false;
    if (entity.isInWater) return false;
    return true;
  } catch {
    return false;
  }
}

/** Every living mob the creature is allowed to eat, nearest-first is up to the caller. */
export function huntableMobsNear(dimension, position, radius) {
  try {
    return dimension.getEntities({
      location: { x: position.x, y: position.y, z: position.z },
      maxDistance: radius,
      families: ["mob"],
      excludeFamilies: ["player", "skitter", "inanimate"],
      excludeTypes: ["minecraft:player", SKITTER_ID],
    }).filter(isHuntableMob);
  } catch {
    return [];
  }
}
