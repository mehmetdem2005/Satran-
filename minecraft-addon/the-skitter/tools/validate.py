#!/usr/bin/env python3
"""
Consistency checks for The Skitter addon: JSON validity, manifest wiring,
cross references between the behaviour and resource pack, and that every
entity property the scripts and Molang touch actually exists.

Run from the addon root:  python3 tools/validate.py
"""
import json
import os
import re
import sys

BP = "the_skitter_BP"
RP = "the_skitter_RP"

errors = []
warnings = []


def load(path):
    try:
        with open(path) as handle:
            return json.load(handle)
    except FileNotFoundError:
        errors.append(f"missing file: {path}")
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON in {path}: {exc}")
    return None


def check_manifests():
    bp = load(f"{BP}/manifest.json")
    rp = load(f"{RP}/manifest.json")
    if not bp or not rp:
        return
    uuids = [bp["header"]["uuid"], rp["header"]["uuid"]]
    uuids += [module["uuid"] for module in bp["modules"] + rp["modules"]]
    if len(set(uuids)) != len(uuids):
        errors.append("duplicate UUIDs across manifests")

    deps = {dep.get("uuid") for dep in bp.get("dependencies", [])}
    if rp["header"]["uuid"] not in deps:
        errors.append("behaviour pack does not depend on the resource pack UUID")

    script_modules = [m for m in bp["modules"] if m["type"] == "script"]
    if len(script_modules) != 1:
        errors.append("behaviour pack must declare exactly one script module")
    else:
        entry = script_modules[0]["entry"]
        if not os.path.exists(f"{BP}/{entry}"):
            errors.append(f"script entry not found: {BP}/{entry}")

    server_dep = [d for d in bp.get("dependencies", []) if d.get("module_name") == "@minecraft/server"]
    if not server_dep:
        errors.append("behaviour pack does not declare a @minecraft/server dependency")

    for pack, folder in ((bp, BP), (rp, RP)):
        if not os.path.exists(f"{folder}/pack_icon.png"):
            warnings.append(f"{folder}/pack_icon.png is missing")


def entity_properties():
    entity = load(f"{BP}/entities/skitter.json")
    if not entity:
        return {}
    return entity["minecraft:entity"]["description"].get("properties", {})


def check_entity():
    entity = load(f"{BP}/entities/skitter.json")
    if not entity:
        return
    description = entity["minecraft:entity"]["description"]
    if description["identifier"] != "skitter:skitter":
        errors.append("unexpected entity identifier")

    groups = set(entity["minecraft:entity"].get("component_groups", {}))
    events = entity["minecraft:entity"].get("events", {})
    for name, event in events.items():
        for key in ("add", "remove"):
            for group in event.get(key, {}).get("component_groups", []):
                if group not in groups:
                    errors.append(f"event {name} references unknown component group {group}")

    triggered = set(re.findall(r'triggerEvent\("([^"]+)"\)', read(f"{BP}/scripts/entity_link.js")))
    triggered |= {f"skitter:set_phase_{n}" for n in range(1, 6)} if any(
        "skitter:set_phase_$" in line for line in read(f"{BP}/scripts/entity_link.js").splitlines()
    ) else set()
    for name in triggered:
        if "$" in name:
            continue
        if name not in events:
            errors.append(f"scripts trigger unknown entity event {name}")

    loot = entity["minecraft:entity"]["components"].get("minecraft:loot", {}).get("table")
    if loot and not os.path.exists(f"{BP}/{loot}"):
        errors.append(f"loot table not found: {BP}/{loot}")


def read(path):
    try:
        with open(path) as handle:
            return handle.read()
    except OSError:
        errors.append(f"cannot read {path}")
        return ""


def check_client_entity():
    client = load(f"{RP}/entity/skitter.entity.json")
    if not client:
        return
    description = client["minecraft:client_entity"]["description"]

    geometries = set()
    for name in ("skitter_widow", "skitter_husk"):
        geo = load(f"{RP}/models/entity/{name}.geo.json")
        if geo:
            for block in geo["minecraft:geometry"]:
                geometries.add(block["description"]["identifier"])
    for key, identifier in description["geometry"].items():
        if identifier not in geometries:
            errors.append(f"client entity geometry '{key}' -> {identifier} does not exist")

    for key, path in description["textures"].items():
        if not os.path.exists(f"{RP}/{path}.png"):
            errors.append(f"client entity texture '{key}' -> {path}.png does not exist")

    animations = load(f"{RP}/animations/skitter.animation.json")
    controllers = load(f"{RP}/animation_controllers/skitter.animation_controllers.json")
    available = set(animations["animations"]) if animations else set()
    available |= set(controllers["animation_controllers"]) if controllers else set()
    short_names = description["animations"]
    for key, identifier in short_names.items():
        if identifier not in available:
            errors.append(f"client entity animation '{key}' -> {identifier} does not exist")
    for key in description["scripts"]["animate"]:
        name = key if isinstance(key, str) else list(key)[0]
        if name not in short_names:
            errors.append(f"animate script references unknown animation short name '{name}'")

    controller_names = set()
    render = load(f"{RP}/render_controllers/skitter.render_controllers.json")
    if render:
        controller_names = set(render["render_controllers"])
    for name in description["render_controllers"]:
        key = name if isinstance(name, str) else list(name)[0]
        if key not in controller_names:
            errors.append(f"missing render controller {key}")


