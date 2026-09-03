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

// ---------------------------------------------------------------------------
// 1) RESMI LISTE
// Mojang'in kendi metadata dosyasindan (bedrock-samples/metadata/
// vanilladata_modules/mojang-items.json) uretilmistir: oyunun TUM vanilla
// esya id'leri. Bedrock'ta bircok id tahmin edilemez (mese kapisi
// "oak_door" degil "wooden_door", yatak "white_bed" degil "bed"), o yuzden
// bu listeyi tahminle degil kaynaktan aliyoruz.
// Guncellemek icin: yeni mojang-items.json'daki adlari buraya yaz.
// >>> VANILLA_BASLA (katalog_guncelle.py bu blogu yeniden yazar)
const VANILLA = [
  "acacia_boat acacia_button acacia_chest_boat acacia_door acacia_fence acacia_fence_gate",
  "acacia_hanging_sign acacia_leaves acacia_log acacia_planks acacia_pressure_plate acacia_sapling",
  "acacia_shelf acacia_sign acacia_slab acacia_stairs acacia_trapdoor acacia_wood activator_rail",
  "allay_spawn_egg allium allow amethyst_block amethyst_cluster amethyst_shard ancient_debris andesite",
  "andesite_slab andesite_stairs andesite_wall angler_pottery_sherd anvil apple archer_pottery_sherd",
  "armadillo_scute armadillo_spawn_egg armor_stand arms_up_pottery_sherd arrow axolotl_bucket",
  "axolotl_spawn_egg azalea azalea_leaves azalea_leaves_flowered azure_bluet baked_potato bamboo",
  "bamboo_block bamboo_button bamboo_chest_raft bamboo_door bamboo_fence bamboo_fence_gate",
  "bamboo_hanging_sign bamboo_mosaic bamboo_mosaic_slab bamboo_mosaic_stairs bamboo_planks",
  "bamboo_pressure_plate bamboo_raft bamboo_shelf bamboo_sign bamboo_slab bamboo_stairs bamboo_trapdoor",
  "banner barrel barrier basalt bat_spawn_egg beacon bed bedrock bee_nest bee_spawn_egg beef beehive",
  "beetroot beetroot_seeds beetroot_soup bell big_dripleaf birch_boat birch_button birch_chest_boat",
  "birch_door birch_fence birch_fence_gate birch_hanging_sign birch_leaves birch_log birch_planks",
  "birch_pressure_plate birch_sapling birch_shelf birch_sign birch_slab birch_stairs birch_trapdoor",
  "birch_wood black_bundle black_candle black_carpet black_concrete black_concrete_powder black_cushion",
  "black_dye black_glazed_terracotta black_harness black_shulker_box black_stained_glass",
  "black_stained_glass_pane black_terracotta black_wool black_wool_double_slab black_wool_slab",
  "black_wool_stairs blackstone blackstone_slab blackstone_stairs blackstone_wall blade_pottery_sherd",
  "blast_furnace blaze_powder blaze_rod blaze_spawn_egg blue_bundle blue_candle blue_carpet blue_concrete",
  "blue_concrete_powder blue_cushion blue_dye blue_egg blue_glazed_terracotta blue_harness blue_ice",
  "blue_orchid blue_shulker_box blue_stained_glass blue_stained_glass_pane blue_terracotta blue_wool",
  "blue_wool_double_slab blue_wool_slab blue_wool_stairs bogged_spawn_egg bolt_armor_trim_smithing_template",
  "bone bone_block bone_meal book bookshelf border_block bordure_indented_banner_pattern bow bowl",
  "brain_coral brain_coral_block brain_coral_fan bread breeze_rod breeze_spawn_egg brewer_pottery_sherd",
  "brewing_stand brick brick_block brick_slab brick_stairs brick_wall brown_bundle brown_candle",
  "brown_carpet brown_concrete brown_concrete_powder brown_cushion brown_dye brown_egg",
  "brown_glazed_terracotta brown_harness brown_mushroom brown_mushroom_block brown_shulker_box",
  "brown_stained_glass brown_stained_glass_pane brown_terracotta brown_wool brown_wool_double_slab",
  "brown_wool_slab brown_wool_stairs brush bubble_coral bubble_coral_block bubble_coral_fan bucket",
  "budding_amethyst bundle burn_pottery_sherd bush cactus cactus_flower cake calcite",
  "calibrated_sculk_sensor camel_husk_spawn_egg camel_spawn_egg campfire candle carrot carrot_on_a_stick",
  "cartography_table carved_pumpkin cat_spawn_egg cauldron cave_spider_spawn_egg chain_command_block",
  "chainmail_boots chainmail_chestplate chainmail_helmet chainmail_leggings charcoal cherry_boat",
  "cherry_button cherry_chest_boat cherry_door cherry_fence cherry_fence_gate cherry_hanging_sign",
  "cherry_leaves cherry_log cherry_planks cherry_pressure_plate cherry_sapling cherry_shelf cherry_sign",
  "cherry_slab cherry_stairs cherry_trapdoor cherry_wood chest chest_minecart chicken chicken_spawn_egg",
  "chipped_anvil chiseled_bookshelf chiseled_cinnabar chiseled_copper chiseled_deepslate",
  "chiseled_nether_bricks chiseled_polished_blackstone chiseled_quartz_block chiseled_red_sandstone",
  "chiseled_resin_bricks chiseled_sandstone chiseled_stone_bricks chiseled_sulfur chiseled_tuff",
  "chiseled_tuff_bricks chorus_flower chorus_fruit chorus_plant cinnabar cinnabar_brick_slab",
  "cinnabar_brick_stairs cinnabar_brick_wall cinnabar_bricks cinnabar_slab cinnabar_stairs cinnabar_wall",
  "clay clay_ball clock closed_eyeblossom coal coal_block coal_ore coarse_dirt",
  "coast_armor_trim_smithing_template cobbled_deepslate cobbled_deepslate_slab cobbled_deepslate_stairs",
  "cobbled_deepslate_wall cobblestone cobblestone_slab cobblestone_wall cocoa_beans cod cod_bucket",
  "cod_spawn_egg command_block command_block_minecart comparator compass composter conduit cooked_beef",
  "cooked_chicken cooked_cod cooked_mutton cooked_porkchop cooked_rabbit cooked_salmon cookie copper_axe",
  "copper_bars copper_block copper_boots copper_bulb copper_chain copper_chest copper_chestplate",
  "copper_door copper_golem_spawn_egg copper_golem_statue copper_grate copper_helmet copper_hoe",
  "copper_horse_armor copper_ingot copper_lantern copper_leggings copper_nautilus_armor copper_nugget",
  "copper_ore copper_pickaxe copper_shovel copper_spear copper_sword copper_torch copper_trapdoor",
  "cornflower cow_spawn_egg cracked_deepslate_bricks cracked_deepslate_tiles cracked_nether_bricks",
  "cracked_polished_blackstone_bricks cracked_stone_bricks crafter crafting_table creaking_heart",
  "creaking_spawn_egg creeper_banner_pattern creeper_head creeper_spawn_egg crimson_button crimson_door",
  "crimson_fence crimson_fence_gate crimson_fungus crimson_hanging_sign crimson_hyphae crimson_nylium",
  "crimson_planks crimson_pressure_plate crimson_roots crimson_shelf crimson_sign crimson_slab",
  "crimson_stairs crimson_stem crimson_trapdoor crossbow crying_obsidian cut_copper cut_copper_slab",
  "cut_copper_stairs cut_red_sandstone cut_red_sandstone_slab cut_sandstone cut_sandstone_slab cyan_bundle",
  "cyan_candle cyan_carpet cyan_concrete cyan_concrete_powder cyan_cushion cyan_dye cyan_glazed_terracotta",
  "cyan_harness cyan_shulker_box cyan_stained_glass cyan_stained_glass_pane cyan_terracotta cyan_wool",
  "cyan_wool_double_slab cyan_wool_slab cyan_wool_stairs damaged_anvil dandelion danger_pottery_sherd",
  "dark_oak_boat dark_oak_button dark_oak_chest_boat dark_oak_door dark_oak_fence dark_oak_fence_gate",
  "dark_oak_hanging_sign dark_oak_leaves dark_oak_log dark_oak_planks dark_oak_pressure_plate",
  "dark_oak_sapling dark_oak_shelf dark_oak_sign dark_oak_slab dark_oak_stairs dark_oak_trapdoor",
  "dark_oak_wood dark_prismarine dark_prismarine_slab dark_prismarine_stairs daylight_detector",
  "dead_brain_coral dead_brain_coral_block dead_brain_coral_fan dead_bubble_coral dead_bubble_coral_block",
  "dead_bubble_coral_fan dead_fire_coral dead_fire_coral_block dead_fire_coral_fan dead_horn_coral",
  "dead_horn_coral_block dead_horn_coral_fan dead_tube_coral dead_tube_coral_block dead_tube_coral_fan",
  "deadbush decorated_pot deepslate deepslate_brick_slab deepslate_brick_stairs deepslate_brick_wall",
  "deepslate_bricks deepslate_coal_ore deepslate_copper_ore deepslate_diamond_ore deepslate_emerald_ore",
  "deepslate_gold_ore deepslate_iron_ore deepslate_lapis_ore deepslate_redstone_ore deepslate_tile_slab",
  "deepslate_tile_stairs deepslate_tile_wall deepslate_tiles deny detector_rail diamond diamond_axe",
  "diamond_block diamond_boots diamond_chestplate diamond_helmet diamond_hoe diamond_horse_armor",
  "diamond_leggings diamond_nautilus_armor diamond_ore diamond_pickaxe diamond_shovel diamond_spear",
  "diamond_sword diorite diorite_slab diorite_stairs diorite_wall dirt dirt_with_roots disc_fragment_5",
  "dispenser dolphin_spawn_egg donkey_spawn_egg dragon_breath dragon_egg dragon_head dried_ghast dried_kelp",
  "dried_kelp_block dripstone_block dropper drowned_spawn_egg dune_armor_trim_smithing_template echo_shard",
  "egg elder_guardian_spawn_egg elytra emerald emerald_block emerald_ore empty_map enchanted_book",
  "enchanted_golden_apple enchanting_table end_brick_stairs end_bricks end_crystal end_portal_frame end_rod",
  "end_stone end_stone_brick_slab end_stone_brick_wall ender_chest ender_dragon_spawn_egg ender_eye",
  "ender_pearl enderman_spawn_egg endermite_spawn_egg evoker_spawn_egg experience_bottle",
  "explorer_pottery_sherd exposed_chiseled_copper exposed_copper exposed_copper_bars exposed_copper_bulb",
  "exposed_copper_chain exposed_copper_chest exposed_copper_door exposed_copper_golem_statue",
  "exposed_copper_grate exposed_copper_lantern exposed_copper_trapdoor exposed_cut_copper",
  "exposed_cut_copper_slab exposed_cut_copper_stairs exposed_lightning_rod eye_armor_trim_smithing_template",
  "farmland feather fence_gate fermented_spider_eye fern field_masoned_banner_pattern filled_map",
  "fire_charge fire_coral fire_coral_block fire_coral_fan firefly_bush firework_rocket firework_star",
  "fishing_rod fletching_table flint flint_and_steel flow_armor_trim_smithing_template flow_banner_pattern",
  "flow_pottery_sherd flower_banner_pattern flower_pot flowering_azalea fox_spawn_egg frame",
  "friend_pottery_sherd frog_spawn frog_spawn_egg frosted_ice furnace ghast_spawn_egg ghast_tear",
  "gilded_blackstone glass glass_bottle glass_pane glistering_melon_slice globe_banner_pattern glow_berries",
  "glow_frame glow_ink_sac glow_lichen glow_squid_spawn_egg glowstone glowstone_dust goat_horn",
  "goat_spawn_egg gold_block gold_ingot gold_nugget gold_ore golden_apple golden_axe golden_boots",
  "golden_carrot golden_chestplate golden_dandelion golden_helmet golden_hoe golden_horse_armor",
  "golden_leggings golden_nautilus_armor golden_pickaxe golden_rail golden_shovel golden_spear golden_sword",
  "granite granite_slab granite_stairs granite_wall grass_block grass_path gravel gray_bundle gray_candle",
  "gray_carpet gray_concrete gray_concrete_powder gray_cushion gray_dye gray_glazed_terracotta gray_harness",
  "gray_shulker_box gray_stained_glass gray_stained_glass_pane gray_terracotta gray_wool",
  "gray_wool_double_slab gray_wool_slab gray_wool_stairs green_bundle green_candle green_carpet",
  "green_concrete green_concrete_powder green_cushion green_dye green_glazed_terracotta green_harness",
  "green_shulker_box green_stained_glass green_stained_glass_pane green_terracotta green_wool",
  "green_wool_double_slab green_wool_slab green_wool_stairs grindstone guardian_spawn_egg gunpowder",
  "guster_banner_pattern guster_pottery_sherd hanging_roots happy_ghast_spawn_egg hardened_clay hay_block",
  "heart_of_the_sea heart_pottery_sherd heartbreak_pottery_sherd heavy_core heavy_weighted_pressure_plate",
  "hoglin_spawn_egg honey_block honey_bottle honeycomb honeycomb_block hopper hopper_minecart horn_coral",
  "horn_coral_block horn_coral_fan horse_spawn_egg host_armor_trim_smithing_template howl_pottery_sherd",
  "husk_spawn_egg ice infested_chiseled_stone_bricks infested_cobblestone infested_cracked_stone_bricks",
  "infested_deepslate infested_mossy_stone_bricks infested_stone infested_stone_bricks ink_sac iron_axe",
  "iron_bars iron_block iron_boots iron_chain iron_chestplate iron_door iron_golem_spawn_egg iron_helmet",
  "iron_hoe iron_horse_armor iron_ingot iron_leggings iron_nautilus_armor iron_nugget iron_ore iron_pickaxe",
  "iron_shovel iron_spear iron_sword iron_trapdoor jigsaw jukebox jungle_boat jungle_button",
  "jungle_chest_boat jungle_door jungle_fence jungle_fence_gate jungle_hanging_sign jungle_leaves",
  "jungle_log jungle_planks jungle_pressure_plate jungle_sapling jungle_shelf jungle_sign jungle_slab",
  "jungle_stairs jungle_trapdoor jungle_wood kelp ladder lantern lapis_block lapis_lazuli lapis_ore",
  "large_amethyst_bud large_fern lava_bucket lead leaf_litter leather leather_boots leather_chestplate",
  "leather_helmet leather_horse_armor leather_leggings lectern lever light_block_0 light_block_1",
  "light_block_10 light_block_11 light_block_12 light_block_13 light_block_14 light_block_15 light_block_2",
  "light_block_3 light_block_4 light_block_5 light_block_6 light_block_7 light_block_8 light_block_9",
  "light_blue_bundle light_blue_candle light_blue_carpet light_blue_concrete light_blue_concrete_powder",
  "light_blue_cushion light_blue_dye light_blue_glazed_terracotta light_blue_harness light_blue_shulker_box",
  "light_blue_stained_glass light_blue_stained_glass_pane light_blue_terracotta light_blue_wool",
  "light_blue_wool_double_slab light_blue_wool_slab light_blue_wool_stairs light_gray_bundle",
  "light_gray_candle light_gray_carpet light_gray_concrete light_gray_concrete_powder light_gray_cushion",
  "light_gray_dye light_gray_harness light_gray_shulker_box light_gray_stained_glass",
  "light_gray_stained_glass_pane light_gray_terracotta light_gray_wool light_gray_wool_double_slab",
  "light_gray_wool_slab light_gray_wool_stairs light_weighted_pressure_plate lightning_rod lilac",
  "lily_of_the_valley lime_bundle lime_candle lime_carpet lime_concrete lime_concrete_powder lime_cushion",
  "lime_dye lime_glazed_terracotta lime_harness lime_shulker_box lime_stained_glass lime_stained_glass_pane",
  "lime_terracotta lime_wool lime_wool_double_slab lime_wool_slab lime_wool_stairs lingering_potion",
  "lit_pumpkin llama_spawn_egg lodestone lodestone_compass loom mace magenta_bundle magenta_candle",
  "magenta_carpet magenta_concrete magenta_concrete_powder magenta_cushion magenta_dye",
  "magenta_glazed_terracotta magenta_harness magenta_shulker_box magenta_stained_glass",
  "magenta_stained_glass_pane magenta_terracotta magenta_wool magenta_wool_double_slab magenta_wool_slab",
  "magenta_wool_stairs magma magma_cream magma_cube_spawn_egg mangrove_boat mangrove_button",
  "mangrove_chest_boat mangrove_door mangrove_fence mangrove_fence_gate mangrove_hanging_sign",
  "mangrove_leaves mangrove_log mangrove_planks mangrove_pressure_plate mangrove_propagule mangrove_roots",
  "mangrove_shelf mangrove_sign mangrove_slab mangrove_stairs mangrove_trapdoor mangrove_wood",
  "medium_amethyst_bud melon_block melon_seeds melon_slice milk_bucket minecart miner_pottery_sherd",
  "mob_spawner mojang_banner_pattern mooshroom_spawn_egg moss_block moss_carpet mossy_cobblestone",
  "mossy_cobblestone_slab mossy_cobblestone_stairs mossy_cobblestone_wall mossy_stone_brick_slab",
  "mossy_stone_brick_stairs mossy_stone_brick_wall mossy_stone_bricks mourner_pottery_sherd mud",
  "mud_brick_slab mud_brick_stairs mud_brick_wall mud_bricks muddy_mangrove_roots mule_spawn_egg",
  "mushroom_stem mushroom_stew music_disc_11 music_disc_13 music_disc_5 music_disc_blocks music_disc_bounce",
  "music_disc_cat music_disc_chirp music_disc_creator music_disc_creator_music_box music_disc_far",
  "music_disc_lava_chicken music_disc_mall music_disc_mellohi music_disc_otherside music_disc_pigstep",
  "music_disc_precipice music_disc_relic music_disc_stal music_disc_strad music_disc_tears music_disc_wait",
  "music_disc_ward mutton mycelium name_tag nautilus_shell nautilus_spawn_egg nether_brick",
  "nether_brick_fence nether_brick_slab nether_brick_stairs nether_brick_wall nether_gold_ore",
  "nether_sprouts nether_star nether_wart nether_wart_block netherbrick netherite_axe netherite_block",
  "netherite_boots netherite_chestplate netherite_helmet netherite_hoe netherite_horse_armor",
  "netherite_ingot netherite_leggings netherite_nautilus_armor netherite_pickaxe netherite_scrap",
  "netherite_shovel netherite_spear netherite_sword netherite_upgrade_smithing_template netherrack",
  "normal_stone_slab normal_stone_stairs noteblock oak_boat oak_chest_boat oak_fence oak_hanging_sign",
  "oak_leaves oak_log oak_planks oak_sapling oak_shelf oak_sign oak_slab oak_stairs oak_wood observer",
  "obsidian ocelot_spawn_egg ochre_froglight ominous_bottle ominous_trial_key open_eyeblossom orange_bundle",
  "orange_candle orange_carpet orange_concrete orange_concrete_powder orange_cushion orange_dye",
  "orange_glazed_terracotta orange_harness orange_poplar_leaves orange_shulker_box orange_stained_glass",
  "orange_stained_glass_pane orange_terracotta orange_tulip orange_wool orange_wool_double_slab",
  "orange_wool_slab orange_wool_stairs oxeye_daisy oxidized_chiseled_copper oxidized_copper",
  "oxidized_copper_bars oxidized_copper_bulb oxidized_copper_chain oxidized_copper_chest",
  "oxidized_copper_door oxidized_copper_golem_statue oxidized_copper_grate oxidized_copper_lantern",
  "oxidized_copper_trapdoor oxidized_cut_copper oxidized_cut_copper_slab oxidized_cut_copper_stairs",
  "oxidized_lightning_rod packed_ice packed_mud painting pale_hanging_moss pale_moss_block pale_moss_carpet",
  "pale_oak_boat pale_oak_button pale_oak_chest_boat pale_oak_door pale_oak_fence pale_oak_fence_gate",
  "pale_oak_hanging_sign pale_oak_leaves pale_oak_log pale_oak_planks pale_oak_pressure_plate",
  "pale_oak_sapling pale_oak_shelf pale_oak_sign pale_oak_slab pale_oak_stairs pale_oak_trapdoor",
  "pale_oak_wood panda_spawn_egg paper parched_spawn_egg parrot_spawn_egg pearlescent_froglight peony",
  "petrified_oak_slab phantom_membrane phantom_spawn_egg pig_spawn_egg piglin_banner_pattern",
  "piglin_brute_spawn_egg piglin_head piglin_spawn_egg pillager_spawn_egg pink_bundle pink_candle",
  "pink_carpet pink_concrete pink_concrete_powder pink_cushion pink_dye pink_glazed_terracotta pink_harness",
  "pink_petals pink_shulker_box pink_stained_glass pink_stained_glass_pane pink_terracotta pink_tulip",
  "pink_wool pink_wool_double_slab pink_wool_slab pink_wool_stairs piston pitcher_plant pitcher_pod",
  "player_head plenty_pottery_sherd podzol pointed_dripstone poisonous_potato polar_bear_spawn_egg",
  "polished_andesite polished_andesite_slab polished_andesite_stairs polished_basalt polished_blackstone",
  "polished_blackstone_brick_slab polished_blackstone_brick_stairs polished_blackstone_brick_wall",
  "polished_blackstone_bricks polished_blackstone_button polished_blackstone_pressure_plate",
  "polished_blackstone_slab polished_blackstone_stairs polished_blackstone_wall polished_cinnabar",
  "polished_cinnabar_slab polished_cinnabar_stairs polished_cinnabar_wall polished_deepslate",
  "polished_deepslate_slab polished_deepslate_stairs polished_deepslate_wall polished_diorite",
  "polished_diorite_slab polished_diorite_stairs polished_granite polished_granite_slab",
  "polished_granite_stairs polished_sulfur polished_sulfur_slab polished_sulfur_stairs polished_sulfur_wall",
  "polished_tuff polished_tuff_slab polished_tuff_stairs polished_tuff_wall poplar_boat poplar_button",
  "poplar_chest_boat poplar_door poplar_fence poplar_fence_gate poplar_hanging_sign poplar_log",
  "poplar_planks poplar_pressure_plate poplar_sapling poplar_shelf poplar_sign poplar_slab poplar_stairs",
  "poplar_trapdoor poplar_wood popped_chorus_fruit poppy porkchop potato potent_sulfur potion",
  "powder_snow_bucket prismarine prismarine_brick_slab prismarine_bricks prismarine_bricks_stairs",
  "prismarine_crystals prismarine_shard prismarine_slab prismarine_stairs prismarine_wall",
  "prize_pottery_sherd pufferfish pufferfish_bucket pufferfish_spawn_egg pumpkin pumpkin_pie pumpkin_seeds",
  "purple_bundle purple_candle purple_carpet purple_concrete purple_concrete_powder purple_cushion",
  "purple_dye purple_glazed_terracotta purple_harness purple_shulker_box purple_stained_glass",
  "purple_stained_glass_pane purple_terracotta purple_wool purple_wool_double_slab purple_wool_slab",
  "purple_wool_stairs purpur_block purpur_pillar purpur_slab purpur_stairs quartz quartz_block",
  "quartz_bricks quartz_ore quartz_pillar quartz_slab quartz_stairs rabbit rabbit_foot rabbit_hide",
  "rabbit_spawn_egg rabbit_stew rail raiser_armor_trim_smithing_template ravager_spawn_egg raw_copper",
  "raw_copper_block raw_gold raw_gold_block raw_iron raw_iron_block recovery_compass red_bundle red_candle",
  "red_carpet red_concrete red_concrete_powder red_cushion red_dye red_glazed_terracotta red_harness",
  "red_mushroom red_mushroom_block red_nether_brick red_nether_brick_slab red_nether_brick_stairs",
  "red_nether_brick_wall red_poplar_leaves red_sand red_sandstone red_sandstone_slab red_sandstone_stairs",
  "red_sandstone_wall red_shrub red_shulker_box red_stained_glass red_stained_glass_pane red_terracotta",
  "red_tulip red_wool red_wool_double_slab red_wool_slab red_wool_stairs redstone redstone_block",
  "redstone_lamp redstone_ore redstone_torch reinforced_deepslate repeater repeating_command_block",
  "resin_block resin_brick resin_brick_slab resin_brick_stairs resin_brick_wall resin_bricks resin_clump",
  "respawn_anchor rib_armor_trim_smithing_template rose_bush rotten_flesh saddle salmon salmon_bucket",
  "salmon_spawn_egg sand sandstone sandstone_slab sandstone_stairs sandstone_wall scaffolding",
  "scrape_pottery_sherd sculk sculk_catalyst sculk_sensor sculk_shrieker sculk_vein sea_lantern sea_pickle",
  "seagrass sentry_armor_trim_smithing_template shaper_armor_trim_smithing_template sheaf_pottery_sherd",
  "shears sheep_spawn_egg shelf_mushroom shelter_pottery_sherd shield short_dry_grass short_grass",
  "shroomlight shulker_shell shulker_spawn_egg silence_armor_trim_smithing_template",
  "silver_glazed_terracotta silverfish_spawn_egg skeleton_horse_spawn_egg skeleton_skull skeleton_spawn_egg",
  "skull_banner_pattern skull_pottery_sherd slime slime_ball slime_spawn_egg small_amethyst_bud",
  "small_dripleaf_block smithing_table smoker smooth_basalt smooth_quartz smooth_quartz_slab",
  "smooth_quartz_stairs smooth_red_sandstone smooth_red_sandstone_slab smooth_red_sandstone_stairs",
  "smooth_sandstone smooth_sandstone_slab smooth_sandstone_stairs smooth_stone smooth_stone_slab",
  "sniffer_egg sniffer_spawn_egg snort_pottery_sherd snout_armor_trim_smithing_template snow",
  "snow_golem_spawn_egg snow_layer snowball soul_campfire soul_lantern soul_sand soul_soil soul_torch",
  "spider_eye spider_spawn_egg spire_armor_trim_smithing_template splash_potion sponge spore_blossom",
  "spruce_boat spruce_button spruce_chest_boat spruce_door spruce_fence spruce_fence_gate",
  "spruce_hanging_sign spruce_leaves spruce_log spruce_planks spruce_pressure_plate spruce_sapling",
  "spruce_shelf spruce_sign spruce_slab spruce_stairs spruce_trapdoor spruce_wood spyglass squid_spawn_egg",
  "stick sticky_piston stone stone_axe stone_brick_slab stone_brick_stairs stone_brick_wall stone_bricks",
  "stone_button stone_hoe stone_pickaxe stone_pressure_plate stone_shovel stone_spear stone_stairs",
  "stone_sword stonecutter_block straw_bed stray_spawn_egg strider_spawn_egg string stripped_acacia_log",
  "stripped_acacia_wood stripped_bamboo_block stripped_birch_log stripped_birch_wood stripped_cherry_log",
  "stripped_cherry_wood stripped_crimson_hyphae stripped_crimson_stem stripped_dark_oak_log",
  "stripped_dark_oak_wood stripped_jungle_log stripped_jungle_wood stripped_mangrove_log",
  "stripped_mangrove_wood stripped_oak_log stripped_oak_wood stripped_pale_oak_log stripped_pale_oak_wood",
  "stripped_poplar_log stripped_poplar_wood stripped_spruce_log stripped_spruce_wood stripped_warped_hyphae",
  "stripped_warped_stem structure_block structure_void sugar sugar_cane sulfur sulfur_brick_slab",
  "sulfur_brick_stairs sulfur_brick_wall sulfur_bricks sulfur_cube_bucket sulfur_cube_spawn_egg sulfur_slab",
  "sulfur_spike sulfur_stairs sulfur_wall sunflower suspicious_gravel suspicious_sand suspicious_stew",
  "sweet_berries tadpole_bucket tadpole_spawn_egg tall_dry_grass tall_grass target",
  "tide_armor_trim_smithing_template tinted_glass tnt tnt_minecart torch torchflower torchflower_seeds",
  "totem_of_undying trader_llama_spawn_egg trapdoor trapped_chest trial_key trial_spawner trident",
  "tripwire_hook tropical_fish tropical_fish_bucket tropical_fish_spawn_egg tube_coral tube_coral_block",
  "tube_coral_fan tuff tuff_brick_slab tuff_brick_stairs tuff_brick_wall tuff_bricks tuff_slab tuff_stairs",
  "tuff_wall turtle_egg turtle_helmet turtle_scute turtle_spawn_egg twisting_vines undyed_shulker_box vault",
  "verdant_froglight vex_armor_trim_smithing_template vex_spawn_egg villager_spawn_egg vindicator_spawn_egg",
  "vine wandering_trader_spawn_egg ward_armor_trim_smithing_template warden_spawn_egg warped_button",
  "warped_door warped_fence warped_fence_gate warped_fungus warped_fungus_on_a_stick warped_hanging_sign",
  "warped_hyphae warped_nylium warped_planks warped_pressure_plate warped_roots warped_shelf warped_sign",
  "warped_slab warped_stairs warped_stem warped_trapdoor warped_wart_block water_bucket waterlily",
  "waxed_chiseled_copper waxed_copper waxed_copper_bars waxed_copper_bulb waxed_copper_chain",
  "waxed_copper_chest waxed_copper_door waxed_copper_golem_statue waxed_copper_grate waxed_copper_lantern",
  "waxed_copper_trapdoor waxed_cut_copper waxed_cut_copper_slab waxed_cut_copper_stairs",
  "waxed_exposed_chiseled_copper waxed_exposed_copper waxed_exposed_copper_bars waxed_exposed_copper_bulb",
  "waxed_exposed_copper_chain waxed_exposed_copper_chest waxed_exposed_copper_door",
  "waxed_exposed_copper_golem_statue waxed_exposed_copper_grate waxed_exposed_copper_lantern",
  "waxed_exposed_copper_trapdoor waxed_exposed_cut_copper waxed_exposed_cut_copper_slab",
  "waxed_exposed_cut_copper_stairs waxed_exposed_lightning_rod waxed_lightning_rod",
  "waxed_oxidized_chiseled_copper waxed_oxidized_copper waxed_oxidized_copper_bars",
  "waxed_oxidized_copper_bulb waxed_oxidized_copper_chain waxed_oxidized_copper_chest",
  "waxed_oxidized_copper_door waxed_oxidized_copper_golem_statue waxed_oxidized_copper_grate",
  "waxed_oxidized_copper_lantern waxed_oxidized_copper_trapdoor waxed_oxidized_cut_copper",
  "waxed_oxidized_cut_copper_slab waxed_oxidized_cut_copper_stairs waxed_oxidized_lightning_rod",
  "waxed_weathered_chiseled_copper waxed_weathered_copper waxed_weathered_copper_bars",
  "waxed_weathered_copper_bulb waxed_weathered_copper_chain waxed_weathered_copper_chest",
  "waxed_weathered_copper_door waxed_weathered_copper_golem_statue waxed_weathered_copper_grate",
  "waxed_weathered_copper_lantern waxed_weathered_copper_trapdoor waxed_weathered_cut_copper",
  "waxed_weathered_cut_copper_slab waxed_weathered_cut_copper_stairs waxed_weathered_lightning_rod",
  "wayfinder_armor_trim_smithing_template weathered_chiseled_copper weathered_copper weathered_copper_bars",
  "weathered_copper_bulb weathered_copper_chain weathered_copper_chest weathered_copper_door",
  "weathered_copper_golem_statue weathered_copper_grate weathered_copper_lantern weathered_copper_trapdoor",
  "weathered_cut_copper weathered_cut_copper_slab weathered_cut_copper_stairs weathered_lightning_rod web",
  "weeping_vines wet_sponge wheat wheat_seeds white_bundle white_candle white_carpet white_concrete",
  "white_concrete_powder white_cushion white_dye white_glazed_terracotta white_harness white_shulker_box",
  "white_stained_glass white_stained_glass_pane white_terracotta white_tulip white_wool",
  "white_wool_double_slab white_wool_slab white_wool_stairs wild_armor_trim_smithing_template wildflowers",
  "wind_charge witch_spawn_egg wither_rose wither_skeleton_skull wither_skeleton_spawn_egg wither_spawn_egg",
  "wolf_armor wolf_spawn_egg wooden_axe wooden_button wooden_door wooden_hoe wooden_pickaxe",
  "wooden_pressure_plate wooden_shovel wooden_spear wooden_sword writable_book yellow_bundle yellow_candle",
  "yellow_carpet yellow_concrete yellow_concrete_powder yellow_cushion yellow_dye yellow_glazed_terracotta",
  "yellow_harness yellow_poplar_leaves yellow_shulker_box yellow_stained_glass yellow_stained_glass_pane",
  "yellow_terracotta yellow_wool yellow_wool_double_slab yellow_wool_slab yellow_wool_stairs",
  "zoglin_spawn_egg zombie_head zombie_horse_spawn_egg zombie_nautilus_spawn_egg zombie_pigman_spawn_egg",
  "zombie_spawn_egg zombie_villager_spawn_egg"
].join(" ").split(" ");
// <<< VANILLA_BITTI

// ---------------------------------------------------------------------------
// 2) ESKI SURUM / TAKMA ADLAR
// Asagisi aile sablonlarindan uretilir. Resmi listede olmayan ama eski
// surumlerde bulunan id'leri (duzlestirme oncesi adlar) yakalamak icin var.
// Oyunda olmayan her aday zaten new ItemStack ile elenir.
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
  for (const ham of [...VANILLA, ...L]) {
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
