// ============ VANILLA ESYA KATALOGU ============
// NEDEN VAR:
// Eski surumde esya listesi yalnizca ItemTypes.getAll() + BlockTypes.getAll()
// ile kuruluyordu. Bu iki kayit bazi Bedrock yapilarinda EKSIK doner
// (ozellikle blok formu item formundan farkli adlanan aileler ve yeni
// eklenen aileler). Eksik donunce markette/takasta esya yok gibi gorunur.
//
// Cozum: aday id'leri burada aile sablonlarindan uretiyoruz. main.js her
// adayi `new ItemStack(id, 1)` ile deniyor; oyunda gercekten olmayan id
// sessizce eleniyor. Yani FAZLA uretmek zararsiz, AZ uretmek eksik markete
// yol acar -> bilerek cok uretiyoruz (legacy adlar dahil).

const L = [];
const at = (...ids) => { for (const id of ids) if (id) L.push(id); };
const carp = (kokler, ekler) => { for (const k of kokler) for (const e of ekler) L.push(k + e); };

// ---------------------------------------------------------------- AGAC
const AGAC_OW = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak"];
const AGAC_NETHER = ["crimson", "warped"];
const AGAC_HEPSI = [...AGAC_OW, ...AGAC_NETHER, "bamboo"];

carp(AGAC_HEPSI, [
  "_planks", "_stairs", "_slab", "_fence", "_fence_gate", "_door", "_trapdoor",
  "_button", "_pressure_plate", "_sign", "_hanging_sign", "_boat", "_chest_boat"
]);
carp(AGAC_OW, ["_log", "_wood", "_leaves", "_sapling"]);
for (const a of AGAC_OW) at(`stripped_${a}_log`, `stripped_${a}_wood`);
for (const a of AGAC_NETHER) at(`${a}_stem`, `${a}_hyphae`, `stripped_${a}_stem`, `stripped_${a}_hyphae`,
  `${a}_fungus`, `${a}_roots`, `${a}_nylium`);
at("bamboo", "bamboo_block", "stripped_bamboo_block", "bamboo_mosaic",
  "bamboo_mosaic_stairs", "bamboo_mosaic_slab", "bamboo_raft", "bamboo_chest_raft",
  "mangrove_roots", "muddy_mangrove_roots", "mangrove_propagule",
  "pale_hanging_moss", "pale_moss_block", "pale_moss_carpet",
  "resin_block", "resin_brick", "resin_bricks", "resin_brick_stairs",
  "resin_brick_slab", "resin_brick_wall", "chiseled_resin_bricks", "resin_clump",
  "creaking_heart", "azalea", "flowering_azalea", "azalea_leaves", "azalea_leaves_flowered",
  "nether_wart_block", "warped_wart_block", "shroomlight",
  "brown_mushroom_block", "red_mushroom_block", "mushroom_stem",
  "chorus_plant", "chorus_flower", "chorus_fruit", "popped_chorus_fruit");

// ---------------------------------------------------------------- RENK
const RENK = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
carp(RENK, [
  "_wool", "_carpet", "_bed", "_banner", "_dye", "_concrete", "_concrete_powder",
  "_terracotta", "_glazed_terracotta", "_stained_glass", "_stained_glass_pane",
  "_shulker_box", "_candle", "_bundle", "_harness"
]);
at("shulker_box", "undyed_shulker_box", "candle", "bundle", "terracotta", "glass", "glass_pane",
  "tinted_glass", "white_dye", "bone_meal", "ink_sac", "cocoa_beans", "lapis_lazuli");

