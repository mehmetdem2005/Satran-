/**
 * Port of com.dogukan.spiderhunt.CommandsKt.
 *
 * Bedrock stable script API cannot register a real `/spider` command, so the
 * same command tree is exposed through `/scriptevent skitter:<sub> [args]`
 * (operator only, matching Java's `requires(permission level 2)`) and through
 * an in-chat `!spider ...` alias when the runtime provides the chat event.
 */
import { world, system } from "@minecraft/server";
import { cfg, loadConfig, saveConfig, setConfigValue, resetConfig, DEFAULTS } from "./config.js";
import { Vec, clamp } from "./vec.js";
import { raycastGround, playSound, SOUNDS } from "./world_util.js";
import { Hunt, MAX_PHASE } from "./hunt.js";
import { AppState, WorldState } from "./state.js";

const STYLES = ["husk", "widow"];

function reply(target, message) {
  if (!target) {
    console.warn(`[skitter] ${message}`);
    return;
  }
  try {
    target.sendMessage(message);
  } catch {
    console.warn(`[skitter] ${message}`);
  }
}

function summonCreature(player, phase) {
  let position;
  try {
    const head = Vec.from(player.getHeadLocation());
    const view = player.getViewDirection();
    const hit = raycastGround(player.dimension, head, new Vec(view.x, view.y, view.z), 100.0, false);
    position = hit ? hit.hitPosition : Vec.from(player.location);
  } catch {
    position = Vec.from(player.location);
  }

  Hunt.start(phase);
  AppState.manualScale = null;
  let yaw = 0;
  try {
    yaw = player.getRotation().y;
  } catch {
    /* default facing */
  }
  AppState.createCreature(player.dimension, position, yaw + 180.0);
  playSound(player.dimension, position, SOUNDS.SPIDER_AMBIENT, 1.5, 0.6);
  reply(
    player,
    `Summoned hunting creature at phase ${phase} (~${Hunt.sizeBlocks(phase).toFixed(1)} blocks, ` +
      `detection radius ${Hunt.detectionRadius(phase).toFixed(0)} blocks, ` +
      `${Math.trunc(Hunt.attackDamage(phase))} damage per hit)`,
  );
}

function statusMessage() {
  const needed = Hunt.killsToAdvance(Hunt.phase);
  const progress = Hunt.phase >= MAX_PHASE
    ? "fully grown"
    : `${Hunt.kills}/${needed} kills until it grows`;
  const creature = AppState.creature;
  const health = creature !== null
    ? `, health ${creature.health.toFixed(0)}/${creature.maxHealth.toFixed(0)}`
    : "";
  return `Creature: ${creature !== null ? "alive" : "none"}${health}, minis: ${AppState.minis.length}, ` +
    `hunting: ${Hunt.enabled ? "on" : "off"}, phase ${Hunt.phase}/${MAX_PHASE} ` +
    `(~${Hunt.sizeBlocks(Hunt.phase).toFixed(1)} blocks), ` +
    `detection radius ${Hunt.detectionRadius(Hunt.phase).toFixed(0)} blocks, ${progress}`;
}

const USAGE = [
  "The Skitter commands (operator only):",
  "  /scriptevent skitter:summon [1-5]",
  "  /scriptevent skitter:remove",
  "  /scriptevent skitter:hunt on|off",
  "  /scriptevent skitter:phase <1-5>",
  "  /scriptevent skitter:status",
  "  /scriptevent skitter:scale <0.1-20>",
  "  /scriptevent skitter:cosmetic [widow|husk]",
  "  /scriptevent skitter:config <key> <value> | list | reset",
  "  /scriptevent skitter:reload",
].join("\n");

/**
 * @param {string} sub lower case sub command
 * @param {string[]} args
 * @param {import("@minecraft/server").Player|undefined} player
 */
