#!/usr/bin/env python3
"""
Generates the_skitter_BP/entities/skitter.json.

Phase scale, collision box and per-phase component groups all come from the
same numbers Hunt/LimbLayout use in the Java mod, so the server-side hitbox
always matches what the simulation thinks the creature's size is.

Run from the addon root:  python3 tools/generate_entity.py
"""
import json
import os

BP = "the_skitter_BP"

GROWTH_FACTOR = 1.4          # ConfigData.growthFactor
MAX_PHASE = 5                # Hunt.MAX_PHASE
MINI_SCALE = 0.25            # ConfigData.miniScale

# Hitbox.update(): setWidth(1.8 * scale), setHeight(1.3 * scale)
HITBOX_WIDTH = 1.8
HITBOX_HEIGHT = 1.3

# The simulation owns the real health value (Creature.health), exactly like the
# Java mod, where the visible body is a display entity with no health at all.
# The entity's own pool is only a damage sink, kept high enough that no single
# burst can kill the render entity out from under the simulation.
HEALTH_POOL = 1024

# Java anchors the Interaction hitbox at `position + (0, -0.65 * scale, 0)`,
# i.e. centred on the body rather than sitting on the ground. Bedrock always
# anchors a collision box at the entity's own location, so the entity is placed
# at that same height and the model is drawn 0.35 * scale lower (see
# tools/generate_assets.py MODEL_Y_OFFSET).
HITBOX_BOTTOM_BELOW_BODY = 0.65


def scale_for_phase(phase):
    return GROWTH_FACTOR ** (phase - 1)


def collision_box(scale):
    return {
        "width": round(HITBOX_WIDTH * scale, 3),
        "height": round(HITBOX_HEIGHT * scale, 3),
    }


def build():
    groups = {}
    events = {}
    phase_groups = [f"skitter:phase_{p}" for p in range(1, MAX_PHASE + 1)]

    for phase in range(1, MAX_PHASE + 1):
        name = f"skitter:phase_{phase}"
        groups[name] = {
            "minecraft:health": {"value": HEALTH_POOL, "max": HEALTH_POOL},
            "minecraft:collision_box": collision_box(scale_for_phase(phase)),
        }
        events[f"skitter:set_phase_{phase}"] = {
            "remove": {"component_groups": [g for g in phase_groups if g != name] + ["skitter:is_mini"]},
            "add": {"component_groups": [name]},
        }

    groups["skitter:is_mini"] = {
        "minecraft:health": {"value": HEALTH_POOL, "max": HEALTH_POOL},
        "minecraft:collision_box": collision_box(MINI_SCALE),
    }
    events["skitter:set_mini"] = {
        "remove": {"component_groups": phase_groups},
        "add": {"component_groups": ["skitter:is_mini"]},
    }

    return {
        "format_version": "1.21.0",
        "minecraft:entity": {
            "description": {
                "identifier": "skitter:skitter",
                "is_spawnable": True,
                "is_summonable": True,
                "is_experimental": False,
                # Everything the resource pack needs in order to draw what the
                # simulation is doing. All of them are client_sync so Molang can
                # read them in animations and the render controller.
                "properties": {
                    "skitter:phase": {"type": "int", "range": [1, MAX_PHASE], "default": 1, "client_sync": True},
                    "skitter:scale": {"type": "float", "range": [0.05, 20.0], "default": 1.0, "client_sync": True},
                    "skitter:speed": {"type": "float", "range": [0.0, 8.0], "default": 0.0, "client_sync": True},
                    "skitter:pitch": {"type": "float", "range": [-1.6, 1.6], "default": 0.0, "client_sync": True},
                    "skitter:roll": {"type": "float", "range": [-1.6, 1.6], "default": 0.0, "client_sync": True},
                    "skitter:crouch": {"type": "float", "range": [0.0, 1.0], "default": 0.0, "client_sync": True},
                    "skitter:strike": {"type": "float", "range": [0.0, 1.0], "default": 0.0, "client_sync": True},
                    "skitter:state": {
                        "type": "enum",
                        "values": ["idle", "walk", "gallop", "climb", "air", "burrow"],
                        "default": "idle",
                        "client_sync": True,
                    },
                    "skitter:style": {
                        "type": "enum",
                        "values": ["widow", "husk"],
                        "default": "widow",
                        "client_sync": True,
                    },
                },
            },
            "component_groups": groups,
            "components": {
                # The Java creature's stand-in is a silverfish, so "arthropod"
                # keeps Bane of Arthropods working; "monster" is what makes iron
                # golems attack it on their own, which is how aggravateGolems is
                # reproduced without a hidden decoy entity.
                "minecraft:type_family": {"family": ["skitter", "monster", "arthropod", "mob"]},
                "minecraft:collision_box": collision_box(1.0),
                "minecraft:health": {"value": HEALTH_POOL, "max": HEALTH_POOL},
                # The script drives position every tick, so the engine must not
                # apply gravity or block collision of its own.
                "minecraft:physics": {"has_collision": False, "has_gravity": False},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:knockback_resistance": {"value": 1.0, "max": 1.0},
                "minecraft:fire_immune": True,
                "minecraft:breathable": {
                    "total_supply": 15, "suffocate_time": -1,
                    "breathes_air": True, "breathes_water": True,
                    "breathes_solids": True, "breathes_lava": True,
                },
                # No minecraft:damage_sensor on purpose. The simulation owns the
                # real health value and main.js already drops any damage that
                # has no living attacker, exactly like Java's ALLOW_DAMAGE
                # handler, so a sensor here could only ever get in the way of
                # the player's own hits.
                "minecraft:nameable": {"allow_name_tag_renaming": False},
                "minecraft:persistent": {},
                "minecraft:loot": {"table": "loot_tables/empty.json"},
            },
            "events": events,
        },
    }


def main():
    os.makedirs(f"{BP}/entities", exist_ok=True)
    path = f"{BP}/entities/skitter.json"
    with open(path, "w") as handle:
        json.dump(build(), handle, indent=2)
    print(f"  {path}")

    os.makedirs(f"{BP}/loot_tables", exist_ok=True)
    with open(f"{BP}/loot_tables/empty.json", "w") as handle:
        json.dump({"pools": []}, handle, indent=2)
    print(f"  {BP}/loot_tables/empty.json")


if __name__ == "__main__":
    main()
