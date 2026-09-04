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

let acik = 0, kontrol = 0;
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
  ["popped_chorus_fruit","chorus_fruit"],["lime_dye","cactus"]];
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

console.log(`\n${kontrol} kontrol, ${acik} acik.`);
process.exit(acik ? 1 : 0);