// ---------------------------------------------------------------- TAS AILELERI
// Her aile icin stairs / slab / wall / cogul / _block denenir; olmayan elenir.
const TAS_AILE = [
  "stone", "smooth_stone", "cobblestone", "mossy_cobblestone", "stone_brick", "mossy_stone_brick",
  "granite", "polished_granite", "diorite", "polished_diorite", "andesite", "polished_andesite",
  "deepslate", "cobbled_deepslate", "polished_deepslate", "deepslate_brick", "deepslate_tile",
  "brick", "mud_brick", "sandstone", "smooth_sandstone", "cut_sandstone", "chiseled_sandstone",
  "red_sandstone", "smooth_red_sandstone", "cut_red_sandstone", "chiseled_red_sandstone",
  "prismarine", "prismarine_brick", "dark_prismarine", "nether_brick", "red_nether_brick",
  "cracked_nether_brick", "chiseled_nether_brick", "blackstone", "polished_blackstone",
  "polished_blackstone_brick", "gilded_blackstone", "end_stone_brick", "purpur", "quartz",
  "smooth_quartz", "quartz_brick", "chiseled_quartz", "tuff", "polished_tuff", "tuff_brick",
  "chiseled_tuff", "chiseled_tuff_brick", "basalt", "polished_basalt", "smooth_basalt",
  "cracked_stone_brick", "chiseled_stone_brick", "cracked_deepslate_brick", "cracked_deepslate_tile",
  "chiseled_deepslate", "cracked_polished_blackstone_brick", "chiseled_polished_blackstone"
];
carp(TAS_AILE, ["", "s", "_block", "_stairs", "_slab", "_wall"]);

at("stone_stairs", "normal_stone_stairs", "stone_block_slab", "double_stone_block_slab",
  "cobblestone_wall", "mossy_cobblestone_wall", "end_bricks", "end_stone",
  "dripstone_block", "pointed_dripstone", "calcite", "amethyst_block", "budding_amethyst",
  "amethyst_cluster", "large_amethyst_bud", "medium_amethyst_bud", "small_amethyst_bud",
  "obsidian", "crying_obsidian", "bedrock", "netherrack", "magma", "magma_block",
  "soul_sand", "soul_soil", "glowstone", "sea_lantern", "bone_block", "hay_block",
  "dried_kelp_block", "sponge", "wet_sponge", "slime", "slime_block", "honey_block",
  "honeycomb_block", "target", "scaffolding", "chain", "iron_bars",
  "dirt", "coarse_dirt", "rooted_dirt", "grass_block", "podzol", "mycelium", "mud",
  "packed_mud", "farmland", "dirt_with_roots", "clay", "gravel", "sand", "red_sand",
  "suspicious_sand", "suspicious_gravel", "moss_block", "moss_carpet", "snow", "snow_block",
  "snow_layer", "ice", "packed_ice", "blue_ice", "frosted_ice", "powder_snow",
  "sculk", "sculk_vein", "sculk_catalyst", "sculk_shrieker", "sculk_sensor",
  "calibrated_sculk_sensor", "reinforced_deepslate", "raw_iron_block", "raw_gold_block",
  "raw_copper_block", "netherite_block", "ancient_debris", "lodestone", "respawn_anchor",
  "crafting_table", "crafter", "furnace", "blast_furnace", "smoker", "cartography_table",
  "fletching_table", "smithing_table", "loom", "stonecutter", "stonecutter_block",
  "grindstone", "composter", "barrel", "chest", "trapped_chest", "ender_chest",
  "beehive", "bee_nest", "campfire", "soul_campfire", "lantern", "soul_lantern",
  "bell", "anvil", "chipped_anvil", "damaged_anvil", "enchanting_table", "brewing_stand",
  "cauldron", "beacon", "conduit", "jukebox", "note_block", "bookshelf",
  "chiseled_bookshelf", "lectern", "flower_pot", "decorated_pot", "armor_stand",
  "end_rod", "torch", "soul_torch", "redstone_torch", "lever", "tripwire_hook",
  "ladder", "vine", "cobweb", "sea_pickle", "turtle_egg", "sniffer_egg", "frogspawn",
  "ochre_froglight", "verdant_froglight", "pearlescent_froglight",
  "mud_bricks", "packed_mud", "muddy_mangrove_roots", "copper_ore", "deepslate_copper_ore");

// ---------------------------------------------------------------- BAKIR AILESI
const BAKIR_ASAMA = ["", "exposed_", "weathered_", "oxidized_"];
const BAKIR_GOVDE = ["copper_block", "cut_copper", "cut_copper_stairs", "cut_copper_slab",
  "chiseled_copper", "copper_grate", "copper_bulb", "copper_door", "copper_trapdoor", "copper"];
