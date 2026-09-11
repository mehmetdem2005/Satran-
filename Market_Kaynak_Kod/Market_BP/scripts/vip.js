// ============ VIP / MAGAZA SEVIYESI (v4.7) ============
// Tasarim dokumanindan: "VIP para ile DOGRUDAN satin alinmasin; magazayi
// aktif kullandikca gelissin."
//
// VIP XP nasil kazanilir:  her $100'luk alis VE satis -> 1 VIP XP
// Ne ise yarar:            marketin SANA SATTIGI fiyatta indirim + gunluk odul
// Neden sadece alis tarafi: indirim satis (markete satma) fiyatina da
//   uygulansaydi, VIP-10 oyuncusu ucuza alip pahaliya satarak para basardi.
//   Dokumanin kendi uyarisi da bu: "marketin oyuncudan alis fiyati VIP
//   nedeniyle YUKSELMEZ."
//
// Kotuye kullanimi kesen uc kural:
//   1) Gunluk XP tavani - ayni esyayi alip satip XP kasilmasin.
//   2) Zararina islem XP uretmez (alip hemen geri satmak zarardir).
//   3) Buyuk islemlerde XP kademeli azalir (tek seferde milyonluk alim
//      yapan, ayni parayi parca parca harcayandan daha fazla XP almasin).

import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
const { world, system } = mc;

export const VIP_CFG = {
  acik: true,
  anahtar: "mk_vip",
  xpBirimi: 100,          // kac dolarlik hacim = 1 XP
  gunlukXpTavani: 3000,   // bir oyun gununde en fazla kazanilabilecek XP
  // Buyuk islemlerde azalan verim: bu esigin ustundeki kisim yarim sayilir
  kademeEsigi: 50000,
  kademeOrani: 0.5,
  sonumGun: 30,           // bu kadar gun islem yoksa XP erimeye baslar
  sonumOrani: 0.02,       // erime miktari (%2)
  gunUzunlugu: 1200000    // 1 Minecraft gunu = 20 dk = 1.200.000 ms
};

// Dokumanin tablosu birebir.
export const SEVIYELER = [
  { s: 0,  xp: 0,       indirim: 0,    carpan: 1.00, odul: null,   ad: "VIP-0" },
  { s: 1,  xp: 5000,    indirim: 0.01, carpan: 1.00, odul: null,   ad: "VIP-1" },
  { s: 2,  xp: 15000,   indirim: 0.01, carpan: 1.02, odul: "blok", ad: "VIP-2" },
  { s: 3,  xp: 35000,   indirim: 0.02, carpan: 1.03, odul: "blok", ad: "VIP-3" },
  { s: 4,  xp: 75000,   indirim: 0.03, carpan: 1.04, odul: "kaynak", ad: "VIP-4" },
  { s: 5,  xp: 150000,  indirim: 0.04, carpan: 1.05, odul: "kaynak", ad: "VIP-5" },
  { s: 6,  xp: 300000,  indirim: 0.05, carpan: 1.06, odul: "buyuk", ad: "VIP-6" },
  { s: 7,  xp: 600000,  indirim: 0.06, carpan: 1.07, odul: "buyuk", ad: "VIP-7" },
  { s: 8,  xp: 1000000, indirim: 0.07, carpan: 1.08, odul: "buyuk", ad: "VIP-8" },
  { s: 9,  xp: 2000000, indirim: 0.08, carpan: 1.09, odul: "nadir", ad: "VIP-9" },
  { s: 10, xp: 5000000, indirim: 0.10, carpan: 1.10, odul: "nadir", ad: "VIP-10" }
];

// Gunluk odul havuzlari. Dokumandaki dagilim: %70 yaygin, %20 orta,
// %8 degerli, %2 nadir.
const ODUL_HAVUZ = {
  yaygin: ["minecraft:stone", "minecraft:cobblestone", "minecraft:dirt", "minecraft:oak_planks",
           "minecraft:sand", "minecraft:gravel", "minecraft:andesite", "minecraft:granite",
           "minecraft:diorite", "minecraft:deepslate", "minecraft:tuff", "minecraft:oak_log"],
  orta:   ["minecraft:stone_bricks", "minecraft:bricks", "minecraft:quartz_block",
           "minecraft:smooth_stone", "minecraft:white_concrete", "minecraft:glass",
           "minecraft:copper_block", "minecraft:terracotta", "minecraft:blackstone"],
  degerli:["minecraft:iron_ingot", "minecraft:gold_ingot", "minecraft:redstone",
           "minecraft:lapis_lazuli", "minecraft:coal", "minecraft:amethyst_shard"],
  nadir:  ["minecraft:diamond", "minecraft:emerald", "minecraft:ender_pearl",
           "minecraft:blaze_rod", "minecraft:quartz"]
};

