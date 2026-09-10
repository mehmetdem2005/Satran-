/**
 * Port of com.dogukan.spiderhunt.misc.HunterBrain and MiniHunterBrain.
 *
 * Every cooldown, threshold, probability and state machine branch is carried
 * over 1:1 from the Java source. Only the engine calls differ: knock-back goes
 * through `applyKnockback`, grabbed entities are teleported with the Bedrock
 * teleport API, and Java's shield-blocking test becomes Bedrock's
 * sneak-with-shield.
 */
import { world } from "@minecraft/server";
import { cfg } from "./config.js";
import {
  Vec, clamp, horizontalDistance, verticalDistance, randomInt, moveTowardsVec,
} from "./vec.js";
import {
  hasLineOfSight, playSound, spawnParticle, shakeCamera,
  getBlockSafe, blockIsPassable, blockHardness, breakBlockWithDrops,
  SOUNDS, PARTICLES,
} from "./world_util.js";
import { Hunt, MAX_PHASE } from "./hunt.js";
import { AppState } from "./state.js";
import { GameMaster } from "./gamemaster.js";
import { BlockBreaker } from "./breaker.js";
import { isHuntable, isHuntableMob, isShielding, huntableMobsNear } from "./hunting.js";
import { isVisiblePlayer, playersIn, allPlayers } from "./players.js";
import { hurtEntity } from "./entity_link.js";
import {
  entityWidth, entityHeight, entityName, entityHealth, entityMaxHealth,
  isEntityAlive, isPlayerEntity,
} from "./entity_info.js";

/* ------------------------------------------------------------------ helpers */

function posOf(entity) {
  return Vec.from(entity.location);
}

function centreOf(entity) {
  return posOf(entity).add(new Vec(0, entityHeight(entity) / 2, 0));
}

/** Emulates Java's `Entity.addVelocity(dx, dy, dz)`. */
function pushEntity(entity, dx, dy, dz) {
  const horizontal = Math.hypot(dx, dz);
  try {
    if (horizontal > 1e-6) {
      entity.applyKnockback(dx / horizontal, dz / horizontal, horizontal, dy);
    } else if (Math.abs(dy) > 1e-6) {
      entity.applyKnockback(0, 0, 0, dy);
    }
    return;
  } catch {
    /* newer signature takes (VectorXZ, verticalStrength) */
  }
  try {
    entity.applyKnockback({ x: dx, z: dz }, dy);
  } catch {
    /* knock-back unavailable for this entity */
  }
}

function teleportTo(entity, vec) {
  try {
    entity.teleport({ x: vec.x, y: vec.y, z: vec.z }, { keepVelocity: false });
  } catch {
    /* target left the world mid-tick */
  }
}

function clearMotion(entity) {
  try {
    entity.clearVelocity();
  } catch {
    /* not supported for this entity type */
  }
}

function isNight() {
  try {
    const time = world.getTimeOfDay();
    return time >= 13000 && time < 23000;
  } catch {
    return false;
  }
}

function playersInDimension(creature) {
  return playersIn(creature.dimension);
}

function nearestBy(list, position) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of list) {
    let distance;
    try {
      distance = posOf(entity).distanceSquared(position);
    } catch {
      continue;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entity;
    }
  }
  return best;
}

/* -------------------------------------------------------------- HunterBrain */

export class HunterBrain {
  constructor(creature) {
    this.creature = creature;
    this.attackIntervalTicks = 20;
    this.mobScanIntervalTicks = 10;
    this.biteIntervalTicks = 12;

    this.target = null;
    this.attackCooldown = 0;
    this.mobScanCooldown = 0;
    this.heldPrey = null;
    this.eatingTicks = 0;
    this.lostTicks = 0;
    this.blockedTicks = 0;
    this.hardStuckTicks = 0;
    this.breaker = new BlockBreaker(creature);
    this.fleeing = false;
    this.fleeTicks = 0;
    this.burrowTicks = -1;
    this.burrowRespawnCooldown = 0;
    this.heldPlayer = null;
    this.playerGrabTicks = 0;
    this.hitsAtGrab = 0;
    this.playerGrabCooldown = 0;
    this.jumpCharge = -1;
    this.jumpFlying = false;
    this.jumpCooldown = 0;
    this.unreachableTicks = 0;
    this.jumpChargeTicks = 18;
    this.maxJumpHeight = 16.0;
    this.webPullCooldown = 0;
    this.belowTicks = 0;
    this.wanderGoal = null;
    this.wanderCooldown = 0;
    this.lastTargetPosition = null;
    this.mockTicks = -1;
    this.mockCooldown = 0;
    this.shadowTicks = -1;
    this.mercyTicks = -1;
    this.mercyCooldown = 0;
    this.stalkTicks = 0;
    this.lastStalkedPlayer = null;
    this.ambientCooldown = 60;
    this.circlePhase = Math.random() * 6.28;
    this.retreatTicks = 0;
    this.hitWindowStart = 0;
    this.hitWindowTimer = 0;
    this.lastHitCounter = 0;
  }

  get blockBreakingPhase() {
    return cfg.blockBreakingPhase;
  }

  /* ------------------------------------------------------------- burrowing */

  startBurrow(respawnCooldownTicks) {
    if (this.burrowTicks >= 0) return;
    this.burrowTicks = 0;
    this.burrowRespawnCooldown = respawnCooldownTicks;
    this.creature.burrowing = true;
    playSound(this.creature.dimension, this.creature.position, SOUNDS.WARDEN_DIG, 2.0, 0.9);
  }