def check_geometry_bones():
    animations = load(f"{RP}/animations/skitter.animation.json")
    if not animations:
        return
    bones = set()
    for name in ("skitter_widow", "skitter_husk"):
        geo = load(f"{RP}/models/entity/{name}.geo.json")
        if not geo:
            continue
        block = geo["minecraft:geometry"][0]
        names = {bone["name"] for bone in block["bones"]}
        for bone in block["bones"]:
            parent = bone.get("parent")
            if parent and parent not in names:
                errors.append(f"{name}: bone {bone['name']} has unknown parent {parent}")
        bones |= names
    for animation_name, animation in animations["animations"].items():
        for bone in animation.get("bones", {}):
            if bone not in bones:
                errors.append(f"animation {animation_name} targets unknown bone {bone}")


def check_properties():
    properties = entity_properties()
    names = set(properties)

    used = set()
    for root, _dirs, files in os.walk(BP):
        for filename in files:
            if filename.endswith(".js"):
                text = read(os.path.join(root, filename))
                used |= set(re.findall(r'"(skitter:[a-z_]+)"', text))
    for root, _dirs, files in os.walk(RP):
        for filename in files:
            if filename.endswith(".json"):
                text = read(os.path.join(root, filename))
                used |= set(re.findall(r"property\('([^']+)'\)", text))

    entity = load(f"{BP}/entities/skitter.json")
    events = set(entity["minecraft:entity"].get("events", {})) if entity else set()
    for name in sorted(used):
        if name in names or name in events:
            continue
        if name.startswith("skitter:set_phase") or name in ("skitter:set_mini", "skitter:skitter",
                                                            "skitter:state", "skitter:config",
                                                            "skitter:summon"):
            continue
        errors.append(f"property '{name}' is used but not declared on the entity")

    for name in ("skitter:phase", "skitter:scale", "skitter:speed", "skitter:pitch",
                 "skitter:roll", "skitter:crouch", "skitter:strike", "skitter:state",
                 "skitter:style"):
        if name not in names:
            errors.append(f"entity is missing required property {name}")
        elif not properties[name].get("client_sync"):
            errors.append(f"property {name} must set client_sync for Molang to read it")


def check_states():
    entity = load(f"{BP}/entities/skitter.json")
    controllers = load(f"{RP}/animation_controllers/skitter.animation_controllers.json")
    if not entity or not controllers:
        return
    values = set(entity["minecraft:entity"]["description"]["properties"]["skitter:state"]["values"])
    text = json.dumps(controllers)
    referenced = set(re.findall(r"skitter:state'\) == '([a-z]+)'", text))
    unknown = referenced - values
    if unknown:
        errors.append(f"animation controller references unknown state values: {sorted(unknown)}")
    states = set(controllers["animation_controllers"]["controller.animation.skitter.move"]["states"])
    missing = values - states
    if missing:
        warnings.append(f"no animation controller state for: {sorted(missing)}")

    script = read(f"{BP}/scripts/entity_link.js")
    produced = set(re.findall(r'return "([a-z]+)";', script))
    unknown = produced - values
    if unknown:
        errors.append(f"entity_link.js produces undeclared states: {sorted(unknown)}")


def check_scripts_parse():
    for root, _dirs, files in os.walk(f"{BP}/scripts"):
        for filename in sorted(files):
            if not filename.endswith(".js"):
                continue
            path = os.path.join(root, filename)
            text = read(path)
            for match in re.findall(r'from "\./([A-Za-z0-9_]+\.js)"', text):
                if not os.path.exists(os.path.join(root, match)):
                    errors.append(f"{path} imports missing module {match}")


def main():
    check_manifests()
    check_entity()
    check_client_entity()
    check_geometry_bones()
    check_properties()
    check_states()
    check_scripts_parse()

    for warning in warnings:
        print(f"WARN  {warning}")
    for error in errors:
        print(f"ERROR {error}")
    if errors:
        print(f"\n{len(errors)} problem(s) found")
        return 1
    print(f"OK - addon validated ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
