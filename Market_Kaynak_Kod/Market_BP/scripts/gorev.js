// ============ HAFTALIK MACERA GOREVLERI (v4.7) ============
// Tasarim dokumaninin ozu: "Oyuncuya para kazanmasi icin gorev vermiyoruz;
// Minecraft oynamasi icin bahane veriyoruz."
//
// Dongü:
//   Her OYUN HAFTASI  -> 8 gorev teklif edilir (herkesinki farkli)
//   Oyuncu en fazla 3 tanesini secer, hafta sonuna kadar yapar
//   Bitirip hafta bitmediyse -> ucret odeyip YENI 8 gorev alabilir
//   Yenileme ucreti her seferinde artar: x1, x1.5, x2.5, x4, x6
//   Bir tam hafta hic yenileme yapilmazsa katsayi SIFIRLANIR
//
// ODUL = Taban x Zorluk x Sure x Risk x Seyahat
// ve haftalik bir TAVAN var, boylece gorevler ekonominin merkezine gecmez.

import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
const { world, system } = mc;

export const GOREV_CFG = {
  acik: true,
  anahtar: "mk_gorev",
  gunUzunlugu: 1200000,      // 1 Minecraft gunu = 20 dk
  haftaGun: 7,
  teklif: 8,                 // hafta basinda gosterilen gorev sayisi
  secim: 3,                  // en fazla kac tanesi secilebilir
  tabanOdul: 260,            // carpanlarin uzerine bindigi taban
  haftalikTavan: 45000,      // bir haftada gorevlerden kazanilabilecek en fazla para
  yenilemeBaz: 200,
  yenilemeKatsayi: [1, 1.5, 2.5, 4, 6],
  yenilemeSiniri: 3,         // bir haftada en fazla kac yenileme
  yorgunlukCeza: 0.10,       // ayni kategoriyi ust uste yapinca odul dusus orani
  yorgunlukEnCok: 0.30
};

// ---- Carpan tablolari (dokumandan birebir) ----
const ZORLUK  = { cok_kolay: 0.5, kolay: 0.8, orta: 1.0, zor: 1.5, cok_zor: 2.2, efsanevi: 3.5 };
const SURE    = { "1-3": 0.5, "3-10": 0.75, "10-20": 1.0, "20-40": 1.4, "40-90": 2.0, "90+": 2.5 };
const RISK    = { yok: 1.0, dusuk: 1.1, orta: 1.3, yuksek: 1.6, olumcul: 2.0 };
const SEYAHAT = { yerinde: 1.0, "500": 1.15, "1000": 1.3, "2500": 1.6, baska_boyut: 1.8 };

const ZORLUK_ADI = {
  cok_kolay: "§aÇok Kolay", kolay: "§aKolay", orta: "§bOrta",
  zor: "§6Zor", cok_zor: "§cÇok Zor", efsanevi: "§5Efsanevi"
};
export const KATEGORI_ADI = {
  toplama: "Toplama", madencilik: "Madencilik", savas: "Savaş",
  kesif: "Keşif", tarim: "Tarım", insa: "İnşa", uretim: "Üretim"
};