export function runCommand(sub, args, player) {
  switch (sub) {
    case "summon": {
      if (!player) {
        reply(player, "summon must be run by a player");
        return;
      }
      const phase = args.length > 0 ? clamp(parseInt(args[0], 10) || 1, 1, MAX_PHASE) : 1;
      summonCreature(player, phase);
      return;
    }
    case "remove": {
      if (AppState.creature === null && AppState.minis.length === 0) {
        reply(player, "There is no creature");
      } else {
        AppState.setCreature(null);
        AppState.clearMinis();
        Hunt.enabled = false;
        reply(player, "Creature removed");
      }
      return;
    }
    case "hunt": {
      const mode = (args[0] ?? "").toLowerCase();
      if (mode === "on") {
        Hunt.enabled = true;
        reply(player, "Hunting enabled");
      } else if (mode === "off") {
        Hunt.enabled = false;
        reply(player, "Hunting disabled");
      } else {
        reply(player, "Usage: hunt on|off");
      }
      return;
    }
    case "phase": {
      const phase = clamp(parseInt(args[0], 10) || 1, 1, MAX_PHASE);
      Hunt.phase = phase;
      Hunt.kills = 0;
      AppState.manualScale = null;
      AppState.recreateCreature();
      reply(player, `Creature phase set to ${phase} (~${Hunt.sizeBlocks(phase).toFixed(1)} blocks)`);
      return;
    }
    case "status": {
      reply(player, statusMessage());
      return;
    }
    case "scale": {
      const value = Number(args[0]);
      if (!Number.isFinite(value) || value < 0.1 || value > 20.0) {
        reply(player, "Usage: scale <0.1-20>");
        return;
      }
      AppState.manualScale = value;
      AppState.recreateCreature();
      reply(player, `Set scale to ${value}`);
      return;
    }
    case "cosmetic": {
      if (args.length === 0) {
        reply(player, `Current cosmetic: ${cfg.cosmetic}. Options: ${STYLES.join(", ")}`);
        return;
      }
      const style = String(args[0]).toLowerCase();
      if (!STYLES.includes(style)) {
        reply(player, `Unknown cosmetic '${style}'. Options: ${STYLES.join(", ")}`);
        return;
      }
      cfg.cosmetic = style;
      saveConfig();
      AppState.recreateCreature();
      reply(player, `Cosmetic set to ${style}`);
      return;
    }
    case "config": {
      const key = args[0];
      if (!key || key === "list") {
        const changed = Object.keys(DEFAULTS)
          .filter((k) => cfg[k] !== DEFAULTS[k])
          .map((k) => `${k}=${cfg[k]}`);
        reply(player, changed.length === 0
          ? "All config values are at their defaults."
          : `Changed: ${changed.join(", ")}`);
        return;
      }
      if (key === "reset") {
        resetConfig();
        AppState.recreateCreature();
        reply(player, "Config reset to defaults");
        return;
      }
      if (args.length < 2) {
        const current = cfg[key];
        reply(player, current === undefined
          ? `Unknown config key '${key}'`
          : `${key} = ${current} (default ${DEFAULTS[key]})`);
        return;
      }
      const error = setConfigValue(key, args.slice(1).join(" "));
      reply(player, error === null ? `${key} = ${cfg[key]}` : error);
      return;
    }
    case "reload": {
      loadConfig();
      AppState.recreateCreature();
      reply(player, "The Skitter config reloaded");
      return;
    }
    case "resetworld": {
      AppState.reset();
      WorldState.reset();
      WorldState.save();
      reply(player, "The Skitter world state cleared - the hunt will start over");
      return;
    }
    default:
      reply(player, USAGE);
  }
}

export function registerCommands() {
  system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (!event.id.startsWith("skitter:")) return;
    const sub = event.id.slice("skitter:".length).toLowerCase();
    const args = String(event.message ?? "").trim().split(/\s+/).filter((it) => it.length > 0);
    const player = event.sourceEntity?.typeId === "minecraft:player" ? event.sourceEntity : undefined;
    try {
      runCommand(sub, args, player);
    } catch (error) {
      reply(player, `The Skitter command failed: ${error}`);
    }
  }, { namespaces: ["skitter"] });

  // Optional chat alias; not every Bedrock build exposes chatSend to scripts.
  try {
    world.beforeEvents.chatSend.subscribe((event) => {
      const message = event.message.trim();
      if (!message.startsWith("!spider")) return;
      event.cancel = true;
      const parts = message.slice("!spider".length).trim().split(/\s+/).filter((it) => it.length > 0);
      const sub = (parts.shift() ?? "status").toLowerCase();
      const sender = event.sender;
      system.run(() => {
        if (!isOperator(sender)) {
          reply(sender, "You need operator permission to use The Skitter commands.");
          return;
        }
        try {
          runCommand(sub, parts, sender);
        } catch (error) {
          reply(sender, `The Skitter command failed: ${error}`);
        }
      });
    });
  } catch {
    /* chat events unavailable - /scriptevent still works */
  }
}

function isOperator(player) {
  try {
    if (typeof player.isOp === "function") return player.isOp();
    if (player.playerPermissionLevel !== undefined) return player.playerPermissionLevel >= 1;
    if (player.commandPermissionLevel !== undefined) return player.commandPermissionLevel >= 1;
  } catch {
    /* fall through */
  }
  return true;
}