for (const mum of ["", "waxed_"]) for (const a of BAKIR_ASAMA) for (const g of BAKIR_GOVDE) at(mum + a + g);
at("copper_ingot", "raw_copper", "copper_nugget", "lightning_rod", "copper_chest");

// ---------------------------------------------------------------- CEVHER
const CEVHERLI = ["coal", "iron", "copper", "gold", "redstone", "lapis", "diamond", "emerald"];
carp(CEVHERLI, ["_ore"]);
for (const c of CEVHERLI) at(`deepslate_${c}_ore`);
at("netherbrick", "nether_gold_ore", "nether_quartz_ore", "quartz_ore", "coal_block", "iron_block",
  "gold_block", "diamond_block", "emerald_block", "lapis_block", "redstone_block",
  "copper_block", "amethyst_block", "netherite_block",
  "coal", "charcoal", "raw_iron", "raw_gold", "raw_copper", "iron_ingot", "gold_ingot",
  "iron_nugget", "gold_nugget", "diamond", "emerald", "quartz", "amethyst_shard",
  "netherite_scrap", "netherite_ingot", "echo_shard", "nether_star", "redstone", "lapis_lazuli");

// ---------------------------------------------------------------- ALET & ZIRH
carp(["wooden", "stone", "iron", "golden", "diamond", "netherite"],
  ["_sword", "_pickaxe", "_axe", "_shovel", "_hoe"]);
carp(["leather", "chainmail", "iron", "golden", "diamond", "netherite"],
  ["_helmet", "_chestplate", "_leggings", "_boots"]);
at("turtle_helmet", "elytra", "shield", "bow", "crossbow", "trident", "arrow",
  "spectral_arrow", "tipped_arrow", "fishing_rod", "flint_and_steel", "shears", "brush",
  "spyglass", "compass", "recovery_compass", "clock", "bucket", "carrot_on_a_stick",
  "warped_fungus_on_a_stick", "lead", "name_tag", "saddle", "wolf_armor",
  "leather_horse_armor", "iron_horse_armor", "golden_horse_armor", "diamond_horse_armor",
  "totem_of_undying", "goat_horn", "mace", "wind_charge", "firework_rocket", "firework_star",
  "fire_charge", "flint", "string", "stick", "bowl", "paper", "book", "writable_book",
  "written_book", "enchanted_book", "experience_bottle", "glass_bottle", "empty_map",
  "map", "filled_map", "ender_eye", "ender_pearl", "blaze_powder", "blaze_rod",
  "brewing_stand", "nether_wart", "ghast_tear", "magma_cream", "fermented_spider_eye",
  "glistering_melon_slice", "golden_carrot", "rabbit_foot", "phantom_membrane",
  "dragon_breath", "potion", "splash_potion", "lingering_potion", "honey_bottle",
  "milk_bucket", "water_bucket", "lava_bucket", "powder_snow_bucket", "cod_bucket",
  "salmon_bucket", "tropical_fish_bucket", "pufferfish_bucket", "axolotl_bucket",
  "tadpole_bucket", "bundle", "trial_key", "ominous_trial_key", "ominous_bottle",
  "breeze_rod", "heavy_core", "flow_banner_pattern", "guster_banner_pattern",
  "field_masoned_banner_pattern", "bordure_indented_banner_pattern",
  "creeper_banner_pattern", "skull_banner_pattern", "flower_banner_pattern",
  "mojang_banner_pattern", "globe_banner_pattern", "piglin_banner_pattern");

// zirh susleme sablonlari
carp(["sentry", "dune", "coast", "wild", "ward", "eye", "vex", "tide", "snout", "rib",
  "spire", "wayfinder", "shaper", "silence", "raiser", "host", "flow", "bolt"],
  ["_armor_trim_smithing_template"]);
at("netherite_upgrade_smithing_template");

// canak kirintlari
carp(["angler", "archer", "arms_up", "blade", "brewer", "burn", "danger", "explorer",
  "flow", "friend", "guster", "heart", "heartbreak", "howl", "miner", "mourner",
  "plenty", "prize", "scrape", "sheaf", "shelter", "skull", "snort"], ["_pottery_sherd"]);