// ---- Gorev havuzu ----
// tur: "topla" (envanterde biriktir) | "oldur" | "kaz" | "git" | "uret"
// hedef: sayac hedefi, esya: takip edilen id(ler)
export const HAVUZ = [
  // --- toplama / tarim ---
  { id: "cicek",    ad: "12 karahindiba topla",       kat: "toplama",   tur: "topla", esya: ["minecraft:dandelion"], hedef: 12, z: "cok_kolay", s: "3-10", r: "yok", y: "yerinde" },
  { id: "cicek5",   ad: "5 farklı çiçek topla",       kat: "toplama",   tur: "cesit", esya: ["minecraft:dandelion","minecraft:poppy","minecraft:blue_orchid","minecraft:allium","minecraft:azure_bluet","minecraft:oxeye_daisy","minecraft:cornflower","minecraft:lily_of_the_valley"], hedef: 5, z: "kolay", s: "10-20", r: "yok", y: "500" },
  { id: "odun",     ad: "64 odun topla",              kat: "toplama",   tur: "topla", esya: ["minecraft:oak_log","minecraft:birch_log","minecraft:spruce_log","minecraft:jungle_log","minecraft:acacia_log","minecraft:dark_oak_log"], hedef: 64, z: "kolay", s: "10-20", r: "yok", y: "yerinde" },
  { id: "bugday",   ad: "64 buğday hasat et",         kat: "tarim",     tur: "topla", esya: ["minecraft:wheat"], hedef: 64, z: "kolay", s: "10-20", r: "yok", y: "yerinde" },
  { id: "balik",    ad: "3 balık tut",                kat: "tarim",     tur: "topla", esya: ["minecraft:cod","minecraft:salmon","minecraft:tropical_fish","minecraft:pufferfish"], hedef: 3, z: "cok_kolay", s: "3-10", r: "yok", y: "yerinde" },
  { id: "bal",      ad: "6 bal şişesi doldur",        kat: "tarim",     tur: "topla", esya: ["minecraft:honey_bottle"], hedef: 6, z: "orta", s: "10-20", r: "dusuk", y: "500" },
  { id: "kaktus",   ad: "48 kaktüs topla",            kat: "tarim",     tur: "topla", esya: ["minecraft:cactus"], hedef: 48, z: "kolay", s: "10-20", r: "dusuk", y: "500" },

  // --- madencilik ---
  { id: "tas",      ad: "128 taş kaz",                kat: "madencilik", tur: "kaz", esya: ["minecraft:stone","minecraft:cobblestone","minecraft:deepslate","minecraft:cobbled_deepslate"], hedef: 128, z: "cok_kolay", s: "10-20", r: "dusuk", y: "yerinde" },
  { id: "demir",    ad: "32 demir cevheri çıkar",     kat: "madencilik", tur: "kaz", esya: ["minecraft:iron_ore","minecraft:deepslate_iron_ore","minecraft:raw_iron"], hedef: 32, z: "orta", s: "20-40", r: "orta", y: "yerinde" },
  { id: "komur",    ad: "64 kömür çıkar",             kat: "madencilik", tur: "kaz", esya: ["minecraft:coal_ore","minecraft:deepslate_coal_ore","minecraft:coal"], hedef: 64, z: "kolay", s: "20-40", r: "dusuk", y: "yerinde" },
  { id: "elmas",    ad: "10 elmas bul",               kat: "madencilik", tur: "kaz", esya: ["minecraft:diamond","minecraft:diamond_ore","minecraft:deepslate_diamond_ore"], hedef: 10, z: "zor", s: "40-90", r: "yuksek", y: "yerinde" },
  { id: "ametist",  ad: "24 ametist parçası topla",   kat: "madencilik", tur: "topla", esya: ["minecraft:amethyst_shard"], hedef: 24, z: "orta", s: "20-40", r: "orta", y: "1000" },
  { id: "lapis",    ad: "32 lapis topla",             kat: "madencilik", tur: "topla", esya: ["minecraft:lapis_lazuli"], hedef: 32, z: "orta", s: "20-40", r: "orta", y: "yerinde" },
  { id: "obsidyen", ad: "10 obsidyen kaz",            kat: "madencilik", tur: "kaz", esya: ["minecraft:obsidian"], hedef: 10, z: "zor", s: "20-40", r: "yuksek", y: "yerinde" },

  // --- savas ---
  { id: "inek",     ad: "5 inek avla",                kat: "savas", tur: "oldur", esya: ["minecraft:cow"], hedef: 5, z: "cok_kolay", s: "3-10", r: "yok", y: "yerinde" },
  { id: "zombi",    ad: "20 zombi öldür",             kat: "savas", tur: "oldur", esya: ["minecraft:zombie","minecraft:husk","minecraft:drowned"], hedef: 20, z: "kolay", s: "10-20", r: "orta", y: "yerinde" },
  { id: "orumcek",  ad: "20 örümcek öldür",           kat: "savas", tur: "oldur", esya: ["minecraft:spider","minecraft:cave_spider"], hedef: 20, z: "kolay", s: "10-20", r: "orta", y: "yerinde" },
  { id: "iskelet",  ad: "20 iskelet avla",            kat: "savas", tur: "oldur", esya: ["minecraft:skeleton","minecraft:stray","minecraft:bogged"], hedef: 20, z: "orta", s: "10-20", r: "orta", y: "yerinde" },
  { id: "creeper",  ad: "10 creeper öldür",           kat: "savas", tur: "oldur", esya: ["minecraft:creeper"], hedef: 10, z: "orta", s: "20-40", r: "yuksek", y: "yerinde" },
  { id: "enderman", ad: "8 enderman öldür",           kat: "savas", tur: "oldur", esya: ["minecraft:enderman"], hedef: 8, z: "zor", s: "20-40", r: "yuksek", y: "500" },
  { id: "blaze",    ad: "5 blaze çubuğu getir",       kat: "savas", tur: "topla", esya: ["minecraft:blaze_rod"], hedef: 5, z: "zor", s: "40-90", r: "olumcul", y: "baska_boyut" },
  { id: "cesit20",  ad: "10 farklı yaratık öldür",    kat: "savas", tur: "cesitOldur", hedef: 10, z: "zor", s: "40-90", r: "yuksek", y: "1000" },
  { id: "wither",   ad: "Wither'ı yen",               kat: "savas", tur: "oldur", esya: ["minecraft:wither"], hedef: 1, z: "efsanevi", s: "90+", r: "olumcul", y: "1000" },
  { id: "ejderha",  ad: "Ender Ejderhası'nı yen",     kat: "savas", tur: "oldur", esya: ["minecraft:ender_dragon"], hedef: 1, z: "efsanevi", s: "90+", r: "olumcul", y: "baska_boyut" },

  // --- kesif ---
  { id: "nether",   ad: "Nether'a git",               kat: "kesif", tur: "boyut", esya: ["minecraft:nether"], hedef: 1, z: "kolay", s: "10-20", r: "orta", y: "baska_boyut" },
  { id: "end",      ad: "End'e ulaş",                 kat: "kesif", tur: "boyut", esya: ["minecraft:the_end"], hedef: 1, z: "cok_zor", s: "90+", r: "olumcul", y: "baska_boyut" },
  // NOT: "kac farkli biyom" gorevi yok - Bedrock script API'sinde guvenilir
  // biyom sorgusu yok, sayamadigimiz seyi gorev yapmiyoruz. Yerine
  // olculebilir kesif hedefleri: yukseklik, derinlik, mesafe.
  { id: "yuksek",   ad: "Y=200 üstüne çık",           kat: "kesif", tur: "yukseklik", esik: 200, hedef: 1, z: "kolay", s: "10-20", r: "orta", y: "yerinde" },
  { id: "derin",    ad: "Y=-50 altına in",            kat: "kesif", tur: "derinlik", esik: -50, hedef: 1, z: "orta", s: "20-40", r: "yuksek", y: "yerinde" },
  { id: "dipdibe",  ad: "Y=-59'a kadar in (bedrock)", kat: "kesif", tur: "derinlik", esik: -59, hedef: 1, z: "zor", s: "40-90", r: "yuksek", y: "yerinde" },
  { id: "uzak",     ad: "Haftanın başladığı yerden 2000 blok uzaklaş", kat: "kesif", tur: "mesafe", esik: 2000, hedef: 1, z: "zor", s: "40-90", r: "orta", y: "2500" },
  { id: "cokuzak",  ad: "Haftanın başladığı yerden 5000 blok uzaklaş", kat: "kesif", tur: "mesafe", esik: 5000, hedef: 1, z: "cok_zor", s: "90+", r: "orta", y: "2500" },

  // --- uretim / insa ---
  { id: "ekmek",    ad: "16 ekmek üret",              kat: "uretim", tur: "topla", esya: ["minecraft:bread"], hedef: 16, z: "cok_kolay", s: "3-10", r: "yok", y: "yerinde" },
  { id: "kalas",    ad: "256 kalas üret",             kat: "uretim", tur: "topla", esya: ["minecraft:oak_planks","minecraft:birch_planks","minecraft:spruce_planks","minecraft:jungle_planks","minecraft:acacia_planks","minecraft:dark_oak_planks"], hedef: 256, z: "kolay", s: "10-20", r: "yok", y: "yerinde" },
  { id: "cam",      ad: "64 cam erit",                kat: "uretim", tur: "topla", esya: ["minecraft:glass"], hedef: 64, z: "kolay", s: "10-20", r: "yok", y: "yerinde" },
  { id: "beton",    ad: "64 beton üret",              kat: "insa",   tur: "topla", esya: ["minecraft:white_concrete","minecraft:red_concrete","minecraft:blue_concrete","minecraft:yellow_concrete","minecraft:green_concrete","minecraft:black_concrete","minecraft:orange_concrete","minecraft:lime_concrete"], hedef: 64, z: "orta", s: "20-40", r: "yok", y: "yerinde" },
  { id: "koy",      ad: "200 blok yerleştir",         kat: "insa",   tur: "koy", hedef: 200, z: "orta", s: "20-40", r: "yok", y: "yerinde" },
  { id: "koy500",   ad: "500 blok yerleştir",         kat: "insa",   tur: "koy", hedef: 500, z: "zor", s: "40-90", r: "yok", y: "yerinde" },
  { id: "demirblok",ad: "8 demir bloğu üret",         kat: "uretim", tur: "topla", esya: ["minecraft:iron_block"], hedef: 8, z: "zor", s: "40-90", r: "orta", y: "yerinde" }
];

