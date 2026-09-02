// ============ FIYAT MOTORU ============
// Elle 180 fiyat yazmak yerine ~140 ham maddeye taban deger verilir,
// geri kalan HER SEY bu tabanlardan turetilir. Boylece:
//  - oyundaki her esyanin fiyati olur (eksik kalmaz)
//  - islenmis urun girdisinden pahali olur (katma deger)
//  - alis/satis makasi sabit oldugu icin sonsuz para acigi olusmaz
//
// GUVENLIK KURALI: hicbir uretim carpani MAKAS'tan buyuk olamaz.
// Cunku girdiyi MAKAS katina alip cikti olarak 1 katina satarsin -> hep zarar.
export const MAKAS = 2.2;

// --- ham madde taban degerleri (oyuncunun 1 adet satinca kazandigi) ---
const TABAN = {
  // toprak / tas
  dirt: 1, coarse_dirt: 1, rooted_dirt: 1, grass_block: 2, podzol: 2, mycelium: 4, mud: 1,
  sand: 1, red_sand: 1, gravel: 1, clay: 4, clay_ball: 1, flint: 2,
  stone: 1, cobblestone: 1, andesite: 1, diorite: 1, granite: 1, tuff: 1,
  deepslate: 1, cobbled_deepslate: 1, calcite: 3, basalt: 2, blackstone: 2,
  netherrack: 1, soul_sand: 3, soul_soil: 3, end_stone: 3, obsidian: 20,
  crying_obsidian: 35, magma: 6, glowstone: 12, sea_lantern: 20,
  snowball: 1, snow_block: 4, ice: 2, packed_ice: 8, blue_ice: 30,
  moss_block: 3, sponge: 40, glass: 2, gravel_block: 1, bedrock: 0,

  // madenler
  coal: 4, charcoal: 3,
  raw_copper: 4, copper_ingot: 5,
  raw_iron: 9, iron_ingot: 12, iron_nugget: 2,
  raw_gold: 14, gold_ingot: 18, gold_nugget: 2,
  diamond: 90, emerald: 55, lapis_lazuli: 8, redstone: 5, quartz: 7,
  amethyst_shard: 10, ancient_debris: 260, netherite_scrap: 260, netherite_ingot: 1200,
  echo_shard: 160, nether_star: 2500,

  // tarim
  wheat: 2, wheat_seeds: 1, carrot: 2, potato: 2, beetroot: 2, beetroot_seeds: 1,
  melon_slice: 1, melon_block: 6, melon_seeds: 1, pumpkin: 5, pumpkin_seeds: 1,
  sugar_cane: 2, sugar: 3, cocoa_beans: 3, bamboo: 1, cactus: 2,
  kelp: 1, dried_kelp: 2, sweet_berries: 2, glow_berries: 5, apple: 5,
  nether_wart: 5, brown_mushroom: 2, red_mushroom: 2, chorus_fruit: 8,
  torchflower_seeds: 40, pitcher_pod: 40, egg: 2, bread: 8,

  // et / balik (cig)
  beef: 3, porkchop: 3, chicken: 2, mutton: 2, rabbit: 3,
  cod: 2, salmon: 3, tropical_fish: 6, pufferfish: 6,

  // mob dusurmeleri
  string: 3, feather: 2, leather: 6, bone: 3, gunpowder: 7, slime_ball: 8,
  rotten_flesh: 1, spider_eye: 4, ender_pearl: 25, blaze_rod: 30,
  ghast_tear: 55, magma_cream: 20, phantom_membrane: 22, shulker_shell: 120,
  prismarine_shard: 7, prismarine_crystals: 11, nautilus_shell: 40,
  heart_of_the_sea: 300, ink_sac: 3, glow_ink_sac: 10,
  rabbit_hide: 3, rabbit_foot: 28, scute: 40, turtle_scute: 40,
  totem_of_undying: 400, dragon_breath: 60, wither_rose: 25,

  // esyalar
  stick: 1, bowl: 1, paper: 2, book: 12, writable_book: 16,
  arrow: 2, bow: 30, crossbow: 45, shield: 20, elytra: 1500,
  saddle: 60, name_tag: 60, lead: 8, bucket: 36,
  flint_and_steel: 15, shears: 25, fishing_rod: 12, compass: 60, clock: 80,
  spyglass: 50, experience_bottle: 25, ender_eye: 55, fire_charge: 12,
  tnt: 25, torch: 1, ladder: 1, cobweb: 5, honeycomb: 8, honey_bottle: 10,
  chest: 5, barrel: 8, crafting_table: 6, furnace: 5, bookshelf: 40,
  ender_chest: 8, anvil: 130, enchanting_table: 250, brewing_stand: 40,
  hopper: 70, beacon: 1200, conduit: 500, lodestone: 100,
  bone_meal: 1, gunpowder_block: 0, lily_pad: 2, vine: 1,
  dandelion: 2, poppy: 2, blue_orchid: 3, allium: 3, azure_bluet: 2,
  oxeye_daisy: 2, cornflower: 3, lily_of_the_valley: 3, sunflower: 3,
  lilac: 3, rose_bush: 3, peony: 3, short_grass: 1, tall_grass: 1,
  fern: 1, large_fern: 1, dead_bush: 1, seagrass: 1, sea_pickle: 4,

  // 1.20+ ile gelenler ve daha once listede olmayanlar
  copper: 45, netherite_upgrade_smithing_template: 200,
  brick: 2, netherbrick: 2, mob_spawner: 800, nether_brick_item: 2,
  mace: 900, breeze_rod: 60, wind_charge: 8, heavy_core: 400,
  trial_key: 90, ominous_trial_key: 180, ominous_bottle: 60,
  resin_clump: 6, resin_block: 20, creaking_heart: 90,
  sculk: 6, sculk_vein: 4, sculk_catalyst: 90, sculk_shrieker: 70,
  sculk_sensor: 40, calibrated_sculk_sensor: 60, reinforced_deepslate: 150,
  dripstone_block: 4, pointed_dripstone: 4, powder_snow: 6,
  spawner: 800, trial_spawner: 800, vault: 800, dragon_egg: 2000,
  end_crystal: 300, budding_amethyst: 200, amethyst_cluster: 30,
  glow_lichen: 4, spore_blossom: 12, big_dripleaf: 4, small_dripleaf: 4,
  hanging_roots: 2, azalea: 6, flowering_azalea: 9, moss_carpet: 2,
  goat_horn: 90, recovery_compass: 200, wolf_armor: 120, armadillo_scute: 20,
  brush: 20, disc_fragment_5: 30, echo_shard_block: 0,
  glow_frame: 12, item_frame: 8, glow_item_frame: 14, painting: 8,
  armor_stand: 12, lectern: 20, chiseled_bookshelf: 30, decorated_pot: 12,
  crafter: 90, loom: 12, smithing_table: 20, fletching_table: 12,
  cartography_table: 12, stonecutter: 12, grindstone: 14, composter: 10,
  campfire: 8, soul_campfire: 12, lantern: 14, soul_lantern: 18,
  bell: 90, beehive: 20, bee_nest: 40, honeycomb_block: 32,
  scaffolding: 2, chain: 12, iron_bars: 4, end_rod: 8,
  glass_bottle: 3, empty_map: 12, map: 12, glistering_melon_slice: 20,
  fermented_spider_eye: 12, blaze_powder: 16, cake: 30, cookie: 3,
  pumpkin_pie: 12, mushroom_stew: 12, rabbit_stew: 25, beetroot_soup: 10,
  suspicious_stew: 15, golden_apple: 120, enchanted_golden_apple: 900,
  golden_carrot: 40, poisonous_potato: 1, popped_chorus_fruit: 9,
  firework_rocket: 8, firework_star: 12, enchanted_book: 120,
  trident: 500, spectral_arrow: 6, tipped_arrow: 8, minecart: 30,
  rail: 3, powered_rail: 12, golden_rail: 12, detector_rail: 10, activator_rail: 10,
  piston: 20, sticky_piston: 28, observer: 25, dropper: 18, dispenser: 25,
  repeater: 12, comparator: 16, lever: 3, daylight_detector: 20,
  tripwire_hook: 6, target: 12, lightning_rod: 30, note_block: 12,
  jukebox: 50, redstone_lamp: 20, redstone_torch: 4, iron_door: 40,
  iron_trapdoor: 45, crafting_table: 6, blast_furnace: 20, smoker: 12,
  respawn_anchor: 200, cauldron: 40, flower_pot: 2, tinted_glass: 12,
  turtle_egg: 30, sniffer_egg: 200, frogspawn: 10, wet_sponge: 40,
  suspicious_sand: 6, suspicious_gravel: 6, packed_mud: 3, farmland: 1,
  brown_egg: 2, blue_egg: 2, armadillo: 0, glowstone_dust: 4,
  nether_wart_block: 45, warped_wart_block: 45, shroomlight: 25,
  crimson_nylium: 4, warped_nylium: 4, purpur_block: 12, purpur_pillar: 12,
  end_stone_bricks: 5, prismarine: 8, mud_bricks: 3, pale_moss_block: 4,
  pale_hanging_moss: 3, pale_moss_carpet: 3, leaf_litter: 1, firefly_bush: 4,
  cactus_flower: 4, wildflowers: 2, bush: 1, torchflower: 45, pitcher_plant: 45
};

