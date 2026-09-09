// ============ VERI SURUMU, GOC VE YEDEK ============
// Amac: modu guncelleyince markette birikmis ilanlar, arsalar, fiyat
// gecmisi ve bekleyen teslimatlar kaybolmasin.
//
// NEREDE DURUYOR (kisa cevap: pakette degil, DUNYADA):
//  - ilanlar, arsalar, fiyat gecmisi, bekleyen teslimat, arena kaydi
//    -> world dynamic property (dunya dosyasinda)
//  - para -> "money" scoreboard hedefi (dunya dosyasinda)
// Ikisi de behavior pack'in icinde degil, dunyanin icinde tutulur. Paketin
// UUID'si surumler arasinda AYNI kaldigi surece (kaldi) yeni surumu ice
// aktarmak veriyi silmez.
//
// Yine de iki guvenlik katmani var:
//  1) Veri surumu takibi: bicim degisirse acilista otomatik goc calisir.
//  2) Otomatik + elle yedek: goc oncesi yedek alinir, admin panelinden
//     istenildigi an geri yuklenebilir.

import * as mc from "@minecraft/server";
import { PARA_TAVANI } from "./fiyat.js";

// v4.0 para olcegi. v4.2'de fiyatlar eski seviyeye dondugu icin bu kat
// sayisi geri alinir; sabit burada duruyor cunku iki goc de ona bagli.
const OLCEK_V40 = 30;
const { world } = mc;

export const VERI_SURUMU = 4;          // veri bicimi her degistiginde artir
const SURUM_ANAHTARI = "mk_veri_surumu";
const YEDEK_BILGI = "mk_yedek_bilgi";

// Yedeklenen / gocurulen anahtarlar
export const ANAHTARLAR = [
  "mk_ilan",        // oyuncu ilanlari
  "mk_gecmis",      // fiyat rehberi gecmisi
  "mk_bpara",       // bekleyen para
  "mk_besya",       // bekleyen esya
  "mk_arsa",        // arsalar
  "mk_arsa_kose",   // arsa kose secimleri
  "mk_arena"        // duello arenasi
];

const say = (v) => (Array.isArray(v) ? v.length : (v && typeof v === "object") ? Object.keys(v).length : (v ? 1 : 0));

export function surumOku() {
  const v = world.getDynamicProperty(SURUM_ANAHTARI);
  return typeof v === "number" ? v : 1;      // isaret yoksa v1 kabul
}

export function ozet(api) {
  const o = { surum: surumOku(), sayilar: {} };
  for (const a of ANAHTARLAR) {
    try { o.sayilar[a] = say(api.yukle(a, null)); } catch { o.sayilar[a] = 0; }
  }
  try { o.yedek = api.yukle(YEDEK_BILGI, null); } catch { o.yedek = null; }
  try { o.paraHedefi = !!world.scoreboard.getObjective("money"); } catch { o.paraHedefi = false; }
  return o;
}

// ---- YEDEK ----
export function yedekAl(api, etiket) {
  const bilgi = { zaman: Date.now(), etiket: etiket ?? "elle", sayilar: {} };
  for (const a of ANAHTARLAR) {
    let v = null;
    try { v = api.yukle(a, null); } catch { }
    try { api.kaydet("mk_y_" + a, v); } catch (e) { console.warn("[Veri] yedek yazilamadi: " + a + " " + e); }
    bilgi.sayilar[a] = say(v);
  }
  try { api.kaydet(YEDEK_BILGI, bilgi); } catch { }
  console.warn(`[Veri] Yedek alindi (${bilgi.etiket}): ` +
    Object.entries(bilgi.sayilar).map(([k, n]) => `${k}=${n}`).join(", "));
  return bilgi;
}

export function yedekVarMi(api) {
  try { return !!api.yukle(YEDEK_BILGI, null); } catch { return false; }
}

export function yedektenYukle(api) {
  const bilgi = api.yukle(YEDEK_BILGI, null);
  if (!bilgi) return null;
  // geri yuklemeden once simdiki hali de yedekle (yanlis basma korumasi)
  const simdiki = {};
  for (const a of ANAHTARLAR) { try { simdiki[a] = api.yukle(a, null); } catch { } }
  try { api.kaydet("mk_y_geri_alma", simdiki); } catch { }

  let yuklenen = 0;
  for (const a of ANAHTARLAR) {
    let v = null;
    try { v = api.yukle("mk_y_" + a, null); } catch { }
    if (v === null || v === undefined) continue;
    try { api.kaydet(a, v); yuklenen++; } catch (e) { console.warn("[Veri] geri yuklenemedi: " + a + " " + e); }
  }
  console.warn(`[Veri] Yedekten geri yuklendi: ${yuklenen} kayit (${new Date(bilgi.zaman).toISOString()})`);
  return { bilgi, yuklenen };
}

