/**
 * Port of com.dogukan.spiderhunt.creature.{LimbLayout, LimbPlan, Limb, Creature}.
 *
 * The Java mod draws the creature out of block-display entities and therefore
 * simulates every leg joint itself. On Bedrock the visible model is a real
 * entity with a bone rig, so the FABRIK joint solve (which only ever fed the
 * renderer) is dropped, while the *physics* half of the limb system - foot
 * placement, step scheduling, ground support and body tilt - is ported exactly,
 * because that is what gives the creature its gait and terrain hugging.
 */
import { cfg } from "./config.js";
import {
  Vec, DOWN_VECTOR, UP_VECTOR, clamp, lerp, lerpVec, moveTowardsVec,
  wrapAngle, horizontalDistance,
} from "./vec.js";
import {
  raycastGround, isBodyPassable, isLiquid, playSound, spawnParticle,
  blockHardness, breakBlockWithDrops, getBlockSafe, blockIsPassable,
  SOUNDS, PARTICLES,
} from "./world_util.js";

/**
 * Vertical sanity rails. Java's creature lives inside a loaded world at all
 * times; on Bedrock a script keeps driving an entity whose chunk has unloaded,
 * where every block query comes back empty and the ground check would conclude
 * "nothing below me" and drop the creature out of the world forever.
 */
const WORLD_FLOOR = -128;
const WORLD_CEILING = 512;

/* ------------------------------------------------------------- limb layout */

const ROWS = [
  // hipZ, out, homeZ, reach
  { hipZ: 0.5, out: 1.05, homeZ: 1.1, reach: 1.0 },
  { hipZ: 0.2, out: 1.4, homeZ: 0.4, reach: 1.0 },
  { hipZ: -0.15, out: 1.4, homeZ: -0.45, reach: 1.05 },
  { hipZ: -0.5, out: 1.1, homeZ: -1.25, reach: 1.15 },
];

const SEGMENTS = [0.85, 0.85, 0.65];

export class LimbLayout {
  constructor(scale, speedBoost = 1.0) {
    this.scale = scale;
    this.speedBoost = speedBoost;

    this.limbs = [];
    for (let rowIndex = 0; rowIndex < ROWS.length; rowIndex++) {
      const row = ROWS[rowIndex];
      for (const side of [1.0, -1.0]) {
        const sideIndex = side > 0 ? 0 : 1;
        this.limbs.push({
          hip: new Vec(0.3 * side, 0.05, row.hipZ).multiply(scale),
          home: new Vec(row.out * side, 0.0, row.homeZ).multiply(scale),
          segmentLengths: SEGMENTS.map((it) => it * row.reach * scale),
          walkGroup: (rowIndex + sideIndex) % 2,
          gallopGroup: row.hipZ > 0 ? 0 : 1,
        });
      }
    }

    this.walkSpeed = 0.16 * scale * speedBoost;
    this.gallopSpeed = 0.42 * scale * speedBoost;
    this.acceleration = 0.022 * scale * speedBoost;
    this.walkTurnRate = 0.09;
    this.gallopTurnRate = 0.16;
    this.rideHeight = 1.0 * scale;
    this.heightLerp = 0.22;
    this.tiltLerp = 0.15;
    this.gravity = 0.08;
    this.walkStepTrigger = 0.5 * scale;
    this.gallopStepTrigger = 1.5 * scale;
    this.walkStepTicksMin = 4;
    this.walkStepTicksMax = 9;
    this.gallopStepTicksMin = 4;
    this.gallopStepTicksMax = 7;
    this.walkStepLift = 0.3 * scale;
    this.gallopStepLift = 0.7 * scale;
    this.maxReach = this.limbs[0].segmentLengths.reduce((a, b) => a + b, 0) * 0.95;
  }
}

/* -------------------------------------------------------------------- limb */

export class Limb {
  constructor(creature, plan) {
    this.creature = creature;
    this.plan = plan;
    this.stepping = false;
    this.stepFrom = new Vec();
    this.stepTarget = new Vec();
    this.stepProgressTicks = 0;
    this.stepDuration = 1;

    const restingFoot = this.restingFootPosition();
    const hit = raycastGround(
      creature.dimension,
      restingFoot.clone().add(new Vec(0, creature.layout.scale, 0)),
      DOWN_VECTOR(),
      creature.layout.scale * 3.0,
      true,
    );
    this.foot = hit ? hit.hitPosition : restingFoot;
    this.grounded = hit !== null;
  }

