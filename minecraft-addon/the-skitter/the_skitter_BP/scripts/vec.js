/**
 * Port of com.dogukan.spiderhunt.utilities.Vector and MathsKt.
 * Mutable vector, identical semantics to the Java original (methods mutate and
 * return `this`, `clone()` makes a copy).
 */
export class Vec {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  static from(loc) {
    return new Vec(loc.x, loc.y, loc.z);
  }

  clone() {
    return new Vec(this.x, this.y, this.z);
  }

  copy(other) {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
    return this;
  }

  add(other) {
    this.x += other.x;
    this.y += other.y;
    this.z += other.z;
    return this;
  }

  subtract(other) {
    this.x -= other.x;
    this.y -= other.y;
    this.z -= other.z;
    return this;
  }

  multiply(m) {
    this.x *= m;
    this.y *= m;
    this.z *= m;
    return this;
  }

  setX(v) { this.x = v; return this; }
  setY(v) { this.y = v; return this; }
  setZ(v) { this.z = v; return this; }

  lengthSquared() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length() {
    return Math.sqrt(this.lengthSquared());
  }

  distanceSquared(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return dx * dx + dy * dy + dz * dz;
  }

  distance(other) {
    return Math.sqrt(this.distanceSquared(other));
  }

  normalize() {
    const length = this.length();
    this.x /= length;
    this.y /= length;
    this.z /= length;
    return this;
  }

  dot(other) {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  isZero() {
    return this.x === 0 && this.y === 0 && this.z === 0;
  }

  rotateAroundX(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ny = c * this.y - s * this.z;
    const nz = s * this.y + c * this.z;
    this.y = ny;
    this.z = nz;
    return this;
  }

  rotateAroundY(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const nx = c * this.x + s * this.z;
    const nz = -s * this.x + c * this.z;
    this.x = nx;
    this.z = nz;
    return this;
  }

  rotateAroundZ(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const nx = c * this.x - s * this.y;
    const ny = s * this.x + c * this.y;
    this.x = nx;
    this.y = ny;
    return this;
  }

  /** Equivalent of `rotate(Quaternionf().rotationYXZ(-yaw, pitch, roll))`. */
  rotateBody(yaw, pitch, roll) {
    return this.rotateAroundZ(roll).rotateAroundX(pitch).rotateAroundY(-yaw);
  }

  toLocation() {
    return { x: this.x, y: this.y, z: this.z };
  }

  toBlockPos() {
    return { x: Math.floor(this.x), y: Math.floor(this.y), z: Math.floor(this.z) };
  }

  isFinite() {
    return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z);
  }
}

export const DOWN_VECTOR = () => new Vec(0, -1, 0);
export const UP_VECTOR = () => new Vec(0, 1, 0);

export function lerp(from, target, factor) {
  return from + (target - from) * factor;
}

export function moveTowardsScalar(from, target, maxDelta) {
  const distance = target - from;
  return Math.abs(distance) <= maxDelta ? target : from + maxDelta * Math.sign(distance);
}

/** Mutates and returns `vec`, like MathsKt.moveTowards(Vector, Vector, Double). */
export function moveTowardsVec(vec, target, maxDelta) {
  const diff = target.clone().subtract(vec);
  const distance = diff.length();
  if (distance <= maxDelta) {
    vec.copy(target);
  } else {
    vec.add(diff.multiply(maxDelta / distance));
  }
  return vec;
}

/** Mutates and returns `vec`, like MathsKt.lerp(Vector, Vector, Double). */
export function lerpVec(vec, target, factor) {
  vec.add(target.clone().subtract(vec).multiply(factor));
  return vec;
}

export function wrapAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

export function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function verticalDistance(a, b) {
  return Math.abs(a.y - b.y);
}

export function horizontalDistance(a, b) {
  const x = a.x - b.x;
  const z = a.z - b.z;
  return Math.sqrt(x * x + z * z);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function randomDouble(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

export function randomInt(minInclusive, maxExclusive) {
  return minInclusive + Math.floor(Math.random() * (maxExclusive - minInclusive));
}