// ---- Odul hesabi ----
export function odulHesapla(g, yorgunluk = 0) {
  const ham = GOREV_CFG.tabanOdul * ZORLUK[g.z] * SURE[g.s] * RISK[g.r] * SEYAHAT[g.y];
  const dusum = 1 - Math.min(GOREV_CFG.yorgunlukEnCok, yorgunluk);
  // 25'in katina yuvarla: odul sayilari okunakli kalsin
  return Math.max(25, Math.round(ham * dusum / 25) * 25);
}

let api = null;
let veri = {};   // oyuncuAdi -> durum
let kirli = false;

function yukle() { try { veri = api?.yukle(GOREV_CFG.anahtar, {}) ?? {}; } catch { veri = {}; } }
function yaz() { if (!api || !kirli) return; try { api.kaydet(GOREV_CFG.anahtar, veri); kirli = false; } catch { } }

const gun = () => Math.floor(Date.now() / GOREV_CFG.gunUzunlugu);
const hafta = () => Math.floor(gun() / GOREV_CFG.haftaGun);
const rastgele = (a) => a[Math.floor(Math.random() * a.length)];

// Zorluk dagilimi: 2 kolay, 2 orta, 2 zor, 1 kesif, 1 surpriz
function havuzSec(yorgunluk) {
  const secim = [];
  const kullanilan = new Set();
  const al = (suz) => {
    const adaylar = HAVUZ.filter(g => !kullanilan.has(g.id) && suz(g));
    if (!adaylar.length) return null;
    // Yorgun kategorilerin agirligi duser: son gorevlerinde cok madencilik
    // yaptiysa sistem kesif/insa/savas tarafina kayar.
    const agirlikli = [];
    for (const g of adaylar) {
      const a = Math.max(1, Math.round(10 * (1 - Math.min(0.8, yorgunluk[g.kat] ?? 0))));
      for (let i = 0; i < a; i++) agirlikli.push(g);
    }
    const g = rastgele(agirlikli);
    kullanilan.add(g.id);
    return g;
  };
  const kolay = (g) => g.z === "cok_kolay" || g.z === "kolay";
  const orta = (g) => g.z === "orta";
  const zor = (g) => g.z === "zor" || g.z === "cok_zor" || g.z === "efsanevi";
  for (const suz of [kolay, kolay, orta, orta, zor, zor]) { const g = al(suz); if (g) secim.push(g); }
  const k = al(g => g.kat === "kesif"); if (k) secim.push(k);
  const sur = al(() => true); if (sur) secim.push({ ...sur, surpriz: true });
  while (secim.length < GOREV_CFG.teklif) { const g = al(() => true); if (!g) break; secim.push(g); }
  return secim;
}