  hipPosition() {
    return this.plan.hip.clone()
      .rotateBody(this.creature.yaw, this.creature.pitch, this.creature.roll)
      .add(this.creature.position);
  }

  restingFootPosition() {
    const lead = this.creature.velocity.clone().multiply(this.dynamicStepTicks() + 2.0);
    if (this.creature.climbing) {
      const normal = this.creature.climbNormal;
      const rightOnWall = new Vec(-normal.z, 0.0, normal.x);
      return this.creature.position.clone()
        .add(rightOnWall.multiply(this.plan.home.x))
        .add(new Vec(0.0, this.plan.home.z, 0.0))
        .add(lead);
    }
    const local = this.plan.home.clone().rotateAroundY(-this.creature.yaw);
    return local
      .add(this.creature.position.clone().setY(this.creature.position.y - this.creature.layout.rideHeight))
      .add(lead.setY(0.0));
  }

  dynamicStepTicks() {
    const layout = this.creature.layout;
    const gallop = this.creature.gallop;
    const trigger = gallop ? layout.gallopStepTrigger : layout.walkStepTrigger;
    const min = gallop ? layout.gallopStepTicksMin : layout.walkStepTicksMin;
    const max = gallop ? layout.gallopStepTicksMax : layout.walkStepTicksMax;
    const speed = this.creature.velocity.length();
    if (speed < 0.001) return max;
    return clamp(Math.trunc((trigger / speed) * 0.8), min, max);
  }

  group() {
    return this.creature.gallop ? this.plan.gallopGroup : this.plan.walkGroup;
  }

  wantsStep() {
    if (this.stepping) return false;
    if (!this.grounded) return true;
    const layout = this.creature.layout;
    const trigger = this.creature.gallop ? layout.gallopStepTrigger : layout.walkStepTrigger;
    const resting = this.restingFootPosition();
    const displacement = this.creature.climbing
      ? this.foot.distance(resting)
      : horizontalDistance(this.foot, resting);
    return displacement > trigger;
  }

  overextended() {
    return !this.stepping &&
      this.foot.distance(this.hipPosition()) > this.creature.layout.maxReach * 1.2;
  }

  beginStep() {
    this.stepping = true;
    this.stepFrom = this.foot.clone();
    this.stepProgressTicks = 0;
    this.stepDuration = this.dynamicStepTicks();
    this.retarget();
  }

  retarget() {
    const desired = this.restingFootPosition();
    const scale = this.creature.layout.scale;
    let hit;
    if (this.creature.climbing) {
      const intoWall = this.creature.climbNormal.clone().multiply(-1.0);
      hit = raycastGround(
        this.creature.dimension,
        desired.clone().add(this.creature.climbNormal.clone().multiply(0.9 * scale)),
        intoWall,
        2.2 * scale,
        true,
      );
    } else {
      hit = raycastGround(
        this.creature.dimension,
        desired.clone().add(new Vec(0.0, 1.1 * scale, 0.0)),
        DOWN_VECTOR(),
        2.4 * scale,
        true,
      );
    }
    this.stepTarget = hit ? hit.hitPosition : desired;

    const hip = this.hipPosition();
    if (this.stepTarget.distance(hip) > this.creature.layout.maxReach) {
      this.stepTarget = hip.clone().add(
        this.stepTarget.clone().subtract(hip).normalize().multiply(this.creature.layout.maxReach),
      );
    }
  }

  update() {
    if (this.stepping) {
      this.stepProgressTicks++;
      if (this.stepProgressTicks % 3 === 0) this.retarget();
      const t = this.stepProgressTicks / this.stepDuration;
      const lift = this.creature.gallop
        ? this.creature.layout.gallopStepLift
        : this.creature.layout.walkStepLift;
      this.foot.copy(lerpVec(this.stepFrom.clone(), this.stepTarget, clamp(t, 0.0, 1.0)));
      this.foot.y += Math.sin(clamp(t, 0.0, 1.0) * Math.PI) * lift;
      if (this.stepProgressTicks >= this.stepDuration) {
        this.stepping = false;
        this.foot.copy(this.stepTarget);
        const hit = this.creature.climbing
          ? raycastGround(
              this.creature.dimension,
              this.foot.clone().add(this.creature.climbNormal.clone().multiply(0.15)),
              this.creature.climbNormal.clone().multiply(-1.0),
              0.5,
              true,
            )
          : raycastGround(
              this.creature.dimension,
              this.foot.clone().add(new Vec(0.0, 0.1, 0.0)),
              DOWN_VECTOR(),
              0.3,
              true,
            );
        this.grounded = hit !== null;
        if (this.grounded) this.onPlant();
      }
    } else if (!this.grounded) {
      this.foot.add(this.creature.velocity);
    }
  }