// ---------------------------------------------------------------- YIYECEK & TARIM
at("wheat", "wheat_seeds", "beetroot", "beetroot_seeds", "beetroot_soup", "carrot",
  "potato", "baked_potato", "poisonous_potato", "melon_slice", "melon_block", "melon_seeds",
  "pumpkin", "carved_pumpkin", "lit_pumpkin", "jack_o_lantern", "pumpkin_seeds", "pumpkin_pie",
  "sugar_cane", "sugar", "cake", "cookie", "bread", "apple", "golden_apple",
  "enchanted_golden_apple", "sweet_berries", "glow_berries", "cactus", "kelp", "dried_kelp",
  "torchflower", "torchflower_seeds", "pitcher_plant", "pitcher_pod", "egg", "brown_egg",
  "blue_egg", "turtle_scute", "scute", "armadillo_scute", "mushroom_stew", "rabbit_stew",
  "suspicious_stew", "beef", "cooked_beef", "porkchop", "cooked_porkchop", "chicken",
  "cooked_chicken", "mutton", "cooked_mutton", "rabbit", "cooked_rabbit", "cod",
  "cooked_cod", "salmon", "cooked_salmon", "tropical_fish", "pufferfish", "rotten_flesh",
  "spider_eye", "chorus_fruit", "honeycomb", "sea_grass", "seagrass", "hay_block");

// ---------------------------------------------------------------- CICEK & BITKI
at("dandelion", "poppy", "blue_orchid", "allium", "azure_bluet", "red_tulip", "orange_tulip",
  "white_tulip", "pink_tulip", "oxeye_daisy", "cornflower", "lily_of_the_valley",
  "wither_rose", "sunflower", "lilac", "rose_bush", "peony", "tall_grass", "short_grass",
  "grass", "fern", "large_fern", "dead_bush", "lily_pad", "spore_blossom", "big_dripleaf",
  "small_dripleaf", "hanging_roots", "glow_lichen", "cave_vines", "twisting_vines",
  "weeping_vines", "sculk_vein", "brown_mushroom", "red_mushroom", "crimson_fungus",
  "warped_fungus", "nether_sprouts", "cactus_flower", "firefly_bush", "leaf_litter",
  "wildflowers", "bush", "short_dry_grass", "tall_dry_grass", "dry_short_grass", "dry_tall_grass");

// ---------------------------------------------------------------- MERCAN
const MERCAN = ["tube", "brain", "bubble", "fire", "horn"];
carp(MERCAN, ["_coral", "_coral_fan", "_coral_block"]);
carp(MERCAN.map(m => "dead_" + m), ["_coral", "_coral_fan", "_coral_block"]);
at("sea_pickle", "prismarine_shard", "prismarine_crystals", "nautilus_shell",
  "heart_of_the_sea", "sponge", "turtle_egg", "conduit");

// ---------------------------------------------------------------- KIRMIZI TAS
at("redstone", "redstone_block", "redstone_torch", "redstone_lamp", "repeater", "comparator",
  "piston", "sticky_piston", "observer", "dropper", "dispenser", "hopper", "lever",
  "daylight_detector", "tripwire_hook", "target", "lightning_rod", "tnt", "rail",
  "golden_rail", "powered_rail", "detector_rail", "activator_rail", "minecart",
  "chest_minecart", "furnace_minecart", "hopper_minecart", "tnt_minecart",
  "command_block_minecart", "iron_door", "iron_trapdoor", "note_block", "jukebox",
  "structure_void", "sculk_sensor", "calibrated_sculk_sensor", "copper_bulb",
  "trial_spawner", "vault", "conduit");

// ---------------------------------------------------------------- MOB DUSURMELERI
at("bone", "feather", "leather", "rabbit_hide", "gunpowder", "slime_ball", "ink_sac",
  "glow_ink_sac", "glowstone_dust", "blaze_rod", "shulker_shell", "phantom_membrane",
  "nether_star", "wither_skeleton_skull", "skeleton_skull", "zombie_head", "creeper_head",
  "dragon_head", "piglin_head", "player_head", "skull", "mob_head", "dragon_egg",
  "end_crystal", "elytra", "netherite_scrap", "echo_shard", "disc_fragment_5",
  "amethyst_shard", "prismarine_shard", "glow_frame", "frame", "item_frame",
  "glow_item_frame", "painting", "arrow", "saddle");

