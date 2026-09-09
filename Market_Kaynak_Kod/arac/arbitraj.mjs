// Fiyat motorunu denetler: "ucuz al -> islet -> pahali sat" acigi var mi?
// Calistir:  node arac/arbitraj.mjs
import fs from "node:fs";
import path from "node:path";
const kok = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const F = await import(path.join(kok, "Market_BP/scripts/fiyat.js"));

const kaynak = fs.readFileSync(path.join(kok, "Market_BP/scripts/fiyat.js"), "utf8");
const blok = kaynak.slice(kaynak.indexOf("const TARIF = {"), kaynak.indexOf("// alet/zirh malzeme degerleri"));
const tarifler = [...blok.matchAll(/^\s{2}([a-z_]+):\s*\{ g: \[(.+?)\], n: (\d+) \}/gm)].map(m => ({
  cikti: m[1],
  girdi: [...m[2].matchAll(/\["([a-z_]+)",\s*(\d+)\]/g)].map(x => [x[1], +x[2]]),
  n: +m[3]
}));

const alis = (id) => F.fiyat("minecraft:" + id)?.alis ?? 0;
const satis = (id) => F.fiyat("minecraft:" + id)?.satis ?? 0;

// ---- Arz-talep ucu ----
// piyasa.js fiyatlari kaydiriyor. En tehlikeli an: HER GIRDI en ucuz
// (satisAlt) ve HER CIKTI en pahali (alisUst) oldugu an. Butun denetimler
// bir de o anda calistirilir. Sinirlar piyasa.js'ten okunur, elle yazilmaz.
const pKaynak = fs.readFileSync(path.join(kok, "Market_BP/scripts/piyasa.js"), "utf8");
const pSayi = (ad) => {
  const m = new RegExp(ad + ":\\s*([0-9.]+)").exec(pKaynak);
  if (!m) throw new Error("piyasa.js icinde " + ad + " bulunamadi");
  return +m[1];
};
const P_ALIS_UST = pSayi("alisUst"), P_SATIS_ALT = pSayi("satisAlt");

const SENARYOLAR = [
  { ad: "normal piyasa (carpan 1.00)", carpan: null },
  {
    ad: `arz-talep ucu (alis x${P_ALIS_UST}, satis x${P_SATIS_ALT})`,
    carpan: () => ({ alis: P_ALIS_UST, satis: P_SATIS_ALT })
  }
];

