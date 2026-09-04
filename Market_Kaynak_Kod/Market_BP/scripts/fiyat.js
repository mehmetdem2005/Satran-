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
  crying_obsidian: 35, magma: 6, glowstone: 12, snowball: 1, snow_block: 4, ice: 2, packed_ice: 8, blue_ice: 30,
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
  sugar_cane: 2, cocoa_beans: 3, bamboo: 1, cactus: 2,
  kelp: 1, dried_kelp: 2, sweet_berries: 2, glow_berries: 5, apple: 5,
  nether_wart: 5, brown_mushroom: 2, red_mushroom: 2, chorus_fruit: 8,
  torchflower_seeds: 40, pitcher_pod: 40, egg: 2, // et / balik (cig)
  beef: 3, porkchop: 3, chicken: 2, mutton: 2, rabbit: 3,
  cod: 2, salmon: 3, tropical_fish: 6, pufferfish: 6,

  // mob dusurmeleri
  string: 3, feather: 2, leather: 6, bone: 3, gunpowder: 7, slime_ball: 8,
  rotten_flesh: 1, spider_eye: 4, ender_pearl: 25, blaze_rod: 30,
  ghast_tear: 55, phantom_membrane: 22, shulker_shell: 120,
  prismarine_shard: 7, prismarine_crystals: 11, nautilus_shell: 40,
  heart_of_the_sea: 300, ink_sac: 3, glow_ink_sac: 10,
  rabbit_hide: 3, rabbit_foot: 28, scute: 40, turtle_scute: 40,
  totem_of_undying: 400, dragon_breath: 60, wither_rose: 25,

  // esyalar
  elytra: 1500,
  experience_bottle: 25, cobweb: 5, honeycomb: 8, honey_bottle: 10,
  gunpowder_block: 0, lily_pad: 2, vine: 1,
  dandelion: 2, poppy: 2, blue_orchid: 3, allium: 3, azure_bluet: 2,
  oxeye_daisy: 2, cornflower: 3, lily_of_the_valley: 3, sunflower: 3,
  lilac: 3, rose_bush: 3, peony: 3, short_grass: 1, tall_grass: 1,
  fern: 1, large_fern: 1, dead_bush: 1, seagrass: 1, sea_pickle: 4,

  // 1.20+ ile gelenler ve daha once listede olmayanlar
  copper: 45, netherite_upgrade_smithing_template: 200,
  hardened_clay: 3, web: 5, waterlily: 2, noteblock: 12, grass_path: 1,
  deadbush: 1, brick_block: 5, netherbrick: 2, snowball: 1, frog_spawn: 10,
  cinnabar: 8, sulfur: 6, potent_sulfur: 20, sulfur_spike: 10, dried_ghast: 60,
  copper_golem_statue: 60, copper_lantern: 16, copper_torch: 2, copper_bars: 5,
  copper_chest: 12, lodestone_compass: 120, golden_dandelion: 6, red_shrub: 1,
  pink_petals: 2, shelf_mushroom: 3, closed_eyeblossom: 5, open_eyeblossom: 5,
  camel_husk_spawn_egg: 400,
  brick: 2, netherbrick: 2, mob_spawner: 800, nether_brick_item: 2,
  carved_pumpkin: 6, azalea_leaves_flowered: 2, brown_mushroom_block: 3, red_mushroom_block: 3,
  mace: 900, breeze_rod: 60, wind_charge: 8, heavy_core: 400,
  trial_key: 90, ominous_trial_key: 180, ominous_bottle: 60,
  resin_clump: 6, resin_block: 20, creaking_heart: 90,
  sculk: 6, sculk_vein: 4, sculk_catalyst: 90, sculk_shrieker: 70,
  sculk_sensor: 40, calibrated_sculk_sensor: 60, reinforced_deepslate: 150,
  dripstone_block: 4, pointed_dripstone: 4, powder_snow: 6,
  spawner: 800, trial_spawner: 800, vault: 800, dragon_egg: 2000,
  budding_amethyst: 200, amethyst_cluster: 30,
  glow_lichen: 4, spore_blossom: 12, big_dripleaf: 4, small_dripleaf: 4,
  hanging_roots: 2, azalea: 6, flowering_azalea: 9, moss_carpet: 2,
  goat_horn: 90, recovery_compass: 200, armadillo_scute: 20,
  disc_fragment_5: 30, echo_shard_block: 0,
  glow_frame: 12, decorated_pot: 12,
  crafter: 90, end_rod: 8,
  fermented_spider_eye: 12, suspicious_stew: 15, enchanted_golden_apple: 900,
  poisonous_potato: 1, popped_chorus_fruit: 9,
  enchanted_book: 120,
  trident: 500, spectral_arrow: 6, tipped_arrow: 8, golden_rail: 12, tinted_glass: 12,
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