function yeniHafta(k) {
  k.hafta = hafta();
  k.teklif = havuzSec(k.yorgunluk ?? {}).map(g => ({ id: g.id, surpriz: !!g.surpriz }));
  k.secili = [];
  k.kazanilan = 0;
  // Yenileme katsayisi YALNIZCA bir tam hafta hic yenileme yapilmadiysa sifirlanir.
  if ((k.sonYenilemeHafta ?? -99) < hafta() - 1) k.yenileme = 0;
  k.haftalikYenileme = 0;
  k.baslangic = null;      // "uzaklas" gorevleri yeni haftada buradan olculur
  kirli = true;
}

export function durum(ad) {
  let k = veri[ad];
  if (!k) {
    k = veri[ad] = { hafta: -1, teklif: [], secili: [], kazanilan: 0, yenileme: 0,
                     haftalikYenileme: 0, sonYenilemeHafta: -99, yorgunluk: {}, puan: 0, biten: 0 };
    kirli = true;
  }
  if (k.hafta !== hafta()) yeniHafta(k);
  return k;
}

const gorevBul = (id) => HAVUZ.find(g => g.id === id);

export function yenilemeUcreti(k) {
  const t = GOREV_CFG.yenilemeKatsayi;
  const kat = t[Math.min(k.yenileme, t.length - 1)];
  return Math.round(GOREV_CFG.yenilemeBaz * kat);
}