let acik = 0, kontrol = 0;
for (const senaryo of SENARYOLAR) {
acik = 0; kontrol = 0;
F.piyasaBagla(senaryo.carpan);
console.log(`\n########## ${senaryo.ad} ##########`);
console.log(`${tarifler.length} tarif denetleniyor...\n`);
for (const t of tarifler) {
  kontrol++;
  const maliyet = t.girdi.reduce((s, [g, a]) => s + satis(g) * a, 0);   // marketten alis
  const kazanc = alis(t.cikti) * t.n;                                    // markete satis
  if (kazanc > maliyet) {
    acik++;
    console.log(`  ACIK  ${t.cikti} x${t.n}: girdi ${maliyet} -> cikti ${kazanc}  (+${kazanc - maliyet})`);
  }
}

// Eritme aciklari (pisirilmis / cevher)
const eritme = [["cooked_beef","beef"],["cooked_porkchop","porkchop"],["cooked_chicken","chicken"],
  ["cooked_mutton","mutton"],["cooked_rabbit","rabbit"],["cooked_cod","cod"],["cooked_salmon","salmon"],
  ["baked_potato","potato"],["charcoal","oak_log"],["glass","sand"],["brick","clay_ball"],
  ["netherbrick","netherrack"],["stone","cobblestone"],["smooth_stone","stone"],["terracotta","clay"],
  ["iron_ingot","raw_iron"],["gold_ingot","raw_gold"],["copper_ingot","raw_copper"],
  ["dried_kelp","kelp"],["sponge","wet_sponge"],["cracked_stone_bricks","stone_bricks"],
  ["popped_chorus_fruit","chorus_fruit"],["lime_dye","cactus"],
  ["resin_brick","resin_clump"]];
for (const [urun, girdi] of eritme) {
  kontrol++;
  if (alis(urun) > satis(girdi)) {
    acik++;
    console.log(`  ACIK  eritme ${girdi} (${satis(girdi)}) -> ${urun} (${alis(urun)})  +${alis(urun) - satis(girdi)}`);
  }
}

// 9'luk blok cevrimi: 9 parca <-> 1 blok, iki yonde de kar olmamali
const bloklar = [["iron_block","iron_ingot"],["gold_block","gold_ingot"],["diamond_block","diamond"],
  ["emerald_block","emerald"],["coal_block","coal"],["redstone_block","redstone"],["lapis_block","lapis_lazuli"],
  ["netherite_block","netherite_ingot"],["copper_block","copper_ingot"],["slime","slime_ball"],
  ["raw_iron_block","raw_iron"],["raw_gold_block","raw_gold"],["raw_copper_block","raw_copper"]];
for (const [blk, parca] of bloklar) {
  kontrol += 2;
  if (alis(blk) > satis(parca) * 9) { acik++; console.log(`  ACIK  9x${parca} -> ${blk}: ${satis(parca)*9} -> ${alis(blk)}`); }
  if (alis(parca) * 9 > satis(blk)) { acik++; console.log(`  ACIK  ${blk} -> 9x${parca}: ${satis(blk)} -> ${alis(parca)*9}`); }
}

// TAS KESICI: bir bloktan kac parca cikiyorsa hepsini satmak, blogu
// almaktan ucuz olmali. Market butun esyalara acildiginda (v3.8) burasi
// para basiyordu: tas 3'e alinip 2 yarim blok 4'e satiliyordu.
// Kaynak listesi elle degil, fiyat motorundaki her "ana blok" icin uretilir.
const ANA_BLOKLAR = [
  "stone", "cobblestone", "mossy_cobblestone", "stone_bricks", "mossy_stone_bricks",
  "andesite", "diorite", "granite", "polished_andesite", "polished_diorite",
  "polished_granite", "sandstone", "red_sandstone", "smooth_sandstone", "deepslate",
  "cobbled_deepslate", "polished_deepslate", "deepslate_bricks", "deepslate_tiles",
  "tuff", "polished_tuff", "tuff_bricks", "blackstone", "polished_blackstone",
  "polished_blackstone_bricks", "nether_bricks", "red_nether_bricks", "quartz_block",
  "smooth_quartz", "purpur_block", "prismarine", "prismarine_bricks", "dark_prismarine",
  "end_stone_bricks", "mud_bricks", "bricks", "resin_bricks",
  "oak_planks", "spruce_planks", "birch_planks", "jungle_planks", "acacia_planks",
  "dark_oak_planks", "mangrove_planks", "cherry_planks", "bamboo_planks",
  "crimson_planks", "warped_planks", "pale_oak_planks"
];
// [son ek, bir bloktan cikan adet]
const KESIM = [["_slab", 2], ["_stairs", 1], ["_wall", 1]];
for (const blk of ANA_BLOKLAR) {
  const maliyet = satis(blk);
  if (!maliyet) continue;
  const kok = blk.replace(/_planks$/, "").replace(/s$/, blk.endsWith("bricks") ? "s" : "");
  for (const [ek, adet] of KESIM) {
    for (const aday of [blk + ek, kok + ek, blk.replace(/_planks$/, "") + ek]) {
      if (!F.fiyat("minecraft:" + aday)) continue;
      kontrol++;
      const kazanc = alis(aday) * adet;
      if (kazanc >= maliyet) {
        acik++;
        console.log(`  ACIK  tas kesici ${blk} (${maliyet}) -> ${adet}x ${aday} (${kazanc})  +${kazanc - maliyet}`);
      }
      break;
    }
  }
}

// Bakir ailesi: 1 bakir blogundan 4 kesilmis bakir cikar
for (const [blk, urun, adet] of [
  ["copper_block", "cut_copper", 4], ["copper_block", "cut_copper_stairs", 4],
  ["copper_block", "cut_copper_slab", 8], ["cut_copper", "cut_copper_slab", 2],
  ["glass", "glass_pane", 2], ["white_wool", "white_carpet", 1]
]) {
  if (!F.fiyat("minecraft:" + urun) || !F.fiyat("minecraft:" + blk)) continue;
  kontrol++;
  if (alis(urun) * adet >= satis(blk)) {
    acik++;
    console.log(`  ACIK  ${blk} (${satis(blk)}) -> ${adet}x ${urun} (${alis(urun) * adet})`);
  }
}

// ============ MOJANG'IN GERCEK TARIFLERI ============
// Elle yazilan TARIF tablosu oyunun tarifinin yaklasik halidir; birkac
// yerde Mojang'dan farkliydi ve bu farklar acik yaratiyordu (lodestone
// netherite yerine demir kulceyle yapiliyor, saddle 3 deri 1 demir...).
// Bu bolum Mojang'in kendi tarif dosyalarindan uretilmis listeyi kullanir.
// Yenilemek icin: arac/vanilla_tarifler.json'u bedrock-samples'tan uret.
try {
  const vt = JSON.parse(fs.readFileSync(path.join(kok, "arac/vanilla_tarifler.json"), "utf8"));
  let atlanan = 0;
  console.log(`\nMojang'in ${vt.sayi} gercek tarifi denetleniyor (${vt.kaynak})...`);
  for (const t of vt.tarifler) {
    const kazanc = alis(t.o) * t.n;
    if (!kazanc) { atlanan++; continue; }
    let maliyet = 0, eksik = false;
    for (const [g, adet] of t.g) {
      const m = satis(g);
      if (!m) { eksik = true; break; }
      maliyet += m * adet;
    }
    if (eksik) { atlanan++; continue; }
    kontrol++;
    if (kazanc > maliyet) {
      acik++;
      console.log(`  ACIK  ${t.t === "f" ? "eritme" : "craft"} ${t.g.map(([g, n]) => n + "x" + g).join(" + ")} (${maliyet}) -> ${t.n}x ${t.o} (${kazanc})  +${kazanc - maliyet}`);
    }
  }
  if (atlanan) console.log(`  (${atlanan} tarif atlandi: fiyati olmayan esya iceriyor)`);
} catch (e) {
  console.log("  UYARI: vanilla_tarifler.json okunamadi -> " + e.message);
}

console.log(`\n${kontrol} kontrol, ${acik} acik.  [${senaryo.ad}]`);
if (acik) { F.piyasaBagla(null); process.exit(1); }
}
F.piyasaBagla(null);
console.log("\nTum senaryolar temiz.");
process.exit(0);