  tickBurrow() {
    if (this.burrowTicks < 0) return false;
    this.burrowTicks++;
    const creature = this.creature;
    creature.gallop = false;
    creature.stop();
    this.breaker.tick(false, null);
    if (this.burrowTicks % 2 === 0) {
      const ground = creature.position.clone();
      const below = getBlockSafe(creature.dimension, ground.x, ground.y - 0.4, ground.z);
      if (below && !blockIsPassable(below)) {
        spawnParticle(
          creature.dimension, PARTICLES.BLOCK_DUST, ground, 14,
          0.7 * creature.scale, 0.3, 0.7 * creature.scale,
        );
      }
    }
    if (this.burrowTicks >= 70) {
      GameMaster.despawn(creature, this.burrowRespawnCooldown);
    }
    return true;
  }

  /* ------------------------------------------------------------------ tick */

  tick(creature) {
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.mobScanCooldown > 0) this.mobScanCooldown--;
    if (this.playerGrabCooldown > 0) this.playerGrabCooldown--;
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    if (this.webPullCooldown > 0) this.webPullCooldown--;
    this.circlePhase += 0.035;
    creature.steadyStance = false;
    creature.digDescend = false;

    this.ambientCooldown--;
    if (this.ambientCooldown <= 0) {
      this.ambientCooldown = 80 + randomInt(0, 100);
      playSound(creature.dimension, creature.position, SOUNDS.SCULK_SENSOR_CLICKING, 1.1, 0.55);
    }

    if (creature.hitCounter > this.lastHitCounter) {
      if (this.hitWindowTimer <= 0) this.hitWindowStart = this.lastHitCounter;
      this.hitWindowTimer = 60;
    }
    this.lastHitCounter = creature.hitCounter;
    if (this.hitWindowTimer > 0) this.hitWindowTimer--;

    if (this.hitWindowTimer > 0 && creature.hitCounter - this.hitWindowStart >= 3 &&
        this.retreatTicks <= 0 && creature.health > creature.maxHealth * 0.1) {
      this.hitWindowTimer = 0;
      this.hitWindowStart = creature.hitCounter;
      let chance = clamp(cfg.retreatChanceBase - cfg.retreatChanceStep * (Hunt.phase - 1), 0.0, 1.0);
      if (isNight()) chance *= 0.6;
      if (Math.random() < chance) {
        this.retreatTicks = 70;
        playSound(creature.dimension, creature.position, SOUNDS.SPIDER_HURT, 1.2, 1.1);
      }
    }
    if (this.retreatTicks > 0) this.retreatTicks--;

    if (this.tickBurrow()) return;

    if (this.fleeing || creature.health <= creature.maxHealth * 0.1) {
      this.flee();
      return;
    }

    if (this.heldPlayer !== null) {
      this.holdPlayer(this.heldPlayer);
      return;
    }

    if (this.heldPrey !== null) {
      this.lostTicks = 0;
      this.breaker.tick(false, null);
      this.eat(this.heldPrey);
      return;
    }

    if (this.jumpCharge >= 0) {
      this.chargeJump();
      return;
    }

    if (this.jumpFlying) {
      if (creature.isAirborne()) {
        if (this.target !== null && isEntityAlive(this.target)) {
          creature.face(posOf(this.target).subtract(creature.position));
        }
        return;
      }
      this.land();
      return;
    }

    this.updateTarget();
    const target = this.target;

    if (target === null) {
      creature.gallop = false;
      if (creature.climbing) creature.stopClimb();
      this.breaker.tick(false, null);

      const search = this.lastTargetPosition;
      if (search !== null && this.lostTicks < 100) {
        creature.moveTowards(search, 0.6, 1.0);
        if (horizontalDistance(creature.position, search) < 2.0) {
          playSound(creature.dimension, creature.position, SOUNDS.WARDEN_SNIFF, 1.4, 0.8);
          this.lastTargetPosition = null;
        }
        this.lostTicks++;
        return;
      }

      this.wanderCooldown--;
      const goal = this.wanderGoal;
      if (goal === null || this.wanderCooldown <= 0 ||
          horizontalDistance(creature.position, goal) < 1.5) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = 4.0 + Math.random() * 8.0;
        this.wanderGoal = creature.position.clone()
          .add(new Vec(Math.cos(angle) * distance, 0.0, Math.sin(angle) * distance));
        this.wanderCooldown = 80 + randomInt(0, 80);
      }
      if (this.wanderGoal !== null) creature.moveTowards(this.wanderGoal, 0.35, 0.5);

