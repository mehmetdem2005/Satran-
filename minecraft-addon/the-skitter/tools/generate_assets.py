#!/usr/bin/env python3
"""
Generates the resource-pack assets for The Skitter (geometry, animations,
controllers, client entity and textures) from the same numbers the Java mod
uses in LimbLayout and CreatureModel.

Run from the addon root:  python3 tools/generate_assets.py
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from png import write_png  # noqa: E402

RP = "the_skitter_RP"
PX = 16.0  # pixels per block

# --------------------------------------------------------------- limb layout
# LimbLayout.ROWS, verbatim from the Java source.
ROWS = [
    dict(hipZ=0.5, out=1.05, homeZ=1.1, reach=1.0),
    dict(hipZ=0.2, out=1.4, homeZ=0.4, reach=1.0),
    dict(hipZ=-0.15, out=1.4, homeZ=-0.45, reach=1.05),
    dict(hipZ=-0.5, out=1.1, homeZ=-1.25, reach=1.15),
]
SEGMENTS = [0.85, 0.85, 0.65]
RIDE_HEIGHT = 1.0
# The entity's origin sits where Java puts the bottom of the Interaction
# hitbox (`position - 0.65 * scale`), so the model - whose feet are at the
# ground, `position - 1.0 * scale` - is drawn this many pixels lower.
MODEL_Y_OFFSET = -(1.0 - 0.65) * 16.0
# CreatureModel.legSegmentThickness = [0.16, 0.115, 0.06] * scale
THICKNESS = [0.16, 0.115, 0.06]
KNEE_SIZE = 0.15

# CreatureModel body parts. Each entry mirrors one `box(...)` call:
# (material, cx, cy, cz, sx, sy, sz, rx, ry, rz)
WIDOW_PARTS = [
    ("plate", 0.0, 0.05, 0.15, 0.78, 0.48, 0.88, 0.0, 0.0, 0.0),
    ("carapace", 0.0, 0.30, 0.10, 0.52, 0.24, 0.62, 0.0, 0.1, 0.0),
    ("shell", 0.0, -0.22, 0.10, 0.50, 0.16, 0.70, 0.0, 0.0, 0.0),
    ("plate", 0.0, 0.30, -1.00, 1.15, 0.95, 1.25, -0.15, 0.0, 0.0),
    ("carapace", 0.0, 0.52, -1.05, 0.78, 0.60, 0.85, -0.15, 0.4, 0.0),
    ("plate", 0.35, 0.12, -0.90, 0.50, 0.50, 0.60, 0.0, 0.5, 0.0),
    ("plate", -0.35, 0.12, -0.90, 0.50, 0.50, 0.60, 0.0, -0.5, 0.0),
    ("plate", 0.0, -0.02, 0.68, 0.44, 0.34, 0.42, 0.1, 0.0, 0.0),
    ("eye", 0.10, 0.10, 0.88, 0.10, 0.10, 0.07, 0.0, 0.0, 0.0),
    ("eye", -0.10, 0.10, 0.88, 0.10, 0.10, 0.07, 0.0, 0.0, 0.0),
    ("eye", 0.21, 0.04, 0.84, 0.06, 0.06, 0.06, 0.0, 0.0, 0.0),
    ("eye", -0.21, 0.04, 0.84, 0.06, 0.06, 0.06, 0.0, 0.0, 0.0),
    ("eye", 0.05, 0.19, 0.86, 0.05, 0.05, 0.05, 0.0, 0.0, 0.0),
    ("eye", -0.05, 0.19, 0.86, 0.05, 0.05, 0.05, 0.0, 0.0, 0.0),
    ("fang", 0.11, -0.24, 0.82, 0.08, 0.26, 0.08, 0.35, 0.0, 0.2),
    ("fang", -0.11, -0.24, 0.82, 0.08, 0.26, 0.08, 0.35, 0.0, -0.2),
    ("spike", 0.20, 0.68, -0.90, 0.09, 0.42, 0.09, -0.4, 0.0, -0.3),
    ("spike", -0.20, 0.68, -0.90, 0.09, 0.42, 0.09, -0.4, 0.0, 0.3),
]

HUSK_PARTS = [
    ("plate", 0.0, 0.12, 0.00, 0.95, 0.95, 0.95, 0.5, 0.785, 0.0),
    ("fang", 0.0, 0.00, 0.85, 0.55, 0.55, 0.55, 0.6, 0.785, 0.0),
    ("carapace", 0.0, 0.28, -1.00, 1.20, 1.20, 1.20, 0.35, 0.785, 0.15),
    ("core", 0.0, -0.18, -0.40, 0.55, 0.55, 0.55, 0.785, 0.6, 0.0),
]

# Texture patch (u, v, w, h) each material samples, shared by every face.
UV = {
    "plate": (0, 0, 16, 16),
    "carapace": (16, 0, 16, 16),
    "shell": (0, 16, 16, 16),
    "spike": (16, 16, 16, 16),
    "leg1": (32, 0, 16, 16),
    "leg2": (32, 16, 16, 16),
    "leg3": (48, 16, 8, 8),
    "knee": (48, 24, 8, 8),
    "fang": (48, 0, 8, 8),
    "eye": (56, 0, 8, 8),
    "core": (48, 8, 8, 8),
}


def vsub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def vadd(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def vmul(a, s):
    return [a[0] * s, a[1] * s, a[2] * s]


def vlen(a):
    return math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2)


def vnorm(a):
    length = vlen(a)
    return [0.0, 0.0, 0.0] if length < 1e-9 else [a[0] / length, a[1] / length, a[2] / length]


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def solve_leg(hip, foot, lengths):
    """
    Rest pose for one 3-segment leg: femur rises up and out to a raised knee,
    then two links fold down onto the foot with the elbow pushed outward.
    Returns [hip, knee, ankle, foot] in geometry space.
    """
    a, b, c = lengths
    delta = vsub(foot, hip)
    horizontal = [delta[0], 0.0, delta[2]]
    outward = vnorm(horizontal) if vlen(horizontal) > 1e-6 else [1.0, 0.0, 0.0]

    # Raise the femur as far as the remaining two links can still reach the
    # foot; that is what gives a spider its high shoulder and folded knee.
    knee = None
    for tenth in range(17, 0, -1):
        rise = tenth / 20.0
        femur_dir = vnorm(vadd(vmul(outward, 0.55), [0.0, rise, 0.0]))
        candidate = vadd(hip, vmul(femur_dir, a))
        if vlen(vsub(foot, candidate)) <= (b + c) * 0.94:
            knee = candidate
            break
    if knee is None:
        knee = vadd(hip, vmul(vnorm(vadd(vmul(outward, 0.55), [0.0, 0.05, 0.0])), a))

    to_foot = vsub(foot, knee)
    distance = vlen(to_foot)
    distance = max(abs(b - c) + 1e-3, min(distance, b + c - 1e-3))
    direction = vnorm(to_foot)

    # Outward component perpendicular to the knee->foot axis: the elbow bends
    # away from the body, the way a spider's tibia does.
    perpendicular = vsub(outward, vmul(direction, vdot(outward, direction)))
    if vlen(perpendicular) < 1e-6:
        perpendicular = vsub([0.0, 1.0, 0.0], vmul(direction, direction[1]))
    perpendicular = vnorm(perpendicular)

    cos_alpha = max(-1.0, min(1.0, (b * b + distance * distance - c * c) / (2 * b * distance)))
    alpha = math.acos(cos_alpha)
    ankle = vadd(knee, vmul(vadd(vmul(direction, math.cos(alpha)),
                                 vmul(perpendicular, math.sin(alpha))), b))
    return [hip, knee, ankle, foot]


def segment_cubes(start, end, thickness, uv, samples=None):
    """Axis-aligned cubes stepped along a segment - no cube rotation needed."""
    length = vlen(vsub(end, start))
    # Very thin Java segments would vanish on a Bedrock model, so the drawn
    # limb never gets thinner than 1.4 px.
    size = max(thickness, 1.4)
    if samples is None:
        samples = max(3, int(round(length / (size * 1.15))))
    u, v, uw, uh = uv
    cubes = []
    for i in range(samples):
        t = (i + 0.5) / samples
        centre = [start[k] + (end[k] - start[k]) * t for k in range(3)]
        cubes.append({
            "origin": [round(centre[0] - size / 2, 4),
                       round(centre[1] - size / 2, 4),
                       round(centre[2] - size / 2, 4)],
            "size": [round(size, 4)] * 3,
            "uv": face_uv(u, v, uw, uh),
        })
    return cubes


def face_uv(u, v, w, h):
    return {face: {"uv": [u, v], "uv_size": [w, h]}
            for face in ("north", "south", "east", "west", "up", "down")}


def body_cube(part):
    """One CreatureModel.Part -> one Bedrock cube (Java +Z front -> Bedrock -Z)."""
    material, cx, cy, cz, sx, sy, sz, rx, ry, rz = part
    centre = [cx * PX, (cy + RIDE_HEIGHT) * PX + MODEL_Y_OFFSET, -cz * PX]
    size = [sx * PX, sy * PX, sz * PX]
    cube = {
        "origin": [round(centre[0] - size[0] / 2, 4),
                   round(centre[1] - size[1] / 2, 4),
                   round(centre[2] - size[2] / 2, 4)],
        "size": [round(s, 4) for s in size],
        "uv": face_uv(*UV[material]),
    }
    # Mirroring Z flips the sign of the X and Y tilts; Z roll is unchanged.
    rotation = [round(-math.degrees(rx), 3), round(-math.degrees(ry), 3),
                round(math.degrees(rz), 3)]
    if any(abs(value) > 0.01 for value in rotation):
        cube["pivot"] = [round(value, 4) for value in centre]
        cube["rotation"] = rotation
    return cube


def build_geometry(style, parts):
    bones = [
        {"name": "root", "pivot": [0, 0, 0]},
        {"name": "body", "parent": "root",
         "pivot": [0, RIDE_HEIGHT * PX + MODEL_Y_OFFSET, 0],
         "cubes": [body_cube(part) for part in parts]},
    ]

    leg_index = 0
    for row_index, row in enumerate(ROWS):
        for side in (1.0, -1.0):
            hip = [0.3 * side * PX, (0.05 + RIDE_HEIGHT) * PX + MODEL_Y_OFFSET,
                   -row["hipZ"] * PX]
            foot = [row["out"] * side * PX, MODEL_Y_OFFSET, -row["homeZ"] * PX]
            lengths = [s * row["reach"] * PX for s in SEGMENTS]
            joints = solve_leg(hip, foot, lengths)

            names = [f"leg{leg_index}_a", f"leg{leg_index}_b", f"leg{leg_index}_c"]
            parents = ["body", names[0], names[1]]
            uvs = ["leg1", "leg2", "leg3"]
            for segment in range(3):
                cubes = segment_cubes(joints[segment], joints[segment + 1],
                                      THICKNESS[segment] * PX, UV[uvs[segment]])
                if segment == 0:
                    knee = KNEE_SIZE * PX
                    cubes.append({
                        "origin": [round(joints[1][k] - knee / 2, 4) for k in range(3)],
                        "size": [round(knee, 4)] * 3,
                        "uv": face_uv(*UV["knee"]),
                    })
                bones.append({
                    "name": names[segment],
                    "parent": parents[segment],
                    "pivot": [round(value, 4) for value in joints[segment]],
                    "cubes": cubes,
                })
            leg_index += 1

    return {
        "description": {
            "identifier": f"geometry.skitter.{style}",
            "texture_width": 64,
            "texture_height": 64,
            "visible_bounds_width": 20,
            "visible_bounds_height": 14,
            "visible_bounds_offset": [0, 4, 0],
        },
        "bones": bones,
    }


# --------------------------------------------------------------- animations
LEG_META = []
for row_index, row in enumerate(ROWS):
    for side in (1.0, -1.0):
        side_index = 0 if side > 0 else 1
        LEG_META.append({
            "side": side,
            "walk_group": (row_index + side_index) % 2,
            "gallop_group": 0 if row["hipZ"] > 0 else 1,
            "row": row_index,
        })


def gait_animation(name, group_key, swing, lift, flex, length, loop=True):
    """
    Two-group alternating gait, using the exact same leg grouping the Java
    scheduler uses (LimbLayout walkGroup / gallopGroup).
    """
    bones = {}
    steps = 8
    for index, meta in enumerate(LEG_META):
        phase = 0.0 if meta[group_key] == 0 else 0.5
        swing_keys, lift_keys, flex_keys, tarsus_keys = {}, {}, {}, {}
        for step in range(steps + 1):
            t = step / steps
            time = round(t * length, 4)
            angle = (t + phase) % 1.0
            # Stance sweeps back linearly, swing arcs forward with a lift.
            if angle < 0.5:
                stride = 1.0 - 4.0 * angle          # +1 -> -1 over the stance
                raise_amount = 0.0
            else:
                stride = -1.0 + 4.0 * (angle - 0.5)  # -1 -> +1 during recovery
                raise_amount = math.sin((angle - 0.5) * 2.0 * math.pi)
            swing_keys[str(time)] = [0.0, round(stride * swing * meta["side"], 3), 0.0]
            lift_keys[str(time)] = [round(-raise_amount * lift, 3), 0.0, 0.0]
            flex_keys[str(time)] = [round(raise_amount * flex, 3), 0.0, 0.0]
            tarsus_keys[str(time)] = [round(-raise_amount * flex * 0.6, 3), 0.0, 0.0]
        bones[f"leg{index}_a"] = {"rotation": merge_rotation(swing_keys, lift_keys)}
        bones[f"leg{index}_b"] = {"rotation": flex_keys}
        bones[f"leg{index}_c"] = {"rotation": tarsus_keys}

    body_keys = {}
    for step in range(steps + 1):
        t = step / steps
        time = round(t * length, 4)
        body_keys[str(time)] = [0.0, round(math.sin(t * 2 * math.pi) * 0.6, 3), 0.0]
    bones["body"] = {"position": body_keys}

    return {
        "loop": loop,
        "animation_length": length,
        "anim_time_update":
            "query.anim_time + query.delta_time * math.max(0.4, query.property('skitter:speed'))",
        "bones": bones,
    }


def merge_rotation(a, b):
    merged = {}
    for key in a:
        merged[key] = [round(a[key][i] + b[key][i], 3) for i in range(3)]
    return merged


def idle_animation():
    bones = {}
    for index, meta in enumerate(LEG_META):
        offset = (index * 0.37) % 1.0
        keys = {}
        for step in range(5):
            t = step / 4
            angle = math.sin((t + offset) * 2 * math.pi)
            keys[str(round(t * 4.0, 4))] = [round(angle * 1.6, 3), round(angle * 1.2 * meta["side"], 3), 0.0]
        bones[f"leg{index}_a"] = {"rotation": keys}
    bones["body"] = {"position": {
        "0.0": [0, 0, 0], "2.0": [0, 0.35, 0], "4.0": [0, 0, 0],
    }}
    return {"loop": True, "animation_length": 4.0, "bones": bones}


def climb_animation():
    bones = {}
    for index, meta in enumerate(LEG_META):
        phase = 0.0 if meta["walk_group"] == 0 else 0.5
        keys = {}
        for step in range(5):
            t = step / 4
            angle = math.sin((t + phase) * 2 * math.pi)
            keys[str(round(t * 0.8, 4))] = [
                round(-22 + angle * 16, 3),
                round(angle * 10 * meta["side"], 3),
                0.0,
            ]
        bones[f"leg{index}_a"] = {"rotation": keys}
        bones[f"leg{index}_b"] = {"rotation": {"0.0": [26, 0, 0], "0.8": [26, 0, 0]}}
    return {
        "loop": True,
        "animation_length": 0.8,
        "anim_time_update":
            "query.anim_time + query.delta_time * math.max(0.5, query.property('skitter:speed'))",
        "bones": bones,
    }


def air_animation():
    bones = {}
    for index, meta in enumerate(LEG_META):
        bones[f"leg{index}_a"] = {"rotation": {"0.0": [-26, round(14 * meta["side"], 3), 0]}}
        bones[f"leg{index}_b"] = {"rotation": {"0.0": [34, 0, 0]}}
        bones[f"leg{index}_c"] = {"rotation": {"0.0": [-18, 0, 0]}}
    return {"loop": True, "animation_length": 0.5, "bones": bones}


def burrow_animation():
    """
    Only the legs fold here. Creature.updateHeight() already drives the body
    into the ground at 0.055 * scale per tick while burrowing, and the entity
    position follows it, so animating a second descent would double it.
    """
    bones = {}
    for index, meta in enumerate(LEG_META):
        bones[f"leg{index}_a"] = {"rotation": {
            "0.0": [0, 0, 0], "3.5": [round(28, 3), round(20 * meta["side"], 3), 0],
        }}
    return {"loop": "hold_on_last_frame", "animation_length": 3.5, "bones": bones}


def pose_animation():
    """
    Streams the simulation state that has no keyframes of its own.

    Only two things belong here. Scale, because `/spider scale` and the phase
    growth are continuous on Bedrock too, and the body tilt that
    Creature.updateTilt() derives from the planted feet. The crouch of a
    charging jump and the strike lunge are NOT applied as a translation: Java
    folds both into the body's target height inside updateHeight(), so the
    entity's real position already carries them and adding them again would
    double the dip. What Java gets for free from IK - legs folding as the body
    sinks onto planted feet - is reproduced by flexing the leg bones instead.

    Rotation signs follow Bedrock's convention (positive X pitches the model
    nose-down, the way the vanilla sneak animation does), which is the opposite
    of the Java model space this was ported from.
    """
    pitch = "query.property('skitter:pitch') * 57.29578"
    roll = "-query.property('skitter:roll') * 57.29578"
    fold = ("(query.property('skitter:crouch') * 18.0"
            " + query.property('skitter:strike') * 8.0)")
    bones = {
        "root": {"scale": "query.property('skitter:scale')"},
        "body": {"rotation": [pitch, 0, roll]},
    }
    for index in range(len(LEG_META)):
        bones[f"leg{index}_a"] = {"rotation": [fold, 0, 0]}
        bones[f"leg{index}_b"] = {"rotation": [f"-{fold} * 0.7", 0, 0]}
    return {"loop": True, "animation_length": 1.0, "bones": bones}


def build_animations():
    return {
        "format_version": "1.8.0",
        "animations": {
            "animation.skitter.idle": idle_animation(),
            "animation.skitter.walk": gait_animation("walk", "walk_group", 13.0, 22.0, 26.0, 1.0),
            "animation.skitter.gallop": gait_animation("gallop", "gallop_group", 20.0, 36.0, 40.0, 0.55),
            "animation.skitter.climb": climb_animation(),
            "animation.skitter.air": air_animation(),
            "animation.skitter.burrow": burrow_animation(),
            "animation.skitter.pose": pose_animation(),
        },
    }


def build_animation_controllers():
    return {
        "format_version": "1.10.0",
        "animation_controllers": {
            "controller.animation.skitter.move": {
                "initial_state": "idle",
                "states": {
                    "idle": {
                        "animations": ["idle"],
                        "blend_transition": 0.2,
                        "transitions": [
                            {"walk": "q.property('skitter:state') == 'walk'"},
                            {"gallop": "q.property('skitter:state') == 'gallop'"},
                            {"climb": "q.property('skitter:state') == 'climb'"},
                            {"air": "q.property('skitter:state') == 'air'"},
                            {"burrow": "q.property('skitter:state') == 'burrow'"},
                        ],
                    },
                    "walk": {
                        "animations": ["walk"],
                        "blend_transition": 0.15,
                        "transitions": [
                            {"idle": "q.property('skitter:state') == 'idle'"},
                            {"gallop": "q.property('skitter:state') == 'gallop'"},
                            {"climb": "q.property('skitter:state') == 'climb'"},
                            {"air": "q.property('skitter:state') == 'air'"},
                            {"burrow": "q.property('skitter:state') == 'burrow'"},
                        ],
                    },
                    "gallop": {
                        "animations": ["gallop"],
                        "blend_transition": 0.15,
                        "transitions": [
                            {"idle": "q.property('skitter:state') == 'idle'"},
                            {"walk": "q.property('skitter:state') == 'walk'"},
                            {"climb": "q.property('skitter:state') == 'climb'"},
                            {"air": "q.property('skitter:state') == 'air'"},
                            {"burrow": "q.property('skitter:state') == 'burrow'"},
                        ],
                    },
                    "climb": {
                        "animations": ["climb"],
                        "blend_transition": 0.25,
                        "transitions": [
                            {"idle": "q.property('skitter:state') == 'idle'"},
                            {"walk": "q.property('skitter:state') == 'walk'"},
                            {"gallop": "q.property('skitter:state') == 'gallop'"},
                            {"air": "q.property('skitter:state') == 'air'"},
                            {"burrow": "q.property('skitter:state') == 'burrow'"},
                        ],
                    },
                    "air": {
                        "animations": ["air"],
                        "blend_transition": 0.15,
                        "transitions": [
                            {"idle": "q.property('skitter:state') == 'idle'"},
                            {"walk": "q.property('skitter:state') == 'walk'"},
                            {"gallop": "q.property('skitter:state') == 'gallop'"},
                            {"climb": "q.property('skitter:state') == 'climb'"},
                            {"burrow": "q.property('skitter:state') == 'burrow'"},
                        ],
                    },
                    "burrow": {
                        "animations": ["burrow"],
                        "blend_transition": 0.3,
                        "transitions": [
                            {"idle": "q.property('skitter:state') == 'idle'"},
                            {"walk": "q.property('skitter:state') == 'walk'"},
                            {"gallop": "q.property('skitter:state') == 'gallop'"},
                        ],
                    },
                },
            },
        },
    }


def build_render_controllers():
    return {
        "format_version": "1.10.0",
        "render_controllers": {
            "controller.render.skitter": {
                "arrays": {
                    "geometries": {
                        "Array.styles": ["Geometry.widow", "Geometry.husk"],
                    },
                    "textures": {
                        "Array.skins": ["Texture.widow", "Texture.husk"],
                    },
                },
                # A Molang comparison already evaluates to 1.0 / 0.0, so the
                # array index needs no ternary.
                "geometry": "Array.styles[query.property('skitter:style') == 'husk']",
                "materials": [{"*": "Material.default"}],
                "textures": ["Array.skins[query.property('skitter:style') == 'husk']"],
            },
        },
    }


def build_client_entity():
    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": "skitter:skitter",
                "materials": {"default": "entity_emissive_alpha"},
                "textures": {
                    "default": "textures/entity/skitter_widow",
                    "widow": "textures/entity/skitter_widow",
                    "husk": "textures/entity/skitter_husk",
                },
                "geometry": {
                    "default": "geometry.skitter.widow",
                    "widow": "geometry.skitter.widow",
                    "husk": "geometry.skitter.husk",
                },
                "animations": {
                    "idle": "animation.skitter.idle",
                    "walk": "animation.skitter.walk",
                    "gallop": "animation.skitter.gallop",
                    "climb": "animation.skitter.climb",
                    "air": "animation.skitter.air",
                    "burrow": "animation.skitter.burrow",
                    "pose": "animation.skitter.pose",
                    "move": "controller.animation.skitter.move",
                },
                "scripts": {
                    "animate": ["move", "pose"],
                },
                "render_controllers": ["controller.render.skitter"],
                # Colour-based egg: it needs no extra atlas entry, so it can never
                # end up as a missing texture on a stricter client.
                "spawn_egg": {"base_color": "#1b1418", "overlay_color": "#c1121f"},
            },
        },
    }


# ------------------------------------------------------------------ textures
def noisy(base, rng, spread=10):
    return tuple(max(0, min(255, channel + rng.randint(-spread, spread))) for channel in base)


def patch(pixels, x, y, w, h, colour, rng, spread=10, alpha=255, veins=None):
    for j in range(y, y + h):
        for i in range(x, x + w):
            r, g, b = noisy(colour, rng, spread)
            pixels[j][i] = (r, g, b, alpha)
    if veins:
        for _ in range(veins):
            vx = rng.randrange(x, x + w)
            vy = rng.randrange(y, y + h)
            length = rng.randint(2, max(3, h // 2))
            for step in range(length):
                px = min(x + w - 1, max(x, vx + rng.randint(-1, 1)))
                py = min(y + h - 1, max(y, vy + step))
                r, g, b = noisy(tuple(int(c * 0.62) for c in colour), rng, 6)
                pixels[py][px] = (r, g, b, alpha)


def build_texture(path, palette, seed):
    rng = random.Random(seed)
    size = 64
    pixels = [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]
    patch(pixels, *UV["plate"], palette["plate"], rng, 12, veins=14)
    patch(pixels, *UV["carapace"], palette["carapace"], rng, 12, veins=10)
    patch(pixels, *UV["shell"], palette["shell"], rng, 10, veins=8)
    patch(pixels, *UV["spike"], palette["spike"], rng, 8, veins=6)
    patch(pixels, *UV["leg1"], palette["leg1"], rng, 9, veins=8)
    patch(pixels, *UV["leg2"], palette["leg2"], rng, 9, veins=8)
    patch(pixels, *UV["leg3"], palette["leg3"], rng, 7)
    patch(pixels, *UV["knee"], palette["knee"], rng, 7)
    patch(pixels, *UV["fang"], palette["fang"], rng, 6)
    # alpha 254 marks emissive pixels for the entity_emissive_alpha material.
    patch(pixels, *UV["eye"], palette["eye"], rng, 4, alpha=254)
    patch(pixels, *UV["core"], palette["core"], rng, 14, alpha=254)
    write_png(path, size, size, pixels)


WIDOW_PALETTE = {          # blackstone / polished blackstone / polished basalt
    "plate": (43, 36, 41), "carapace": (76, 50, 35), "shell": (57, 51, 56),
    "spike": (74, 71, 80), "leg1": (36, 30, 35), "leg2": (50, 45, 52),
    "leg3": (70, 66, 74), "knee": (76, 50, 35), "fang": (227, 221, 199),
    "eye": (255, 43, 30), "core": (146, 24, 24),
}
HUSK_PALETTE = {           # calcite / tuff / bone / soul sand
    "plate": (223, 220, 212), "carapace": (107, 107, 98), "shell": (198, 194, 184),
    "spike": (180, 176, 166), "leg1": (214, 211, 202), "leg2": (120, 118, 110),
    "leg3": (227, 221, 199), "knee": (227, 221, 199), "fang": (240, 236, 220),
    "eye": (255, 176, 64), "core": (255, 138, 46),
}


# ------------------------------------------------------------------ particles
# Four effects the mod leans on have no Bedrock vanilla identifier we can rely
# on across builds (Java's SNOWFLAKE web strands, ITEM_SNOWBALL venom spray,
# SQUID_INK despawn cloud and the block-dust puff). Shipping them as our own
# particle definitions removes every "unknown particle effect" risk.
PARTICLE_SPECS = [
    # identifier, uv x offset, size, lifetime, gravity, drag
    ("skitter:web_strand", 0, 0.055, 0.85, 0.0, 0.0),
    ("skitter:venom", 4, 0.085, 0.60, 1.6, 0.5),
    ("skitter:dust", 8, 0.115, 0.75, 3.2, 1.0),
    ("skitter:ink", 12, 0.170, 1.10, -0.2, 1.4),
]


def particle_effect(identifier, uv_x, size, lifetime, gravity, drag):
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": identifier,
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/skitter_particles",
                },
            },
            "components": {
                "minecraft:emitter_rate_instant": {"num_particles": 1},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_point": {"offset": [0, 0, 0], "direction": [0, 0, 0]},
                "minecraft:particle_lifetime_expression": {"max_lifetime": lifetime},
                "minecraft:particle_initial_speed": 0,
                "minecraft:particle_motion_dynamic": {
                    "linear_acceleration": [0, -gravity, 0],
                    "linear_drag_coefficient": drag,
                },
                "minecraft:particle_appearance_billboard": {
                    "size": [size, size],
                    "facing_camera_mode": "lookat_xyz",
                    "uv": {
                        "texture_width": 16,
                        "texture_height": 16,
                        "uv": [uv_x, 0],
                        "uv_size": [4, 4],
                    },
                },
                "minecraft:particle_appearance_tinting": {"color": [1, 1, 1, 1]},
            },
        },
    }


PARTICLE_COLOURS = [
    (238, 238, 232),   # web strand - pale silk
    (168, 108, 220),   # venom
    (104, 96, 96),     # block dust
    (26, 20, 26),      # ink
]


def build_particle_texture(path):
    rng = random.Random(99)
    size = 16
    pixels = [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]
    for index, colour in enumerate(PARTICLE_COLOURS):
        ox = index * 4
        for y in range(4):
            for x in range(4):
                # Soft round dot: corners fade out so the speck reads as a mote
                # rather than a square.
                dx, dy = x - 1.5, y - 1.5
                distance = (dx * dx + dy * dy) ** 0.5
                alpha = 255 if distance < 1.2 else (170 if distance < 1.9 else 70)
                pixels[y][ox + x] = noisy(colour, rng, 8) + (alpha,)
    write_png(path, size, size, pixels)


def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as handle:
        json.dump(data, handle, indent=2)
    print(f"  {path}")


def main():
    print("The Skitter - generating resource pack assets")
    dump(f"{RP}/models/entity/skitter_widow.geo.json",
         {"format_version": "1.12.0", "minecraft:geometry": [build_geometry("widow", WIDOW_PARTS)]})
    dump(f"{RP}/models/entity/skitter_husk.geo.json",
         {"format_version": "1.12.0", "minecraft:geometry": [build_geometry("husk", HUSK_PARTS)]})
    dump(f"{RP}/animations/skitter.animation.json", build_animations())
    dump(f"{RP}/animation_controllers/skitter.animation_controllers.json",
         build_animation_controllers())
    dump(f"{RP}/render_controllers/skitter.render_controllers.json", build_render_controllers())
    dump(f"{RP}/entity/skitter.entity.json", build_client_entity())

    for identifier, uv_x, size, lifetime, gravity, drag in PARTICLE_SPECS:
        name = identifier.split(":", 1)[1]
        dump(f"{RP}/particles/{name}.particle.json",
             particle_effect(identifier, uv_x, size, lifetime, gravity, drag))
    os.makedirs(f"{RP}/textures/particle", exist_ok=True)
    build_particle_texture(f"{RP}/textures/particle/skitter_particles.png")
    print(f"  {RP}/textures/particle/skitter_particles.png")

    os.makedirs(f"{RP}/textures/entity", exist_ok=True)
    build_texture(f"{RP}/textures/entity/skitter_widow.png", WIDOW_PALETTE, 1337)
    print(f"  {RP}/textures/entity/skitter_widow.png")
    build_texture(f"{RP}/textures/entity/skitter_husk.png", HUSK_PALETTE, 4242)
    print(f"  {RP}/textures/entity/skitter_husk.png")

    print("done")


if __name__ == "__main__":
    main()