// ---------------------------------------------------------------- MUZIK
carp(["music_disc_"], ["13", "cat", "blocks", "chirp", "far", "mall", "mellohi", "stal",
  "strad", "ward", "11", "wait", "otherside", "5", "pigstep", "relic", "creator",
  "creator_music_box", "precipice", "tears", "lava_chicken"]);

// ---------------------------------------------------------------- DOGURMA YUMURTALARI
carp([
  "allay", "armadillo", "axolotl", "bat", "bee", "blaze", "bogged", "breeze", "camel",
  "cat", "cave_spider", "chicken", "cod", "cow", "creaking", "creeper", "dolphin",
  "donkey", "drowned", "elder_guardian", "enderman", "endermite", "evoker", "fox",
  "frog", "ghast", "glow_squid", "goat", "guardian", "happy_ghast", "hoglin", "horse",
  "husk", "iron_golem", "llama", "magma_cube", "mooshroom", "mule", "ocelot", "panda",
  "parrot", "phantom", "pig", "piglin", "piglin_brute", "pillager", "polar_bear",
  "pufferfish", "rabbit", "ravager", "salmon", "sheep", "shulker", "silverfish",
  "skeleton", "skeleton_horse", "slime", "sniffer", "snow_golem", "spider", "squid",
  "stray", "strider", "tadpole", "trader_llama", "tropical_fish", "turtle", "vex",
  "villager", "vindicator", "wandering_trader", "warden", "witch", "wither",
  "wither_skeleton", "wolf", "zoglin", "zombie", "zombie_horse", "zombie_villager",
  "zombified_piglin"
], ["_spawn_egg"]);

// ---------------------------------------------------------------- NETHER & END
at("netherrack", "nether_brick", "nether_bricks", "nether_wart", "nether_wart_block",
  "soul_sand", "soul_soil", "basalt", "blackstone", "glowstone", "shroudstone",
  "crimson_nylium", "warped_nylium", "ancient_debris", "lodestone", "respawn_anchor",
  "end_stone", "end_stone_bricks", "purpur_block", "purpur_pillar", "purpur_stairs",
  "purpur_slab", "end_rod", "chorus_plant", "chorus_flower", "shulker_box", "elytra",
  "dragon_head", "dragon_egg", "end_crystal", "obsidian", "crying_obsidian");

// ---------------------------------------------------------------- CESITLI
at("barrier", "structure_block", "jigsaw", "command_block", "light_block", "allow", "deny",
  "border_block", "chain_command_block", "repeating_command_block", "spawner", "mob_spawner",
  "monster_egg", "infested_stone", "infested_cobblestone", "infested_stone_bricks",
  "infested_deepslate", "sculk_shrieker", "trial_spawner", "vault", "bed", "banner",
  "cauldron", "flower_pot", "sign", "hanging_sign", "boat", "chest_boat", "oak_boat");

// ============ DISA ACILAN ============
let ONBELLEK = null;

// Tekrarsiz, "minecraft:" onekli aday listesi.
export function katalog() {
  if (ONBELLEK) return ONBELLEK;
  const k = new Set();
  for (const ham of L) {
    if (typeof ham !== "string") continue;
    const id = ham.trim();
    if (!id || id.includes(" ")) continue;
    k.add(id.includes(":") ? id : `minecraft:${id}`);
  }
  ONBELLEK = [...k];
  return ONBELLEK;
}

