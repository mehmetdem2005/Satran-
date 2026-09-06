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
const { world } = mc;

export const VERI_SURUMU = 2;          // veri bicimi her degistiginde artir
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
