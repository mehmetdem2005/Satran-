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
const { world, system } = mc;

export const AMETIS_CFG = {
  acik: true,
  omurSaat: 4,          // kac saat sonra yok olur
  tikAraligi: 40,       // kac tikte bir kontrol (40 tik = 2 saniye)
  uyariDakika: [30, 10, 5, 1],   // kalan sure bu degerlere dusunce uyar
  ses: true
};

// Alet id -> gorunen ad
export const ALETLER = {
  "mk:ametis_kazma":  "Ametist Kazma",
  "mk:ametis_kurek":  "Ametist Kürek",
  "mk:ametis_balta":  "Ametist Balta",
  "mk:ametis_kilic":  "Ametist Kılıç",
  "mk:ametis_mizrak": "Ametist Mızrak"
};

export function ametisMi(item) {
  return !!item && Object.prototype.hasOwnProperty.call(ALETLER, item.typeId);
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
  try {
    item.setLore([
      "§7Ametist alet - §dsüreli",
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
  return satir;
}
