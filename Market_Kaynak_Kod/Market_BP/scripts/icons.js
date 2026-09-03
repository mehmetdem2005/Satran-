import * as mc from "@minecraft/server";
import { resmiIkon, IKON_SAYISI } from "./ikonlar.js";

export const VARSAYILAN = "textures/items/market_soru";

// v2.2: ikon yollari artik tahmin edilmiyor. ikonlar.js, Mojang'in resmi
// vanilla resource pack verisinden (item_texture.json + terrain_texture.json
// + blocks.json) uretilmis id -> doku yolu haritasini tasiyor. Asagidaki
// OZEL tablosu onun USTUNDE calisir: kendi cizdigimiz gorseller ve elle
// duzeltmeler burada kalir.

// Bedrock'ta bircok esyanin texture dosya adi item id'sinden farkli
// (book -> book_normal, oak_planks -> planks_oak gibi). Asagisi o farki kapatir.
// Burada olmayanlar icin calisma aninda BlockTypes'a bakilir:
// blok ise textures/blocks/<ad>, degilse textures/items/<ad> denenir.
const OZEL = {
  // --- kitaplar / yazi ---
  book: "textures/items/book_normal",
  writable_book: "textures/items/book_writable",
  written_book: "textures/items/book_written",
  enchanted_book: "textures/items/book_enchanted",
  knowledge_book: "textures/items/book_knowledge",

  // --- toz / boya ---
  redstone: "textures/items/redstone_dust",
  lapis_lazuli: "textures/items/dye_powder_blue_new",
  ink_sac: "textures/items/dye_powder_black_new",
  cocoa_beans: "textures/items/dye_powder_brown",
  bone_meal: "textures/items/dye_powder_white",
  slime_ball: "textures/items/slimeball",

  // --- yiyecek ---
  golden_apple: "textures/items/apple_golden",
  enchanted_golden_apple: "textures/items/apple_golden",
  golden_carrot: "textures/items/carrot_golden",
  baked_potato: "textures/items/potato_baked",
  poisonous_potato: "textures/items/potato_poisonous",
  beef: "textures/items/beef_raw",
  cooked_beef: "textures/items/beef_cooked",
  porkchop: "textures/items/porkchop_raw",
  cooked_porkchop: "textures/items/porkchop_cooked",
  chicken: "textures/items/chicken_raw",
  cooked_chicken: "textures/items/chicken_cooked",
  mutton: "textures/items/mutton_raw",
  cooked_mutton: "textures/items/mutton_cooked",
  rabbit: "textures/items/rabbit_raw",
  cooked_rabbit: "textures/items/rabbit_cooked",
  cod: "textures/items/fish_raw",
  cooked_cod: "textures/items/fish_cooked",
  salmon: "textures/items/fish_salmon_raw",
  cooked_salmon: "textures/items/fish_salmon_cooked",
  tropical_fish: "textures/items/fish_clownfish_raw",
  pufferfish: "textures/items/fish_pufferfish_raw",
  melon_slice: "textures/items/melon",
  sugar_cane: "textures/items/reeds",
  nether_wart: "textures/items/nether_wart",

  // --- kovalar ---
  bucket: "textures/items/bucket_empty",
  water_bucket: "textures/items/bucket_water",
  lava_bucket: "textures/items/bucket_lava",
  milk_bucket: "textures/items/bucket_milk",
  powder_snow_bucket: "textures/items/bucket_powder_snow",

  // --- ahsap / altin ekipman (id != texture) ---
  wooden_sword: "textures/items/wood_sword",
  wooden_pickaxe: "textures/items/wood_pickaxe",
  wooden_axe: "textures/items/wood_axe",
  wooden_shovel: "textures/items/wood_shovel",
  wooden_hoe: "textures/items/wood_hoe",
  golden_sword: "textures/items/gold_sword",
  golden_pickaxe: "textures/items/gold_pickaxe",
  golden_axe: "textures/items/gold_axe",
  golden_shovel: "textures/items/gold_shovel",
  golden_hoe: "textures/items/gold_hoe",
  golden_helmet: "textures/items/gold_helmet",
  golden_chestplate: "textures/items/gold_chestplate",
  golden_leggings: "textures/items/gold_leggings",
  golden_boots: "textures/items/gold_boots",

  // --- cesitli item ---
  ender_eye: "textures/items/ender_eye",
  fire_charge: "textures/items/fireball",
  totem_of_undying: "textures/items/totem",
  clock: "textures/items/clock_item",
  compass: "textures/items/compass_item",
  crossbow: "textures/items/crossbow_standby",
  spyglass: "textures/items/spyglass",
  goat_horn: "textures/items/goat_horn",
  brush: "textures/items/brush",

  // --- ahsap bloklar (legacy adlandirma) ---
  oak_log: "textures/blocks/log_oak",
  spruce_log: "textures/blocks/log_spruce",
  birch_log: "textures/blocks/log_birch",
  jungle_log: "textures/blocks/log_jungle",
  acacia_log: "textures/blocks/log_acacia",
  dark_oak_log: "textures/blocks/log_big_oak",
  oak_planks: "textures/blocks/planks_oak",
  spruce_planks: "textures/blocks/planks_spruce",
  birch_planks: "textures/blocks/planks_birch",
  jungle_planks: "textures/blocks/planks_jungle",
  acacia_planks: "textures/blocks/planks_acacia",
  dark_oak_planks: "textures/blocks/planks_big_oak",
  oak_leaves: "textures/blocks/leaves_oak_opaque",
  spruce_leaves: "textures/blocks/leaves_spruce_opaque",
  birch_leaves: "textures/blocks/leaves_birch_opaque",
  jungle_leaves: "textures/blocks/leaves_jungle_opaque",

  // --- tas / toprak ---
  grass_block: "textures/blocks/grass_side_carried",
  podzol: "textures/blocks/dirt_podzol_side",
  mycelium: "textures/blocks/mycelium_side",
  stone_bricks: "textures/blocks/stonebrick",
  mossy_cobblestone: "textures/blocks/cobblestone_mossy",
  bricks: "textures/blocks/brick",
  nether_bricks: "textures/blocks/nether_brick",
  red_nether_bricks: "textures/blocks/red_nether_brick",
  end_stone_bricks: "textures/blocks/end_bricks",
  sandstone: "textures/blocks/sandstone_normal",
  red_sandstone: "textures/blocks/redsandstone_normal",
  quartz_block: "textures/blocks/quartz_block_side",
  nether_quartz_ore: "textures/blocks/quartz_ore",
  prismarine: "textures/blocks/prismarine_rough",
  snow_block: "textures/blocks/snow",
  terracotta: "textures/blocks/hardened_clay",
  ancient_debris: "textures/blocks/ancient_debris_side",
  hay_block: "textures/blocks/hayblock_side",
  pumpkin: "textures/blocks/pumpkin_side",
  carved_pumpkin: "textures/blocks/pumpkin_face_off",
  lit_pumpkin: "textures/blocks/pumpkin_face_on",
  melon_block: "textures/blocks/melon_side",
  crafting_table: "textures/blocks/crafting_table_front",
  furnace: "textures/blocks/furnace_front_off",
  blast_furnace: "textures/blocks/blast_furnace_front_off",
  smoker: "textures/blocks/smoker_front_off",
  torch: "textures/blocks/torch_on",
  soul_torch: "textures/blocks/soul_torch",
  tnt: "textures/blocks/tnt_side",
  glass_pane: "textures/blocks/glass",
  iron_bars: "textures/blocks/iron_bars",
  ladder: "textures/blocks/ladder",
  cobweb: "textures/blocks/web",
  vine: "textures/blocks/vine",
  lily_pad: "textures/blocks/waterlily",
  sea_lantern: "textures/blocks/sea_lantern",
  redstone_lamp: "textures/blocks/redstone_lamp_off",
  note_block: "textures/blocks/noteblock",
  jukebox: "textures/blocks/jukebox_side",
  slime: "textures/blocks/slime",
  magma: "textures/blocks/magma",
  monster_egg: "textures/blocks/stone",

  // --- yun ---
  white_wool: "textures/blocks/wool_colored_white",
  black_wool: "textures/blocks/wool_colored_black",
  red_wool: "textures/blocks/wool_colored_red",
  blue_wool: "textures/blocks/wool_colored_blue",
  green_wool: "textures/blocks/wool_colored_green",
  yellow_wool: "textures/blocks/wool_colored_yellow",
  orange_wool: "textures/blocks/wool_colored_orange",
  purple_wool: "textures/blocks/wool_colored_purple",
  pink_wool: "textures/blocks/wool_colored_pink",
  brown_wool: "textures/blocks/wool_colored_brown",
  cyan_wool: "textures/blocks/wool_colored_cyan",
  lime_wool: "textures/blocks/wool_colored_lime",
  gray_wool: "textures/blocks/wool_colored_gray",
  light_blue_wool: "textures/blocks/wool_colored_light_blue",
  light_gray_wool: "textures/blocks/wool_colored_silver",
  magenta_wool: "textures/blocks/wool_colored_magenta",

  // --- sandiklar entity model, ikon yok: kendi gorselimiz ---
  chest: "textures/items/market_sandik",
  trapped_chest: "textures/items/market_sandik",
  barrel: "textures/items/market_sandik",
  ender_chest: "textures/items/market_endersandik",
  shulker_box: VARSAYILAN,
  bed: VARSAYILAN,
  banner: VARSAYILAN
};