// ---- GOC (migration) ----
// Her goc, veriyi ESKI bicimden YENI bicime cevirir. Yeni bir bicim
// degisikligi yaparsan VERI_SURUMU'nu artir ve buraya bir adim ekle.
const GOCLER = {
  // v1 -> v2: arsa kose secimi tek koseden ({x,z,d}) iki koseye ({k1,k2}) gecti
  2: (api) => {
    const eski = api.yukle("mk_arsa_kose", null);
    if (!eski || typeof eski !== "object") return "arsa kosesi yok";
    let n = 0;
    const yeni = {};
    for (const [ad, k] of Object.entries(eski)) {
      if (k && (k.k1 || k.k2)) { yeni[ad] = k; continue; }   // zaten yeni bicim
      if (k && typeof k.x === "number") { yeni[ad] = { k1: k }; n++; continue; }
      yeni[ad] = k;
    }
    api.kaydet("mk_arsa_kose", yeni);
    return `${n} arsa kose secimi yeni bicime gecirildi`;
  },

  // v2 -> v3: para olcegi degisti (v4.0). Butun fiyatlar OLCEK katina
  // cikti; dunyada birikmis para ve fiyatlar da ayni katsayiyla buyutulur,
  // yoksa eski oyuncularin birikimi bir anda degersizlesirdi.
  3: (api) => {
    const K = OLCEK_V40;
    const buyut = (n) => Math.max(0, Math.min(PARA_TAVANI, Math.round((Number(n) || 0) * K)));
    const raporlar = [];

    // 1) oyuncu bakiyeleri (scoreboard)
    try {
      const hedef = world.scoreboard.getObjective("money");
      let n = 0;
      for (const katilimci of hedef?.getParticipants?.() ?? []) {
        const eski = hedef.getScore(katilimci);
        if (typeof eski !== "number" || eski <= 0) continue;
        hedef.setScore(katilimci, buyut(eski));
        n++;
      }
      raporlar.push(`${n} bakiye`);
    } catch (e) { raporlar.push("bakiye okunamadi"); }

    // 2) oyuncu ilanlarinin fiyatlari
    try {
      const ilan = api.yukle("mk_ilan", []) ?? [];
      let n = 0;
      for (const i of ilan) {
        if (typeof i?.f === "number") { i.f = buyut(i.f); n++; }
        if (typeof i?.bahis === "number") i.bahis = buyut(i.bahis);
      }
      if (n) api.kaydet("mk_ilan", ilan);
      raporlar.push(`${n} ilan`);
    } catch { raporlar.push("ilan hatasi"); }

    // 3) bekleyen odemeler
    try {
      const bp = api.yukle("mk_bpara", {}) ?? {};
      let n = 0;
      for (const ad of Object.keys(bp)) { bp[ad] = buyut(bp[ad]); n++; }
      if (n) api.kaydet("mk_bpara", bp);
      raporlar.push(`${n} bekleyen odeme`);
    } catch { raporlar.push("bekleyen odeme hatasi"); }

    // 4) fiyat gecmisi (rehber ortalamalari)
    try {
      const g = api.yukle("mk_gecmis", []) ?? [];
      let n = 0;
      for (const k of g) { if (typeof k?.b === "number") { k.b = buyut(k.b); n++; } }
      if (n) api.kaydet("mk_gecmis", g);
      raporlar.push(`${n} gecmis kaydi`);
    } catch { raporlar.push("gecmis hatasi"); }

    // 5) arsa satis / kira fiyatlari
    try {
      const arsalar = api.yukle("mk_arsa", []) ?? [];
      let n = 0;
      for (const a of arsalar) {
        if (typeof a?.sat?.fiyat === "number") { a.sat.fiyat = buyut(a.sat.fiyat); n++; }
        if (typeof a?.kira?.fiyat === "number") { a.kira.fiyat = buyut(a.kira.fiyat); n++; }
        if (typeof a?.kiraci?.odenen === "number") a.kiraci.odenen = buyut(a.kiraci.odenen);
      }
      if (n) api.kaydet("mk_arsa", arsalar);
      raporlar.push(`${n} arsa fiyati`);
    } catch { raporlar.push("arsa hatasi"); }

    return `para olcegi x${K}: ` + raporlar.join(", ");
  },

  // v3 -> v4: v4.0'da butun fiyatlar 30 katina cikarilmisti; v4.2'de eski
  // seviyeye donuldu. Dunyada birikmis para ve fiyatlar da ayni oranda
  // kucultulur, yoksa herkes bir anda 30 kat zengin kalirdi.
  //
  // NOT: Hic v4.0/v4.1 gormemis bir dunya once 3. gocu (x30), hemen ardindan
  // bu gocu (/30) calistirir; sonuc degismez. v4.0 gormus dunya ise sadece
  // bunu calistirir ve dogru yere iner.
  4: (api) => {
    const K = OLCEK_V40;
    const kucult = (n) => Math.max(0, Math.min(PARA_TAVANI, Math.round((Number(n) || 0) / K)));
    const raporlar = [];

    try {
      const hedef = world.scoreboard.getObjective("money");
      let n = 0;
      for (const katilimci of hedef?.getParticipants?.() ?? []) {
        const eski = hedef.getScore(katilimci);
        if (typeof eski !== "number" || eski <= 0) continue;
        hedef.setScore(katilimci, kucult(eski));
        n++;
      }
      raporlar.push(`${n} bakiye`);
    } catch { raporlar.push("bakiye okunamadi"); }

    try {
      const ilan = api.yukle("mk_ilan", []) ?? [];
      let n = 0;
      for (const i of ilan) {
        if (typeof i?.f === "number") { i.f = Math.max(1, kucult(i.f)); n++; }
        if (typeof i?.bahis === "number") i.bahis = kucult(i.bahis);
      }
      if (n) api.kaydet("mk_ilan", ilan);
      raporlar.push(`${n} ilan`);
    } catch { raporlar.push("ilan hatasi"); }

    try {
      const bp = api.yukle("mk_bpara", {}) ?? {};
      let n = 0;
      for (const ad of Object.keys(bp)) { bp[ad] = kucult(bp[ad]); n++; }
      if (n) api.kaydet("mk_bpara", bp);
      raporlar.push(`${n} bekleyen odeme`);
    } catch { raporlar.push("bekleyen odeme hatasi"); }

    try {
      const g = api.yukle("mk_gecmis", []) ?? [];
      let n = 0;
      for (const k of g) { if (typeof k?.b === "number") { k.b = Math.max(1, kucult(k.b)); n++; } }
      if (n) api.kaydet("mk_gecmis", g);
      raporlar.push(`${n} gecmis kaydi`);
    } catch { raporlar.push("gecmis hatasi"); }

    try {
      const arsalar = api.yukle("mk_arsa", []) ?? [];
      let n = 0;
      for (const a of arsalar) {
        if (typeof a?.sat?.fiyat === "number") { a.sat.fiyat = Math.max(1, kucult(a.sat.fiyat)); n++; }
        if (typeof a?.kira?.fiyat === "number") { a.kira.fiyat = Math.max(1, kucult(a.kira.fiyat)); n++; }
        if (typeof a?.kiraci?.odenen === "number") a.kiraci.odenen = kucult(a.kiraci.odenen);
      }
      if (n) api.kaydet("mk_arsa", arsalar);
      raporlar.push(`${n} arsa fiyati`);
    } catch { raporlar.push("arsa hatasi"); }

    return `para olcegi /${K}: ` + raporlar.join(", ");
  }
};

