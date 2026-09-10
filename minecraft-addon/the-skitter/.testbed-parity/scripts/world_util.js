/**
 * Port of com.dogukan.spiderhunt.utilities.UtilitiesKt for Bedrock.
 *
 * Bedrock's script API has no voxel-shape queries, so block collision is
 * resolved from an explicit table (see `PASSABLE`) and the ray cast is a DDA
 * walk instead of Minecraft's `world.raycast`. Semantics of every exported
 * function match the Java original.
 */
import { world, system } from "@minecraft/server";
import { Vec, clamp } from "./vec.js";

/* ------------------------------------------------------------------ blocks */

/** Blocks with an empty collision shape (the Java `VoxelShape.isEmpty()` set). */
const PASSABLE_EXACT = new Set([
  "minecraft:air", "minecraft:cave_air", "minecraft:void_air",
  "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava",
  "minecraft:web", "minecraft:cobweb",
  "minecraft:fire", "minecraft:soul_fire", "minecraft:nether_portal", "minecraft:end_portal",
  "minecraft:torch", "minecraft:soul_torch", "minecraft:redstone_torch", "minecraft:unlit_redstone_torch",
  "minecraft:wall_torch", "minecraft:soul_wall_torch", "minecraft:colored_torch_rg", "minecraft:colored_torch_bp",
  "minecraft:redstone_wire", "minecraft:redstone_dust",
  "minecraft:rail", "minecraft:golden_rail", "minecraft:detector_rail", "minecraft:activator_rail",
  "minecraft:lever", "minecraft:tripwire", "minecraft:tripwire_hook", "minecraft:string",
  "minecraft:ladder", "minecraft:vine", "minecraft:cave_vines", "minecraft:cave_vines_body_with_berries",
  "minecraft:cave_vines_head_with_berries", "minecraft:twisting_vines", "minecraft:weeping_vines",
  "minecraft:tallgrass", "minecraft:short_grass", "minecraft:fern", "minecraft:large_fern",
  "minecraft:double_plant", "minecraft:deadbush", "minecraft:seagrass", "minecraft:kelp",
  "minecraft:yellow_flower", "minecraft:red_flower", "minecraft:wither_rose", "minecraft:torchflower",
  "minecraft:pitcher_plant", "minecraft:sapling", "minecraft:bamboo_sapling",
  "minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot", "minecraft:reeds",
  "minecraft:sugar_cane", "minecraft:nether_wart", "minecraft:pumpkin_stem", "minecraft:melon_stem",
  "minecraft:crimson_roots", "minecraft:warped_roots", "minecraft:nether_sprouts", "minecraft:fungus",
  "minecraft:crimson_fungus", "minecraft:warped_fungus", "minecraft:brown_mushroom", "minecraft:red_mushroom",
  "minecraft:glow_lichen", "minecraft:sculk_vein", "minecraft:hanging_roots", "minecraft:spore_blossom",
  "minecraft:pink_petals", "minecraft:small_dripleaf_block", "minecraft:frogspawn",
  "minecraft:structure_void", "minecraft:light_block",
  "minecraft:sign", "minecraft:wall_sign", "minecraft:standing_sign", "minecraft:hanging_sign",
  "minecraft:item_frame", "minecraft:frame", "minecraft:glow_frame", "minecraft:flower_pot",
  "minecraft:wooden_button", "minecraft:stone_button", "minecraft:wooden_pressure_plate",
  "minecraft:stone_pressure_plate", "minecraft:light_weighted_pressure_plate",
  "minecraft:heavy_weighted_pressure_plate", "minecraft:snow_layer", "minecraft:powder_snow",
]);

const PASSABLE_MATCHES = [
  "_torch", "_sapling", "_button", "_pressure_plate", "_sign", "_banner", "_candle",
  "_coral_fan", "_rail", "_fungus", "_roots", "_vines", "_flower",
];

function isLeavesId(id) {
  return id.includes("leaves");
}

/** Approximation of `state.getCollisionShape(...).isEmpty()`. */
export function blockIsPassable(block) {
  if (!block) return true;
  let id;
  try {
    id = block.typeId;
  } catch {
    return true;
  }
  if (PASSABLE_EXACT.has(id)) return true;
  for (const part of PASSABLE_MATCHES) {
    if (id.endsWith(part)) return true;
  }
  try {
    if (block.isAir || block.isLiquid) return true;
  } catch {
    /* older runtimes without these accessors */
  }
  return false;
}

export function getBlockSafe(dimension, x, y, z) {
  try {
    return dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
  } catch {
    return undefined;
  }
}