// Renk aileleri: 16 rengin hepsi ayni sablonu kullanir, elle yazmaya gerek yok.
// Bedrock texture adlandirmasinda "light_gray" -> "silver" olur.
const RENKLER = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink",
  "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const RENK_ADI = { light_gray: "silver" };

// [ek, klasor, sablon] -> sablondaki %r rengin texture adiyla degisir
const RENK_AILE = [
  ["_wool", "blocks", "wool_colored_%r"],
  ["_carpet", "blocks", "wool_colored_%r"],
  ["_concrete", "blocks", "concrete_%r"],
  ["_concrete_powder", "blocks", "concrete_powder_%r"],
  ["_terracotta", "blocks", "hardened_clay_stained_%r"],
  ["_glazed_terracotta", "blocks", "glazed_terracotta_%r"],
  ["_stained_glass", "blocks", "glass_%r"],
  ["_stained_glass_pane", "blocks", "glass_%r"],
  ["_shulker_box", "blocks", "shulker_top_%r"],
  ["_dye", "items", "dye_powder_%r"]
];

function renkliAile(ad) {
  for (const [ek, klasor, sablon] of RENK_AILE) {
    if (!ad.endsWith(ek)) continue;
    const renk = ad.slice(0, -ek.length);
    if (!RENKLER.includes(renk)) continue;
    return `textures/${klasor}/${sablon.replace("%r", RENK_ADI[renk] ?? renk)}`;
  }
  return undefined;
}

