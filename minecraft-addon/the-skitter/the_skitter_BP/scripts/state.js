/** Port of com.dogukan.spiderhunt.AppState and misc.WorldState. */
import { world } from "@minecraft/server";
import { cfg } from "./config.js";
import { Vec, DOWN_VECTOR, clamp, toDegrees, randomDouble } from "./vec.js";
import { raycastGround, playSound, SOUNDS } from "./world_util.js";
import { Creature, LimbLayout } from "./creature.js";
import { Hunt, MAX_PHASE } from "./hunt.js";
import { attachEntity, detachEntity, forgetAll } from "./entity_link.js";
import { hooks } from "./hooks.js";

export const AppState = {
  creature: null,
  minis: [],
  manualScale: null,

  setCreature(value) {
    if (this.creature !== value && this.creature !== null) {
      closeCreature(this.creature);
    }
    this.creature = value;
  },

  currentScale() {
    return this.manualScale !== null ? this.manualScale : Hunt.scaleForPhase(Hunt.phase);
  },

  createCreature(dimension, groundPosition, yawDegrees) {
    const layout = new LimbLayout(this.currentScale(), 1.0);
    const position = groundPosition.clone();
    position.y += layout.rideHeight;
    const creature = Creature.create(dimension, position, yawDegrees, layout);
    creature.maxHealth = Hunt.healthForPhase(Hunt.phase);
    creature.health = creature.maxHealth;
    this.setCreature(creature);
    attachEntity(creature, Hunt.phase);
    return creature;
  },

  recreateCreature() {
    const old = this.creature;
    if (old === null) return;
    const ground = old.position.clone();
    ground.y -= old.layout.rideHeight;
    this.createCreature(old.dimension, ground, toDegrees(old.yaw));
  },

  createMini(dimension, position, yawDegrees) {
    const mini = Creature.create(
      dimension,
      position,
      yawDegrees,
      new LimbLayout(cfg.miniScale, cfg.miniSpeedBoost),
    );
    mini.isMini = true;
    mini.maxHealth = cfg.miniHealth;
    mini.health = mini.maxHealth;
    this.minis.push(mini);
    attachEntity(mini, Hunt.phase);
    return mini;
  },

  clearMinis() {
    for (const mini of this.minis) closeCreature(mini);
    this.minis.length = 0;
  },

  allCreatures() {
    return this.creature !== null ? [this.creature, ...this.minis] : [...this.minis];
  },

  reset() {
    this.setCreature(null);
    this.clearMinis();
    this.manualScale = null;
    Hunt.reset();
    if (hooks.resetGameMaster) hooks.resetGameMaster();
    forgetAll();
  },
};

export function closeCreature(creature) {
  if (!creature) return;
  creature.dead = true;
  try {
    creature.brain.close();
  } catch {
    /* brain teardown must never block cleanup */
  }
  detachEntity(creature);
}

hooks.recreateCreature = () => AppState.recreateCreature();
hooks.currentCreature = () => AppState.creature;

/* ------------------------------------------------------------- world state */

const STATE_KEY = "skitter:state";

export const WorldState = {
  initialSpawnDone: false,
  pendingRestore: false,
  restoreDimension: "minecraft:overworld",
  loaded: false,

  load() {
    let raw;
    try {
      raw = world.getDynamicProperty(STATE_KEY);
    } catch {
      raw = undefined;
    }
    this.loaded = true;
    if (typeof raw !== "string" || raw.length === 0) {
      this.initialSpawnDone = false;
      this.pendingRestore = false;
      return;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      this.initialSpawnDone = false;
      this.pendingRestore = false;
      return;
    }
    this.initialSpawnDone = data.initialSpawnDone === true;
    Hunt.enabled = data.enabled === true;
    Hunt.phase = clamp(Number(data.phase) || 1, 1, MAX_PHASE);
    Hunt.kills = Number(data.kills) || 0;
    this.pendingRestore = data.enabled === true && data.hasCreature === true;
    this.restoreDimension = typeof data.dimension === "string" ? data.dimension : "minecraft:overworld";
  },

  tick() {
    if (!this.initialSpawnDone) {
      const player = firstLivePlayer();
      if (!player) return;
      this.initialSpawnDone = true;
      Hunt.start(1);
      this.spawnNear(player, 15.0, 35.0);
      this.save();
      return;
    }
    if (this.pendingRestore) {
      const dimension = resolveDimension(this.restoreDimension);
      const player = firstLivePlayer(dimension);
      if (!player) return;
      this.pendingRestore = false;
      this.spawnNear(player, 20.0, 30.0);
      this.save();
    }
  },

  spawnNear(player, minDistance, maxDistance) {
    const dimension = player.dimension;
    const angle = Math.random() * 2 * Math.PI;
    const distance = randomDouble(minDistance, maxDistance);
    const x = player.location.x + Math.cos(angle) * distance;
    const z = player.location.z + Math.sin(angle) * distance;
    const hit = raycastGround(
      dimension,
      new Vec(x, player.location.y + 16.0, z),
      DOWN_VECTOR(),
      48.0,
      true,
    );
    const ground = hit ? hit.hitPosition : new Vec(x, player.location.y, z);
    const towardsPlayer = toDegrees(Math.atan2(-(player.location.x - x), player.location.z - z));
    const creature = AppState.createCreature(dimension, ground, towardsPlayer);
    playSound(dimension, creature.position, SOUNDS.WARDEN_HEARTBEAT, 1.6, 0.65);
  },

  save() {
    const data = {
      initialSpawnDone: this.initialSpawnDone,
      enabled: Hunt.enabled,
      phase: Hunt.phase,
      kills: Hunt.kills,
      hasCreature: AppState.creature !== null || (hooks.hasPendingRespawn?.() ?? false),
      dimension: AppState.creature !== null ? AppState.creature.dimension.id : this.restoreDimension,
    };
    try {
      world.setDynamicProperty(STATE_KEY, JSON.stringify(data));
    } catch {
      /* dynamic property write failed - state is still correct in memory */
    }
  },

  reset() {
    this.initialSpawnDone = false;
    this.pendingRestore = false;
    this.restoreDimension = "minecraft:overworld";
  },
};

export function firstLivePlayer(dimension) {
  let players;
  try {
    players = world.getAllPlayers();
  } catch {
    return undefined;
  }
  for (const player of players) {
    try {
      if (dimension && player.dimension.id !== dimension.id) continue;
      if (isSpectatorOrDead(player)) continue;
      return player;
    } catch {
      /* skip players whose handle went stale mid-iteration */
    }
  }
  return undefined;
}

export function isSpectatorOrDead(player) {
  try {
    const health = player.getComponent("minecraft:health");
    if (health && health.currentValue <= 0) return true;
  } catch {
    /* ignore */
  }
  try {
    const mode = player.getGameMode ? player.getGameMode() : undefined;
    if (mode === "spectator") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function resolveDimension(id) {
  try {
    return world.getDimension(id);
  } catch {
    try {
      return world.getDimension("minecraft:overworld");
    } catch {
      return undefined;
    }
  }
}