/** `UtilitiesKt.isPassable` */
export function isPassable(dimension, position) {
  const block = getBlockSafe(dimension, position.x, position.y, position.z);
  if (!block) return true;
  return blockIsPassable(block);
}

/** `UtilitiesKt.isBodyPassable` - leaves count as passable. */
export function isBodyPassable(dimension, position) {
  const block = getBlockSafe(dimension, position.x, position.y, position.z);
  if (!block) return true;
  let id;
  try {
    id = block.typeId;
  } catch {
    return true;
  }
  if (isLeavesId(id)) return true;
  return blockIsPassable(block);
}

/** `UtilitiesKt.isLiquid` */
export function isLiquid(dimension, position) {
  const block = getBlockSafe(dimension, position.x, position.y, position.z);
  if (!block) return false;
  try {
    if (block.isLiquid) return true;
  } catch {
    /* fall through to the id check */
  }
  try {
    const id = block.typeId;
    return id === "minecraft:water" || id === "minecraft:flowing_water" ||
      id === "minecraft:lava" || id === "minecraft:flowing_lava";
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- ray casting */

const MAX_RAY_STEPS = 512;

/**
 * `UtilitiesKt.raycastGround` - DDA walk that stops on the first colliding
 * block and returns the exact surface point, or null when nothing was hit.
 */
export function raycastGround(dimension, position, direction, maxDistance, ignoreLeaves = false) {
  if (!(maxDistance > 0)) return null;
  const lengthSquared = direction.lengthSquared();
  if (lengthSquared === 0 || Number.isNaN(lengthSquared)) return null;
  if (!position.isFinite()) return null;

  const dir = direction.clone().normalize();
  if (!dir.isFinite()) return null;

  let x = Math.floor(position.x);
  let y = Math.floor(position.y);
  let z = Math.floor(position.z);

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dir.x);
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dir.y);
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dir.z);

  const boundary = (origin, cell, step) =>
    step > 0 ? cell + 1 - origin : step < 0 ? origin - cell : Infinity;

  let tMaxX = stepX === 0 ? Infinity : boundary(position.x, x, stepX) * tDeltaX;
  let tMaxY = stepY === 0 ? Infinity : boundary(position.y, y, stepY) * tDeltaY;
  let tMaxZ = stepZ === 0 ? Infinity : boundary(position.z, z, stepZ) * tDeltaZ;

  // A ray that starts inside a solid block hits at distance 0, exactly like
  // Minecraft's own clip() call.
  const startBlock = getBlockSafe(dimension, x, y, z);
  if (startBlock && !blockIsPassable(startBlock) &&
      !(ignoreLeaves && isLeavesId(safeTypeId(startBlock)))) {
    return { hitPosition: position.clone() };
  }

  let travelled = 0;
  for (let step = 0; step < MAX_RAY_STEPS; step++) {
    let axis;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      travelled = tMaxX; x += stepX; tMaxX += tDeltaX; axis = 0;
    } else if (tMaxY <= tMaxZ) {
      travelled = tMaxY; y += stepY; tMaxY += tDeltaY; axis = 1;
    } else {
      travelled = tMaxZ; z += stepZ; tMaxZ += tDeltaZ; axis = 2;
    }
    if (travelled > maxDistance) return null;

    const block = getBlockSafe(dimension, x, y, z);
    if (!block) return null;
    if (blockIsPassable(block)) continue;
    if (ignoreLeaves && isLeavesId(safeTypeId(block))) continue;

    const hit = new Vec(
      position.x + dir.x * travelled,
      position.y + dir.y * travelled,
      position.z + dir.z * travelled,
    );
    // Snap the crossed axis onto the block face so heights stay exact.
    if (axis === 0) hit.x = stepX > 0 ? x : x + 1;
    else if (axis === 1) hit.y = stepY > 0 ? y : y + 1;
    else hit.z = stepZ > 0 ? z : z + 1;
    return { hitPosition: hit };
  }
  return null;
}

function safeTypeId(block) {
  try {
    return block.typeId;
  } catch {
    return "";
  }
}

/** `UtilitiesKt.hasLineOfSight` */
export function hasLineOfSight(dimension, from, to) {
  const diff = to.clone().subtract(from);
  const distance = diff.length();
  if (distance < 1e-6) return true;
  return raycastGround(dimension, from, diff, distance, false) === null;
}

/* -------------------------------------------------------- block hardness */

