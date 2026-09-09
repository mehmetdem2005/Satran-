/**
 * Bedrock does not expose an entity's collision size to scripts, so the widths
 * the Java mod reads from `Entity.getWidth()/getHeight()` come from this table
 * (vanilla 1.21 values). Height falls back to the head-location trick for
 * anything unknown.
 */
const SIZES = new Map(Object.entries({
  "minecraft:player": [0.6, 1.8],
  "minecraft:zombie": [0.6, 1.95], "minecraft:husk": [0.6, 1.95], "minecraft:drowned": [0.6, 1.95],
  "minecraft:zombie_villager": [0.6, 1.95], "minecraft:zombie_pigman": [0.6, 1.95],
  "minecraft:zombified_piglin": [0.6, 1.95], "minecraft:skeleton": [0.6, 1.99],
  "minecraft:stray": [0.6, 1.99], "minecraft:wither_skeleton": [0.7, 2.4],
  "minecraft:creeper": [0.6, 1.7], "minecraft:spider": [1.4, 0.9], "minecraft:cave_spider": [0.7, 0.5],
  "minecraft:enderman": [0.6, 2.9], "minecraft:endermite": [0.4, 0.3], "minecraft:silverfish": [0.4, 0.3],
  "minecraft:witch": [0.6, 1.95], "minecraft:villager": [0.6, 1.95], "minecraft:villager_v2": [0.6, 1.95],
  "minecraft:wandering_trader": [0.6, 1.95], "minecraft:pillager": [0.6, 1.95],
  "minecraft:vindicator": [0.6, 1.95], "minecraft:evocation_illager": [0.6, 1.95],
  "minecraft:ravager": [1.95, 2.2], "minecraft:iron_golem": [1.4, 2.7], "minecraft:snow_golem": [0.7, 1.9],
  "minecraft:cow": [0.9, 1.4], "minecraft:mooshroom": [0.9, 1.4], "minecraft:pig": [0.9, 0.9],
  "minecraft:sheep": [0.9, 1.3], "minecraft:chicken": [0.4, 0.7], "minecraft:rabbit": [0.4, 0.5],
  "minecraft:horse": [1.396, 1.6], "minecraft:donkey": [1.396, 1.5], "minecraft:mule": [1.396, 1.6],
  "minecraft:llama": [0.9, 1.87], "minecraft:wolf": [0.6, 0.85], "minecraft:cat": [0.6, 0.7],
  "minecraft:ocelot": [0.6, 0.7], "minecraft:fox": [0.6, 0.7], "minecraft:panda": [1.3, 1.25],
  "minecraft:polar_bear": [1.4, 1.4], "minecraft:goat": [0.9, 1.3], "minecraft:sniffer": [1.9, 1.75],
  "minecraft:camel": [1.7, 2.375], "minecraft:bee": [0.7, 0.6], "minecraft:bat": [0.5, 0.9],
  "minecraft:blaze": [0.6, 1.8], "minecraft:ghast": [4.0, 4.0], "minecraft:magma_cube": [1.0, 1.0],
  "minecraft:slime": [1.0, 1.0], "minecraft:hoglin": [1.4, 1.4], "minecraft:zoglin": [1.4, 1.4],
  "minecraft:piglin": [0.6, 1.95], "minecraft:piglin_brute": [0.6, 1.95], "minecraft:strider": [0.9, 1.7],
  "minecraft:phantom": [0.9, 0.5], "minecraft:shulker": [1.0, 1.0], "minecraft:warden": [0.9, 2.9],
  "minecraft:allay": [0.35, 0.6], "minecraft:frog": [0.5, 0.5], "minecraft:armadillo": [0.7, 0.65],
  "minecraft:breeze": [0.6, 1.77], "minecraft:parrot": [0.5, 0.9], "minecraft:turtle": [1.2, 0.4],
  "minecraft:vex": [0.4, 0.8], "minecraft:wither": [0.9, 3.5], "minecraft:ender_dragon": [16.0, 8.0],
}));

const DEFAULT_SIZE = [0.7, 1.7];

/**
 * `Entity.isValid` is a method on @minecraft/server 1.x and a plain boolean
 * property on 2.x; this accepts either so the pack survives a runtime upgrade.
 */
export function isValidEntity(entity) {
  if (!entity) return false;
  try {
    const flag = entity.isValid;
    if (typeof flag === "function") return flag.call(entity) !== false;
    if (typeof flag === "boolean") return flag;
    return true;
  } catch {
    return false;
  }
}

export function entityWidth(entity) {
  try {
    const size = SIZES.get(entity.typeId);
    if (size) return size[0];
  } catch {
    /* stale handle */
  }
  return DEFAULT_SIZE[0];
}

export function entityHeight(entity) {
  try {
    const size = SIZES.get(entity.typeId);
    if (size) return size[1];
    const head = entity.getHeadLocation();
    const derived = (head.y - entity.location.y) / 0.85;
    if (Number.isFinite(derived) && derived > 0.2 && derived < 12) return derived;
  } catch {
    /* fall through */
  }
  return DEFAULT_SIZE[1];
}

/** Human readable name used by `Hunt.registerKill`'s message. */
export function entityName(entity) {
  try {
    const id = entity.typeId ?? "creature";
    return id.replace(/^.*:/, "").replace(/_/g, " ");
  } catch {
    return "creature";
  }
}

export function entityHealth(entity) {
  try {
    const component = entity.getComponent("minecraft:health");
    return component ? component.currentValue : 0;
  } catch {
    return 0;
  }
}

export function entityMaxHealth(entity) {
  try {
    const component = entity.getComponent("minecraft:health");
    if (!component) return 0;
    return component.effectiveMax ?? component.defaultValue ?? component.currentValue;
  } catch {
    return 0;
  }
}

export function isEntityAlive(entity) {
  if (!isValidEntity(entity)) return false;
  try {
    const component = entity.getComponent("minecraft:health");
    if (component && component.currentValue <= 0) return false;
    return true;
  } catch {
    return false;
  }
}

export function isPlayerEntity(entity) {
  try {
    return entity?.typeId === "minecraft:player";
  } catch {
    return false;
  }
}
