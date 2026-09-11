// ============ AMETIST ALETLER ============
// Netherite'tan guclu ama OMURLU aletler: eline gectigi andan itibaren
// AMETIS_CFG.omurSaat saat sonra eriyip yok olurlar.
//
// Neden boyle: kalici olsalardi netherite'i tamamen anlamsiz kilarlardi.
// Sureli olunca "en guclu alet" olmak yerine "dogru anda kullanilan
// pahali kaynak" oluyorlar - o yuzden tam buyulu netherite'tan da degerli.
//
// SURE NASIL TUTULUYOR: aletin uzerine yazilan lore satirinda. Dinamik
// ozellik degil, cunku lore hem kalici hem de oyuncuya kalan sureyi
// gosteriyor. Envanterden cikip sandiga girse bile sure isler.

import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
import { fiyat } from "./fiyat.js";
const { world, system } = mc;

export const AMETIS_CFG = {
  acik: true,
  omurSaat: 4,          // kac saat sonra yok olur
  tikAraligi: 40,       // kac tikte bir kontrol (40 tik = 2 saniye)
  uyariDakika: [30, 10, 5, 1],   // kalan sure bu degerlere dusunce uyar
  ses: true
};

// Alet id -> gorunen ad
// v4.5: sadece balta ve kilic kaldi. Kazma/kurek/mizrak kaldirildi -
// bes ayri sureli alet hem crafti karmasiklastiriyor hem de her birinin
// ayri omur sayaci envanteri gurultuye bogiyordu.
export const ALETLER = {
  "mk:ametis_balta": "Ametist Balta",
  "mk:ametis_kilic": "Ametist Kılıç"
};

export function ametisMi(item) {
  return !!item && Object.prototype.hasOwnProperty.call(ALETLER, item.typeId);
}

// ============ AMETIST ATOLYESI (v4.5) ============
// Duz ametist alet yerine ISTEDIGIN BUYUYLE alet dovduruyorsun.
// Fiyat = aletin market alis fiyati + buyunun seviye basina bedeli.
// Buyu bedelleri kasten agir: bu aletler 4 saatte eriyor, yani surekli
// alinacak bir sey olsaydi ekonomi tek kalemden akardi.
//
// ad     : oyuncunun gordugu Turkce ad
// enCok  : Bedrock'un izin verdigi en yuksek seviye (ustunu oyun reddeder)
// birim  : seviye basina ek ucret
export const BUYULER = {
  "mk:ametis_kilic": [
    { id: "sharpness",          ad: "Keskinlik",      enCok: 5, birim: 9000 },
    { id: "smite",              ad: "Kutsama",        enCok: 5, birim: 6000 },
    { id: "bane_of_arthropods", ad: "Böcek Belası",   enCok: 5, birim: 6000 },
    { id: "fire_aspect",        ad: "Alev Dokunuşu",  enCok: 2, birim: 14000 },
    { id: "looting",            ad: "Yağma",          enCok: 3, birim: 20000 },
    { id: "knockback",          ad: "Geri İtme",      enCok: 2, birim: 5000 },
    { id: "unbreaking",         ad: "Dayanıklılık",   enCok: 3, birim: 8000 },
    { id: "mending",            ad: "Onarım",         enCok: 1, birim: 40000 }
  ],
  "mk:ametis_balta": [
    { id: "sharpness",   ad: "Keskinlik",        enCok: 5, birim: 9000 },
    { id: "efficiency",  ad: "Verimlilik",       enCok: 5, birim: 9000 },
    { id: "fortune",     ad: "Şans",             enCok: 3, birim: 22000 },
    { id: "silk_touch",  ad: "İpeksi Dokunuş",   enCok: 1, birim: 30000 },
    { id: "unbreaking",  ad: "Dayanıklılık",     enCok: 3, birim: 8000 },
    { id: "mending",     ad: "Onarım",           enCok: 1, birim: 40000 }
  ]
};

const ROMEN = ["", "I", "II", "III", "IV", "V"];
export const seviyeYazi = (n) => ROMEN[n] ?? String(n);

// Buyusuz govde fiyati market motorundan gelir; arz-talep oynarsa
// atolye fiyati da onunla birlikte oynar.
export function govdeFiyati(typeId) {
  return fiyat(typeId)?.satis ?? 60000;
}
export function buyuBedeli(b, seviye) { return b.birim * Math.max(1, seviye); }
export function atolyeFiyati(typeId, b, seviye) {
  return govdeFiyati(typeId) + buyuBedeli(b, seviye);
}