const HARDNESS_EXACT = new Map(Object.entries({
  "minecraft:bedrock": -1, "minecraft:barrier": -1, "minecraft:command_block": -1,
  "minecraft:chain_command_block": -1, "minecraft:repeating_command_block": -1,
  "minecraft:structure_block": -1, "minecraft:structure_void": -1, "minecraft:jigsaw": -1,
  "minecraft:end_portal": -1, "minecraft:end_portal_frame": -1, "minecraft:end_gateway": -1,
  "minecraft:light_block": -1, "minecraft:reinforced_deepslate": 55,
  "minecraft:obsidian": 50, "minecraft:crying_obsidian": 50, "minecraft:respawn_anchor": 50,
  "minecraft:netherite_block": 50, "minecraft:ancient_debris": 30, "minecraft:enchanting_table": 5,
  "minecraft:anvil": 5, "minecraft:ender_chest": 22.5, "minecraft:spawner": 5, "minecraft:mob_spawner": 5,
  "minecraft:air": 0, "minecraft:cave_air": 0, "minecraft:water": 0, "minecraft:lava": 0,
  "minecraft:flowing_water": 0, "minecraft:flowing_lava": 0,
  "minecraft:dirt": 0.5, "minecraft:coarse_dirt": 0.5, "minecraft:rooted_dirt": 0.5,
  "minecraft:grass_block": 0.6, "minecraft:grass": 0.6, "minecraft:podzol": 0.5, "minecraft:mycelium": 0.6,
  "minecraft:farmland": 0.6, "minecraft:dirt_with_roots": 0.5, "minecraft:mud": 0.5,
  "minecraft:sand": 0.5, "minecraft:red_sand": 0.5, "minecraft:gravel": 0.6, "minecraft:clay": 0.6,
  "minecraft:soul_sand": 0.5, "minecraft:soul_soil": 0.5, "minecraft:magma": 0.5,
  "minecraft:snow": 0.1, "minecraft:snow_layer": 0.1, "minecraft:powder_snow": 0.25,
  "minecraft:ice": 0.5, "minecraft:packed_ice": 0.5, "minecraft:blue_ice": 2.8, "minecraft:frosted_ice": 0.5,
  "minecraft:stone": 1.5, "minecraft:cobblestone": 2.0, "minecraft:mossy_cobblestone": 2.0,
  "minecraft:deepslate": 3.0, "minecraft:cobbled_deepslate": 3.5, "minecraft:tuff": 1.5,
  "minecraft:calcite": 0.75, "minecraft:dripstone_block": 1.5, "minecraft:pointed_dripstone": 1.5,
  "minecraft:blackstone": 1.5, "minecraft:basalt": 1.25, "minecraft:smooth_basalt": 1.25,
  "minecraft:netherrack": 0.4, "minecraft:end_stone": 3.0, "minecraft:sandstone": 0.8,
  "minecraft:red_sandstone": 0.8, "minecraft:glass": 0.3, "minecraft:glass_pane": 0.3,
  "minecraft:glowstone": 0.3, "minecraft:sea_lantern": 0.3, "minecraft:redstone_lamp": 0.3,
  "minecraft:iron_block": 5.0, "minecraft:gold_block": 3.0, "minecraft:diamond_block": 5.0,
  "minecraft:emerald_block": 5.0, "minecraft:lapis_block": 3.0, "minecraft:redstone_block": 5.0,
  "minecraft:coal_block": 5.0, "minecraft:copper_block": 3.0, "minecraft:quartz_block": 0.8,
  "minecraft:bookshelf": 1.5, "minecraft:melon_block": 1.0, "minecraft:pumpkin": 1.0,
  "minecraft:hay_block": 0.5, "minecraft:sponge": 0.6, "minecraft:tnt": 0,
  "minecraft:bone_block": 2.0, "minecraft:sculk": 0.2, "minecraft:sculk_catalyst": 3.0,
  "minecraft:sculk_shrieker": 3.0, "minecraft:sculk_sensor": 1.5, "minecraft:moss_block": 0.1,
  "minecraft:crafting_table": 2.5, "minecraft:furnace": 3.5, "minecraft:chest": 2.5,
  "minecraft:trapped_chest": 2.5, "minecraft:beacon": 3.0, "minecraft:cactus": 0.4,
}));

const HARDNESS_MATCHES = [
  ["_leaves", 0.2], ["leaves", 0.2],
  ["deepslate_", 4.5], ["_ore", 3.0],
  ["_planks", 2.0], ["_log", 2.0], ["_wood", 2.0], ["_stem", 2.0], ["_hyphae", 2.0],
  ["_stairs", 2.0], ["_slab", 2.0], ["_fence", 2.0], ["_fence_gate", 2.0],
  ["_door", 3.0], ["_trapdoor", 3.0],
  ["_wool", 0.8], ["_carpet", 0.1], ["_terracotta", 1.25], ["_glazed_terracotta", 1.4],
  ["_concrete", 1.8], ["_concrete_powder", 0.5], ["_glass", 0.3], ["_shulker_box", 2.0],
  ["_bricks", 2.0], ["_brick", 2.0], ["_wall", 2.0], ["_sandstone", 0.8],
  ["_copper", 3.0], ["_amethyst", 1.5], ["_mushroom_block", 0.2], ["_nylium", 0.4],
  ["_sapling", 0], ["_flower", 0], ["_bed", 0.2], ["_banner", 1.0], ["_sign", 1.0],
];