// Acilista calisir. Veri surumu eskiyse once yedek alir, sonra gocu isletir.
export function acilistaKontrol(api) {
  const eski = surumOku();
  if (eski === VERI_SURUMU) return null;
  if (eski > VERI_SURUMU) {
    console.warn(`[Veri] UYARI: dunyadaki veri surumu (${eski}) modun surumunden (${VERI_SURUMU}) yeni. ` +
      "Muhtemelen daha yeni bir surumden geri donuldu; veriye dokunulmuyor.");
    return null;
  }
  console.warn(`[Veri] Veri surumu ${eski} -> ${VERI_SURUMU}, goc basliyor.`);
  yedekAl(api, `goc_oncesi_v${eski}`);
  const adimlar = [];
  for (let s = eski + 1; s <= VERI_SURUMU; s++) {
    const goc = GOCLER[s];
    if (!goc) continue;
    try { adimlar.push(`v${s}: ${goc(api)}`); }
    catch (e) { adimlar.push(`v${s}: HATA ${e}`); console.warn("[Veri] goc hatasi: " + e); }
  }
  try { world.setDynamicProperty(SURUM_ANAHTARI, VERI_SURUMU); } catch { }
  console.warn("[Veri] Goc tamam. " + (adimlar.join(" | ") || "yapacak bir sey yoktu"));
  return { eski, yeni: VERI_SURUMU, adimlar };
}