// Aletin uzerindeki buyuleri okunakli tek satira cevirir (lore icin).
function buyuOzet(item) {
  try {
    const e = item.getComponent("minecraft:enchantable");
    if (!e) return "";
    const liste = [];
    for (const b of e.getEnchantments() ?? []) {
      const kimlik = typeof b.type === "string" ? b.type : b.type?.id;
      const tablo = [...(BUYULER["mk:ametis_kilic"] ?? []), ...(BUYULER["mk:ametis_balta"] ?? [])];
      const bilinen = tablo.find(x => x.id === kimlik);
      liste.push(`${bilinen?.ad ?? kimlik} ${seviyeYazi(b.level ?? 1)}`);
    }
    return liste.length ? `\u00a75${liste.join(", ")}` : "";
  } catch { return ""; }
}

const ETIKET = "§8[ömür]";          // lore satirinin isareti
const SAAT_MS = 3600000;

function bitisOku(item) {
  try {
    for (const satir of item.getLore() ?? []) {
      if (!satir.startsWith(ETIKET)) continue;
      const n = Number(satir.slice(ETIKET.length).trim());
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch { }
  return undefined;
}

function kalanYazi(ms) {
  if (ms <= 0) return "§cbitti";
  const dk = Math.ceil(ms / 60000);
  if (dk >= 60) {
    const s = Math.floor(dk / 60), k = dk % 60;
    return `§d${s} sa ${k} dk`;
  }
  return dk > 10 ? `§d${dk} dk` : `§c${dk} dk`;
}

// Lore'u kalan sureyi gosterecek sekilde tazeler. Bitis zamani gizli
// satirda saklanir; oyuncuya okunakli satir gosterilir.
function loreYaz(item, bitis) {
  const kalan = bitis - Date.now();
  const buyu = buyuOzet(item);       // "Keskinlik V" gibi
  try {
    item.setLore([
      "§7Ametist alet - §dsüreli",
      ...(buyu ? [buyu] : []),
      `§7Kalan ömür: ${kalanYazi(kalan)}`,
      "§8Süre dolunca eriyip yok olur.",
      `${ETIKET} ${bitis}`
    ]);
  } catch { }
}

// Yeni bir alete omur damgasi basar (henuz damgasi yoksa).
export function damgala(item) {
  if (!ametisMi(item)) return item;
  if (bitisOku(item) !== undefined) return item;
  loreYaz(item, Date.now() + AMETIS_CFG.omurSaat * SAAT_MS);
  return item;
}

const sonUyari = new Map();      // "oyuncu|typeId" -> uyarilan dakika

function uyar(p, item, kalanDk) {
  const anahtar = `${p.name}|${item.typeId}`;
  // Esikler kucukten buyuge taranir: 4 dakika kalmissa "5 dakika" bandina
  // girer, "30 dakika" bandina degil. (Buyukten kucuge tarayinca hep en
  // buyuk esik yakalaniyor ve yanlis sure yaziliyordu.)
  const esikler = [...AMETIS_CFG.uyariDakika].sort((a, b) => a - b);
  for (const esik of esikler) {
    if (kalanDk > esik) continue;
    if (sonUyari.get(anahtar) === esik) return;
    sonUyari.set(anahtar, esik);
    const ad = ALETLER[item.typeId] ?? "Ametist alet";
    p.sendMessage(`§d[Ametist] §f${ad} §7erimeye başladı: §c${kalanDk} dakika§7 kaldı.`);
    if (AMETIS_CFG.ses) { try { p.playSound("random.fizz"); } catch { } }
    return;
  }
}

function eritildi(p, item) {
  const ad = ALETLER[item.typeId] ?? "Ametist alet";
  p.sendMessage(`§d[Ametist] §f${ad} §7eriyip yok oldu. §8(ömrü doldu)`);
  if (AMETIS_CFG.ses) {
    try { p.playSound("random.glass"); } catch { }
    try {
      p.dimension.spawnParticle("minecraft:critical_hit_emitter", {
        x: p.location.x, y: p.location.y + 1, z: p.location.z
      });
    } catch { }
  }
}

// Bir kabin icindeki ametist aletleri isler. Doner: yok edilen sayisi.
function kabiIsle(p, kap) {
  if (!kap) return 0;
  let yokEdilen = 0;
  const simdi = Date.now();
  for (let i = 0; i < kap.size; i++) {
    let item;
    try { item = kap.getItem(i); } catch { continue; }
    if (!ametisMi(item)) continue;

    let bitis = bitisOku(item);
    if (bitis === undefined) {
      // ilk kez goruluyor: omur simdi baslar
      bitis = simdi + AMETIS_CFG.omurSaat * SAAT_MS;
      loreYaz(item, bitis);
      try { kap.setItem(i, item); } catch { }
      continue;
    }

    if (bitis <= simdi) {
      try { kap.setItem(i, undefined); } catch { continue; }
      eritildi(p, item);
      yokEdilen++;
      continue;
    }

    // kalan sureyi tazele (dakika degistiyse yaz, her tikte yazma)
    const kalanDk = Math.ceil((bitis - simdi) / 60000);
    const eskiDk = item._kalanDk;
    if (eskiDk !== kalanDk) {
      loreYaz(item, bitis);
      try { kap.setItem(i, item); } catch { }
    }
    uyar(p, item, kalanDk);
  }
  return yokEdilen;
}

let dongu = null;
export const DURUM = { yokEdilen: 0, damgalanan: 0 };

export function kur() {
  if (dongu !== null || !AMETIS_CFG.acik) return;
  dongu = system.runInterval(() => {
    try {
      for (const p of world.getAllPlayers()) {
        let kap;
        try { kap = p.getComponent("minecraft:inventory")?.container; } catch { continue; }
        DURUM.yokEdilen += kabiIsle(p, kap);
      }
    } catch (e) { console.warn("[Ametist] dongu: " + e); }
  }, AMETIS_CFG.tikAraligi);
  console.warn(`[Ametist] Sureli aletler aktif (${AMETIS_CFG.omurSaat} saat).`);
}

// !ametis: elindeki aletin kalan suresi
export function rapor(p) {
  const satir = [];
  let kap;
  try { kap = p.getComponent("minecraft:inventory")?.container; } catch { }
  const elde = kap?.getItem(p.selectedSlotIndex);
  if (ametisMi(elde)) {
    const bitis = bitisOku(elde);
    satir.push(`§d${ALETLER[elde.typeId]}`);
    satir.push(bitis === undefined
      ? "§7Ömrü henüz başlamadı."
      : `§7Kalan ömür: ${kalanYazi(bitis - Date.now())}`);
  } else {
    satir.push("§7Elinde ametist alet yok.");
  }
  let sayi = 0;
  for (let i = 0; i < (kap?.size ?? 0); i++) if (ametisMi(kap.getItem(i))) sayi++;
  satir.push(`§7Envanterinde §f${sayi}§7 ametist alet var.`);
  satir.push(`§8Ametist aletler ${AMETIS_CFG.omurSaat} saat sonra eriyip yok olur.`);
  satir.push("§8Tarif: ametist bloğu + netherit külçe (craft masası).");
  satir.push("§8İstediğin büyüyle dövdürmek için: §f!atolye");
  return satir;
}

// ---- Atolye ekranlari ----
// 1) alet sec  ->  2) buyu sec  ->  3) seviye + onay
export function atolye(p, api) {
  const f = new ui.ActionFormData()
    .title("§lAMETİST ATÖLYESİ")
    .body(`§7İstediğin büyüyle ametist alet dövdürürsün.\n`
      + `§8Büyü aletin üstüne yazılır.\n\n`
      + `§c⏳ Bu aletler §f${AMETIS_CFG.omurSaat} saat§c sonra eriyip yok olur.\n`
      + `§8Bakiyen: §a${api.fmt(api.paraOku(p))}`);
  const sira = Object.keys(BUYULER);
  for (const id of sira)
    f.button(`§d${ALETLER[id]}\n§8gövde ${api.fmt(govdeFiyati(id))} + büyü`, ikon(id));
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection >= sira.length) return api.anaMenu?.(p);
    buyuSec(p, api, sira[r.selection]);
  });
}