const bellek = new Map();

export function ikonSayisi() { return IKON_SAYISI; }

export function ikon(typeId) {
  if (bellek.has(typeId)) return bellek.get(typeId);
  const tam = String(typeId).includes(":") ? String(typeId) : `minecraft:${typeId}`;
  const ad = tam.replace(/^minecraft:/, "");

  let yol = resmiIkon(ad) ?? OZEL[ad] ?? renkliAile(ad);
  if (!yol) {
    // dogurma yumurtalarinin tek bir texture'i vardir, rengi oyun boyar
    if (ad.endsWith("_spawn_egg")) yol = "textures/items/spawn_egg";
    else if (ad.endsWith("_bed") || ad.endsWith("_banner")) yol = VARSAYILAN;
  }
  if (!yol) {
    // ikonlar.js'te yoksa kok blogun ikonunu dene (yeni aileler icin)
    const kok = ad.replace(/_(double_slab|slab|stairs|wall|fence_gate|fence|button|pressure_plate|trapdoor|door|shelf|sign|hanging_sign)$/, "");
    if (kok !== ad) yol = resmiIkon(kok) ?? resmiIkon(kok + "s") ?? resmiIkon(kok + "_planks") ?? resmiIkon(kok + "_block");
  }
  if (!yol) {
    let blokMu = false;
    try { blokMu = !!mc.BlockTypes.get(tam); } catch { blokMu = false; }
    yol = blokMu ? `textures/blocks/${ad}` : `textures/items/${ad}`;
  }
  bellek.set(typeId, yol);
  return yol;
}