// ============ TURKCE ARAMA SOZLUGU ============
// Oyuncu "elmas" yazinca "diamond" bulunsun diye. Arama hem id hem de bu
// sozlukten cevrilen karsilik uzerinde calisir.
// Deger tek bir karsilik ya da karsilik dizisi olabilir.
export const ARAMA_SOZLUK = {
  elmas: "diamond", zumrut: "emerald", zümrüt: "emerald", altin: "gold", altın: "gold",
  demir: "iron", bakir: "copper", bakır: "copper", komur: "coal", kömür: "coal",
  kizil: "redstone", kızıl: "redstone", kirmizitas: "redstone", lapis: "lapis",
  netherit: "netherite", kuvars: "quartz", ametist: "amethyst", cevher: "ore",
  kulce: "ingot", külçe: "ingot", blok: "block", tas: "stone", taş: "stone",
  toprak: "dirt", cimen: "grass", çimen: "grass", kum: "sand", cakil: "gravel",
  kil: "clay", odun: "log", agac: "wood", ağaç: "wood", tahta: "planks",
  kutuk: "log", kütük: "log", yaprak: "leaves", fidan: "sapling",
  merdiven: "stairs", basamak: "stairs", plaka: "slab", duvar: "wall", cit: "fence",
  çit: "fence", kapi: "door", kapı: "door", kapak: "trapdoor", dugme: "button",
  düğme: "button", tabela: "sign", camur: "mud", çamur: "mud", tugla: "brick",
  tuğla: "brick", cam: "glass", yun: "wool", yün: "wool", hali: "carpet",
  halı: "carpet", yatak: "bed", bayrak: "banner", boya: "dye", beton: "concrete",
  seramik: "terracotta", mum: "candle", sandik: "chest", sandık: "chest",
  firin: "furnace", fırın: "furnace", masa: "table", kitap: "book", kitaplik: "bookshelf",
  kilic: "sword", kılıç: "sword", kazma: "pickaxe", balta: "axe", kurek: "shovel",
  kürek: "shovel", capa: "hoe", çapa: "hoe", yay: "bow", ok: "arrow",
  kalkan: "shield", zirh: "helmet", zırh: "helmet", kask: "helmet", gogus: "chestplate",
  göğüs: "chestplate", pantolon: "leggings", bot: "boots", cizme: "boots", çizme: "boots",
  olta: "fishing_rod", makas: "shears", kova: "bucket", pusula: "compass", saat: "clock",
  dürbün: "spyglass", durbun: "spyglass", iksir: "potion", iksır: "potion",
  ekmek: "bread", elma: "apple", et: "beef", tavuk: "chicken", domuz: ["porkchop", "pig"],
  koyun: ["mutton", "sheep"], tavsan: "rabbit", tavşan: "rabbit", balik: "fish", balık: "fish",
  somon: "salmon", morina: "cod", pasta: "cake", kurabiye: "cookie", corba: "stew",
  çorba: "stew", bugday: "wheat", buğday: "wheat", havuc: "carrot", havuç: "carrot",
  patates: "potato", pancar: "beetroot", kabak: "pumpkin", karpuz: "melon",
  seker: "sugar", şeker: "sugar", mantar: "mushroom", tohum: "seeds", cicek: "flower",
  çiçek: "flower", gul: "rose", gül: "rose", kaktus: "cactus", kaktüs: "cactus",
  bambu: "bamboo", yumurta: "egg", dogurma: "spawn_egg", doğurma: "spawn_egg",
  kemik: "bone", ip: "string", tuy: "feather", tüy: "feather", deri: "leather",
  barut: "gunpowder", balcik: "slime", balçık: "slime", inci: "ender_pearl",
  ender: "ender", canavar: "spawn_egg", mob: "spawn_egg",
  ates: "fire", ateş: "fire", mesale: "torch", meşale: "torch", fener: "lantern",
  lamba: "lamp", kandil: "lantern", ray: "rail", vagon: "minecart", piston: "piston",
  huni: "hopper", firlatici: "dispenser", fırlatıcı: "dispenser", kule: "beacon",
  ors: "anvil", örs: "anvil", buyu: "enchanting", büyü: "enchanting",
  plak: "music_disc", muzik: "music_disc", müzik: "music_disc",
  buz: "ice", kar: "snow", su: "water", lav: "lava", sunger: "sponge", sünger: "sponge",
  mercan: "coral", deniz: "sea", kabuk: "shell", kalp: "heart", yildiz: "star",
  yıldız: "star", ejderha: "dragon", kafa: "head", kurukafa: "skull",
  havai: "firework", fisek: "firework", fişek: "firework", tnt: "tnt", bomba: "tnt",
  cerceve: "item_frame", çerçeve: "item_frame", tablo: "painting", saksi: "flower_pot",
  saksı: "flower_pot", zincir: "chain", parmaklik: "iron_bars", parmaklık: "iron_bars",
  merdivenli: "ladder", ip_merdiven: "ladder", agkurdu: "cobweb", ag: "cobweb",
  koltuk: "chest", varil: "barrel", kazan: "cauldron", sise: "bottle", şişe: "bottle",
  bal: "honey", petek: "honeycomb", ari: "bee", arı: "bee", kovan: "beehive",

  // agac turleri
  mese: "oak", meşe: "oak", ladin: "spruce", hus: "birch", huş: "birch",
  orman: "jungle", akasya: "acacia", koyu: "dark_oak", karanlik: "dark_oak",
  karanlık: "dark_oak", mangrov: "mangrove", kiraz: "cherry", solgun: "pale_oak",
  kizilagac: "crimson", kızılağaç: "crimson", carpik: "warped", çarpık: "warped",

  // renkler
  beyaz: "white", siyah: "black", kirmizi: "red", kırmızı: "red", mavi: "blue",
  yesil: "green", yeşil: "green", sari: "yellow", sarı: "yellow",
  turuncu: "orange", mor: "purple", pembe: "pink", gri: "gray",
  kahverengi: "brown", kahve: "brown", eflatun: "magenta", turkuaz: "cyan",
  acikmavi: "light_blue", acik: "light", açık: "light", limon: "lime",
  yesilimsi: "lime", gumus: "light_gray", gümüş: "light_gray",

  // mob adlari (dogurma yumurtalari icin)
  inek: "cow", zombi: "zombie", iskelet: "skeleton", orumcek: "spider",
  örümcek: "spider", yaratik: "creeper", yaratık: "creeper", creeper: "creeper",
  ejder: "dragon", kurt: "wolf", kopek: "wolf", köpek: "wolf", kedi: "cat",
  at: "horse", esek: "donkey", eşek: "donkey", katir: "mule", katır: "mule",
  lama: "llama", ayi: "polar_bear", ayı: "polar_bear", tilki: "fox",
  panda: "panda", papagan: "parrot", papağan: "parrot", kaplumbaga: "turtle",
  kaplumbağa: "turtle", yarasa: "bat", kurbaga: "frog", kurbağa: "frog",
  keci: "goat", keçi: "goat", deve: "camel", golem: "iron_golem",
  koylu: "villager", köylü: "villager", cadi: "witch", cadı: "witch",
  hayalet: "ghast", denizanasi: "squid", muhafiz: "guardian",
  wither: "wither", warden: "warden", enderman: "enderman"
};