/** Approximation of `BlockState.getDestroySpeed(world, pos)` (Java hardness). */
export function blockHardness(block) {
  const id = safeTypeId(block);
  if (!id) return -1;
  const exact = HARDNESS_EXACT.get(id);
  if (exact !== undefined) return exact;
  for (const [needle, value] of HARDNESS_MATCHES) {
    if (id.includes(needle)) return value;
  }
  return 1.5;
}

/** Breaks a block and drops its items, like `world.breakBlock(pos, true)`. */
export function breakBlockWithDrops(dimension, x, y, z) {
  try {
    dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
    return true;
  } catch {
    const block = getBlockSafe(dimension, x, y, z);
    if (!block) return false;
    try {
      block.setType("minecraft:air");
      return true;
    } catch {
      return false;
    }
  }
}

export function setBlockType(dimension, x, y, z, ids) {
  const block = getBlockSafe(dimension, x, y, z);
  if (!block) return false;
  for (const id of ids) {
    try {
      block.setType(id);
      return true;
    } catch {
      /* try the next alias */
    }
  }
  return false;
}

/* ------------------------------------------------------- sound / particles */

/**
 * Java sound event -> Bedrock sound event ids, most faithful first. Every id is
 * attempted in order and failures are swallowed, so an id that a given Bedrock
 * build does not know can never break the hunt.
 */
export const SOUNDS = {
  GENERIC_EAT: ["random.eat"],
  RAVAGER_ROAR: ["mob.ravager.roar", "mob.ravager.celebrate"],
  RAVAGER_ATTACK: ["mob.ravager.bite", "mob.ravager.roar"],
  ENDER_DRAGON_GROWL: ["mob.enderdragon.growl"],
  WARDEN_DIG: ["mob.warden.dig", "mob.warden.roar"],
  WARDEN_SNIFF: ["mob.warden.sniff", "mob.warden.listening"],
  WARDEN_HEARTBEAT: ["mob.warden.heartbeat", "mob.warden.nearby_closest"],
  WARDEN_ATTACK_IMPACT: ["mob.warden.attack_impact", "mob.warden.attack", "random.explode"],
  SCULK_SENSOR_CLICKING: ["block.sculk_sensor.clicking", "block.sculk_sensor.place"],
  SCULK_SHRIEKER_SHRIEK: ["block.sculk_shrieker.shriek", "block.sculk_sensor.clicking"],
  SPIDER_HURT: ["mob.spider.say"],
  SPIDER_AMBIENT: ["mob.spider.say"],
  SPIDER_DEATH: ["mob.spider.death"],
  SPIDER_STEP: ["mob.spider.step", "step.stone"],
  LLAMA_SPIT: ["mob.llama.spit", "mob.llama.angry"],
  SLIME_BLOCK_PLACE: ["mob.slime.small", "mob.slime.attack"],
  SLIME_BLOCK_BREAK: ["mob.slime.big", "mob.slime.attack"],
  WOOL_STEP: ["step.cloth", "step.grass"],
  SHIELD_BLOCK: ["item.shield.block", "random.anvil_land"],
  SHIELD_BREAK: ["item.shield.break", "random.break"],
  GENERIC_EXPLODE: ["random.explode"],
  PLAYER_BURP: ["random.burp"],
  PLAYER_SPLASH: ["random.splash"],
  ENDERMAN_TELEPORT: ["mob.endermen.portal"],
  NETHERITE_BLOCK_STEP: ["step.netherite", "step.stone"],
  NETHERITE_BLOCK_FALL: ["step.netherite", "step.stone"],
};

export function playSound(dimension, position, sound, volume, pitch) {
  const ids = Array.isArray(sound) ? sound : [sound];
  const location = { x: position.x, y: position.y, z: position.z };
  const safePitch = clamp(pitch, 0.01, 2.0);
  for (const id of ids) {
    try {
      dimension.playSound(id, location, { volume, pitch: safePitch });
      return;
    } catch {
      /* unknown id on this build - try the fallback */
    }
  }
  // Dimension.playSound is missing on a few older runtimes; the command form
  // is always there.
  try {
    dimension.runCommand(
      `playsound ${ids[0]} @a ${position.x.toFixed(2)} ${position.y.toFixed(2)} ` +
      `${position.z.toFixed(2)} ${volume.toFixed(2)} ${safePitch.toFixed(2)}`,
    );
  } catch {
    /* sound is cosmetic - never let it break the hunt */
  }
}