      this.lostTicks++;
      if (this.lostTicks > 120) this.lastStalkedPlayer = null;
      if (this.lostTicks >= cfg.despawnAfterLostTicks) {
        GameMaster.despawn(creature, cfg.respawnCooldownTicks);
      }
      return;
    }

    this.lostTicks = 0;
    this.lastTargetPosition = posOf(target);

    const targetIsPlayer = isPlayerEntity(target);
    if (targetIsPlayer && target.id !== this.lastStalkedPlayer) {
      this.lastStalkedPlayer = target.id;
      this.stalkTicks = 30;
      playSound(creature.dimension, creature.position, SOUNDS.WARDEN_HEARTBEAT, 1.6, 0.6);
      if (this.mercyCooldown <= 0 && Math.random() < cfg.silentPursuitChance) {
        this.shadowTicks = 0;
      }
    }

    if (this.shadowTicks >= 0) {
      if (!targetIsPlayer) {
        this.shadowTicks = -1;
      } else {
        this.shadowTicks++;
        creature.gallop = false;
        this.breaker.tick(false, null);
        const targetPos = posOf(target);
        creature.face(targetPos.clone().subtract(creature.position));
        const distance = horizontalDistance(creature.position, targetPos);
        const away = creature.position.clone().subtract(targetPos).setY(0.0);
        if (away.lengthSquared() > 1e-8) away.normalize();
        if (distance < 40.0) {
          creature.moveTowards(creature.position.clone().add(away.multiply(10.0)), 0.7, 0.0);
        } else if (distance > 52.0) {
          creature.moveTowards(targetPos, 0.5, 45.0);
        } else {
          creature.stop();
        }
        if (this.shadowTicks > 600) {
          this.shadowTicks = -1;
          this.startBurrow(cfg.respawnCooldownTicks);
        }
        return;
      }
    }

    if (this.stalkTicks > 0) {
      this.stalkTicks--;
      creature.gallop = false;
      creature.stop();
      creature.face(posOf(target).subtract(creature.position));
      this.breaker.tick(false, null);
      return;
    }

    if (this.retreatTicks > 0 && targetIsPlayer && this.heldPrey === null) {
      const targetPos = posOf(target);
      const away = creature.position.clone().subtract(targetPos).setY(0.0);
      if (away.lengthSquared() > 1e-8) away.normalize();
      creature.face(targetPos.clone().subtract(creature.position));
      creature.moveTowards(creature.position.clone().add(away.multiply(8.0)), 0.9, 0.0);
      this.breaker.tick(false, null);
      if (this.retreatTicks === 1 && !creature.isAirborne() && Math.random() < cfg.retreatPounceChance) {
        this.jumpCooldown = 0;
        this.beginJumpCharge();
      }
      return;
    }

    const targetPosition = posOf(target);
    creature.face(targetPosition.clone().subtract(creature.position));

    const reach = Hunt.attackRange(Hunt.phase) + entityWidth(target) / 2.0;
    const horizontal = horizontalDistance(creature.position, targetPosition);
    const vertical = verticalDistance(creature.position, targetPosition);
    creature.gallop = horizontal > reach + 4.0;

    const targetCentre = targetPosition.clone().add(new Vec(0.0, entityHeight(target) / 2.0, 0.0));
    const lineOfSight = hasLineOfSight(creature.dimension, creature.position, targetCentre);

    if (this.mercyCooldown > 0) this.mercyCooldown--;

    if (this.mercyTicks >= 0) {
      this.mercyTicks++;
      creature.gallop = false;
      this.breaker.tick(false, null);
      if (this.mercyTicks < 40) {
        creature.stop();
        creature.face(targetPosition.clone().subtract(creature.position));
      } else {
        const away = creature.position.clone().subtract(targetPosition).setY(0.0);
        if (away.lengthSquared() > 1e-8) away.normalize();
        creature.face(away);
        creature.moveTowards(creature.position.clone().add(away.multiply(12.0)), 0.9, 0.0);
        const distance = horizontalDistance(creature.position, targetPosition);
        if (distance > 45.0 || this.mercyTicks > 450) {
          this.mercyTicks = -1;
          this.startBurrow(400);
        }
      }
      return;
    }

    const withinReach = horizontal <= reach && vertical <= Hunt.attackVerticalRange(Hunt.phase);
    if (this.attackCooldown <= 0 && withinReach && lineOfSight) {
      const sparePrey = targetIsPlayer && this.mercyCooldown <= 0 &&
        entityHealth(target) <= entityMaxHealth(target) * 0.2 &&
        Math.random() < cfg.mercyChance;
      if (sparePrey) {
        this.mercyTicks = 0;
        this.mercyCooldown = 2400;
        this.attackCooldown = this.attackIntervalTicks;
        playSound(creature.dimension, creature.position, SOUNDS.WARDEN_HEARTBEAT, 1.5, 0.45);
      } else if (!targetIsPlayer) {
        this.grab(target);
      } else if (this.playerGrabCooldown <= 0 && !isShielding(target, creature) && Math.random() < 0.3) {
        this.grabPlayer(target);
      } else {
        this.attack(target);
      }
    }

    if (creature.climbing) {
      if (targetPosition.y < creature.position.y - 2.0 || horizontal > 25.0) creature.stopClimb();
      this.blockedTicks = 0;
      this.unreachableTicks = 0;
      this.breaker.tick(false, null);
      return;
    }

    if (((vertical > 2.0 && horizontal <= reach + 3.0 && targetPosition.y > creature.position.y) ||
         this.blockedTicks > 15) &&
        creature.tryStartClimb(targetPosition.clone().subtract(creature.position))) {
      this.blockedTicks = 0;
      this.unreachableTicks = 0;
      this.breaker.tick(false, null);
      return;
    }

    if (this.mockCooldown > 0) this.mockCooldown--;
    if (this.mockTicks >= 0) {
      this.mockTicks++;
      creature.face(targetPosition.clone().subtract(creature.position));
      if (this.mockTicks < 18) {
        creature.gallop = true;
        creature.moveTowards(targetPosition, 1.2, 5.0);
      } else if (this.mockTicks < 40) {
        creature.gallop = false;
        creature.stop();
      } else {
        this.mockTicks = -1;
      }
      this.breaker.tick(false, null);
      return;
    }

    if (targetIsPlayer && this.mockCooldown <= 0) {
      if (horizontal >= 14.0 && horizontal <= 30.0 && lineOfSight && Math.random() < 0.004) {
        this.mockTicks = 0;
        this.mockCooldown = 700;
        playSound(creature.dimension, creature.position, SOUNDS.SCULK_SHRIEKER_SHRIEK, 0.6, 0.9);
      }
    }

    let moveGoal = targetPosition;
    if (targetIsPlayer && horizontal > 12.0 && !creature.climbing) {
      const toTarget = targetPosition.clone().subtract(creature.position).setY(0.0);
      if (toTarget.lengthSquared() > 1e-8) {
        toTarget.normalize();
        const side = new Vec(-toTarget.z, 0.0, toTarget.x);
        const sway = Math.sin(this.circlePhase) * Math.min(horizontal * 0.3, 6.0);
        moveGoal = targetPosition.clone().add(side.multiply(sway));
      }
    }
    creature.moveTowards(moveGoal, Hunt.speedMultiplier(Hunt.phase), reach * 0.6);

    const actualSpeed = new Vec(creature.velocity.x, 0.0, creature.velocity.z).length();
    const desiredSpeed = creature.getBaseSpeed() * Hunt.speedMultiplier(Hunt.phase);
    if (horizontal > reach && actualSpeed < desiredSpeed * 0.3) this.blockedTicks++;
    else if (!lineOfSight && actualSpeed < desiredSpeed * 0.5) this.blockedTicks++;
    else this.blockedTicks = Math.max(this.blockedTicks - 2, 0);

    const mining = Hunt.phase >= this.blockBreakingPhase && this.blockedTicks > 10;
    const digDirection = targetPosition.clone().subtract(creature.position);
    this.breaker.tick(mining, digDirection);

    if (mining && this.breaker.diggingDown &&
        (this.breaker.isWorking() || creature.spaceBelowIsOpen())) {
      creature.face(digDirection);
      creature.stop();
      creature.digDescend = true;
      creature.steadyStance = false;
      return;
    }
    creature.steadyStance = mining && !this.breaker.diggingDown;

    const perchedAbove = vertical > Hunt.attackVerticalRange(Hunt.phase) &&
      targetPosition.y > creature.position.y && horizontal <= reach + 3.0;
    this.unreachableTicks = perchedAbove
      ? this.unreachableTicks + 1
      : Math.max(this.unreachableTicks - 2, 0);

    const stuckLimit = cfg.stuckDespawnTicks;
    if (stuckLimit > 0) {
      const doingNothing = actualSpeed < 0.02 && !withinReach && !this.breaker.isWorking() &&
        !creature.climbing && !creature.isAirborne() && this.jumpCharge < 0;
      this.hardStuckTicks = doingNothing ? this.hardStuckTicks + 1 : 0;
      if (this.hardStuckTicks >= stuckLimit) {
        GameMaster.despawn(creature, cfg.respawnCooldownTicks);
        return;
      }
    }

    const stuckBehindTerrain = this.blockedTicks > 25 && horizontal >= 3.0 && horizontal <= 40.0;
    const preyOutOfReach = this.unreachableTicks > 20 && vertical <= this.maxJumpHeight;
    if (this.jumpCooldown <= 0 && (stuckBehindTerrain || preyOutOfReach)) {
      this.unreachableTicks = 0;
      const canWebInstead = preyOutOfReach && targetIsPlayer && this.webPullCooldown <= 0 &&
        vertical > 6.0 && lineOfSight;
      if (canWebInstead && Math.random() < 0.5) {
        this.webPull(target);
      } else {
        this.beginJumpCharge();
      }
    }

    if (targetIsPlayer && this.webPullCooldown <= 0 && this.unreachableTicks > 25 &&
        vertical > this.maxJumpHeight && lineOfSight) {
      this.webPull(target);
    }

    const preyBelow = targetPosition.y < creature.position.y - 2.0 &&
      vertical > Hunt.attackVerticalRange(Hunt.phase) &&
      horizontal <= reach + 2.0 && vertical <= 24.0;
    this.belowTicks = preyBelow ? this.belowTicks + 1 : Math.max(this.belowTicks - 2, 0);
    if (this.belowTicks > 12 && !creature.isAirborne() && creature.spaceBelowIsOpen()) {
      this.belowTicks = 0;
      playSound(creature.dimension, creature.position, SOUNDS.SPIDER_AMBIENT, 1.2, 0.5);
      const nudge = targetPosition.clone().subtract(creature.position).setY(0.0);
      if (nudge.lengthSquared() > 1e-8) nudge.normalize().multiply(0.12 * creature.scale);
      creature.launch(new Vec(nudge.x, -0.05, nudge.z));
    }
  }

  /* ------------------------------------------------------------- web pull */

  webPull(player) {
    const creature = this.creature;
    this.webPullCooldown = cfg.webPullCooldownTicks;
    this.unreachableTicks = 0;
    playSound(creature.dimension, creature.position, SOUNDS.LLAMA_SPIT, 1.4, 0.5);
    const playerPosition = posOf(player);
    playSound(creature.dimension, playerPosition, SOUNDS.SLIME_BLOCK_PLACE, 1.0, 0.7);
    const playerCentre = playerPosition.clone().add(new Vec(0.0, entityHeight(player) / 2.0, 0.0));
    this.webStrand(this.mouthPosition(), playerCentre);
    spawnParticle(creature.dimension, PARTICLES.ITEM_SNOWBALL, playerCentre, 15, 0.3, 0.3, 0.3);

    const pull = creature.position.clone().subtract(playerPosition).setY(0.0);
    if (pull.lengthSquared() > 1e-8) pull.normalize();
    teleportTo(player, new Vec(
      playerPosition.x + pull.x * 0.4,
      playerPosition.y + 0.5,
      playerPosition.z + pull.z * 0.4,
    ));
    pushEntity(player, pull.x * 1.1, 0.3, pull.z * 1.1);
  }

  close() {
    this.creature.crouch = 0.0;
    this.breaker.close();
  }

  /* ------------------------------------------------------------------ flee */

  flee() {
    const creature = this.creature;
    if (!this.fleeing) {
      this.fleeing = true;
      this.releasePlayer(true);
      this.heldPrey = null;
      this.jumpCharge = -1;
      creature.crouch = 0.0;
      if (creature.climbing) creature.stopClimb();
      Hunt.announce(creature, "The creature shrieks and flees!");
      playSound(creature.dimension, creature.position, SOUNDS.SPIDER_DEATH, 1.5, 1.4);
    }
    this.fleeTicks++;
    creature.gallop = true;

    // Java's flee() runs from anyone alive who is not a spectator - creative
  // players still count as a threat here, unlike the targeting filter.
  const threats = playersInDimension(creature).filter(isVisiblePlayer);
    const threat = nearestBy(threats, creature.position);
    if (threat === null) {
      GameMaster.despawn(creature, cfg.respawnCooldownTicks);
      return;
    }

    const threatPosition = posOf(threat);
    const away = creature.position.clone().subtract(threatPosition).setY(0.0);
    if (away.lengthSquared() < 1e-8) away.copy(creature.forward());
    else away.normalize();
    creature.face(away);
    creature.moveTowards(
      creature.position.clone().add(away.clone().multiply(24.0)),
      cfg.fleeSpeedMultiplier, 0.0,
    );

    const actualSpeed = new Vec(creature.velocity.x, 0.0, creature.velocity.z).length();
    const mining = Hunt.phase >= this.blockBreakingPhase &&
      actualSpeed < creature.getBaseSpeed() * 0.4;
    this.breaker.tick(mining, away);

    const distance = threatPosition.distance(creature.position);
    if (distance > Hunt.detectionRadius(Hunt.phase) * 1.3 || this.fleeTicks > 500) {
      this.startBurrow(cfg.respawnCooldownTicks);
    }
  }

  /* ------------------------------------------------------------ player grab */

  grabPlayer(player) {
    const creature = this.creature;
    this.heldPlayer = player;
    this.playerGrabTicks = 0;
    this.hitsAtGrab = creature.hitCounter;
    creature.strike();
    playSound(creature.dimension, creature.position, SOUNDS.SPIDER_AMBIENT, 1.2, 0.5);
    playSound(creature.dimension, creature.position, SOUNDS.LLAMA_SPIT, 1.0, 0.6);
    const playerCentre = centreOf(player);
    spawnParticle(creature.dimension, PARTICLES.ITEM_SNOWBALL, playerCentre, 12, 0.3, 0.3, 0.3);
    this.webStrand(this.mouthPosition(), playerCentre);
  }

  holdPlayer(player) {
    const creature = this.creature;
    creature.gallop = false;
    creature.stop();
    this.breaker.tick(false, null);

    let invalid = !isEntityAlive(player);
    if (!invalid) {
      try {
        invalid = player.dimension.id !== creature.dimension.id;
      } catch {
        invalid = true;
      }
    }
    if (!invalid && !isHuntable(player)) invalid = true;
    if (invalid) {
      this.heldPlayer = null;
      this.playerGrabCooldown = cfg.grabCooldownTicks;
      return;
    }

    if (creature.hitCounter - this.hitsAtGrab >= 3) {
      Hunt.announce(creature, "The creature recoils and lets go!");
      playSound(creature.dimension, creature.position, SOUNDS.SPIDER_HURT, 1.4, 0.9);
      this.releasePlayer(true);
      return;
    }

    this.playerGrabTicks++;
    if (this.playerGrabTicks > 160) {
      this.releasePlayer(true);
      return;
    }

    const mouth = this.mouthPosition();
    const playerPosition = posOf(player);
    if (playerPosition.distance(mouth) > 0.9) {
      const pulled = moveTowardsVec(playerPosition.clone(), mouth, 0.5);
      teleportTo(player, pulled);
      this.webStrand(mouth, playerPosition.clone().add(new Vec(0.0, entityHeight(player) / 2.0, 0.0)));
      if (this.playerGrabTicks % 4 === 1) {
        playSound(creature.dimension, playerPosition, SOUNDS.WOOL_STEP, 0.8, 0.6);
      }
    } else {
      teleportTo(player, mouth);
      if (this.playerGrabTicks % 5 === 0) {
        spawnParticle(creature.dimension, PARTICLES.SNOWFLAKE, mouth, 2, 0.2, 0.2, 0.2);
      }
      if (this.playerGrabTicks % 30 === 0) {
        if (isShielding(player, creature)) {
          playSound(creature.dimension, mouth, SOUNDS.SHIELD_BLOCK, 0.8, 1.1);
        } else {
          hurtEntity(creature, player, 2.0);
          playSound(creature.dimension, mouth, SOUNDS.GENERIC_EAT, 0.8, 0.6);
        }
      }
    }
    clearMotion(player);
  }

  releasePlayer(fling) {
    const player = this.heldPlayer;
    if (player === null) return;
    this.heldPlayer = null;
    this.playerGrabCooldown = cfg.grabCooldownTicks;
    if (fling && isEntityAlive(player)) {
      const away = posOf(player).subtract(this.creature.position).setY(0.0);
      if (away.lengthSquared() < 1e-8) away.copy(this.creature.forward());
      else away.normalize();
      pushEntity(player, away.x * 0.6, 0.45, away.z * 0.6);
    }
  }

  /* ------------------------------------------------------------------ jump */

  beginJumpCharge() {
    this.jumpCharge = 0;
    this.creature.stop();
    this.breaker.tick(false, null);
    playSound(this.creature.dimension, this.creature.position, SOUNDS.SCULK_SHRIEKER_SHRIEK, 0.7, 1.5);
  }

  chargeJump() {
    const creature = this.creature;
    const target = this.target;
    if (target === null || !isEntityAlive(target)) {
      this.jumpCharge = -1;
      creature.crouch = 0.0;
      return;
    }
    creature.gallop = false;
    creature.stop();
    creature.face(posOf(target).subtract(creature.position));
    this.jumpCharge++;
    creature.crouch = clamp(this.jumpCharge / this.jumpChargeTicks, 0.0, 1.0);

    const ground = creature.position.clone()
      .add(new Vec(0.0, -creature.layout.rideHeight * 0.7, 0.0));
    if (this.jumpCharge % 3 === 0) {
      spawnParticle(creature.dimension, PARTICLES.SCULK_CHARGE_POP, ground, 6,
        0.6 * creature.scale, 0.2, 0.6 * creature.scale);
    }
    if (this.jumpCharge < this.jumpChargeTicks) return;

    this.jumpCharge = -1;
    this.jumpFlying = true;
    this.jumpCooldown = cfg.jumpCooldownTicks;
    creature.crouch = 0.0;
    this.blockedTicks = 0;

    const power = Math.max(cfg.jumpPowerMultiplier, 0.1);
    const targetPosition = posOf(target);
    const distance = horizontalDistance(creature.position, targetPosition);
    const flightTicks = clamp(Math.trunc(10 + (distance * 1.1) / power), 10, 26);
    const rise = targetPosition.y - creature.position.y;
    const gravity = creature.layout.gravity;
    const vy = clamp(
      (rise + 0.5 * gravity * flightTicks * flightTicks) / flightTicks,
      0.35, 1.7 * power,
    );
    const horizontal = targetPosition.clone().subtract(creature.position).setY(0.0);
    if (horizontal.lengthSquared() > 1e-8) horizontal.normalize().multiply(distance / flightTicks);
    creature.launch(new Vec(horizontal.x, vy, horizontal.z));

    playSound(creature.dimension, creature.position, SOUNDS.RAVAGER_ROAR, Math.min(1.2 * power, 2.5), 1.5);
    spawnParticle(creature.dimension, PARTICLES.EXPLOSION, ground, 1, 0, 0, 0);
    spawnParticle(creature.dimension, PARTICLES.CLOUD, ground, 25,
      0.8 * creature.scale, 0.2, 0.8 * creature.scale);
    this.shakeNearbyPlayers(0.5 * cfg.jumpShakeMultiplier);
  }

  land() {
    const creature = this.creature;
    this.jumpFlying = false;
    this.blockedTicks = 0;
    const ground = creature.position.clone().add(new Vec(0.0, -creature.layout.rideHeight, 0.0));
    playSound(creature.dimension, creature.position, SOUNDS.WARDEN_ATTACK_IMPACT, 1.6, 0.8);
    playSound(creature.dimension, creature.position, SOUNDS.GENERIC_EXPLODE, 0.8, 0.7);
    spawnParticle(creature.dimension, PARTICLES.EXPLOSION_EMITTER, ground, 1, 0, 0, 0);
    spawnParticle(creature.dimension, PARTICLES.CLOUD, ground, 35, creature.scale, 0.2, creature.scale);
    const groundBlock = getBlockSafe(creature.dimension, ground.x, ground.y - 0.5, ground.z);
    if (groundBlock && !blockIsPassable(groundBlock)) {
      spawnParticle(creature.dimension, PARTICLES.BLOCK_DUST, ground, 60,
        creature.scale, 0.3, creature.scale);
    }
    this.shakeNearbyPlayers(1.0 * cfg.jumpShakeMultiplier);
    this.crushLandingGround(ground.y);
  }

  crushLandingGround(groundY) {
    const creature = this.creature;
    const breakPower = Math.max(cfg.jumpGroundBreakMultiplier, 0.0);
    if (breakPower <= 0.0) return;
    const radius = Math.max((1.0 + 0.9 * creature.scale) * breakPower, 1.2);
    const maxBroken = Math.max(Math.trunc((1 + Hunt.phase * Hunt.phase) * breakPower), 1);
    const crushChance = (0.25 + 0.1 * Hunt.phase) * breakPower;
    let broken = 0;

    const minX = Math.floor(creature.position.x - radius);
    const maxX = Math.floor(creature.position.x + radius);
    const minY = Math.floor(groundY - 1.2);
    const maxY = Math.floor(groundY + 0.4);
    const minZ = Math.floor(creature.position.z - radius);
    const maxZ = Math.floor(creature.position.z + radius);

    for (let x = minX; x <= maxX && broken < maxBroken; x++) {
      for (let y = minY; y <= maxY && broken < maxBroken; y++) {
        for (let z = minZ; z <= maxZ && broken < maxBroken; z++) {
          const dx = x + 0.5 - creature.position.x;
          const dz = z + 0.5 - creature.position.z;
          if (dx * dx + dz * dz > radius * radius) continue;
          if (Math.random() > crushChance) continue;
          const block = getBlockSafe(creature.dimension, x, y, z);
          if (!block || blockIsPassable(block)) continue;
          const hardness = blockHardness(block);
          if (hardness < 0 || hardness > 25.0) continue;
          breakBlockWithDrops(creature.dimension, x, y, z);
          broken++;
        }
      }
    }
  }

  shakeNearbyPlayers(strength) {
    const creature = this.creature;
    const radius = 14.0 * Math.max(creature.scale, 1.0);
    for (const player of playersInDimension(creature)) {
      const distance = posOf(player).distance(creature.position);
      if (!(distance < radius)) continue;
      shakeCamera(player, strength * (1.0 - distance / radius));
    }
  }

  /* --------------------------------------------------------- target choice */

  updateTarget() {
    const creature = this.creature;
    const radius = Hunt.detectionRadius(Hunt.phase);

    const current = this.target;
    if (current !== null) {
      const keepRange = radius * (this.shadowTicks >= 0 ? 2.2 : 1.2);
      let escaped = false;
      if (!isEntityAlive(current)) escaped = true;
      else {
        try {
          if (current.dimension.id !== creature.dimension.id) escaped = true;
          else if (posOf(current).distance(creature.position) > keepRange) escaped = true;
          else if (isPlayerEntity(current) && !isHuntable(current)) escaped = true;
          else if (!isPlayerEntity(current) && !isHuntableMob(current)) escaped = true;
        } catch {
          escaped = true;
        }
      }
      if (escaped) this.target = null;
    }

    if (creature.grudgeTarget !== null) {
      for (const player of playersInDimension(creature)) {
        try {
          if (player.id !== creature.grudgeTarget) continue;
          if (!isHuntable(player)) continue;
          if (posOf(player).distance(creature.position) > radius * 1.2) continue;
          this.target = player;
          return;
        } catch {
          /* stale handle */
        }
      }
    }

    const nearbyPlayers = playersInDimension(creature).filter((player) => {
      try {
        return isHuntable(player) && posOf(player).distance(creature.position) <= radius;
      } catch {
        return false;
      }
    });
    const nearestPlayer = nearestBy(nearbyPlayers, creature.position);
    if (nearestPlayer !== null) {
      this.target = nearestPlayer;
      return;
    }

    if (this.target !== null && isPlayerEntity(this.target)) this.target = null;

    if (this.target === null && this.mobScanCooldown <= 0) {
      this.mobScanCooldown = this.mobScanIntervalTicks;
      const mobs = huntableMobsNear(creature.dimension, creature.position, radius);
      this.target = nearestBy(mobs, creature.position);
    }
  }

  mouthPosition() {
    const creature = this.creature;
    return creature.position.clone()
      .add(creature.forward().multiply(1.0 * creature.scale))
      .add(new Vec(0.0, -0.4 * creature.scale, 0.0));
  }

  /* ------------------------------------------------------------ prey / bite */

  grab(prey) {
    const creature = this.creature;
    this.heldPrey = prey;
    this.eatingTicks = 0;
    creature.strike();
    playSound(creature.dimension, creature.position, SOUNDS.SPIDER_AMBIENT, 1.2, 0.6);
    playSound(creature.dimension, creature.position, SOUNDS.LLAMA_SPIT, 1.0, 0.6);
    const preyCentre = centreOf(prey);
    spawnParticle(creature.dimension, PARTICLES.ITEM_SNOWBALL, preyCentre, 12, 0.3, 0.3, 0.3);
    this.webStrand(this.mouthPosition(), preyCentre);
  }

  eat(prey) {
    const creature = this.creature;
    creature.gallop = false;
    creature.stop();

    let escaped = !isEntityAlive(prey);
    if (!escaped) {
      try {
        if (prey.dimension.id !== creature.dimension.id) escaped = true;
        else if (posOf(prey).distance(creature.position) > Hunt.attackRange(Hunt.phase) * 3) escaped = true;
      } catch {
        escaped = true;
      }
    }
    if (escaped) {
      this.finishMeal();
      return;
    }

    this.eatingTicks++;
    const mouth = this.mouthPosition();
    const preyPosition = posOf(prey);
    const preyCentre = preyPosition.clone().add(new Vec(0.0, entityHeight(prey) / 2.0, 0.0));
    clearMotion(prey);

    if (preyPosition.distance(mouth) > 0.6) {
      const pullSpeed = 0.45 + 0.1 * creature.scale;
      const pulled = moveTowardsVec(preyPosition.clone(), mouth, pullSpeed);
      teleportTo(prey, pulled);
      this.webStrand(mouth, preyCentre);
      if (this.eatingTicks % 4 === 1) {
        playSound(creature.dimension, preyCentre, SOUNDS.WOOL_STEP, 0.8, 0.6);
      }
      return;
    }

    teleportTo(prey, mouth);
    if (this.eatingTicks % 5 === 0) {
      spawnParticle(creature.dimension, PARTICLES.SNOWFLAKE, preyCentre, 2, 0.2, 0.2, 0.2);
    }
    if (this.eatingTicks % this.biteIntervalTicks === 1) {
      const name = entityName(prey);
      hurtEntity(creature, prey, Hunt.attackDamage(Hunt.phase));
      playSound(creature.dimension, mouth, SOUNDS.GENERIC_EAT, 1.0, 0.8 + Math.random() * 0.3);
      spawnParticle(creature.dimension, PARTICLES.CRIT, mouth, 8,
        0.2 * creature.scale, 0.2 * creature.scale, 0.2 * creature.scale);
      if (!isEntityAlive(prey)) {
        playSound(creature.dimension, creature.position, SOUNDS.PLAYER_BURP, 1.0, 0.7);
        Hunt.registerKill(creature, name, preyCentre);
        this.finishMeal();
      }
    }
  }

  webStrand(from, to) {
    const diff = to.clone().subtract(from);
    const length = diff.length();
    if (length < 0.05) return;
    const steps = clamp(Math.trunc(length / 0.35), 1, 40);
    const step = diff.multiply(1.0 / steps);
    const current = from.clone();
    for (let i = 0; i <= steps; i++) {
      spawnParticle(this.creature.dimension, PARTICLES.SNOWFLAKE, current, 1, 0, 0, 0);
      current.add(step);
    }
  }

  finishMeal() {
    this.heldPrey = null;
    this.eatingTicks = 0;
    this.attackCooldown = this.attackIntervalTicks;
  }

  attack(victim) {
    const creature = this.creature;
    this.attackCooldown = this.attackIntervalTicks;
    creature.strike();

    if (isPlayerEntity(victim) && isShielding(victim, creature)) {
      const victimPosition = posOf(victim);
      if (Hunt.phase >= MAX_PHASE) {
        playSound(creature.dimension, victimPosition, SOUNDS.SHIELD_BREAK, 1.0, 0.9);
      } else {
        playSound(creature.dimension, victimPosition, SOUNDS.SHIELD_BLOCK, 1.0, 1.0);
      }
      const shove = victimPosition.clone().subtract(creature.position).setY(0.0);
      if (shove.lengthSquared() > 1e-8) shove.normalize();
      else shove.copy(creature.forward());
      pushEntity(victim, shove.x * 0.3, 0.2, shove.z * 0.3);
      return;
    }

    const name = entityName(victim);
    hurtEntity(creature, victim, Hunt.attackDamage(Hunt.phase));

    if (isEntityAlive(victim) && Math.random() < cfg.poisonChance) {
      const minTicks = Math.trunc(cfg.poisonMinSeconds * 20);
      const maxTicks = Math.max(Math.trunc(cfg.poisonMaxSeconds * 20), minTicks);
      const duration = minTicks + (maxTicks > minTicks ? randomInt(0, maxTicks - minTicks + 1) : 0);
      try {
        victim.addEffect("poison", duration, { amplifier: 0, showParticles: true });
      } catch {
        /* immune entity */
      }
      playSound(creature.dimension, posOf(victim), SOUNDS.SPIDER_STEP, 1.0, 0.5);
    }

    const away = posOf(victim).subtract(creature.position).setY(0.0);
    if (away.lengthSquared() > 1e-8) away.normalize();
    else away.copy(creature.forward());
    const strength = 0.4 + 0.15 * Hunt.phase;
    pushEntity(victim, away.x * strength, 0.35, away.z * strength);

    playSound(creature.dimension, creature.position, SOUNDS.RAVAGER_ATTACK, 1.0, 1.3);
    if (!isEntityAlive(victim)) {
      Hunt.registerKill(creature, name, centreOf(victim));
    }
  }
}

