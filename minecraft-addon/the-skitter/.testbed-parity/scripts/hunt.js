/** Port of com.dogukan.spiderhunt.misc.Hunt. */
import { cfg } from "./config.js";
import { Vec, clamp } from "./vec.js";
import { playSound, spawnParticle, runLater, SOUNDS, PARTICLES } from "./world_util.js";
import { hooks } from "./hooks.js";

export const MAX_PHASE = 5;

export const Hunt = {
  enabled: false,
  phase: 1,
  kills: 0,

  scaleForPhase(phase) {
    return Math.pow(cfg.growthFactor, phase - 1);
  },

  sizeBlocks(phase) {
    return cfg.baseSizeBlocks * this.scaleForPhase(phase);
  },

  detectionRadius(phase) {
    return cfg.visionPerBlock * this.sizeBlocks(phase);
  },

  killsToAdvance(phase) {
    return cfg.killsBase + cfg.killsStep * (phase - 1);
  },

  attackDamage(phase) {
    return cfg.damageBase + cfg.damageStep * (phase - 1);
  },

  attackRange(phase) {
    return cfg.attackRangeBase + cfg.attackRangeScale * this.scaleForPhase(phase);
  },

  attackVerticalRange(phase) {
    return cfg.verticalRangeBase + cfg.verticalRangeScale * this.scaleForPhase(phase);
  },

  speedMultiplier(phase) {
    return cfg.speedBase + cfg.speedStep * (phase - 1);
  },

  healthForPhase(phase) {
    return cfg.healthBase * this.scaleForPhase(phase);
  },

  start(startPhase) {
    this.phase = clamp(startPhase, 1, MAX_PHASE);
    this.kills = 0;
    this.enabled = true;
  },

  reset() {
    this.enabled = false;
    this.phase = 1;
    this.kills = 0;
  },

  registerKill(creature, victimName, victimCentre) {
    const dimension = creature.dimension;
    playSound(dimension, creature.position, SOUNDS.GENERIC_EAT, 1.2, 0.8);

    const heard = creature.dimension.getPlayers === undefined
      ? []
      : safePlayers(dimension);
    if (heard.some((p) => Vec.from(p.location).distance(creature.position) < 24.0)) {
      playSound(dimension, creature.position, SOUNDS.RAVAGER_ROAR, 1.3, 0.55);
    }

    if (victimCentre) {
      spawnParticle(dimension, PARTICLES.SWEEP_ATTACK, victimCentre, 3, 0.3, 0.3, 0.3);
    }

    if (this.phase >= MAX_PHASE) {
      this.announce(creature, `The creature devoured a ${victimName} (fully grown)`);
      return;
    }

    const needed = this.killsToAdvance(this.phase);
    this.kills++;
    if (this.kills < needed) {
      this.announce(creature, `The creature devoured a ${victimName} (${this.kills}/${needed} until it grows)`);
      return;
    }

    this.phase++;
    this.kills = 0;
    runLater(1, () => {
      if (hooks.recreateCreature) hooks.recreateCreature();
      const grown = hooks.currentCreature ? hooks.currentCreature() : null;
      if (grown) {
        playSound(grown.dimension, grown.position, SOUNDS.ENDER_DRAGON_GROWL, 1.5, 1.3);
        spawnParticle(grown.dimension, PARTICLES.EXPLOSION_EMITTER, grown.position, 1, 0, 0, 0);
      }
      const subject = grown ?? creature;
      this.announce(
        subject,
        `The creature grew to phase ${this.phase}! (~${this.sizeBlocks(this.phase).toFixed(1)} blocks, ` +
          `sees ${this.detectionRadius(this.phase).toFixed(0)} blocks)`,
      );
    });
  },

  /**
   * The Java mod deliberately ships this as an empty method - the creature
   * never narrates itself. Kept as a no-op so behaviour matches; flip
   * `Hunt.verbose` on to surface the messages while debugging.
   */
  verbose: false,
  announce(_creature, message) {
    if (!this.verbose) return;
    try {
      // eslint-disable-next-line no-undef
      globalThis.__skitterSay?.(message);
    } catch {
      /* ignore */
    }
  },
};

function safePlayers(dimension) {
  try {
    return dimension.getPlayers();
  } catch {
    return [];
  }
}