/**
 * Bedrock particle names for each Java particle used by the mod, most faithful
 * first.
 */
export const PARTICLES = {
  CRIT: ["minecraft:critical_hit_emitter", "minecraft:basic_crit_particle"],
  SWEEP_ATTACK: ["minecraft:sweep_attack", "minecraft:critical_hit_emitter"],
  EXPLOSION_EMITTER: ["minecraft:huge_explosion_emitter", "minecraft:explosion_manual"],
  EXPLOSION: ["minecraft:explosion_manual", "minecraft:basic_smoke_particle"],
  CLOUD: ["minecraft:basic_smoke_particle"],
  POOF: ["minecraft:basic_smoke_particle"],
  SNOWFLAKE: ["minecraft:snowflake_particle", "minecraft:basic_smoke_particle"],
  ITEM_SNOWBALL: ["minecraft:snowball_poof", "minecraft:snowflake_particle"],
  SQUID_INK: ["minecraft:ink_emitter", "minecraft:basic_smoke_particle"],
  SPLASH: ["minecraft:water_splash_particle", "minecraft:basic_smoke_particle"],
  SCULK_CHARGE_POP: ["minecraft:sculk_charge_pop_particle", "minecraft:basic_crit_particle"],
  BLOCK_DUST: ["minecraft:basic_smoke_particle"],
};

/** Hard cap so a single effect can never flood the particle budget. */
const MAX_PARTICLES_PER_CALL = 24;

/**
 * `UtilitiesKt.spawnParticle`. Bedrock spawns one particle per call, so the
 * count/offset form of the Java helper is emulated with a gaussian scatter.
 */
export function spawnParticle(dimension, particle, position, count, offsetX, offsetY, offsetZ) {
  const ids = Array.isArray(particle) ? particle : [particle];
  const total = Math.min(Math.max(count | 0, 1), MAX_PARTICLES_PER_CALL);
  let chosen = null;
  for (let i = 0; i < total; i++) {
    const location = {
      x: position.x + gaussian() * offsetX,
      y: position.y + gaussian() * offsetY,
      z: position.z + gaussian() * offsetZ,
    };
    if (chosen !== null) {
      try {
        dimension.spawnParticle(chosen, location);
      } catch {
        return;
      }
      continue;
    }
    for (const id of ids) {
      try {
        dimension.spawnParticle(id, location);
        chosen = id;
        break;
      } catch {
        /* try the next alias */
      }
    }
    if (chosen === null) return;
  }
}

function gaussian() {
  // Sum of three uniforms, close enough to Java's Random.nextGaussian() spread
  // for particle scatter and much cheaper.
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.1547;
}

/**
 * `UtilitiesKt.shakeCamera`. Java sends repeated hurt-animation packets; Bedrock
 * has a real camera shake, so the strength is mapped onto it directly.
 */
export function shakeCamera(player, strength) {
  const intensity = clamp(strength * 1.2, 0.05, 4.0);
  const seconds = clamp(0.3 + strength * 0.5, 0.1, 2.0);
  const args = `${intensity.toFixed(3)} ${seconds.toFixed(3)} positional`;
  try {
    player.runCommand(`camerashake add @s ${args}`);
    return;
  } catch {
    /* the player's own permission level may not allow camerashake */
  }
  try {
    const name = String(player.name).replace(/["\\]/g, "");
    player.dimension.runCommand(`camerashake add "${name}" ${args}`);
  } catch {
    /* camerashake unavailable - purely cosmetic, ignore */
  }
}

/* ---------------------------------------------------------------- scheduler */

const pendingTasks = [];

/** `UtilitiesKt.runLater` - delay is in ticks. */
export function runLater(delayTicks, task) {
  pendingTasks.push({ remaining: Math.max(delayTicks, 0), task });
}

/** Drives `runLater`; called once per server tick from main.js. */
export function tickScheduler() {
  for (let i = pendingTasks.length - 1; i >= 0; i--) {
    const entry = pendingTasks[i];
    if (--entry.remaining > 0) continue;
    pendingTasks.splice(i, 1);
    try {
      entry.task();
    } catch (error) {
      console.warn(`[skitter] scheduled task failed: ${error}`);
    }
  }
}

export function clearScheduler() {
  pendingTasks.length = 0;
}

export { world, system };