// 9 adet ham maddeden yapilan bloklar
const BLOK9 = {
  coal_block: "coal", iron_block: "iron_ingot", gold_block: "gold_ingot",
  diamond_block: "diamond", emerald_block: "emerald", lapis_block: "lapis_lazuli",
  redstone_block: "redstone", netherite_block: "netherite_ingot",
  copper_block: "copper_ingot", amethyst_block: "amethyst_shard",
  raw_iron_block: "raw_iron", raw_gold_block: "raw_gold", raw_copper_block: "raw_copper",
  slime: "slime_ball", bone_block: "bone_meal", hay_block: "wheat",
  dried_kelp_block: "dried_kelp", bamboo_block: "bamboo", quartz_block: "quartz",
  wheat_block: "wheat"
};

// cevher -> icinden cikan
const CEVHER = {
  coal_ore: "coal", iron_ore: "raw_iron", gold_ore: "raw_gold", copper_ore: "raw_copper",
  diamond_ore: "diamond", emerald_ore: "emerald", lapis_ore: "lapis_lazuli",
  redstone_ore: "redstone", nether_quartz_ore: "quartz", nether_gold_ore: "gold_nugget",
  quartz_ore: "quartz"
};

// alet/zirh malzeme degerleri
const MALZEME = {
  wooden: 1, wood: 1, stone: 1, golden: 18, gold: 18, iron: 12,
  diamond: 90, netherite: 1200, leather: 6, chainmail: 12, turtle: 40
};
// parca basina kac malzeme
const PARCA = {
  sword: 2, pickaxe: 3, axe: 3, shovel: 1, hoe: 2,
  helmet: 5, chestplate: 8, leggings: 7, boots: 4
};

