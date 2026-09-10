/**
 * Player predicates, one per call site in the Java mod.
 *
 * The Java source uses three *different* filters and mixing them up changes
 * behaviour, so they are kept apart here:
 *
 *   HuntingKt.isHuntable   alive && !creative && !spectator   (targeting)
 *   HunterBrain.flee       alive && !spectator                (threat to run from)
 *   WorldState             alive && !spectator                (who to spawn near)
 *   GameMaster.tick        alive && !creative && !spectator   (respawn anchor)
 *
 * Bedrock has no reliable per-player game-mode getter across runtimes, so the
 * creative and spectator sets are refreshed once per tick from a query.
 */
import { world, GameMode } from "@minecraft/server";

/** Enum member names differ between @minecraft/server 1.x and 2.x. */
const CREATIVE = GameMode?.creative ?? GameMode?.Creative ?? "creative";
const SPECTATOR = GameMode?.spectator ?? GameMode?.Spectator ?? "spectator";

const creativeIds = new Set();
const spectatorIds = new Set();

export function refreshPlayerFilters() {
  fill(creativeIds, CREATIVE);
  fill(spectatorIds, SPECTATOR);
}

function fill(target, mode) {
  target.clear();
  let players;
  try {
    players = world.getPlayers({ gameMode: mode });
  } catch {
    return;
  }
  for (const player of players) {
    try {
      target.add(player.id);
    } catch {
      /* stale handle */
    }
  }
}

/** `Entity.isValid` is a method on @minecraft/server 1.x, a property on 2.x. */
export function isValidHandle(entity) {
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

/** `LivingEntity.isAlive()` */
export function isAlive(player) {
  if (!isValidHandle(player)) return false;
  try {
    const health = player.getComponent("minecraft:health");
    return !health || health.currentValue > 0;
  } catch {
    return false;
  }
}

export function isCreative(player) {
  try {
    return creativeIds.has(player.id);
  } catch {
    return false;
  }
}

export function isSpectator(player) {
  try {
    return spectatorIds.has(player.id);
  } catch {
    return false;
  }
}

/** `HuntingKt.isHuntable` and `GameMaster.tick`'s respawn-anchor filter. */
export function isHuntablePlayer(player) {
  return isAlive(player) && !isCreative(player) && !isSpectator(player);
}

/** `HunterBrain.flee` and `WorldState`: alive and not a spectator. */
export function isVisiblePlayer(player) {
  return isAlive(player) && !isSpectator(player);
}

export function allPlayers() {
  try {
    return world.getAllPlayers();
  } catch {
    return [];
  }
}

export function playersIn(dimension) {
  const result = [];
  for (const player of allPlayers()) {
    try {
      if (player.dimension.id !== dimension.id) continue;
      result.push(player);
    } catch {
      /* stale handle */
    }
  }
  return result;
}