  onPlant() {
    const dimension = this.creature.dimension;
    const scale = this.creature.layout.scale;
    if (isLiquid(dimension, this.foot)) {
      playSound(dimension, this.foot, SOUNDS.PLAYER_SPLASH, 0.25, 1.0 + Math.random() * 0.2);
      spawnParticle(dimension, PARTICLES.SPLASH, this.foot, 12, 0.15 * scale, 0.05, 0.15 * scale);
    } else {
      const volume = Math.min(0.18 + 0.1 * scale, 0.6);
      const pitch = clamp(1.4 - 0.25 * scale, 0.5, 1.8);
      playSound(dimension, this.foot, SOUNDS.NETHERITE_BLOCK_STEP, volume, pitch + Math.random() * 0.1);
    }
  }
}

/* ---------------------------------------------------------------- creature */

/** `com.dogukan.spiderhunt.creature.IdleBrain` - parks the creature in place. */
export class IdleBrain {
  tick(creature) {
    creature.gallop = false;
    creature.stop();
    if (creature.climbing) creature.stopClimb();
  }

  close() {}
}

export class Creature {
  constructor(dimension, position, yaw, layout) {
    this.dimension = dimension;
    this.position = position;
    this.yaw = yaw;
    this.layout = layout;

    this.velocity = new Vec(0, 0, 0);
    this.gallop = false;
    this.pitch = 0;
    this.roll = 0;
    this.brain = new IdleBrain();

    this.maxHealth = 60.0;
    this.health = 60.0;
    this.hurtCooldown = 0;
    this.isMini = false;
    this.hitCounter = 0;
    this.grudgeTarget = null;
    this.grudgeTicks = 0;
    this.crouch = 0.0;
    this.steadyStance = false;
    this.digDescend = false;
    this.strikeTicks = 0;
    this.burrowing = false;
    this.climbing = false;
    this.climbNormal = new Vec(0, 0, 1);
    this.climbTicks = 0;

    this.goalPoint = null;
    this.goalSpeedFactor = 1.0;
    this.goalStopDistance = 0.0;
    this.faceDirection = null;
    this.currentStepGroup = 0;
    this.falling = false;
    this.time = 0;

    /** The Bedrock entity that renders this creature (see entity_link.js). */
    this.entity = null;
    this.dead = false;
    /** Set when the body left the world; main.js despawns it next tick. */
    this.outOfBounds = false;

    // Built last: a Limb reads back climbing/velocity/yaw while it looks for
    // the ground under its resting foot.
    this.limbs = this.layout.limbs.map((plan) => new Limb(this, plan));
  }

  static create(dimension, position, yawDegrees, layout) {
    return new Creature(dimension, position.clone(), (yawDegrees * Math.PI) / 180, layout);
  }

  get scale() {
    return this.layout.scale;
  }

  setBrain(value) {
    this.brain.close();
    this.brain = value;
  }

  spaceBelowIsOpen() {
    const standingY = this.position.y - this.layout.rideHeight;
    const check = new Vec(this.position.x, standingY - 0.4, this.position.z);
    return isBodyPassable(this.dimension, check);
  }

  strike() {
    this.strikeTicks = 6;
  }

  isAirborne() {
    return this.falling;
  }

  forward() {
    return new Vec(-Math.sin(this.yaw), 0.0, Math.cos(this.yaw));
  }

  getBaseSpeed() {
    return this.gallop ? this.layout.gallopSpeed : this.layout.walkSpeed;
  }

  moveTowards(point, speedFactor, stopDistance) {
    this.goalPoint = point.clone();
    this.goalSpeedFactor = speedFactor;
    this.goalStopDistance = stopDistance;
  }

  stop() {
    this.goalPoint = null;
  }

  face(direction) {
    if (direction.lengthSquared() > 1e-8) this.faceDirection = direction.clone();
  }

  launch(jumpVelocity) {
    this.velocity.copy(jumpVelocity);
    this.falling = true;
  }

  /* ------------------------------------------------------------- climbing */