// SATILAMAYACAK ESYALAR
// v2.0'da bu liste bilerek KUCULTULDU. Eskiden dogurma yumurtalari, kafalar,
// yazili kitap, harita, ejderha yumurtasi gibi tamamen ticarete uygun esyalar
// da yasakliydi ve markette gorunmuyorlardi -> "tum itemler yok" sikayeti.
// Simdi sadece oyunun teknik/verilemez bloklari disarida kaliyor.
// DIKKAT: burada "includes" kullanmak tehlikeli -> "stairs" icinde "air" gecer,
// "lava_bucket" icinde "lava" gecer. O yuzden tam eslesme + desen kullaniyoruz.
const YASAK_TAM = new Set([
  "air", "water", "flowing_water", "lava", "flowing_lava", "fire", "soul_fire",
  "barrier", "light_block", "structure_void", "structure_block", "jigsaw",
  "command_block", "chain_command_block", "repeating_command_block",
  "allow", "deny", "border_block", "debug_stick", "camera",
  "end_portal", "end_gateway", "end_portal_frame", "nether_portal", "portal",
  "moving_block", "unknown", "info_update", "info_update2",
  "client_request_placeholder_block", "glowingobsidian", "netherreactor",
  "bubble_column", "standing_sign", "wall_sign", "standing_banner", "wall_banner",
  "flowing_lava", "lit_furnace", "lit_smoker", "lit_blast_furnace"
]);
const YASAK_DESEN = [/^reserved/, /_command_block$/];

const bellek = new Map();
const sarmal = new Set();

function ad(id) { return String(id).replace(/^minecraft:/, "").replace(/^mk:/, ""); }