// Bir arama metnini kelime gruplarina cevirir.
// Her grup bir kelimenin olasi karsiliklarini tutar; eslesme icin HER
// grubun en az bir karsiligi id icinde gecmelidir.
// "beyaz yun" -> [["beyaz","white"], ["yun","wool"]] -> white_wool bulunur.
// "yumurtasi" -> "yumurta" gibi Turkce ekleri kirparak sozlukte arar.
function karsiliklar(kelime) {
  const v = ARAMA_SOZLUK[kelime];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

// "yumurtasi" -> "yumurta" gibi Turkce ekleri kirparak sozlukte arar.
function kokBul(kelime) {
  for (let i = 1; i <= 4 && kelime.length - i >= 3; i++) {
    const c = karsiliklar(kelime.slice(0, kelime.length - i));
    if (c.length) return c;
  }
  return [];
}

export function aramaGruplari(metin) {
  const ham = String(metin ?? "").toLowerCase().trim();
  if (!ham) return [];
  const duz = ham.replace(/\s+/g, "_");
  const tam = karsiliklar(duz).concat(karsiliklar(ham));
  if (tam.length) return [[...new Set([...tam, duz])]];
  const gruplar = [];
  for (const kelime of ham.split(/[\s,]+/).filter(Boolean)) {
    const g = [kelime, ...karsiliklar(kelime)];
    if (g.length === 1) g.push(...kokBul(kelime));
    gruplar.push([...new Set(g)]);
  }
  return gruplar;
}