// ---- Gorev secme / ilerleme ----
export function sec(ad, gorevId) {
  const k = durum(ad);
  if (k.secili.length >= GOREV_CFG.secim) return { ok: false, sebep: `En fazla ${GOREV_CFG.secim} görev seçebilirsin.` };
  if (k.secili.some(x => x.id === gorevId)) return { ok: false, sebep: "Bu görev zaten seçili." };
  if (!k.teklif.some(x => x.id === gorevId)) return { ok: false, sebep: "Bu görev sana teklif edilmemiş." };
  const g = gorevBul(gorevId);
  if (!g) return { ok: false, sebep: "Görev bulunamadı." };
  k.secili.push({ id: gorevId, ilerleme: 0, bitti: false, veri: {} });
  kirli = true;
  return { ok: true, gorev: g };
}

export function yenile(p) {
  const k = durum(p.name);
  if (k.haftalikYenileme >= GOREV_CFG.yenilemeSiniri)
    return { ok: false, sebep: `Bu hafta en fazla ${GOREV_CFG.yenilemeSiniri} yenileme yapabilirsin.` };
  const acik = k.secili.filter(x => !x.bitti).length;
  if (acik > 0) return { ok: false, sebep: "Önce seçili görevlerini bitir." };
  const ucret = yenilemeUcreti(k);
  if (api.paraOku(p) < ucret) return { ok: false, sebep: `Yenileme ücreti ${api.fmt(ucret)}, paran yetmiyor.` };
  api.paraEkle(p, -ucret);
  k.teklif = havuzSec(k.yorgunluk).map(g => ({ id: g.id, surpriz: !!g.surpriz }));
  k.secili = [];
  k.yenileme++;
  k.haftalikYenileme++;
  k.sonYenilemeHafta = hafta();
  kirli = true;
  return { ok: true, ucret };
}