  tryStartClimb(towards) {
    if (this.climbing || this.falling) return false;
    const direction = towards.clone().setY(0.0);
    if (direction.lengthSquared() < 1e-8) return false;
    direction.normalize();
    if (raycastGround(this.dimension, this.position, direction, 1.7 * this.scale, true) === null) return false;
    if (raycastGround(
      this.dimension,
      this.position.clone().add(new Vec(0.0, 1.2 * this.scale, 0.0)),
      direction,
      2.2 * this.scale,
      true,
    ) === null) return false;
    this.climbing = true;
    this.climbTicks = 0;
    this.climbNormal = direction.multiply(-1.0);
    return true;
  }

  stopClimb() {
    if (!this.climbing) return;
    this.climbing = false;
    this.falling = true;
    this.velocity.y = 0.0;
  }

  updateClimb() {
    this.climbTicks++;
    this.crouch = 0.0;
    this.gallop = false;
    const intoWall = this.climbNormal.clone().multiply(-1.0);
    const wallHit = raycastGround(this.dimension, this.position, intoWall, 1.8 * this.scale, true);
    if (wallHit === null || this.climbTicks > 300) {
      this.climbing = false;
      this.launch(new Vec(intoWall.x * 0.35, 0.5, intoWall.z * 0.35));
      return;
    }
    const desired = wallHit.hitPosition.clone().add(this.climbNormal.clone().multiply(0.8 * this.scale));
    this.position.x = lerp(this.position.x, desired.x, 0.25);
    this.position.z = lerp(this.position.z, desired.z, 0.25);
    const climbSpeed = this.layout.walkSpeed * cfg.climbSpeedFactor;
    this.position.y += climbSpeed;
    this.velocity.x = 0.0;
    this.velocity.z = 0.0;
    this.velocity.y = climbSpeed;
  }

  /* --------------------------------------------------------- block smashing */

