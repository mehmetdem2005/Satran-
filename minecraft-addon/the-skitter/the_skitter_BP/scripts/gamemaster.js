/** Port of com.dogukan.spiderhunt.misc.GameMaster. */
import { world } from "@minecraft/server";
import { cfg } from "./config.js";
import { Vec, DOWN_VECTOR, toDegrees, randomDouble } from "./vec.js";
import { raycastGround, playSound, spawnParticle, SOUNDS, PARTICLES } from "./world_util.js";
import { AppState, isSpectatorOrDead } from "./state.js";
import { Hunt } from "./hunt.js";
import { hooks } from "./hooks.js";

const RESPAWN_MIN_DISTANCE = 20.0;
const RESPAWN_MAX_DISTANCE = 30.0;

export const GameMaster = {
  respawnCooldown: -1,
  respawnDimension: null,

  despawn(creature, cooldownTicks = cfg.respawnCooldownTicks) {
    Hunt.announce(creature, "The creature slinks back into the dark...");
    const dimension = creature.dimension;
    playSound(dimension, creature.position, SOUNDS.ENDERMAN_TELEPORT, 1.2, 0.5);
    spawnParticle(dimension, PARTICLES.POOF, creature.position, 40,
      creature.scale * 0.8, creature.scale * 0.5, creature.scale * 0.8);
    spawnParticle(dimension, PARTICLES.SQUID_INK, creature.position, 25,
      creature.scale * 0.6, creature.scale * 0.4, creature.scale * 0.6);
    this.respawnDimension = dimension;
    this.respawnCooldown = cooldownTicks;
    AppState.setCreature(null);
  },

  tick() {
    if (this.respawnCooldown < 0) return;
    if (!Hunt.enabled || AppState.creature !== null) {
      this.respawnCooldown = -1;
      this.respawnDimension = null;
      return;
    }
    if (this.respawnCooldown > 0) {
      this.respawnCooldown--;
      return;
    }
    const dimension = this.respawnDimension;
    if (!dimension) {
      this.respawnCooldown = -1;
      return;
    }

    const candidates = [];
    let players;
    try {
      players = world.getAllPlayers();
    } catch {
      return;
    }
    for (const player of players) {
      try {
        if (player.dimension.id !== dimension.id) continue;
        if (isSpectatorOrDead(player)) continue;
        candidates.push(player);
      } catch {
        /* stale handle */
      }
    }
    if (candidates.length === 0) return;
    const player = candidates[Math.floor(Math.random() * candidates.length)];

    const yawRadians = (getPlayerYaw(player) * Math.PI) / 180;
    const behind = new Vec(Math.sin(yawRadians), 0.0, -Math.cos(yawRadians));
    behind.rotateAroundY(randomDouble(-0.7, 0.7));
    const distance = randomDouble(RESPAWN_MIN_DISTANCE, RESPAWN_MAX_DISTANCE);
    const x = player.location.x + behind.x * distance;
    const z = player.location.z + behind.z * distance;
    const hit = raycastGround(
      dimension, new Vec(x, player.location.y + 16.0, z), DOWN_VECTOR(), 48.0, false,
    );
    const ground = hit ? hit.hitPosition : new Vec(x, player.location.y, z);
    const towardsPlayer = toDegrees(Math.atan2(-(player.location.x - x), player.location.z - z));

    const creature = AppState.createCreature(dimension, ground, towardsPlayer);
    playSound(dimension, creature.position, SOUNDS.WARDEN_HEARTBEAT, 2.0, 0.7);
    this.respawnCooldown = -1;
    this.respawnDimension = null;
  },

  hasPendingRespawn() {
    return this.respawnCooldown >= 0;
  },

  reset() {
    this.respawnCooldown = -1;
    this.respawnDimension = null;
  },
};

function getPlayerYaw(player) {
  try {
    return player.getRotation().y;
  } catch {
    return 0;
  }
}

hooks.despawn = (creature, cooldownTicks) => GameMaster.despawn(creature, cooldownTicks);
hooks.resetGameMaster = () => GameMaster.reset();
hooks.hasPendingRespawn = () => GameMaster.hasPendingRespawn();