function tamamla(p, kayitli, g) {
  const k = durum(p.name);
  kayitli.bitti = true;
  const yorgun = k.yorgunluk[g.kat] ?? 0;
  let odul = odulHesapla(g, yorgun);
  // Haftalik tavan: gorevler ekonominin merkezine gecmesin
  const kalan = Math.max(0, GOREV_CFG.haftalikTavan - (k.kazanilan ?? 0));
  const kirpildi = odul > kalan;
  odul = Math.min(odul, kalan);
  k.kazanilan = (k.kazanilan ?? 0) + odul;
  k.yorgunluk[g.kat] = Math.min(GOREV_CFG.yorgunlukEnCok, yorgun + GOREV_CFG.yorgunlukCeza);
  // Diger kategoriler yavasca dinlenir
  for (const kat of Object.keys(k.yorgunluk)) if (kat !== g.kat) k.yorgunluk[kat] = Math.max(0, k.yorgunluk[kat] - 0.05);
  const puan = Math.max(1, Math.round(ZORLUK[g.z] * 10));
  k.puan = (k.puan ?? 0) + puan;
  k.biten = (k.biten ?? 0) + 1;
  kirli = true;
  if (odul > 0) api.paraEkle(p, odul);
  try {
    p.sendMessage(`§6§l✔ GÖREV TAMAM §r§f${g.ad}`);
    p.sendMessage(`§7Ödül: §a${api.fmt(odul)}§7  §8+${puan} Macera Puanı${kirpildi ? " §8(haftalık tavan)" : ""}`);
    p.playSound("random.levelup");
    p.onScreenDisplay.setTitle("§6Görev Tamam!", { subtitle: `§a${api.fmt(odul)}`, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
  } catch { }
}

// Sayaci ilerletir. `miktar` kadar artirir, hedefe varinca tamamlar.
function ilerlet(p, suz, miktar, etiket) {
  if (!GOREV_CFG.acik || !miktar) return;
  const k = durum(p.name);
  for (const kayitli of k.secili) {
    if (kayitli.bitti) continue;
    const g = gorevBul(kayitli.id);
    if (!g || !suz(g)) continue;
    if (g.tur === "cesit" || g.tur === "cesitOldur") {
      kayitli.veri ??= {};
      if (kayitli.veri[etiket]) continue;
      kayitli.veri[etiket] = 1;
      kayitli.ilerleme = Object.keys(kayitli.veri).length;
    } else {
      kayitli.ilerleme = (kayitli.ilerleme ?? 0) + miktar;
    }
    kirli = true;
    if (kayitli.ilerleme >= g.hedef) tamamla(p, kayitli, g);
    else if (kayitli.ilerleme % Math.max(1, Math.floor(g.hedef / 4)) === 0)
      try { p.onScreenDisplay.setActionBar(`§6${g.ad} §7${kayitli.ilerleme}/${g.hedef}`); } catch { }
  }
}

// ---- Olay kancalari ----
export function blokKirildi(p, typeId) {
  ilerlet(p, g => (g.tur === "kaz") && g.esya?.includes(typeId), 1, typeId);
}
export function blokKondu(p) { ilerlet(p, g => g.tur === "koy", 1, "koy"); }
export function varlikOldu(p, typeId) {
  ilerlet(p, g => g.tur === "oldur" && g.esya?.includes(typeId), 1, typeId);
  ilerlet(p, g => g.tur === "cesitOldur", 1, typeId);
}
export function esyaGoruldu(p, typeId, adet) {
  ilerlet(p, g => (g.tur === "topla") && g.esya?.includes(typeId), adet, typeId);
  ilerlet(p, g => g.tur === "cesit" && g.esya?.includes(typeId), 1, typeId);
}
export function boyutDegisti(p, boyutId) {
  const kisa = String(boyutId).replace("minecraft:", "");
  ilerlet(p, g => g.tur === "boyut" && g.esya?.some(e => e.replace("minecraft:", "") === kisa), 1, kisa);
}
// Tek seferlik kesif hedefleri: esige varilinca gorev biter (hedef 1).
export function konum(p) {
  const k = durum(p.name);
  if (!k.secili.some(x => !x.bitti)) return;
  const l = p.location; if (!l) return;
  // Haftanin baslangic noktasi: "uzaklas" gorevleri buradan olculur.
  k.baslangic ??= { x: Math.round(l.x), z: Math.round(l.z) };
  const uzaklik = Math.hypot(l.x - k.baslangic.x, l.z - k.baslangic.z);
  ilerlet(p, g => g.tur === "yukseklik" && l.y >= g.esik, 1, "y");
  ilerlet(p, g => g.tur === "derinlik" && l.y <= g.esik, 1, "y");
  ilerlet(p, g => g.tur === "mesafe" && uzaklik >= g.esik, 1, "m");
}

// "topla" gorevleri envanteri tarar: craft, ticaret, loot - nasil geldigi
// onemli degil, eldeki EN YUKSEK adet sayilir (esya harcansa bile geri gitmez).
export function envanterTara(p) {
  if (!GOREV_CFG.acik) return;
  const k = durum(p.name);
  if (!k.secili.some(x => !x.bitti)) return;
  let kap;
  try { kap = p.getComponent("minecraft:inventory")?.container; } catch { return; }
  if (!kap) return;
  const sayim = new Map();
  for (let i = 0; i < kap.size; i++) {
    const it = kap.getItem(i);
    if (!it) continue;
    sayim.set(it.typeId, (sayim.get(it.typeId) ?? 0) + it.amount);
  }
  for (const kayitli of k.secili) {
    if (kayitli.bitti) continue;
    const g = gorevBul(kayitli.id);
    if (!g || (g.tur !== "topla" && g.tur !== "cesit")) continue;
    if (g.tur === "cesit") {
      kayitli.veri ??= {};
      for (const e of g.esya) if (sayim.has(e)) kayitli.veri[e] = 1;
      kayitli.ilerleme = Object.keys(kayitli.veri).length;
    } else {
      let toplam = 0;
      for (const e of g.esya) toplam += sayim.get(e) ?? 0;
      if (toplam > (kayitli.ilerleme ?? 0)) kayitli.ilerleme = toplam;
    }
    kirli = true;
    if (kayitli.ilerleme >= g.hedef) tamamla(p, kayitli, g);
  }
}

export function kur(apiRef) {
  api = apiRef;
  yukle();
  system.runInterval(() => {
    try { for (const p of world.getAllPlayers()) { envanterTara(p); konum(p); } } catch { }
    yaz();
  }, 40);
  console.warn("[Görev] Haftalık macera görevleri aktif.");
}

// ---- Unvanlar ----
export const UNVANLAR = [
  { puan: 0, ad: "§7Yeni Başlayan" }, { puan: 100, ad: "§a🏕️ Gezgin" },
  { puan: 500, ad: "§b🧭 Kaşif" }, { puan: 1500, ad: "§6⚔️ Macera Ustası" },
  { puan: 4000, ad: "§5👑 Efsane" }
];
export const unvan = (puan) => [...UNVANLAR].reverse().find(u => puan >= u.puan) ?? UNVANLAR[0];

// ---- Ekranlar ----
export function ekran(p, apiRef) {
  if (apiRef) api = apiRef;
  const k = durum(p.name);
  const kalanGun = GOREV_CFG.haftaGun - (gun() % GOREV_CFG.haftaGun);
  const acik = k.secili.filter(x => !x.bitti);
  const biten = k.secili.filter(x => x.bitti);

  let govde = `§7Macera Puanı: §f${k.puan ?? 0} ${unvan(k.puan ?? 0).ad}\n`
    + `§7Bu hafta kazanılan: §a${api.fmt(k.kazanilan ?? 0)}§7 / ${api.fmt(GOREV_CFG.haftalikTavan)}\n`
    + `§7Hafta bitimine: §f${kalanGun} Minecraft günü\n\n`;
  if (k.secili.length) {
    govde += "§e§lSEÇİLİ GÖREVLERİN\n";
    for (const x of k.secili) {
      const g = gorevBul(x.id); if (!g) continue;
      govde += x.bitti
        ? `§a✔ ${g.ad}\n`
        : `§f• ${g.ad} §7${x.ilerleme ?? 0}/${g.hedef} §8(${api.fmt(odulHesapla(g, k.yorgunluk[g.kat] ?? 0))})\n`;
    }
    govde += "\n";
  }
  govde += `§8${k.secili.length}/${GOREV_CFG.secim} görev seçildi. ${acik.length ? "" : biten.length ? "Hepsini bitirdin!" : ""}`;

  const f = new ui.ActionFormData().title("§lMACERA GÖREVLERİ").body(govde);
  const islem = [];
  f.button(`§e${GOREV_CFG.teklif} Görev Teklifi\n§8${GOREV_CFG.secim - k.secili.length} seçim hakkın kaldı`, "textures/items/map_filled");
  islem.push(() => teklifler(p));
  if (k.secili.length && !acik.length) {
    const ucret = yenilemeUcreti(k);
    f.button(`§6Yeni Görev Listesi\n§8${api.fmt(ucret)} §8(${k.haftalikYenileme}/${GOREV_CFG.yenilemeSiniri})`, "textures/items/emerald");
    islem.push(() => {
      const r = yenile(p);
      if (!r.ok) { p.sendMessage("§c[Görev] " + r.sebep); return ekran(p); }
      p.sendMessage(`§6[Görev] §fYeni liste geldi. §c-${api.fmt(r.ucret)}`);
      ekran(p);
    });
  }
  f.button("§7Ödül Nasıl Hesaplanır"); islem.push(() => acikla(p));
  f.button("§7< Geri"); islem.push(() => api.anaMenu?.(p));
  f.show(p).then(r => { if (!r.canceled) islem[r.selection]?.(); });
}

function teklifler(p) {
  const k = durum(p.name);
  const f = new ui.ActionFormData().title("§lGÖREV TEKLİFLERİ")
    .body(`§7En fazla §f${GOREV_CFG.secim}§7 görev seçebilirsin. §8(${k.secili.length} seçili)\n`
      + "§8Seçtiklerin hafta sonuna kadar geçerli.");
  const islem = [];
  for (const t of k.teklif) {
    const g = gorevBul(t.id); if (!g) continue;
    const secili = k.secili.some(x => x.id === t.id);
    const odul = odulHesapla(g, k.yorgunluk[g.kat] ?? 0);
    if (t.surpriz && !secili) {
      f.button(`§d§l? Gizemli Görev\n§8${ZORLUK_ADI[g.z]} §8· §a${api.fmt(odul)}`);
    } else {
      f.button(`${secili ? "§a✔ " : "§f"}${g.ad}\n§8${ZORLUK_ADI[g.z]} §8· ${KATEGORI_ADI[g.kat]} · §a${api.fmt(odul)}`);
    }
    islem.push(() => {
      if (secili) { p.sendMessage("§7[Görev] Bu görev zaten seçili."); return teklifler(p); }
      const r = sec(p.name, t.id);
      if (!r.ok) { p.sendMessage("§c[Görev] " + r.sebep); return teklifler(p); }
      p.sendMessage(`§6[Görev] §fSeçildi: §e${g.ad} §7(${api.fmt(odul)})`);
      try { p.playSound("random.orb"); } catch { }
      teklifler(p);
    });
  }
  f.button("§7< Geri"); islem.push(() => ekran(p));
  f.show(p).then(r => { if (!r.canceled) islem[r.selection]?.(); });
}

function acikla(p) {
  new ui.ActionFormData().title("§lÖDÜL HESABI")
    .body(
      "§7Ödül = §fTaban × Zorluk × Süre × Risk × Seyahat\n\n" +
      `§eTaban§7: ${api.fmt(GOREV_CFG.tabanOdul)}\n\n` +
      "§eZorluk§7: çok kolay ×0.5, kolay ×0.8, orta ×1.0,\n§7zor ×1.5, çok zor ×2.2, efsanevi ×3.5\n\n" +
      "§eSüre§7: 1-3dk ×0.5 · 3-10 ×0.75 · 10-20 ×1.0\n§720-40 ×1.4 · 40-90 ×2.0 · 90+ ×2.5\n\n" +
      "§eRisk§7: yok ×1.0 · düşük ×1.1 · orta ×1.3\n§7yüksek ×1.6 · ölümcül ×2.0\n\n" +
      "§eSeyahat§7: yerinde ×1.0 · 500 blok ×1.15\n§71000 ×1.3 · 2500 ×1.6 · başka boyut ×1.8\n\n" +
      `§cHaftalık tavan: §f${api.fmt(GOREV_CFG.haftalikTavan)}\n` +
      "§8Görevler ekonominin merkezine geçmesin diye.\n\n" +
      "§cKategori yorgunluğu\n§7Aynı türü üst üste yaparsan o türün ödülü\n§7%10, %20, en fazla %30 düşer ve sistem sana\n§7başka türden görev göstermeye başlar.\n\n" +
      "§cYenileme ücreti\n§7×1 → ×1.5 → ×2.5 → ×4 → ×6\n§7Bir tam hafta yenileme yapmazsan sıfırlanır."
    )
    .button("§7< Geri").show(p).then(r => { if (!r.canceled) ekran(p); });
}

export function rapor(ad) {
  const k = durum(ad);
  const acik = k.secili.filter(x => !x.bitti);
  const satir = [`§6Macera Puanı: §f${k.puan ?? 0} ${unvan(k.puan ?? 0).ad}`,
                 `§7Bitirilen görev: §f${k.biten ?? 0}`];
  if (acik.length) {
    satir.push("§7Açık görevlerin:");
    for (const x of acik) {
      const g = gorevBul(x.id); if (!g) continue;
      satir.push(`§8- §f${g.ad} §7${x.ilerleme ?? 0}/${g.hedef}`);
    }
  } else satir.push("§7Açık görevin yok. §f!gorev§7 ile yeni seç.");
  return satir;
}