function ikon(id) { return id === "mk:ametis_kilic" ? "textures/items/mk_ametis_kilic" : "textures/items/mk_ametis_balta"; }

function buyuSec(p, api, typeId) {
  const liste = BUYULER[typeId] ?? [];
  const govde = govdeFiyati(typeId);
  const f = new ui.ActionFormData()
    .title(`§l${ALETLER[typeId].toUpperCase()}`)
    .body(`§7Gövde: §c${api.fmt(govde)}\n§7Üstüne bir büyü seçersin.\n`
      + `§8Fiyat = gövde + (seviye × büyü bedeli)\n§8Bakiyen: §a${api.fmt(api.paraOku(p))}`);
  for (const b of liste)
    f.button(`§5${b.ad}\n§8en fazla ${seviyeYazi(b.enCok)} · seviye başı §c${api.fmt(b.birim)}`);
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection >= liste.length) return atolye(p, api);
    seviyeSec(p, api, typeId, liste[r.selection]);
  });
}

function seviyeSec(p, api, typeId, b) {
  const f = new ui.ModalFormData().title(`§l${b.ad.toUpperCase()}`);
  if (b.enCok > 1) f.slider(`Seviye (1 - ${seviyeYazi(b.enCok)})`, 1, b.enCok, { defaultValue: b.enCok });
  else f.toggle(`${b.ad} ${seviyeYazi(1)} — ${api.fmt(atolyeFiyati(typeId, b, 1))}`, { defaultValue: true });
  f.show(p).then(r => {
    if (r.canceled) return buyuSec(p, api, typeId);
    const seviye = b.enCok > 1 ? Math.max(1, Math.min(b.enCok, Math.floor(r.formValues[0]))) : 1;
    if (b.enCok === 1 && r.formValues[0] !== true) return buyuSec(p, api, typeId);
    onay(p, api, typeId, b, seviye);
  });
}

