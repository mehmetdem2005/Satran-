// ============ TICARET SEVIYESI ============
// Amac: her esya herkese ilk dakikadan acik olmasin. Oyuncu ticaret
// yaptikca XP kazanir, seviye atlar, pahali esyalar seviye ile acilir.
//
// Kurallar:
//  - SATMAK her zaman serbesttir (yoksa yeni oyuncu hic yukselemez).
//  - SATIN ALMAK esyanin seviyesini gerektirir.
//  - Esyanin seviyesi fiyatindan turetilir; elle liste tutulmaz.

import * as mc from "@minecraft/server";
const { world } = mc;

export const SEVIYE_CFG = {
  objective: "mk_xp",
  maxSeviye: 10,
  xpSatisBolen: 10,          // markete satista her 10 para = 1 XP
  xpAlisBolen: 25,           // marketten aliste her 25 para = 1 XP
  xpTavan: 300,              // tek islemde kazanilabilecek en fazla XP
  xpTakas: 15,               // takas basina sabit XP
  oyuncuMarketiKilitli: false, // oyuncu ilanlarinda da seviye sarti aransin mi
  kilitliGoster: true        // seviyesi yetmeyen esya listede kilitli gorunsun
};

// Seviyeye ulasmak icin gereken TOPLAM XP (indis 0 = seviye 1)
export const ESIK = [0, 300, 800, 1700, 3200, 5600, 9500, 15500, 24000, 36000];

export const UNVAN = [
  "Çırak", "Seyyar Satıcı", "Pazarcı", "Esnaf", "Tüccar",
  "Kıdemli Tüccar", "Tacir", "Büyük Tacir", "Lonca Üyesi", "Pazar Ustası"
];

// Esyanin taban fiyatina gore gereken seviye (indis+1)
const FIYAT_ESIK = [3, 8, 18, 40, 80, 160, 320, 700, 1400, Infinity];

export function esyaSeviyesi(tabanFiyat) {
  const f = Number(tabanFiyat) || 0;
  for (let i = 0; i < FIYAT_ESIK.length; i++) if (f <= FIYAT_ESIK[i]) return i + 1;
  return SEVIYE_CFG.maxSeviye;
}

export function seviyeden(xp) {
  let s = 1;
  for (let i = 0; i < ESIK.length; i++) if (xp >= ESIK[i]) s = i + 1;
  return Math.min(s, SEVIYE_CFG.maxSeviye);
}

// ---- XP deposu (scoreboard: para ile ayni mantik, cevrimdisi de durur) ----
function obj() {
  return world.scoreboard.getObjective(SEVIYE_CFG.objective)
      ?? world.scoreboard.addObjective(SEVIYE_CFG.objective, "Ticaret XP");
}
export function xpOku(p) { try { return obj().getScore(p) ?? 0; } catch { return 0; } }
function xpYaz(p, v) { try { obj().setScore(p, Math.max(0, Math.floor(v))); } catch { } }

export function seviye(p) { return seviyeden(xpOku(p)); }

export function ilerleme(p) {
  const xp = xpOku(p);
  const s = seviyeden(xp);
  const son = s >= SEVIYE_CFG.maxSeviye;
  const alt = ESIK[s - 1] ?? 0;
  const ust = son ? alt : ESIK[s];
  const yuzde = son ? 100 : Math.max(0, Math.min(100, Math.round((xp - alt) / (ust - alt) * 100)));
  return { xp, seviye: s, unvan: UNVAN[s - 1] ?? "", son, alt, ust, kalan: son ? 0 : ust - xp, yuzde };
}

// Bedrock'in yazi tipinde golge karakteri (░) ve emoji yok; ayni dolu blogu
// iki renkte kullaniyoruz.
export function cubuk(yuzde, uzunluk = 20) {
  const dolu = Math.round(uzunluk * Math.max(0, Math.min(100, yuzde)) / 100);
  return `§a${"\u2588".repeat(dolu)}§8${"\u2588".repeat(Math.max(0, uzunluk - dolu))}`;
}

// XP verir; seviye atlarsa oyuncuya gosterir. Kazanilan XP'yi dondurur.
export function xpVer(p, miktar) {
  const kazanc = Math.max(0, Math.min(SEVIYE_CFG.xpTavan, Math.floor(miktar)));
  if (kazanc <= 0) return 0;
  const oncekiSeviye = seviyeden(xpOku(p));
  xpYaz(p, xpOku(p) + kazanc);
  const yeni = ilerleme(p);
  if (yeni.seviye > oncekiSeviye) {
    try {
      p.onScreenDisplay.setTitle("§6§lSEVİYE ATLADIN", {
        subtitle: `§eTicaret Lv ${yeni.seviye} §7- §f${yeni.unvan}`,
        fadeInDuration: 5, stayDuration: 45, fadeOutDuration: 10
      });
    } catch { }
    try { p.playSound("random.levelup"); } catch { }
    p.sendMessage(`§6[Market] §lSEVİYE ${yeni.seviye}§r§6 - §f${yeni.unvan}`);
    p.sendMessage("§7Yeni eşyalar açıldı. §fTicaret Seviyesi §7menüsünden bak.");
  } else {
    try { p.onScreenDisplay.setActionBar(`§8+${kazanc} XP  §7Lv ${yeni.seviye}  ${cubuk(yeni.yuzde, 10)}`); } catch { }
  }
  return kazanc;
}

export function xpAyarla(p, deger) { xpYaz(p, deger); }

// Ticaret turlerine gore XP
export const xpSatistan = (tutar) => Math.floor(tutar / SEVIYE_CFG.xpSatisBolen);
export const xpAlistan = (tutar) => Math.floor(tutar / SEVIYE_CFG.xpAlisBolen);

// Bu esyayi alabilir mi? {olur, gerekli, seviye}
export function alabilirMi(p, tabanFiyat) {
  const gerekli = esyaSeviyesi(tabanFiyat);
  const s = seviye(p);
  return { olur: s >= gerekli, gerekli, seviye: s };
}
