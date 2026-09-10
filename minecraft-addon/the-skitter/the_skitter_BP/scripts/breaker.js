/**
 * Port of com.dogukan.spiderhunt.misc.BlockBreaker.
 *
 * Bedrock has no `setBlockBreakingInfo`, so the crack overlay is replaced with
 * dust particles and the vanilla dig sound; timing, target selection, job
 * limits and hardness gating are identical to the Java original.
 */
import { cfg } from "./config.js";
import { Vec, clamp } from "./vec.js";
import {
  getBlockSafe, blockIsPassable, blockHardness, breakBlockWithDrops,
  isLiquid, playSound, spawnParticle, SOUNDS, PARTICLES,
} from "./world_util.js";
import { Hunt } from "./hunt.js";

const COAST_TICKS = 25;

export class BlockBreaker {
  constructor(creature) {
    this.creature = creature;
    /** key "x,y,z" -> { x, y, z, totalTicks, progressTicks } */
    this.jobs = new Map();
    this.scanCooldown = 0;
    this.coastTicks = 0;
    this.diggingDown = false;
  }

  get maxHardness() {
    return cfg.maxBlockHardness;
  }

  get ticksPerHardness() {
    return cfg.ticksPerHardness;
  }

  maxConcurrent() {
    return clamp(2 * Hunt.phase - 2, 2, 8);
  }

  isWorking() {
    return this.jobs.size !== 0;
  }

  tick(active, direction) {
    if (active && direction) {
      this.coastTicks = COAST_TICKS;
      if (this.scanCooldown > 0) this.scanCooldown--;
      if (this.jobs.size < this.maxConcurrent() && this.scanCooldown <= 0) {
        this.scanCooldown = 4;
        this.scan(direction);
      }
    } else {
      if (this.coastTicks > 0) this.coastTicks--;
      if (this.coastTicks <= 0) {
        if (this.jobs.size !== 0) this.clear();
        return;
      }
    }

    const dimension = this.creature.dimension;
    const done = [];
    for (const [key, job] of this.jobs) {
      const block = getBlockSafe(dimension, job.x, job.y, job.z);
      if (!block || blockIsPassable(block) || blockHardness(block) < 0) {
        done.push(key);
        continue;
      }
      job.progressTicks++;
      if (job.progressTicks >= Math.max(job.totalTicks, 1)) {
        breakBlockWithDrops(dimension, job.x, job.y, job.z);
        done.push(key);
        continue;
      }
      // Stand-in for the vanilla crack overlay.
      if (job.progressTicks % 5 === 1) {
        const centre = new Vec(job.x + 0.5, job.y + 0.5, job.z + 0.5);
        spawnParticle(dimension, PARTICLES.BLOCK_DUST, centre, 2, 0.25, 0.25, 0.25);
        if (job.progressTicks % 10 === 1) {
          playSound(dimension, centre, SOUNDS.SPIDER_STEP, 0.35, 0.6);
        }
      }
    }
    for (const key of done) this.jobs.delete(key);
  }

  scan(direction) {
    const horizontalLength = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    if (Math.abs(direction.y) > horizontalLength) {
      this.diggingDown = direction.y < 0.0;
      this.scanVertical(direction.y < 0.0);
      return;
    }
    this.diggingDown = false;
    this.scanWall(direction);
  }

  scanVertical(down) {
    const creature = this.creature;
    const scale = creature.scale;
    const radius = Math.max(0.9 * scale, 0.9);
    let topY;
    let bottomY;
    if (down) {
      topY = creature.position.y - creature.layout.rideHeight + 0.4;
      bottomY = topY - 2.6;
    } else {
      bottomY = creature.position.y + 0.6 * scale;
      topY = bottomY + 2.4;
    }

    const candidates = [];
    const minX = Math.floor(creature.position.x - radius);
    const maxX = Math.floor(creature.position.x + radius);
    const minZ = Math.floor(creature.position.z - radius);
    const maxZ = Math.floor(creature.position.z + radius);
    for (let x = minX; x <= maxX; x++) {
      for (let y = Math.floor(bottomY); y <= Math.floor(topY); y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const dx = x + 0.5 - creature.position.x;
          const dz = z + 0.5 - creature.position.z;
          if (dx * dx + dz * dz > radius * radius) continue;
          const key = `${x},${y},${z}`;
          if (this.jobs.has(key)) continue;
          const hardness = this.diggableHardness(x, y, z);
          if (hardness === null) continue;
          const layerDistance = Math.abs(y + 0.5 - creature.position.y);
          candidates.push({ key, x, y, z, hardness, sort: layerDistance + (dx * dx + dz * dz) * 0.2 });
        }
      }
    }
    this.enqueue(candidates);
  }

  scanWall(direction) {
    const creature = this.creature;
    const scale = creature.scale;
    const forward = direction.clone().setY(0.0);
    if (forward.lengthSquared() < 1e-8) return;
    forward.normalize();
    const right = new Vec(forward.z, 0.0, -forward.x);

    const halfWidth = 1.1 * scale;
    const minForward = 0.3 * scale;
    const maxForward = 1.9 * scale;
    const minY = creature.position.y - 0.8 * scale;
    const maxY = creature.position.y + 0.8 * scale;

    const candidates = [];
    const minX = Math.floor(creature.position.x - maxForward);
    const maxX = Math.floor(creature.position.x + maxForward);
    const minZ = Math.floor(creature.position.z - maxForward);
    const maxZ = Math.floor(creature.position.z + maxForward);
    // The forward/lateral test only depends on x and z, so it is done once per
    // column instead of once per block.
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const relative = new Vec(x + 0.5 - creature.position.x, 0.0, z + 0.5 - creature.position.z);
        const forwardDistance = relative.dot(forward);
        if (forwardDistance < minForward || forwardDistance > maxForward) continue;
        const lateral = relative.dot(right);
        if (lateral < -halfWidth || lateral > halfWidth) continue;
        const sort = forwardDistance + Math.abs(lateral) * 0.5;
        for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
          const key = `${x},${y},${z}`;
          if (this.jobs.has(key)) continue;
          const hardness = this.diggableHardness(x, y, z);
          if (hardness === null) continue;
          candidates.push({ key, x, y, z, hardness, sort });
        }
      }
    }
    this.enqueue(candidates);
  }

  /** Returns the hardness, or null when the block must not be dug. */
  diggableHardness(x, y, z) {
    const block = getBlockSafe(this.creature.dimension, x, y, z);
    if (!block) return null;
    if (blockIsPassable(block)) return null;
    if (isLiquid(this.creature.dimension, new Vec(x, y, z))) return null;
    const hardness = blockHardness(block);
    if (hardness < 0 || hardness > this.maxHardness) return null;
    return hardness;
  }

  enqueue(candidates) {
    candidates.sort((a, b) => a.sort - b.sort);
    const limit = this.maxConcurrent();
    for (const candidate of candidates) {
      if (this.jobs.size >= limit) break;
      const ticks = clamp(Math.trunc(candidate.hardness * this.ticksPerHardness), 4, 40);
      this.jobs.set(candidate.key, {
        x: candidate.x, y: candidate.y, z: candidate.z,
        totalTicks: ticks, progressTicks: 0,
      });
    }
  }

  clear() {
    this.jobs.clear();
    this.diggingDown = false;
  }

  close() {
    this.clear();
  }
}