/* ---------------------------------------------------------- MiniHunterBrain */

export class MiniHunterBrain {
  constructor(creature) {
    this.creature = creature;
    this.detectionRadius = 25.0;
    this.reach = 1.3;
    this.attackIntervalTicks = 15;
    this.mobScanIntervalTicks = 10;
    this.target = null;
    this.attackCooldown = 0;
    this.mobScanCooldown = 0;
  }

  get damage() {
    return cfg.miniDamage;
  }

  tick(creature) {
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.mobScanCooldown > 0) this.mobScanCooldown--;
    this.updateTarget();

    const target = this.target;
    if (target === null) {
      creature.gallop = false;
      creature.stop();
      return;
    }

    const targetPosition = posOf(target);
    creature.face(targetPosition.clone().subtract(creature.position));
    const effectiveReach = this.reach + entityWidth(target) / 2.0;
    const horizontal = horizontalDistance(creature.position, targetPosition);
    const vertical = verticalDistance(creature.position, targetPosition);
    creature.gallop = horizontal > 4.0;

    const targetCentre = targetPosition.clone().add(new Vec(0.0, entityHeight(target) / 2.0, 0.0));
    if (this.attackCooldown <= 0 && horizontal <= effectiveReach && vertical <= 2.0 &&
        hasLineOfSight(creature.dimension, creature.position, targetCentre)) {
      this.bite(target);
    }