// ============ CRAFT TARIFLERI ============
// Fiyat kalitesini yukselten asil parca: asagidaki esyalarin degeri artik
// tahmin edilmiyor, GIRDILERINDEN hesaplaniyor.
//   deger(cikti) = toplam(girdi degeri) / cikti adedi * URETIM
// URETIM her zaman MAKAS'in altinda oldugu icin "ucuz al -> craftla -> pahali
// sat" acigi olusmaz (test: node arac/arbitraj.mjs).
const URETIM = 1.15;

// cikti: { g: [[girdi, adet], ...], n: cikti adedi }
const TARIF = {
  // --- ahsap ---
  stick: { g: [["oak_planks", 2]], n: 4 },
  crafting_table: { g: [["oak_planks", 4]], n: 1 },
  chest: { g: [["oak_planks", 8]], n: 1 },
  trapped_chest: { g: [["chest", 1], ["tripwire_hook", 1]], n: 1 },
  barrel: { g: [["oak_planks", 6], ["oak_slab", 2]], n: 1 },
  ladder: { g: [["stick", 7]], n: 3 },
  torch: { g: [["coal", 1], ["stick", 1]], n: 4 },
  soul_torch: { g: [["coal", 1], ["stick", 1], ["soul_sand", 1]], n: 4 },
  bowl: { g: [["oak_planks", 3]], n: 4 },
  bookshelf: { g: [["oak_planks", 6], ["book", 3]], n: 1 },
  chiseled_bookshelf: { g: [["oak_planks", 6], ["oak_slab", 3]], n: 1 },
  lectern: { g: [["oak_slab", 4], ["bookshelf", 1]], n: 1 },
  note_block: { g: [["oak_planks", 8], ["redstone", 1]], n: 1 },
  jukebox: { g: [["oak_planks", 8], ["diamond", 1]], n: 1 },
  composter: { g: [["oak_slab", 7]], n: 1 },
  cartography_table: { g: [["oak_planks", 4], ["paper", 2]], n: 1 },
  fletching_table: { g: [["oak_planks", 4], ["flint", 2]], n: 1 },
  smithing_table: { g: [["oak_planks", 4], ["iron_ingot", 2]], n: 1 },
  loom: { g: [["oak_planks", 2], ["string", 2]], n: 1 },
  scaffolding: { g: [["bamboo", 6], ["string", 1]], n: 6 },
  armor_stand: { g: [["stick", 6], ["smooth_stone_slab", 1]], n: 1 },
  item_frame: { g: [["stick", 8], ["leather", 1]], n: 1 },
  glow_item_frame: { g: [["item_frame", 1], ["glow_ink_sac", 1]], n: 1 },
  painting: { g: [["stick", 8], ["white_wool", 1]], n: 1 },
  bee_nest: { g: [["oak_planks", 6], ["honeycomb", 3]], n: 1 },
  beehive: { g: [["oak_planks", 6], ["honeycomb", 3]], n: 1 },
  campfire: { g: [["stick", 3], ["coal", 1], ["oak_log", 3]], n: 1 },
  soul_campfire: { g: [["stick", 3], ["soul_sand", 1], ["oak_log", 3]], n: 1 },

  // --- tas / metal ---
  furnace: { g: [["cobblestone", 8]], n: 1 },
  blast_furnace: { g: [["furnace", 1], ["iron_ingot", 5], ["smooth_stone", 3]], n: 1 },
  smoker: { g: [["furnace", 1], ["oak_log", 4]], n: 1 },
  stonecutter: { g: [["stone", 3], ["iron_ingot", 1]], n: 1 },
  grindstone: { g: [["stick", 2], ["oak_planks", 2], ["stone_slab", 1]], n: 1 },
  cauldron: { g: [["iron_ingot", 7]], n: 1 },
  hopper: { g: [["iron_ingot", 5], ["chest", 1]], n: 1 },
  anvil: { g: [["iron_block", 3], ["iron_ingot", 4]], n: 1 },
  iron_bars: { g: [["iron_ingot", 6]], n: 16 },
  chain: { g: [["iron_ingot", 1], ["iron_nugget", 2]], n: 1 },
  iron_door: { g: [["iron_ingot", 6]], n: 3 },
  iron_trapdoor: { g: [["iron_ingot", 4]], n: 1 },
  lantern: { g: [["torch", 1], ["iron_nugget", 8]], n: 1 },
  soul_lantern: { g: [["soul_torch", 1], ["iron_nugget", 8]], n: 1 },
  bucket: { g: [["iron_ingot", 3]], n: 1 },
  shears: { g: [["iron_ingot", 2]], n: 1 },
  flint_and_steel: { g: [["iron_ingot", 1], ["flint", 1]], n: 1 },
  compass: { g: [["iron_ingot", 4], ["redstone", 1]], n: 1 },
  clock: { g: [["gold_ingot", 4], ["redstone", 1]], n: 1 },
  minecart: { g: [["iron_ingot", 5]], n: 1 },
  rail: { g: [["iron_ingot", 6], ["stick", 1]], n: 16 },
  powered_rail: { g: [["gold_ingot", 6], ["stick", 1], ["redstone", 1]], n: 6 },
  detector_rail: { g: [["iron_ingot", 6], ["stone_pressure_plate", 1], ["redstone", 1]], n: 6 },
  activator_rail: { g: [["iron_ingot", 6], ["stick", 2], ["redstone_torch", 1]], n: 6 },
  bell: { g: [["gold_ingot", 3], ["oak_planks", 3]], n: 1 },
  lodestone: { g: [["chiseled_stone_bricks", 8], ["netherite_ingot", 1]], n: 1 },
  glass_pane: { g: [["glass", 6]], n: 16 },
  glass_bottle: { g: [["glass", 3]], n: 3 },
  spyglass: { g: [["copper_ingot", 2], ["amethyst_shard", 1]], n: 1 },
  brush: { g: [["feather", 1], ["copper_ingot", 1], ["stick", 1]], n: 1 },
  lightning_rod: { g: [["copper_ingot", 3]], n: 1 },

  // --- kirmizi tas ---
  redstone_torch: { g: [["redstone", 1], ["stick", 1]], n: 1 },
  redstone_lamp: { g: [["glowstone", 1], ["redstone", 4]], n: 1 },
  piston: { g: [["oak_planks", 3], ["cobblestone", 4], ["iron_ingot", 1], ["redstone", 1]], n: 1 },
  sticky_piston: { g: [["piston", 1], ["slime_ball", 1]], n: 1 },
  observer: { g: [["cobblestone", 6], ["redstone", 2], ["quartz", 1]], n: 1 },
  dispenser: { g: [["cobblestone", 7], ["bow", 1], ["redstone", 1]], n: 1 },
  dropper: { g: [["cobblestone", 7], ["redstone", 1]], n: 1 },
  repeater: { g: [["stone", 3], ["redstone_torch", 2], ["redstone", 1]], n: 1 },
  comparator: { g: [["stone", 3], ["redstone_torch", 3], ["quartz", 1]], n: 1 },
  daylight_detector: { g: [["glass", 3], ["quartz", 3], ["oak_slab", 3]], n: 1 },
  target: { g: [["hay_block", 1], ["redstone", 4]], n: 1 },
  tnt: { g: [["gunpowder", 5], ["sand", 4]], n: 1 },
  tripwire_hook: { g: [["iron_ingot", 1], ["stick", 1], ["oak_planks", 1]], n: 2 },
  lever: { g: [["cobblestone", 1], ["stick", 1]], n: 1 },
  chest_minecart: { g: [["minecart", 1], ["chest", 1]], n: 1 },
  hopper_minecart: { g: [["minecart", 1], ["hopper", 1]], n: 1 },
  furnace_minecart: { g: [["minecart", 1], ["furnace", 1]], n: 1 },
  tnt_minecart: { g: [["minecart", 1], ["tnt", 1]], n: 1 },

  // --- yiyecek ---
  bread: { g: [["wheat", 3]], n: 1 },
  cookie: { g: [["wheat", 2], ["cocoa_beans", 1]], n: 8 },
  cake: { g: [["milk_bucket", 3], ["sugar", 2], ["wheat", 3], ["egg", 1]], n: 1 },
  pumpkin_pie: { g: [["pumpkin", 1], ["sugar", 1], ["egg", 1]], n: 1 },
  golden_apple: { g: [["gold_ingot", 8], ["apple", 1]], n: 1 },
  golden_carrot: { g: [["gold_nugget", 8], ["carrot", 1]], n: 1 },
  glistering_melon_slice: { g: [["gold_nugget", 8], ["melon_slice", 1]], n: 1 },
  mushroom_stew: { g: [["brown_mushroom", 1], ["red_mushroom", 1], ["bowl", 1]], n: 1 },
  rabbit_stew: { g: [["cooked_rabbit", 1], ["carrot", 1], ["baked_potato", 1], ["brown_mushroom", 1], ["bowl", 1]], n: 1 },
  beetroot_soup: { g: [["beetroot", 6], ["bowl", 1]], n: 1 },
  sugar: { g: [["sugar_cane", 1]], n: 1 },
  hay_block: { g: [["wheat", 9]], n: 1 },
  bone_meal: { g: [["bone", 1]], n: 3 },
  bone_block: { g: [["bone_meal", 9]], n: 1 },

  // --- cesitli ---
  paper: { g: [["sugar_cane", 3]], n: 3 },
  book: { g: [["paper", 3], ["leather", 1]], n: 1 },
  writable_book: { g: [["book", 1], ["ink_sac", 1], ["feather", 1]], n: 1 },
  bookshelf_dummy: { g: [["oak_planks", 6], ["book", 3]], n: 1 },
  map: { g: [["paper", 8], ["compass", 1]], n: 1 },
  empty_map: { g: [["paper", 9]], n: 1 },
  fishing_rod: { g: [["stick", 3], ["string", 2]], n: 1 },
  bow: { g: [["stick", 3], ["string", 3]], n: 1 },
  crossbow: { g: [["stick", 3], ["string", 2], ["iron_ingot", 1], ["tripwire_hook", 1]], n: 1 },
  arrow: { g: [["flint", 1], ["stick", 1], ["feather", 1]], n: 4 },
  shield: { g: [["oak_planks", 6], ["iron_ingot", 1]], n: 1 },
  fire_charge: { g: [["gunpowder", 1], ["blaze_powder", 1], ["coal", 1]], n: 3 },
  blaze_powder: { g: [["blaze_rod", 1]], n: 2 },
  magma_cream: { g: [["blaze_powder", 1], ["slime_ball", 1]], n: 1 },
  ender_eye: { g: [["ender_pearl", 1], ["blaze_powder", 1]], n: 1 },
  firework_rocket: { g: [["paper", 1], ["gunpowder", 1]], n: 3 },
  firework_star: { g: [["gunpowder", 1], ["red_dye", 1]], n: 1 },
  white_wool: { g: [["string", 4]], n: 1 },
  white_carpet: { g: [["white_wool", 2]], n: 3 },
  white_bed: { g: [["white_wool", 3], ["oak_planks", 3]], n: 1 },
  candle: { g: [["string", 1], ["honeycomb", 1]], n: 1 },
  honeycomb_block: { g: [["honeycomb", 4]], n: 1 },
  honey_block: { g: [["honey_bottle", 4]], n: 1 },
  slime_block: { g: [["slime_ball", 9]], n: 1 },
  end_crystal: { g: [["glass", 7], ["ender_eye", 1], ["ghast_tear", 1]], n: 1 },
  beacon: { g: [["glass", 5], ["obsidian", 3], ["nether_star", 1]], n: 1 },
  conduit: { g: [["nautilus_shell", 8], ["heart_of_the_sea", 1]], n: 1 },
  respawn_anchor: { g: [["crying_obsidian", 6], ["glowstone", 3]], n: 1 },
  enchanting_table: { g: [["obsidian", 4], ["diamond", 2], ["book", 1]], n: 1 },
  brewing_stand: { g: [["cobblestone", 3], ["blaze_rod", 1]], n: 1 },
  ender_chest: { g: [["obsidian", 8], ["ender_eye", 1]], n: 1 },
  flower_pot: { g: [["brick", 3]], n: 1 },
  bricks: { g: [["brick", 4]], n: 1 },
  nether_bricks: { g: [["netherbrick", 4]], n: 1 },
  quartz_block: { g: [["quartz", 4]], n: 1 },
  snow_block: { g: [["snowball", 4]], n: 1 },
  clay: { g: [["clay_ball", 4]], n: 1 },
  glowstone: { g: [["glowstone_dust", 4]], n: 1 },
  melon_block: { g: [["melon_slice", 9]], n: 1 },
  dried_kelp_block: { g: [["dried_kelp", 9]], n: 1 },
  sea_lantern: { g: [["prismarine_shard", 4], ["prismarine_crystals", 5]], n: 1 },
  prismarine: { g: [["prismarine_shard", 4]], n: 1 },
  saddle: { g: [["leather", 5], ["iron_ingot", 2]], n: 1 },
  lead: { g: [["string", 4], ["slime_ball", 1]], n: 2 },
  name_tag: { g: [["paper", 1], ["iron_ingot", 1]], n: 1 },
  carrot_on_a_stick: { g: [["fishing_rod", 1], ["carrot", 1]], n: 1 },
  warped_fungus_on_a_stick: { g: [["fishing_rod", 1], ["warped_fungus", 1]], n: 1 },
  leather_horse_armor: { g: [["leather", 7]], n: 1 },
  iron_horse_armor: { g: [["iron_ingot", 7]], n: 1 },
  golden_horse_armor: { g: [["gold_ingot", 7]], n: 1 },
  diamond_horse_armor: { g: [["diamond", 7]], n: 1 },
  wolf_armor: { g: [["armadillo_scute", 6]], n: 1 },
  bed: { g: [["white_wool", 3], ["oak_planks", 3]], n: 1 },
  banner: { g: [["white_wool", 6], ["stick", 1]], n: 1 },
  brick_block: { g: [["brick", 4]], n: 1 },
  jack_o_lantern: { g: [["carved_pumpkin", 1], ["torch", 1]], n: 1 },
  lit_pumpkin: { g: [["carved_pumpkin", 1], ["torch", 1]], n: 1 }
};