let api = null;
let veri = {};          // oyuncuAdi -> { xp, gun, gunlukXp, sonIslem, sonOdul }
let kirli = false;

function yukle() {
  try { veri = api?.yukle(VIP_CFG.anahtar, {}) ?? {}; } catch { veri = {}; }
}
function yaz() {
  if (!api || !kirli) return;
  try { api.kaydet(VIP_CFG.anahtar, veri); kirli = false; } catch { }
}
const bugun = () => Math.floor(Date.now() / VIP_CFG.gunUzunlugu);

function kayit(ad) {
  let k = veri[ad];
  if (!k) { k = veri[ad] = { xp: 0, gun: bugun(), gunlukXp: 0, sonIslem: Date.now(), sonOdul: -1 }; kirli = true; }
  if (k.gun !== bugun()) { k.gun = bugun(); k.gunlukXp = 0; kirli = true; }
  return k;
}

export function seviyeBul(xp) {
  let s = SEVIYELER[0];
  for (const a of SEVIYELER) if (xp >= a.xp) s = a;
  return s;
}
export function xpOku(ad) { return kayit(ad).xp; }
export function seviye(ad) { return seviyeBul(xpOku(ad)); }

// Marketin SANA SATTIGI fiyata uygulanan indirim (0 - 0.10).
export function indirim(ad) { return VIP_CFG.acik ? seviye(ad).indirim : 0; }
// Indirimli fiyat - IKI TABANI VAR:
//   1) `dip`: arz-talebin indirebilecegi EN DUSUK fiyat. VIP indirimi bunun
//      altina inemez. Yoksa iki indirim ust uste binip ekonomiyi aciyordu:
//      guvenlik payi MAKAS/URETIM = 1.29 iken, arz-talep ucu (1.10/0.90 =
//      1.22) uzerine %10 VIP koyunca oran 1.36'ya cikiyor ve "ucuza al,
//      craftla, pahaliya sat" kar ediyordu. Denetci 23 acik buldu.
//      Kural: zaten dip fiyattaki mala ayrica VIP indirimi yok.
//   2) `alis`: satis fiyati asla alis fiyatinin altina/esitine inemez,
//      yoksa "al, hemen geri sat" kari olusur.
export function indirimliFiyat(ad, satis, alis, dip) {
  const i = indirim(ad);
  if (!i) return satis;
  let yeni = Math.max(1, Math.ceil(satis * (1 - i)));
  if (Number.isFinite(dip)) yeni = Math.max(yeni, dip);
  if (Number.isFinite(alis)) yeni = Math.max(yeni, alis + 1);
  return Math.min(satis, yeni);
}

// Islem hacminden XP yazar. `kar` false ise (zararina islem) XP verilmez.
export function islemXp(ad, hacim, karliMi = true) {
  if (!VIP_CFG.acik || !karliMi || !(hacim > 0)) return 0;
  const k = kayit(ad);
  // Buyuk islemlerde kademeli azaltma
  const esik = VIP_CFG.kademeEsigi;
  const sayilan = hacim <= esik ? hacim : esik + (hacim - esik) * VIP_CFG.kademeOrani;
  let xp = Math.floor(sayilan / VIP_CFG.xpBirimi * seviyeBul(k.xp).carpan);
  const kalan = Math.max(0, VIP_CFG.gunlukXpTavani - k.gunlukXp);
  xp = Math.min(xp, kalan);
  if (xp <= 0) { k.sonIslem = Date.now(); kirli = true; return 0; }
  const onceki = seviyeBul(k.xp).s;
  k.xp += xp; k.gunlukXp += xp; k.sonIslem = Date.now(); kirli = true;
  const sonraki = seviyeBul(k.xp).s;
  if (sonraki > onceki) terfi(ad, seviyeBul(k.xp));
  return xp;
}