function onay(p, api, typeId, b, seviye) {
  const tutar = atolyeFiyati(typeId, b, seviye);
  const bakiye = api.paraOku(p);
  new ui.ActionFormData()
    .title("§lONAY")
    .body(`§f${ALETLER[typeId]}\n§5${b.ad} ${seviyeYazi(seviye)}\n\n`
      + `§7Gövde: §c${api.fmt(govdeFiyati(typeId))}\n`
      + `§7Büyü: §c${api.fmt(buyuBedeli(b, seviye))} §8(${seviye} × ${api.fmt(b.birim)})\n`
      + `§7Toplam: §c${api.fmt(tutar)}\n§7Bakiyen: §a${api.fmt(bakiye)}\n\n`
      + `§c⏳ ${AMETIS_CFG.omurSaat} saat sonra eriyip yok olur.`)
    .button(bakiye >= tutar ? "§aDÖVDÜR" : "§8(Para yetersiz)", ikon(typeId))
    .button("§7< Geri")
    .show(p).then(r => {
      if (r.canceled || r.selection === 1) return buyuSec(p, api, typeId);
      if (api.paraOku(p) < tutar) { p.sendMessage("§c[Ametist] Yeterli paran yok."); return; }
      const item = uret(typeId, b, seviye);
      if (!item) { p.sendMessage("§c[Ametist] Alet dövülemedi."); return; }
      api.paraEkle(p, -tutar);
      api.esyaVer(p, item);
      p.sendMessage(`§d[Ametist] §f${ALETLER[typeId]} §5${b.ad} ${seviyeYazi(seviye)} §7dövüldü. §c-${api.fmt(tutar)}`);
      try { p.playSound("random.anvil_use"); } catch { }
      DURUM.damgalanan++;
    });
}

// Buyulu, omur damgali ametist alet uretir.
export function uret(typeId, b, seviye) {
  let item;
  try { item = new mc.ItemStack(typeId, 1); } catch { return null; }
  try {
    const e = item.getComponent("minecraft:enchantable");
    // EnchantmentTypes bazi surumlerde nesne, bazilarinda duz metin kabul
    // ediyor; ikisini de deniyoruz ki tek bir surume bagli kalmayalim.
    let tip = b.id;
    try { tip = mc.EnchantmentTypes?.get?.(b.id) ?? b.id; } catch { }
    e?.addEnchantment({ type: tip, level: seviye });
  } catch (err) { console.warn("[Ametist] buyu eklenemedi: " + err); }
  loreYaz(item, Date.now() + AMETIS_CFG.omurSaat * SAAT_MS);
  return item;
}