  smashThrough(point) {
    const maxHardness = cfg.maxBlockHardness;
    const halfWidth = Math.max(0.9 * this.scale, 0.6);
    const halfHeight = Math.max(0.8 * this.scale, 0.6);
    const maxSmash = Math.trunc(4 + this.scale * 6);

    const minX = Math.floor(point.x - halfWidth);
    const minY = Math.floor(point.y - halfHeight);
    const minZ = Math.floor(point.z - halfWidth);
    const maxX = Math.floor(point.x + halfWidth);
    const maxY = Math.floor(point.y + halfHeight);
    const maxZ = Math.floor(point.z + halfWidth);

    const candidates = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const block = getBlockSafe(this.dimension, x, y, z);
          if (!block || blockIsPassable(block)) continue;
          const hardness = blockHardness(block);
          if (!(hardness >= 0) || !(hardness <= maxHardness)) continue;
          const dx = x + 0.5 - point.x;
          const dy = y + 0.5 - point.y;
          const dz = z + 0.5 - point.z;
          candidates.push({ x, y, z, d: dx * dx + dy * dy + dz * dz });
        }
      }
    }
    candidates.sort((a, b) => a.d - b.d);

    let smashed = false;
    for (let index = 0; index < candidates.length && index < maxSmash; index++) {
      const pos = candidates[index];
      breakBlockWithDrops(this.dimension, pos.x, pos.y, pos.z);
      smashed = true;
    }
    return smashed && isBodyPassable(this.dimension, point);
  }

  /* ------------------------------------------------------------ main update */

  update() {
    this.time++;
    if (this.hurtCooldown > 0) this.hurtCooldown--;
    if (this.strikeTicks > 0) this.strikeTicks--;
    if (this.grudgeTicks > 0) this.grudgeTicks--;
    else this.grudgeTarget = null;

    this.brain.tick(this);
    if (this.dead) return;

    // Chunk not loaded: every block lookup would answer "air", so hold still
    // this tick instead of falling through a world that is not there.
    if (getBlockSafe(this.dimension, this.position.x, this.position.y, this.position.z) === undefined) {
      return;
    }

    if (this.burrowing) {
      this.velocity.x = 0.0;
      this.velocity.z = 0.0;
      this.updateHeight();
    } else if (this.climbing) {
      this.face(this.climbNormal.clone().multiply(-1.0));
      this.turn();
      this.updateClimb();
    } else {
      this.turn();
      this.accelerate();
      const full = this.position.clone().add(new Vec(this.velocity.x, 0.0, this.velocity.z));
      const stepUp = full.clone().add(new Vec(0.0, 1.05, 0.0));
      const xOnly = this.position.clone().add(new Vec(this.velocity.x, 0.0, 0.0));
      const zOnly = this.position.clone().add(new Vec(0.0, 0.0, this.velocity.z));
      if (isBodyPassable(this.dimension, full)) {
        this.position.copy(full);
      } else if (this.falling && !this.isMini && cfg.jumpSmashesBlocks && this.smashThrough(full)) {
        this.position.copy(full);
      } else if (isBodyPassable(this.dimension, stepUp)) {
        this.position.copy(full.clone().add(new Vec(0.0, 0.6, 0.0)));
      } else if (isBodyPassable(this.dimension, xOnly)) {
        this.position.copy(xOnly);
        this.velocity.z = 0.0;
      } else if (isBodyPassable(this.dimension, zOnly)) {
        this.position.copy(zOnly);
        this.velocity.x = 0.0;
      } else {
        this.velocity.x = 0.0;
        this.velocity.z = 0.0;
      }
      this.updateHeight();
    }

    if (!this.position.isFinite() ||
        this.position.y < WORLD_FLOOR || this.position.y > WORLD_CEILING) {
      this.outOfBounds = true;
      return;
    }

    this.scheduleSteps();
    for (const limb of this.limbs) limb.update();
    this.updateTilt();

    this.goalPoint = null;
    this.faceDirection = null;
  }

  turn() {
    let direction = this.faceDirection;
    if (direction === null && this.goalPoint !== null) {
      direction = this.goalPoint.clone().subtract(this.position);
    }
    if (direction === null) return;
    if (direction.x === 0.0 && direction.z === 0.0) return;
    const targetYaw = Math.atan2(-direction.x, direction.z);
    const turnRate = this.gallop ? this.layout.gallopTurnRate : this.layout.walkTurnRate;
    this.yaw += clamp(wrapAngle(targetYaw - this.yaw), -turnRate, turnRate);
    this.yaw = wrapAngle(this.yaw);
  }

  accelerate() {
    if (this.falling) return;
    const goal = this.goalPoint;
    let desired = new Vec(0, 0, 0);
    if (goal !== null) {
      const toGoal = goal.clone().subtract(this.position).setY(0.0);
      const distance = toGoal.length();
      const speed = this.getBaseSpeed() * this.goalSpeedFactor;
      const current = new Vec(this.velocity.x, 0.0, this.velocity.z).length();
      const brakingDistance = (current * current) / (2 * this.layout.acceleration);
      if (distance > this.goalStopDistance + brakingDistance && distance > 1e-4) {
        desired = toGoal.multiply(speed / distance);
      }
    }
    const horizontal = new Vec(this.velocity.x, 0.0, this.velocity.z);
    moveTowardsVec(horizontal, desired, this.layout.acceleration);
    this.velocity.x = horizontal.x;
    this.velocity.z = horizontal.z;
  }

  updateHeight() {
    if (this.burrowing) {
      this.position.y -= 0.055 * this.scale;
      this.velocity.x = 0.0;
      this.velocity.y = 0.0;
      this.velocity.z = 0.0;
      return;
    }

    if (this.falling) {
      this.velocity.y -= this.layout.gravity;
      this.position.y += this.velocity.y;
      if (this.velocity.y <= 0.0) {
        const landing = raycastGround(
          this.dimension,
          this.position.clone().add(new Vec(0.0, 0.5 * this.scale, 0.0)),
          DOWN_VECTOR(),
          0.5 * this.scale + this.layout.rideHeight,
          true,
        );
        if (landing !== null) {
          this.falling = false;
          this.velocity.y = 0.0;
          playSound(this.dimension, this.position, SOUNDS.NETHERITE_BLOCK_FALL, 0.8, 0.8);
        }
      }
      return;
    }

    if (this.digDescend) {
      const shaft = raycastGround(
        this.dimension,
        this.position.clone().add(new Vec(0.0, 0.5 * this.scale, 0.0)),
        DOWN_VECTOR(),
        this.layout.rideHeight + 3.0 * this.scale,
        true,
      );
      if (shaft === null) {
        this.falling = true;
        this.velocity.y = 0.0;
        return;
      }
      const targetY = shaft.hitPosition.y + this.layout.rideHeight;
      this.position.y = lerp(this.position.y, targetY, 0.35);
      this.velocity.y = 0.0;
      return;
    }

    const plantedFeet = this.limbs.filter((it) => it.grounded && !it.stepping);
    const groundHit = raycastGround(
      this.dimension,
      this.position.clone().add(new Vec(0.0, 0.5 * this.scale, 0.0)),
      DOWN_VECTOR(),
      (this.layout.rideHeight + 0.5 * this.scale) * 2.5,
      true,
    );
    if (plantedFeet.length === 0 && groundHit === null) {
      this.falling = true;
      this.velocity.y = 0.0;
      return;
    }

    let supportY = groundHit !== null ? groundHit.hitPosition.y : Number.NEGATIVE_INFINITY;
    if (plantedFeet.length !== 0) {
      let sum = 0.0;
      for (const limb of plantedFeet) sum += limb.foot.y;
      supportY = Math.max(supportY, sum / plantedFeet.length);
    }

    let targetY = supportY + this.layout.rideHeight;
    targetY -= this.crouch * 0.55 * this.layout.rideHeight;
    if (this.strikeTicks > 0) {
      targetY -= Math.sin((this.strikeTicks / 6.0) * Math.PI) * 0.3 * this.layout.rideHeight;
    }
    if (this.gallop && !this.steadyStance && this.velocity.length() > this.layout.walkSpeed) {
      targetY += Math.sin(this.time * 0.55) * 0.1 * this.scale;
    }
    if (this.steadyStance) {
      targetY = Math.max(targetY, this.position.y - 0.02);
    }
    if (isLiquid(this.dimension, this.position)) {
      targetY = Math.max(targetY, this.position.y + 0.05);
    }
    const ceiling = raycastGround(this.dimension, this.position, UP_VECTOR(), 1.0 * this.scale, true);
    if (ceiling !== null) {
      targetY = Math.min(targetY, ceiling.hitPosition.y - 0.45 * this.scale);
    }
    if (!isBodyPassable(this.dimension, this.position)) {
      targetY = Math.min(targetY, this.position.y);
    }
    this.position.y = lerp(this.position.y, targetY, this.layout.heightLerp);
    this.velocity.y = 0.0;
  }

  scheduleSteps() {
    if (!this.limbs.some((it) => it.stepping)) {
      const currentWants = this.limbs.some((it) => it.group() === this.currentStepGroup && it.wantsStep());
      const otherWants = this.limbs.some((it) => it.group() !== this.currentStepGroup && it.wantsStep());
      if (!currentWants && otherWants) {
        this.currentStepGroup = 1 - this.currentStepGroup;
      }
    }
    for (const limb of this.limbs) {
      if (limb.stepping || !limb.wantsStep()) continue;
      if (limb.group() !== this.currentStepGroup && !limb.overextended()) continue;
      limb.beginStep();
    }
  }

  updateTilt() {
    if (this.climbing) {
      this.pitch = lerp(this.pitch, -1.15, 0.25);
      this.roll = lerp(this.roll, 0.0, 0.25);
      return;
    }
    let frontY = 0, frontWeight = 0, backY = 0, backWeight = 0;
    let leftY = 0, leftWeight = 0, rightY = 0, rightWeight = 0;
    for (const limb of this.limbs) {
      if (!limb.grounded) continue;
      // Inverse of rotationY(-yaw) is rotationY(+yaw).
      const local = limb.foot.clone().subtract(this.position).rotateAroundY(this.yaw);
      if (local.z > 0.0) {
        frontY += limb.foot.y;
        frontWeight += 1.0;
      } else {
        backY += limb.foot.y;
        backWeight += 1.0;
      }
      if (local.x > 0.0) {
        rightY += limb.foot.y;
        rightWeight += 1.0;
      } else {
        leftY += limb.foot.y;
        leftWeight += 1.0;
      }
    }
    let targetPitch = 0.0;
    let targetRoll = 0.0;
    if (frontWeight > 0.0 && backWeight > 0.0) {
      const slope = (backY / backWeight - frontY / frontWeight) / (2.0 * this.scale);
      targetPitch = clamp(Math.atan2(slope, 1.0), -0.45, 0.45);
    }
    if (leftWeight > 0.0 && rightWeight > 0.0) {
      const slope = (rightY / rightWeight - leftY / leftWeight) / (2.0 * this.scale);
      targetRoll = clamp(Math.atan2(slope, 1.0), -0.45, 0.45);
    }
    if (this.strikeTicks > 0) {
      targetPitch += Math.sin((this.strikeTicks / 6.0) * Math.PI) * 0.35;
    }
    this.pitch = lerp(this.pitch, targetPitch, this.layout.tiltLerp);
    this.roll = lerp(this.roll, targetRoll, this.layout.tiltLerp);
  }

  teleport(newPosition) {
    const diff = newPosition.clone().subtract(this.position);
    this.position.copy(newPosition);
    for (const limb of this.limbs) limb.foot.add(diff);
  }
}