export function yasakMi(id) {
  const a = ad(id);
  if (YASAK_TAM.has(a)) return true;
  return YASAK_DESEN.some(r => r.test(a));
}

// Bir esyanin taban degerini hesaplar (oyuncunun satinca kazandigi)
export function tabanDeger(id) {
  const a = ad(id);
  if (bellek.has(a)) return bellek.get(a);
  if (sarmal.has(a)) return 5;        // dongusel referans korumasi
  sarmal.add(a);
  const v = Math.max(1, Math.round(hesapla(a)));
  sarmal.delete(a);
  bellek.set(a, v);
  return v;
}
const D = (x) => tabanDeger(x);

function hesapla(a) {
  if (TABAN[a] !== undefined) return TABAN[a];

  // --- v2.0: eskiden yasakli oldugu icin hic fiyatlanmayan aileler ---
  if (a.endsWith("_spawn_egg")) return 400;
  if (a.endsWith("_head") || a.endsWith("_skull") || a === "skull") return 120;
  if (a.endsWith("_pottery_sherd")) return 60;
  if (a.endsWith("_froglight")) return 30;
  if (a.endsWith("_banner_pattern")) return 30;
  if (a.endsWith("_bundle") || a === "bundle") return 12;
  if (a.endsWith("_harness")) return 20;
  if (a.endsWith("_minecart")) return D("minecart") + 20;
  if (a.endsWith("_coral_block") ) return 20;
  if (a.endsWith("_coral_fan")) return 6;
  if (a.endsWith("_coral")) return 8;
  if (a.startsWith("dead_")) return D(a.slice(5)) * 0.6;
  if (a.endsWith("_chest_boat")) return 6;
  if (a.endsWith("_raft") || a.endsWith("_boat")) return 4;
  if (a.startsWith("infested_")) return D(a.slice(9));
  if (a === "monster_egg") return D("stone");

  // bakir asamalari: temel bakirin degerinden turetilir (mumlusu biraz pahali)
  if (/^(waxed_)?(exposed_|weathered_|oxidized_)?/.test(a) && a.includes("copper")) {
    const cip = a.replace(/^waxed_/, "").replace(/^(exposed_|weathered_|oxidized_)/, "");
    if (cip !== a) return D(cip) * (a.startsWith("waxed_") ? 1.15 : 1);
  }

  // pisirilmis -> cigin 1.8 kati (MAKAS'in altinda, acik yok)
  if (a.startsWith("cooked_")) return D(a.slice(7)) * 1.8;
  if (a === "baked_potato") return D("potato") * 1.8;

  // 9'luk bloklar
  if (BLOK9[a]) return D(BLOK9[a]) * 9;

  // cevherler
  if (CEVHER[a]) return D(CEVHER[a]) * 1.3;
  if (a.startsWith("deepslate_") && CEVHER[a.slice(10)]) return D(CEVHER[a.slice(10)]) * 1.3;
  if (a.endsWith("_ore")) return 8;

  // nugget: her zaman kulcenin 1/9'undan ucuz (yoksa kulce boz-sat acigi olur)
  if (a.endsWith("_nugget")) {
    const kulce = a.slice(0, -7) + "_ingot";
    if (TABAN[kulce] !== undefined) return Math.max(1, TABAN[kulce] / 9 * 0.9);
    return 1;
  }

  // alet & zirh
  for (const [m, mv] of Object.entries(MALZEME)) {
    if (!a.startsWith(m + "_")) continue;
    const parca = a.slice(m.length + 1);
    if (PARCA[parca]) return mv * PARCA[parca] * 1.15 + 2;
  }

  // kovalar: bos kova + icindekinin degeri
  if (a.endsWith("_bucket")) {
    const ic = a.slice(0, -7);
    const icDeger = { lava: 20, water: 1, milk: 3, powder_snow: 8, cod: 4, salmon: 5,
                      tropical_fish: 8, pufferfish: 8, axolotl: 40, tadpole: 10 }[ic] ?? 2;
    return D("bucket") + icDeger;
  }

  // ahsap ailesi
  if (/_(log|wood|stem|hyphae)$/.test(a)) return 4;
  if (a.endsWith("_planks")) return 1.2;
  if (a.endsWith("_leaves")) return 1;
  if (a.endsWith("_sapling")) return 3;
  if (a.endsWith("_propagule")) return 3;

  // renkli cam once: yoksa asagidaki _pane kurali yanlis kokten hesaplar
  if (a.endsWith("_stained_glass_pane")) return 3;

  // yapi parcalari: kok blogun degerinden turetilir
  const yapi = [
    ["_stairs", 0.8], ["_slab", 0.5], ["_wall", 0.8], ["_fence_gate", 1.3],
    ["_fence", 0.9], ["_trapdoor", 1.1], ["_door", 1.3], ["_pressure_plate", 0.7],
    ["_button", 0.4], ["_sign", 1.2], ["_bricks", 1.2], ["_brick", 1.2],
    ["_tiles", 1.2], ["_pane", 0.6], ["_carpet", 0.6]
  ];
  for (const [ek, carpan] of yapi) {
    if (!a.endsWith(ek)) continue;
    const kok = a.slice(0, -ek.length);
    if (!kok) break;
    const adaylar = [kok, kok + "_planks", kok + "s", "polished_" + kok];
    for (const c of adaylar) if (TABAN[ad(c)] !== undefined) return D(c) * carpan + 1;
    return 3 * carpan + 1;
  }

  // renkli aile
  if (a.endsWith("_wool")) return 4;
  if (a.endsWith("_bed")) return 18;
  if (a.endsWith("_banner")) return 24;
  if (a.endsWith("_dye")) return 3;
  if (a.endsWith("_concrete") || a.endsWith("_concrete_powder")) return 3;
  if (a.endsWith("_terracotta") || a === "terracotta") return 3;
  if (a.endsWith("_stained_glass") || a.endsWith("_stained_glass_pane")) return 3;
  if (a.endsWith("_glazed_terracotta")) return 8;
  if (a.endsWith("_candle") || a === "candle") return 6;
  if (a.endsWith("_shulker_box") || a === "shulker_box") return D("shulker_shell") * 2 + D("chest");
  if (a.endsWith("_tulip")) return 2;
  if (a.startsWith("music_disc")) return 90;
  if (a.startsWith("potion") || a.startsWith("splash_potion") || a.startsWith("lingering_potion")) return 25;
  if (a.endsWith("_horse_armor")) return 150;
  if (a.startsWith("smithing_template") || a.endsWith("_smithing_template")) return 200;
  if (a.startsWith("polished_") || a.startsWith("chiseled_") || a.startsWith("cut_") || a.startsWith("smooth_")) {
    const kok = a.replace(/^(polished_|chiseled_|cut_|smooth_)/, "");
    return D(kok) * 1.3 + 1;
  }
  if (a.startsWith("mossy_") || a.startsWith("cracked_")) return D(a.replace(/^(mossy_|cracked_)/, "")) * 1.2;
  if (a.startsWith("waxed_")) return D(a.slice(6)) * 1.1;

  // bilinmeyen: makul bir varsayilan
  return 5;
}