// alet/zirh malzeme degerleri
const MALZEME = {
  wooden: 1, wood: 1, stone: 1, copper: 5, golden: 18, gold: 18, iron: 12,
  diamond: 90, netherite: 1200, leather: 6, chainmail: 12, turtle: 40
};
// parca basina kac malzeme
const PARCA = {
  sword: 2, pickaxe: 3, axe: 3, shovel: 1, hoe: 2, spear: 3,
  helmet: 5, chestplate: 8, leggings: 7, boots: 4,
  nautilus_armor: 10, horse_armor: 8
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
const YASAK_DESEN = [/^reserved/, /_command_block$/, /^light_block(_\d+)?$/];

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

// Bedrock'ta bazi mese esyalari agac adi tasimaz (oak_door degil wooden_door
// gibi). Bunlari mese karsiligina baglayip ayni tariften hesapliyoruz.
const ESKI_AD = {
  wooden_door: "oak_door", wooden_button: "oak_button", wooden_pressure_plate: "oak_pressure_plate",
  trapdoor: "oak_trapdoor", fence_gate: "oak_fence_gate", sign: "oak_sign", boat: "oak_boat",
  chest_boat: "oak_chest_boat", wooden_slab: "oak_slab", oak_wood_stairs: "oak_stairs",
  frame: "item_frame", glow_frame: "glow_item_frame", filled_map: "map", empty_map: "empty_map",
  mob_spawner: "spawner", monster_egg: "stone", web: "cobweb", waterlily: "lily_pad",
  noteblock: "note_block", hardened_clay: "terracotta", brick_block: "bricks",
  stonecutter_block: "stonecutter", magma: "magma_block", melon_block: "melon_block"
};

function hesapla(a) {
  if (TABAN[a] !== undefined) return TABAN[a];
  if (ESKI_AD[a] && ESKI_AD[a] !== a) return D(ESKI_AD[a]);
  if (a === "chipped_anvil") return D("anvil") * 0.7;
  if (a === "damaged_anvil") return D("anvil") * 0.45;

  // Craft tarifi varsa deger girdilerinden hesaplanir (en dogru yontem)
  if (TARIF[a]) {
    const t = TARIF[a];
    let toplam = 0;
    for (const [girdi, adet] of t.g) toplam += D(girdi) * adet;
    return toplam / (t.n || 1) * URETIM;
  }

  // --- v2.0: eskiden yasakli oldugu icin hic fiyatlanmayan aileler ---
  if (a.endsWith("_spawn_egg")) return 400;
  if (a.endsWith("_head") || a.endsWith("_skull") || a === "skull") return 120;
  if (a.endsWith("_pottery_sherd")) return 60;
  if (a.endsWith("_shelf")) return 6;
  if (a.endsWith("_cushion")) return 8;
  if (a.endsWith("_nautilus_armor")) return 150;
  if (a.endsWith("_pillar")) return D(a.slice(0, -7) + "_block") * 1.2 + 1;
  if (a.endsWith("_chain") || a === "chain") return 12;
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

  // ahsap ailesi: her agac turu icin ayni tarifler gecerli, tek tek yazmiyoruz.
  // Kok deger = o agacin tahtasi; yoksa genel tahta degeri.
  const AHSAP_TARIF = [
    ["_door", 6, 3], ["_trapdoor", 6, 2], ["_hanging_sign", 6, 6], ["_sign", 6, 3],
    ["_fence_gate", 4, 1], ["_fence", 4, 3], ["_pressure_plate", 2, 1], ["_button", 1, 1],
    ["_stairs", 6, 4], ["_slab", 3, 6], ["_chest_boat", 5, 1], ["_boat", 5, 1],
    ["_shelf", 6, 1], ["_mosaic", 2, 1], ["_raft", 5, 1]
  ];
  const AGAC = /^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|poplar|crimson|warped|bamboo)$/;
  for (const [ek, girdi, cikti] of AHSAP_TARIF) {
    if (!a.endsWith(ek)) continue;
    const kok = a.slice(0, -ek.length);
    if (!AGAC.test(kok)) break;                     // ahsap degil: genel kural baksin
    let deger = D(kok + "_planks") * girdi / cikti * URETIM;
    if (ek === "_chest_boat") deger += D("chest");
    if (ek === "_hanging_sign") deger += D("chain") * 2 / cikti;
    if (ek === "_fence_gate" || ek === "_fence") deger += D("stick") * 4 / cikti;
    if (ek === "_sign") deger += D("stick") / cikti;
    return deger;
  }

  if (/_(log|wood|stem|hyphae)$/.test(a)) return 4;
  if (a.endsWith("_planks")) return D("oak_log") / 4 * URETIM;
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

// Bir ESYA YIGININ gercek satis degeri (adet basina).
// Duz tur fiyati yetmiyor: hasarli alet daha ucuz, buyulu esya daha degerli
// olmali. Satis yollari bu fonksiyonu kullanir.
export function esyaDegeri(item) {
  if (!item) return 0;
  const t = fiyat(item.typeId);
  if (!t) return 0;
  let deger = t.alis;

  // hasar: tam saglam 1.0, kirilmak uzere 0.2
  try {
    const dur = item.getComponent("minecraft:durability");
    if (dur && dur.maxDurability > 0 && dur.damage > 0) {
      const kalan = Math.max(0, 1 - dur.damage / dur.maxDurability);
      deger *= 0.2 + 0.8 * kalan;
    }
  } catch { }

  // buyuler: her seviye +%12, en fazla 3 kat
  try {
    const e = item.getComponent("minecraft:enchantable");
    if (e) {
      let seviye = 0;
      for (const b of e.getEnchantments()) seviye += b.level ?? 1;
      if (seviye > 0) deger *= Math.min(3, 1 + seviye * 0.12);
    }
  } catch { }

  try { if (item.nameTag) deger *= 1.05; } catch { }
  return Math.max(1, Math.round(deger));
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
    /(_smithing_template|_bucket|_spear|_nautilus_armor)$/.test(a) ||
    ["bow", "crossbow", "trident", "mace", "shield", "elytra", "arrow", "spectral_arrow",
     "tipped_arrow", "fishing_rod", "shears", "brush", "flint_and_steel", "bucket",
     "compass", "recovery_compass", "clock", "spyglass", "saddle", "lead", "name_tag",
     "book", "writable_book", "written_book", "enchanted_book", "experience_bottle",
     "wolf_armor", "carrot_on_a_stick", "warped_fungus_on_a_stick", "wind_charge",
     "lodestone_compass", "trapdoor", "shears",
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
    /_(wool|carpet|bed|banner|dye|concrete|concrete_powder|terracotta|glazed_terracotta|stained_glass|stained_glass_pane|candle|shulker_box|bundle|harness|banner_pattern|pottery_sherd|head|skull|cushion)$/.test(a) ||
    ["terracotta", "candle", "shulker_box", "undyed_shulker_box", "bundle", "glass",
     "glass_pane", "tinted_glass", "item_frame", "glow_item_frame", "painting",
     "flower_pot", "decorated_pot", "armor_stand", "lectern", "chiseled_bookshelf",
     "bookshelf", "skull", "end_rod", "lantern", "soul_lantern", "torch", "soul_torch",
     "campfire", "soul_campfire", "chain", "iron_bars", "ladder", "scaffolding",
     "bell", "beehive", "bee_nest", "frame", "glow_frame", "fire_charge",
     "bed", "banner", "sign", "filled_map", "hardened_clay", "noteblock",
     "copper_lantern", "copper_torch", "copper_golem_statue"].includes(a)],

  ["Ahşap & Bitki", "minecraft:oak_log", a =>
    /_(log|wood|stem|hyphae|planks|leaves|sapling|propagule|fungus|roots|mosaic|boat|raft|nylium|shelf|petals|eyeblossom|shrub|dandelion)$/.test(a) ||
    /^stripped_/.test(a) || a === "boat" || a === "chest_boat" ||
    /(flower|tulip|orchid|rose|lilac|peony|fern|grass|vine|moss|mushroom_block|coral|azalea|dripleaf|sprouts|bush)/.test(a) ||
    ["stick", "dandelion", "poppy", "allium", "azure_bluet", "oxeye_daisy", "cornflower",
     "lily_of_the_valley", "sunflower", "dead_bush", "seagrass", "sea_grass", "lily_pad",
     "sea_pickle", "bamboo_block", "bamboo_raft", "bamboo_chest_raft", "spore_blossom",
     "glow_lichen", "hanging_roots", "leaf_litter", "wildflowers", "firefly_bush",
     "cactus_flower", "resin_clump", "creaking_heart", "chorus_plant",
     "chorus_flower", "shroomlight", "bowl", "paper", "deadbush", "waterlily",
     "web", "shelf_mushroom", "frog_spawn", "pink_petals"].includes(a)],

  ["Taş & Yapı", "minecraft:stone", a =>
    /_(stairs|slab|wall|fence|fence_gate|door|trapdoor|bricks|brick|tiles|pane|sign|hanging_sign)$/.test(a) ||
    /^(polished_|chiseled_|cut_|smooth_|mossy_|cracked_|waxed_|exposed_|weathered_|oxidized_|deepslate_|infested_)/.test(a) ||
    /(copper|sandstone|prismarine|blackstone|purpur|basalt|deepslate|tuff|resin|cinnabar|sulfur)/.test(a) ||
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
     "fence_gate", "brick", "bricks", "brick_block", "netherbrick", "snowball",
     "iron_chain", "chain", "grass_path", "quartz_pillar", "cinnabar", "sulfur",
     "potent_sulfur", "sulfur_spike",
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
     "glass_bottle", "empty_map", "map", "dried_ghast"].includes(a) ||
    /^music_disc/.test(a) || /^disc_fragment/.test(a)]
];

export const KATEGORILER = KURAL.map(([ad, ikon]) => ({ ad, ikon })).concat([{ ad: "Diğer", ikon: "minecraft:paper" }]);

export function kategoriIndex(id) {
  const a = ad(id);
  for (let i = 0; i < KURAL.length; i++) { try { if (KURAL[i][2](a)) return i; } catch { } }
  return KURAL.length;
}
