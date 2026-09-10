#!/usr/bin/env python3
"""
Writes tools/testbed/parity_expected.json straight from the Java source
constants, independently of the JavaScript port, so parity.mjs is comparing two
separate transcriptions instead of one value with itself.

Every number below was read out of the decompiled Fabric jar:
  misc/ConfigData.java, misc/Hunt.java, creature/LimbLayout.java
"""
import json
import os

# --- misc/ConfigData.java field initialisers ------------------------------
CONFIG = {
    "baseSizeBlocks": 3.0, "growthFactor": 1.4, "killsBase": 10, "killsStep": 5,
    "damageBase": 6.0, "damageStep": 2.0, "attackRangeBase": 0.9,
    "attackRangeScale": 1.8, "verticalRangeBase": 1.8, "verticalRangeScale": 1.3,
    "poisonChance": 0.45, "poisonMinSeconds": 3.0, "poisonMaxSeconds": 5.0,
    "healthBase": 60.0, "speedBase": 0.5, "speedStep": 0.1,
    "fleeSpeedMultiplier": 1.5, "climbSpeedFactor": 0.8, "visionPerBlock": 10.0,
    "jumpCooldownTicks": 200, "webPullCooldownTicks": 200, "grabCooldownTicks": 400,
    "despawnAfterLostTicks": 200, "respawnCooldownTicks": 600, "stuckDespawnTicks": 300,
    "blockBreakingPhase": 3, "maxBlockHardness": 25.0, "ticksPerHardness": 5.0,
    "cosmetic": "widow", "retreatPounceChance": 0.1, "silentPursuitChance": 0.15,
    "mercyChance": 0.35, "retreatChanceBase": 0.5, "retreatChanceStep": 0.1,
    "jumpPowerMultiplier": 1.0, "jumpShakeMultiplier": 1.0,
    "jumpGroundBreakMultiplier": 1.0, "jumpSmashesBlocks": True,
    "miniCountMin": 3, "miniCountMax": 5, "miniHealth": 12.0, "miniDamage": 3.0,
    "miniSpeedBoost": 2.8, "miniScale": 0.25,
}

C = CONFIG


def scale_for_phase(p):
    return C["growthFactor"] ** (p - 1)


# --- misc/Hunt.java -------------------------------------------------------
hunt = {}
for phase in range(1, 6):
    s = scale_for_phase(phase)
    hunt[str(phase)] = {
        "scale": s,
        "sizeBlocks": C["baseSizeBlocks"] * s,
        "detectionRadius": C["visionPerBlock"] * (C["baseSizeBlocks"] * s),
        "killsToAdvance": C["killsBase"] + C["killsStep"] * (phase - 1),
        "attackDamage": C["damageBase"] + C["damageStep"] * (phase - 1),
        "attackRange": C["attackRangeBase"] + C["attackRangeScale"] * s,
        "attackVerticalRange": C["verticalRangeBase"] + C["verticalRangeScale"] * s,
        "speedMultiplier": C["speedBase"] + C["speedStep"] * (phase - 1),
        "healthForPhase": C["healthBase"] * s,
    }

# --- creature/LimbLayout.java --------------------------------------------
ROWS = [  # hipZ, out, homeZ, reach
    (0.5, 1.05, 1.1, 1.0),
    (0.2, 1.4, 0.4, 1.0),
    (-0.15, 1.4, -0.45, 1.05),
    (-0.5, 1.1, -1.25, 1.15),
]
SEGMENTS = [0.85, 0.85, 0.65]


def layout(scale, speed_boost):
    limbs = []
    for row_index, (hip_z, out, home_z, reach) in enumerate(ROWS):
        for side in (1.0, -1.0):
            side_index = 0 if side > 0 else 1
            limbs.append({
                "hip": [0.3 * side * scale, 0.05 * scale, hip_z * scale],
                "home": [out * side * scale, 0.0 * scale, home_z * scale],
                "segmentLengths": [it * reach * scale for it in SEGMENTS],
                "walkGroup": (row_index + side_index) % 2,
                "gallopGroup": 0 if hip_z > 0 else 1,
            })
    return {
        "walkSpeed": 0.16 * scale * speed_boost,
        "gallopSpeed": 0.42 * scale * speed_boost,
        "acceleration": 0.022 * scale * speed_boost,
        "walkTurnRate": 0.09,
        "gallopTurnRate": 0.16,
        "rideHeight": 1.0 * scale,
        "heightLerp": 0.22,
        "tiltLerp": 0.15,
        "gravity": 0.08,
        "walkStepTrigger": 0.5 * scale,
        "gallopStepTrigger": 1.5 * scale,
        "walkStepTicksMin": 4,
        "walkStepTicksMax": 9,
        "gallopStepTicksMin": 4,
        "gallopStepTicksMax": 7,
        "walkStepLift": 0.3 * scale,
        "gallopStepLift": 0.7 * scale,
        "maxReach": sum(limbs[0]["segmentLengths"]) * 0.95,
        "limbs": limbs,
    }


data = {
    "config": CONFIG,
    "hunt": hunt,
    "layout": {
        "main": layout(1.0, 1.0),
        "mini": layout(C["miniScale"], C["miniSpeedBoost"]),
    },
}

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parity_expected.json")
with open(path, "w") as handle:
    json.dump(data, handle, indent=2)
print(f"  {path}")