// Oyuncunun gordugu fiyatlar
export function fiyat(id) {
  if (yasakMi(id)) return null;
  const taban = tabanDeger(id);
  return { alis: Math.max(1, taban), satis: Math.max(2, Math.ceil(taban * MAKAS)) };
}

// ============ OTOMATIK KATEGORILER ============
// Sira onemli: ilk uyan kural kazanir. Hicbirine uymayan "Diger"e duser,
// yani hicbir esya listeden kaybolmaz.
const KURAL = [
  ["Doğurma Yumurtaları", "minecraft:egg", a => /_spawn_egg$/.test(a)],

  ["Alet, Zırh & Silah", "minecraft:diamond_sword", a =>
    /_(sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots|horse_armor)$/.test(a) ||
    /(_smithing_template|_bucket)$/.test(a) ||
    ["bow", "crossbow", "trident", "mace", "shield", "elytra", "arrow", "spectral_arrow",
     "tipped_arrow", "fishing_rod", "shears", "brush", "flint_and_steel", "bucket",
     "compass", "recovery_compass", "clock", "spyglass", "saddle", "lead", "name_tag",
     "book", "writable_book", "written_book", "enchanted_book", "experience_bottle",
     "wolf_armor", "carrot_on_a_stick", "warped_fungus_on_a_stick", "wind_charge",
     "firework_rocket", "firework_star", "goat_horn", "totem_of_undying"].includes(a)],

  ["Madenler & Cevher", "minecraft:diamond", a =>
    /(_ore$|^raw_|_ingot$|_nugget$)/.test(a) ||
    ["coal", "charcoal", "diamond", "emerald", "lapis_lazuli", "redstone", "quartz",
     "amethyst_shard", "ancient_debris", "netherite_scrap", "echo_shard", "flint",
     "clay_ball", "coal_block", "iron_block", "gold_block", "diamond_block",
     "emerald_block", "lapis_block", "redstone_block", "netherite_block", "copper_block",
     "amethyst_block", "raw_iron_block", "raw_gold_block", "raw_copper_block",
     "budding_amethyst", "amethyst_cluster", "nether_star"].includes(a)],

  ["Tarım & Yiyecek", "minecraft:wheat", a =>
    /^(cooked_|baked_)/.test(a) || /_(seeds|stew|soup|pie)$/.test(a) ||
    ["wheat", "carrot", "potato", "poisonous_potato", "beetroot", "melon_slice",
     "melon_block", "pumpkin", "carved_pumpkin", "lit_pumpkin", "sugar_cane", "sugar",
     "cocoa_beans", "bamboo", "cactus", "kelp", "dried_kelp", "sweet_berries",
     "glow_berries", "apple", "golden_apple", "enchanted_golden_apple", "golden_carrot",
     "glistering_melon_slice", "nether_wart", "brown_mushroom", "red_mushroom", "bread",
     "cake", "cookie", "egg", "brown_egg", "blue_egg", "milk_bucket", "honey_bottle",
     "honeycomb", "beef", "porkchop", "chicken", "mutton", "rabbit", "cod", "salmon",
     "tropical_fish", "pufferfish", "chorus_fruit", "popped_chorus_fruit", "hay_block",
     "bone_meal", "farmland", "composter", "torchflower", "pitcher_plant",
     "pitcher_pod", "jack_o_lantern"].includes(a)],

  ["Kırmızı Taş & Mekanizma", "minecraft:redstone", a =>
    /(_rail$|_minecart$|_piston$|_button$|_pressure_plate$)/.test(a) ||
    ["redstone", "redstone_torch", "redstone_lamp", "repeater", "comparator", "piston",
     "observer", "dropper", "dispenser", "hopper", "lever", "daylight_detector",
     "tripwire_hook", "target", "lightning_rod", "note_block", "jukebox", "rail",
     "minecart", "tnt", "iron_door", "iron_trapdoor", "sculk_sensor",
     "calibrated_sculk_sensor", "sculk_shrieker", "crafter", "copper_bulb",
     "trial_spawner", "vault", "spawner", "mob_spawner", "structure_void",
     "command_block_minecart"].includes(a)],

  ["Renkli & Dekor", "minecraft:white_wool", a =>
    /_(wool|carpet|bed|banner|dye|concrete|concrete_powder|terracotta|glazed_terracotta|stained_glass|stained_glass_pane|candle|shulker_box|bundle|harness|banner_pattern|pottery_sherd|head|skull)$/.test(a) ||
    ["terracotta", "candle", "shulker_box", "undyed_shulker_box", "bundle", "glass",
     "glass_pane", "tinted_glass", "item_frame", "glow_item_frame", "painting",
     "flower_pot", "decorated_pot", "armor_stand", "lectern", "chiseled_bookshelf",
     "bookshelf", "skull", "end_rod", "lantern", "soul_lantern", "torch", "soul_torch",
     "campfire", "soul_campfire", "chain", "iron_bars", "ladder", "scaffolding",
     "bell", "beehive", "bee_nest", "frame", "glow_frame", "fire_charge",
     "bed", "banner", "sign"].includes(a)],

  ["Ahşap & Bitki", "minecraft:oak_log", a =>
    /_(log|wood|stem|hyphae|planks|leaves|sapling|propagule|fungus|roots|mosaic|boat|raft|nylium)$/.test(a) ||
    /^stripped_/.test(a) || a === "boat" || a === "chest_boat" ||
    /(flower|tulip|orchid|rose|lilac|peony|fern|grass|vine|moss|mushroom_block|coral|azalea|dripleaf|sprouts|bush)/.test(a) ||
    ["stick", "dandelion", "poppy", "allium", "azure_bluet", "oxeye_daisy", "cornflower",
     "lily_of_the_valley", "sunflower", "dead_bush", "seagrass", "sea_grass", "lily_pad",
     "sea_pickle", "bamboo_block", "bamboo_raft", "bamboo_chest_raft", "spore_blossom",
     "glow_lichen", "hanging_roots", "leaf_litter", "wildflowers", "firefly_bush",
     "cactus_flower", "resin_clump", "creaking_heart", "chorus_plant",
     "chorus_flower", "shroomlight", "bowl", "paper"].includes(a)],

  ["Taş & Yapı", "minecraft:stone", a =>
    /_(stairs|slab|wall|fence|fence_gate|door|trapdoor|bricks|brick|tiles|pane|sign|hanging_sign)$/.test(a) ||
    /^(polished_|chiseled_|cut_|smooth_|mossy_|cracked_|waxed_|exposed_|weathered_|oxidized_|deepslate_|infested_)/.test(a) ||
    /(copper|sandstone|prismarine|blackstone|purpur|basalt|deepslate|tuff|resin)/.test(a) ||
    ["dirt", "coarse_dirt", "rooted_dirt", "grass_block", "podzol", "mycelium", "mud",
     "packed_mud", "sand", "red_sand", "gravel", "clay", "stone", "cobblestone",
     "andesite", "diorite", "granite", "tuff", "calcite", "netherrack", "soul_sand",
     "soul_soil", "end_stone", "obsidian", "crying_obsidian", "glass", "glowstone",
     "sea_lantern", "snow", "snow_block", "ice", "packed_ice", "blue_ice", "moss_block",
     "sponge", "wet_sponge", "magma", "magma_block", "bedrock", "dripstone_block",
     "pointed_dripstone", "sculk", "sculk_vein", "sculk_catalyst", "reinforced_deepslate",
     "chest", "trapped_chest", "barrel", "ender_chest", "crafting_table", "furnace",
     "blast_furnace", "smoker", "anvil", "enchanting_table", "brewing_stand", "cauldron",
     "beacon", "conduit", "lodestone", "respawn_anchor", "smithing_table", "loom",
     "stonecutter", "grindstone", "cartography_table", "fletching_table", "cobweb",
     "turtle_egg", "sniffer_egg", "frogspawn", "suspicious_sand", "suspicious_gravel",
     "chipped_anvil", "damaged_anvil", "slime", "slime_block", "honey_block",
     "snow_layer", "frosted_ice", "powder_snow", "bone_block", "dried_kelp_block",
     "nether_wart_block", "warped_wart_block", "shroudstone"].includes(a) ||
    /_block$/.test(a) || /_froglight$/.test(a) || /_amethyst_bud$/.test(a)],

  ["Mob & Değerli", "minecraft:ender_pearl", a =>
    ["string", "feather", "leather", "rabbit_hide", "bone", "gunpowder", "slime_ball",
     "rotten_flesh", "spider_eye", "fermented_spider_eye", "ender_pearl", "ender_eye",
     "blaze_rod", "blaze_powder", "breeze_rod", "ghast_tear", "magma_cream",
     "phantom_membrane", "shulker_shell", "prismarine_shard", "prismarine_crystals",
     "nautilus_shell", "heart_of_the_sea", "ink_sac", "glow_ink_sac", "glowstone_dust",
     "rabbit_foot", "scute", "turtle_scute", "armadillo_scute", "dragon_breath",
     "dragon_egg", "end_crystal", "heavy_core", "trial_key", "ominous_trial_key",
     "ominous_bottle", "netherite_ingot", "potion", "splash_potion", "lingering_potion",
     "glass_bottle", "empty_map", "map", "filled_map"].includes(a) ||
    /^music_disc/.test(a) || /^disc_fragment/.test(a)]
];

export const KATEGORILER = KURAL.map(([ad, ikon]) => ({ ad, ikon })).concat([{ ad: "Diğer", ikon: "minecraft:paper" }]);

export function kategoriIndex(id) {
  const a = ad(id);
  for (let i = 0; i < KURAL.length; i++) { try { if (KURAL[i][2](a)) return i; } catch { } }
  return KURAL.length;
}