function terfi(ad, sev) {
  const p = world.getAllPlayers().find(x => x.name === ad);
  if (!p) return;
  try {
    p.sendMessage(`§6§l⭐ ${sev.ad}! §r§7Artık alışlarında §e%${Math.round(sev.indirim * 100)}§7 indirim var.`);
    if (sev.odul) p.sendMessage("§7Günlük VIP ödülünü §f!vip§7 ile al.");
    p.playSound("random.levelup");
    p.onScreenDisplay.setTitle(`§6${sev.ad}`, { subtitle: "§7Mağaza seviyen yükseldi", fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
  } catch { }
}

// ---- Gunluk odul ----
const rast = (a) => a[Math.floor(Math.random() * a.length)];

function odulUret(tur) {
  const r = Math.random();
  let havuz, adet;
  if (tur === "nadir") {
    havuz = r < 0.45 ? ODUL_HAVUZ.yaygin : r < 0.72 ? ODUL_HAVUZ.orta : r < 0.93 ? ODUL_HAVUZ.degerli : ODUL_HAVUZ.nadir;
    adet = havuz === ODUL_HAVUZ.nadir ? 8 : havuz === ODUL_HAVUZ.degerli ? 32 : 192;
  } else if (tur === "buyuk") {
    havuz = r < 0.60 ? ODUL_HAVUZ.yaygin : r < 0.85 ? ODUL_HAVUZ.orta : r < 0.97 ? ODUL_HAVUZ.degerli : ODUL_HAVUZ.nadir;
    adet = havuz === ODUL_HAVUZ.nadir ? 4 : havuz === ODUL_HAVUZ.degerli ? 16 : 128;
  } else if (tur === "kaynak") {
    havuz = r < 0.68 ? ODUL_HAVUZ.yaygin : r < 0.88 ? ODUL_HAVUZ.orta : r < 0.98 ? ODUL_HAVUZ.degerli : ODUL_HAVUZ.nadir;
    adet = havuz === ODUL_HAVUZ.nadir ? 2 : havuz === ODUL_HAVUZ.degerli ? 8 : 64;
  } else {  // "blok": %70 yaygin, %20 orta, %8 degerli, %2 nadir
    havuz = r < 0.70 ? ODUL_HAVUZ.yaygin : r < 0.90 ? ODUL_HAVUZ.orta : r < 0.98 ? ODUL_HAVUZ.degerli : ODUL_HAVUZ.nadir;
    adet = havuz === ODUL_HAVUZ.nadir ? 1 : havuz === ODUL_HAVUZ.degerli ? 8 : 64;
  }
  return { id: rast(havuz), adet };
}

export function odulHazirMi(ad) {
  const k = kayit(ad);
  const sev = seviyeBul(k.xp);
  return !!sev.odul && k.sonOdul !== bugun();
}

export function odulAl(p) {
  const k = kayit(p.name);
  const sev = seviyeBul(k.xp);
  if (!sev.odul) return { ok: false, sebep: "VIP-2 ve ustu günlük ödül alır." };
  if (k.sonOdul === bugun()) return { ok: false, sebep: "Bugünkü ödülünü aldın. Yeni Minecraft gününde tekrar gel." };
  k.sonOdul = bugun(); kirli = true;
  const kac = sev.s >= 8 ? 3 : sev.s >= 6 ? 2 : 1;
  const verilen = [];
  for (let i = 0; i < kac; i++) {
    const o = odulUret(sev.odul);
    try {
      const it = new mc.ItemStack(o.id, Math.min(o.adet, 64));
      let kalan = o.adet;
      while (kalan > 0) {
        const par = Math.min(kalan, 64);
        api.esyaVer(p, new mc.ItemStack(o.id, par));
        kalan -= par;
      }
      verilen.push(o);
    } catch { }
  }
  return { ok: true, verilen };
}

// ---- Sonum: uzun sure islem yoksa XP erir ----
function sonumUygula() {
  const simdi = Date.now();
  const sinir = VIP_CFG.sonumGun * VIP_CFG.gunUzunlugu;
  for (const [ad, k] of Object.entries(veri)) {
    if (!k || !(k.xp > 0)) continue;
    if (simdi - (k.sonIslem ?? simdi) < sinir) continue;
    k.xp = Math.floor(k.xp * (1 - VIP_CFG.sonumOrani));
    k.sonIslem = simdi;          // bir sonraki erime icin sayac yeniden
    kirli = true;
  }
}

export function kur(apiRef) {
  api = apiRef;
  yukle();
  system.runInterval(() => { sonumUygula(); yaz(); }, 600);
  console.warn("[VIP] Magaza seviyesi sistemi aktif.");
}

// ---- Ekran ----
export function ekran(p, apiRef) {
  if (apiRef) api = apiRef;
  const k = kayit(p.name);
  const sev = seviyeBul(k.xp);
  const sonraki = SEVIYELER.find(x => x.xp > k.xp);
  const ilerleme = sonraki
    ? `§7${sonraki.ad} için: §f${api.fmt(sonraki.xp - k.xp)} VIP XP\n${cubuk(k.xp, sev.xp, sonraki.xp)}`
    : "§6En yüksek seviyedesin.";

  const govde =
    `§6§l${sev.ad}§r  §7${api.fmt(k.xp)} VIP XP\n${ilerleme}\n\n` +
    `§eAyrıcalıkların\n` +
    `§7Alış indirimi: §a%${Math.round(sev.indirim * 100)}\n` +
    `§7XP çarpanı: §f×${sev.carpan.toFixed(2)}\n` +
    `§7Günlük ödül: §f${sev.odul ? (sev.s >= 8 ? "3 paket" : sev.s >= 6 ? "2 paket" : "1 paket") : "yok (VIP-2'de açılır)"}\n\n` +
    `§8Her §f$${VIP_CFG.xpBirimi}§8'lık alış VE satış = 1 VIP XP\n` +
    `§8Günlük XP tavanı: ${api.fmt(VIP_CFG.gunlukXpTavani)} §8(bugün ${api.fmt(k.gunlukXp)})\n` +
    `§8İndirim sadece MARKETTEN ALIRKEN geçerli.`;

  const f = new ui.ActionFormData().title("§lVIP / MAĞAZA SEVİYESİ").body(govde);
  const islem = [];
  if (odulHazirMi(p.name)) {
    f.button("§a§lGÜNLÜK ÖDÜLÜ AL", "textures/items/diamond");
    islem.push(() => {
      const r = odulAl(p);
      if (!r.ok) { p.sendMessage("§c[VIP] " + r.sebep); return; }
      for (const o of r.verilen)
        p.sendMessage(`§6[VIP] §f${o.adet}x §e${o.id.replace("minecraft:", "")}`);
      try { p.playSound("random.orb"); } catch { }
      ekran(p);
    });
  }
  f.button("§7Seviye Tablosu"); islem.push(() => tablo(p));
  f.button("§7< Geri"); islem.push(() => api.anaMenu?.(p));
  f.show(p).then(r => { if (!r.canceled) islem[r.selection]?.(); });
}

function cubuk(xp, alt, ust) {
  const oran = Math.max(0, Math.min(1, (xp - alt) / Math.max(1, ust - alt)));
  const dolu = Math.round(oran * 20);
  return "§a" + "█".repeat(dolu) + "§8" + "░".repeat(20 - dolu) + ` §7%${Math.round(oran * 100)}`;
}

function tablo(p) {
  const k = kayit(p.name);
  const satir = SEVIYELER.map(s => {
    const isaret = k.xp >= s.xp ? "§a✔" : "§8•";
    return `${isaret} §f${s.ad}§7 ${String(api.fmt(s.xp)).padStart(9)} XP  §e%${Math.round(s.indirim * 100)}§7 indirim${s.odul ? " §8+ödül" : ""}`;
  }).join("\n");
  new ui.ActionFormData().title("§lVIP SEVİYELERİ")
    .body(satir + "\n\n§8Mağazadan alıp sattıkça yükselirsin. Para ile satın alınamaz.")
    .button("§7< Geri").show(p).then(r => { if (!r.canceled) ekran(p); });
}

export function rapor(ad) {
  const k = kayit(ad);
  const sev = seviyeBul(k.xp);
  const sonraki = SEVIYELER.find(x => x.xp > k.xp);
  return [
    `§6${sev.ad} §7- ${k.xp} VIP XP`,
    `§7Alış indirimi: §a%${Math.round(sev.indirim * 100)}`,
    sonraki ? `§7${sonraki.ad} için ${sonraki.xp - k.xp} XP daha` : "§6En yüksek seviye"
  ];
}
