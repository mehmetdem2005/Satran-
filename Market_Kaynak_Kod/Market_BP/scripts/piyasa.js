// ============ ARZ - TALEP (canli piyasa) ============
// Hazir Market'in fiyatlari artik sabit degil: oyuncular ne yaptiysa
// fiyat ona gore kayar.
//
//   Bir esyayi COK SATARSAN  -> arz artar -> market o esyaya DAHA AZ oder
//   Bir esyayi COK ALIRSAN   -> talep artar -> market onu DAHA PAHALI satar
//
// Zamanla her sey normale doner (SONUM), yani bir gunluk cilginlik kalici
// fiyat bozmaz.
//
// GUVENLIK (onemli): carpanlar keyfi secilmedi. Ekonomi "girdiyi al,
// craftla, ciktiyi sat" hesabina dayaniyor; en dar guvenlik payi
//   MAKAS (2.2) / URETIM (1.7) = 1.29 kat.
// Bu yuzden en dusuk ALIS carpani ile en yuksek SATIS carpani arasindaki
// oran 1.29'un altinda kalmali:
//   satis en az 0.90 x 2.2 = 1.98   >   alis en fazla 1.10 x 1.7 = 1.87
// arac/arbitraj.mjs bunu "en kotu durum" olarak ayrica denetliyor.

import * as mc from "@minecraft/server";
import { piyasaBagla, tabanDeger } from "./fiyat.js";

export const PIYASA_CFG = {
  acik: true,
  anahtar: "mk_piyasa",
  // Akis ADET degil DEGER olarak olculur: 2000 bugday ile 2000 elmas
  // piyasayi ayni kadar oynatmamali. Her adet, esyanin taban degeri
  // kadar agirlik tasir; hacim de o yuzden "kac liralik net akis
  // carpani ucuna tasir" demek. 150.000 ~ 27 yigin elmas (1728 adet).
  hacim: 150000,
  // ALIS = marketin sana odedigi. Cok satarsan duser.
  alisAlt: 0.75, alisUst: 1.10,
  // SATIS = senin odedigin. Cok alirsan yukselir.
  satisAlt: 0.90, satisUst: 1.60,
  sonum: 0.97,          // her sonumAraligi'nda net akis bu oranda erir
  sonumAraligi: 300,    // saniye (5 dakika)
  kayitAraligi: 60,     // saniye - diske yazma
  enAzAkis: 250         // bunun altindaki net akis kaydedilmez (~3 elmas)
};

// id -> net akis (pozitif: oyuncular ALDI, negatif: oyuncular SATTI)
let akis = new Map();
let api = null, kirli = false, sonSonum = Date.now(), sonKayit = Date.now();

function yukle() {
  try {
    const d = api?.yukle(PIYASA_CFG.anahtar, {}) ?? {};
    akis = new Map(Object.entries(d).map(([k, v]) => [k, Number(v) || 0]));
  } catch { akis = new Map(); }
}
function yaz() {
  if (!api || !kirli) return;
  const d = {};
  for (const [k, v] of akis) if (Math.abs(v) >= PIYASA_CFG.enAzAkis) d[k] = Math.round(v);
  try { api.kaydet(PIYASA_CFG.anahtar, d); kirli = false; } catch { }
}

// Net akisi -1..+1 araligina getirir.
function baski(id) {
  const n = akis.get(id) ?? 0;
  if (!n) return 0;
  return Math.max(-1, Math.min(1, n / PIYASA_CFG.hacim));
}

// Bir esyanin guncel carpanlari.
export function carpan(id) {
  if (!PIYASA_CFG.acik) return null;
  const d = baski(id);
  if (d === 0) return null;
  const C = PIYASA_CFG;
  const alis = d > 0
    ? 1 + d * (C.alisUst - 1)        // talep: market biraz daha cok oder
    : 1 + d * (1 - C.alisAlt);       // arz: market belirgin az oder
  const satis = d > 0
    ? 1 + d * (C.satisUst - 1)       // talep: satin almak belirgin pahali
    : 1 + d * (1 - C.satisAlt);      // arz: satin almak biraz ucuz
  return { alis, satis };
}

// Bir adedin piyasa agirligi = esyanin taban degeri. Boylece ucuz yigin
// mallar fiyati sarsmaz, pahali esyalar birkac yiginda hissedilir.
const agirlikBellek = new Map();
function agirlik(id) {
  let a = agirlikBellek.get(id);
  if (a === undefined) {
    try { a = Math.max(1, tabanDeger(id)); } catch { a = 1; }
    agirlikBellek.set(id, a);
  }
  return a;
}

// Oyuncu marketten ALDI (talep) / markete SATTI (arz).
export function alindi(id, adet) { hareket(id, +Math.max(0, adet) * agirlik(id)); }
export function satildi(id, adet) { hareket(id, -Math.max(0, adet) * agirlik(id)); }
function hareket(id, delta) {
  if (!PIYASA_CFG.acik || !delta) return;
  const yeni = (akis.get(id) ?? 0) + delta;
  const sinir = PIYASA_CFG.hacim * 1.5;      // carpan zaten uclarda doyuyor
  akis.set(id, Math.max(-sinir, Math.min(sinir, yeni)));
  kirli = true;
}

// Yuzde olarak degisim (menude gostermek icin). Ornek: +18 / -9
export function yuzde(id) {
  const c = carpan(id);
  if (!c) return null;
  return { alis: Math.round((c.alis - 1) * 100), satis: Math.round((c.satis - 1) * 100) };
}

// En cok hareket eden esyalar (piyasa ekrani)
export function hareketliler(limit = 20) {
  return [...akis.entries()]
    .filter(([, v]) => Math.abs(v) >= PIYASA_CFG.enAzAkis)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, limit)
    .map(([id, v]) => ({ id, akis: Math.round(v), ...(yuzde(id) ?? { alis: 0, satis: 0 }) }));
}

export function sifirla() { akis = new Map(); kirli = true; yaz(); }

export function kur(apiRef) {
  api = apiRef;
  yukle();
  piyasaBagla(carpan);            // fiyat motoru artik piyasayi soruyor
  mc.system.runInterval(() => {
    const simdi = Date.now();
    if (simdi - sonSonum >= PIYASA_CFG.sonumAraligi * 1000) {
      sonSonum = simdi;
      let degisti = false;
      for (const [k, v] of akis) {
        const y = v * PIYASA_CFG.sonum;
        if (Math.abs(y) < PIYASA_CFG.enAzAkis) { akis.delete(k); degisti = true; }
        else if (y !== v) { akis.set(k, y); degisti = true; }
      }
      if (degisti) kirli = true;
    }
    if (simdi - sonKayit >= PIYASA_CFG.kayitAraligi * 1000) { sonKayit = simdi; yaz(); }
  }, 100);
  console.warn("[Piyasa] Arz-talep motoru aktif.");
}