    if (creature.climbing) {
      if (targetPosition.y < creature.position.y - 1.0) creature.stopClimb();
      return;
    }
    if (vertical > 1.5 && horizontal <= 3.0 && targetPosition.y > creature.position.y &&
        creature.tryStartClimb(targetPosition.clone().subtract(creature.position))) {
      return;
    }
    creature.moveTowards(targetPosition, 1.0, effectiveReach * 0.6);
  }

  updateTarget() {
    const creature = this.creature;
    const current = this.target;
    if (current !== null) {
      let escaped = !isEntityAlive(current);
      if (!escaped) {
        try {
          if (current.dimension.id !== creature.dimension.id) escaped = true;
          else if (posOf(current).distance(creature.position) > this.detectionRadius * 1.2) escaped = true;
          else if (isPlayerEntity(current) && !isHuntable(current)) escaped = true;
          else if (!isPlayerEntity(current) && !isHuntableMob(current)) escaped = true;
        } catch {
          escaped = true;
        }
      }
      if (escaped) this.target = null;
    }

    const nearbyPlayers = playersInDimension(creature).filter((player) => {
      try {
        return isHuntable(player) && posOf(player).distance(creature.position) <= this.detectionRadius;
      } catch {
        return false;
      }
    });
    const nearestPlayer = nearestBy(nearbyPlayers, creature.position);
    if (nearestPlayer !== null) {
      this.target = nearestPlayer;
      return;
    }

    if (this.target !== null && isPlayerEntity(this.target)) this.target = null;

    if (this.target === null && this.mobScanCooldown <= 0) {
      this.mobScanCooldown = this.mobScanIntervalTicks;
      const mobs = huntableMobsNear(creature.dimension, creature.position, this.detectionRadius);
      this.target = nearestBy(mobs, creature.position);
    }
  }

  bite(victim) {
    const creature = this.creature;
    this.attackCooldown = this.attackIntervalTicks;
    creature.strike();

    if (isPlayerEntity(victim) && isShielding(victim, creature)) {
      playSound(creature.dimension, posOf(victim), SOUNDS.SHIELD_BLOCK, 0.7, 1.3);
      return;
    }

    hurtEntity(creature, victim, this.damage);
    if (isEntityAlive(victim) && Math.random() < 0.2) {
      try {
        victim.addEffect("poison", 60, { amplifier: 0, showParticles: true });
      } catch {
        /* immune entity */
      }
    }
    const away = posOf(victim).subtract(creature.position).setY(0.0);
    if (away.lengthSquared() > 1e-8) away.normalize();
    pushEntity(victim, away.x * 0.15, 0.15, away.z * 0.15);
    playSound(creature.dimension, creature.position, SOUNDS.SPIDER_AMBIENT, 0.8, 1.6);
  }

  close() {}
}
