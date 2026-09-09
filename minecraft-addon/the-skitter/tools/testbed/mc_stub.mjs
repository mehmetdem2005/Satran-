/**
 * A very small stand-in for @minecraft/server, just faithful enough to boot the
 * behaviour pack outside Minecraft and run its tick loop against a synthetic
 * world. Used by tools/testbed/run.mjs.
 */
export const GameMode = { creative: "creative", spectator: "spectator", survival: "survival", adventure: "adventure" };
export const EntityDamageCause = { entityAttack: "entityAttack", fall: "fall" };
export const EquipmentSlot = { Offhand: "Offhand", Mainhand: "Mainhand" };

export const stats = { particles: 0, sounds: 0, commands: [], spawned: [], messages: [], warnings: [] };

class Block {
  constructor(id, x, y, z) {
    this.typeId = id;
    this.x = x; this.y = y; this.z = z;
  }
  get isAir() { return this.typeId === "minecraft:air"; }
  get isLiquid() { return this.typeId.includes("water") || this.typeId.includes("lava"); }
  setType(id) { world._terrain.set(`${this.x},${this.y},${this.z}`, id); this.typeId = id; }
}

class Component {
  constructor(value, max) { this.currentValue = value; this.effectiveMax = max; this.defaultValue = max; }
  setCurrentValue(value) { this.currentValue = value; }
}

let nextId = 1;

export class Entity {
  constructor(typeId, location, dimension) {
    this.id = String(nextId++);
    this.typeId = typeId;
    this.location = { ...location };
    this.dimension = dimension;
    this.tags = new Set();
    this.properties = new Map();
    this.nameTag = "";
    this.isSneaking = false;
    this.isInWater = false;
    this._health = new Component(typeId === "skitter:skitter" ? 1024 : 20,
                                 typeId === "skitter:skitter" ? 1024 : 20);
    this._removed = false;
  }
  isValid() { return !this._removed; }
  addTag(tag) { this.tags.add(tag); return true; }
  getTags() { return [...this.tags]; }
  triggerEvent(name) { this.lastEvent = name; }
  setProperty(id, value) { this.properties.set(id, value); }
  getProperty(id) { return this.properties.get(id); }
  getComponent(name) {
    if (name === "minecraft:health") return this._health;
    if (name === "minecraft:equippable") return { getEquipment: () => undefined };
    return undefined;
  }
  getHeadLocation() { return { x: this.location.x, y: this.location.y + 1.6, z: this.location.z }; }
  getViewDirection() { return { x: 0, y: 0, z: 1 }; }
  getRotation() { return { x: 0, y: 0 }; }
  teleport(location) { this.location = { ...location }; }
  applyKnockback() {}
  applyImpulse() {}
  clearVelocity() {}
  applyDamage(amount) {
    this._health.currentValue -= amount;
    world._fireHurt(this, amount, this._lastAttacker);
    return true;
  }
  addEffect() {}
  remove() { this._removed = true; this.dimension._entities.delete(this); }
  runCommand(command) { stats.commands.push(command); return { successCount: 1 }; }
  sendMessage(message) { stats.messages.push(message); this.lastMessage = message; }
}

export class Player extends Entity {
  constructor(location, dimension) {
    super("minecraft:player", location, dimension);
    this._health = new Component(20, 20);
  }
  getGameMode() { return "survival"; }
  isOp() { return true; }
}

class Dimension {
  constructor(id) { this.id = id; this._entities = new Set(); }
  getBlock(location) {
    const key = `${location.x},${location.y},${location.z}`;
    const override = world._terrain.get(key);
    if (override) return new Block(override, location.x, location.y, location.z);
    return new Block(location.y < 64 ? "minecraft:stone" : "minecraft:air",
                     location.x, location.y, location.z);
  }
  getEntities(options = {}) {
    let list = [...this._entities];
    if (options.type) list = list.filter((e) => e.typeId === options.type);
    if (options.excludeTypes) list = list.filter((e) => !options.excludeTypes.includes(e.typeId));
    if (options.families) list = list.filter((e) => e.typeId !== "minecraft:player" && e.typeId !== "skitter:skitter");
    if (options.location && options.maxDistance !== undefined) {
      list = list.filter((e) => Math.hypot(
        e.location.x - options.location.x,
        e.location.y - options.location.y,
        e.location.z - options.location.z) <= options.maxDistance);
    }
    return list;
  }
  getPlayers() { return [...this._entities].filter((e) => e.typeId === "minecraft:player"); }
  spawnEntity(typeId, location) {
    const entity = new Entity(typeId, location, this);
    this._entities.add(entity);
    stats.spawned.push(typeId);
    return entity;
  }
  spawnParticle(name) { stats.particles++; if (!name.startsWith("minecraft:")) throw new Error("bad particle"); }
  playSound() { stats.sounds++; }
  runCommand(command) { stats.commands.push(command); return { successCount: 1 }; }
}

function makeEvent() {
  const handlers = [];
  return {
    subscribe(handler) { handlers.push(handler); return handler; },
    unsubscribe(handler) { const i = handlers.indexOf(handler); if (i >= 0) handlers.splice(i, 1); },
    _fire(payload) { for (const handler of handlers) handler(payload); },
  };
}

const overworld = new Dimension("minecraft:overworld");

export const world = {
  _terrain: new Map(),
  _dimensions: new Map([["minecraft:overworld", overworld], ["overworld", overworld]]),
  _properties: new Map(),
  afterEvents: {
    entityHurt: makeEvent(),
    entityDie: makeEvent(),
    playerLeave: makeEvent(),
    worldLoad: makeEvent(),
  },
  beforeEvents: { chatSend: makeEvent() },
  getDimension(id) {
    const dimension = this._dimensions.get(id);
    if (!dimension) throw new Error(`unknown dimension ${id}`);
    return dimension;
  },
  getAllPlayers() { return overworld.getPlayers(); },
  getPlayers(options = {}) {
    const players = overworld.getPlayers();
    if (options.gameMode) return players.filter((p) => p.getGameMode() === options.gameMode);
    return players;
  },
  getDynamicProperty(key) { return this._properties.get(key); },
  setDynamicProperty(key, value) { this._properties.set(key, value); },
  getTimeOfDay() { return 1000; },
  _fireHurt(entity, damage, attacker) {
    this.afterEvents.entityHurt._fire({
      hurtEntity: entity,
      damage,
      damageSource: { cause: "entityAttack", damagingEntity: attacker },
    });
  },
};

const intervals = [];
const timeouts = [];

export const system = {
  currentTick: 0,
  runInterval(callback, period = 1) { intervals.push({ callback, period }); return intervals.length; },
  runTimeout(callback, delay) { timeouts.push({ callback, remaining: delay }); return timeouts.length; },
  run(callback) { timeouts.push({ callback, remaining: 1 }); return timeouts.length; },
  clearRun() {},
  afterEvents: { scriptEventReceive: makeEvent() },
  _tick() {
    this.currentTick++;
    for (let i = timeouts.length - 1; i >= 0; i--) {
      if (--timeouts[i].remaining <= 0) {
        const entry = timeouts.splice(i, 1)[0];
        entry.callback();
      }
    }
    for (const entry of intervals) {
      if (this.currentTick % entry.period === 0) entry.callback();
    }
  },
};

export const overworldDimension = overworld;
export { Dimension };
