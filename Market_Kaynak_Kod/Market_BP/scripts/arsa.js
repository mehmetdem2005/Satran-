import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

const { world, system } = mc;
const { ActionFormData, ModalFormData } = ui;

export const ARSA_CFG = {
  anahtar: "mk_arsa",
  koseAnahtar: "mk_arsa_kose",
  birimFiyat: 2,        // blok basina fiyat (alan * bu)
  maxKenar: 128,        // tek kenar en fazla
  minKenar: 5,
  maxArsaOyuncu: 10,    // v3.2: bir oyuncu kac arsa kurabilir
  iadeOrani: 0.5,       // arsa silinince paranin yarisi geri
  girisBildirimi: true,

  // v2.0 AYARLARI
  // Operatorler arsa korumasini GECMEZ. Eskiden gecerlerdi: dunya sahibi
  // ve butun op'lar korumadan muaftı, bu yuzden koruma "hic calismiyor"
  // gibi gorunuyordu. Gecmesi gereken biri varsa ona "market_admin"
  // etiketi ver: /tag "Oyuncu" add market_admin
  adminGecebilir: false,
  hayvanKorumasi: true, // arsadaki hayvan/esya cercevesi/zirh standi korunur
  sinirGosterme: true,  // menude "Sinirlari Goster" (parcacikla cizer)

  // v3.1: kendi arsana isinlanma
  isinlanma: true,          // "Arsalarim" listesinden kendi arsana isinlan
  uyeIsinlanabilir: false,  // uyeler de sahibinin arsasina isinlanabilsin mi
  isinlanmaBekleme: 3,      // saniye - ust uste isinlanma engeli

  // v3.2: arsa pazari (satis / kiralama)
  pazar: true,            // arsalari baska oyunculara satabilir/kiralayabilir
  maxKiraGun: 60,         // tek seferde en fazla kac gunluk kira
  maxFiyat: 100000000,    // satis/kira fiyat tavani (yanlis yazimi engeller)
  kiraciUyeEkleyebilir: false
};

export const SOPA_ID = "mk:arsa_sopasi";
const SOPA_AD = "§6Arsa Sopası";

const kose = new Map();      // oyuncu.id -> {k1:{x,z,d}, k2:{x,z,d}} (diske de yazilir)
let sopaTik = -99;           // blok tiklamasi ile havaya tiklamayi ayirmak icin
const sonBolge = new Map();  // oyuncu.id -> arsa id / "yok"

// Hangi korumanin gercekten kayit oldugunu tutar; teshis ekrani bunu gosterir.
export const KORUMA_DURUM = {};

// ---- veri (onbellekli) ----
// Eskiden her blok kirmada / her tikte dynamic property okunup JSON.parse
// ediliyordu. Kalabalik bir dunyada bu belirgin gecikme yapiyordu.
let ONBELLEK = null;
function arsalar(api) {
  if (ONBELLEK) return ONBELLEK;
  try { ONBELLEK = api.yukle(ARSA_CFG.anahtar, []) ?? []; }
  catch (e) { console.warn("[Arsa] veri okunamadi: " + e); ONBELLEK = []; }
  if (!Array.isArray(ONBELLEK)) ONBELLEK = [];
  return ONBELLEK;
}
function arsalariYaz(api, v) {
  ONBELLEK = Array.isArray(v) ? v : [];
  api.kaydet(ARSA_CFG.anahtar, ONBELLEK);
}
export function onbellegiBosalt() { ONBELLEK = null; }

function icinde(a, d, x, z) {
  return a.d === d && x >= a.x1 && x <= a.x2 && z >= a.z1 && z <= a.z2;
}
// Bir oyuncunun kullanabilecegi arsalar (sahibi oldugu + kiraladiklari).
// Duello sahasi secimi bunu kullanir.
export function oyuncuArsalari(api, ad) {
  try {
    return arsalar(api)
      .filter(a => a.s === ad || kiraciMi(a, ad))
      .map(a => ({
        id: a.id, ad: a.ad, d: a.d, s: a.s,
        x1: a.x1, z1: a.z1, x2: a.x2, z2: a.z2,
        tp: a.tp, kiraci: a.s !== ad
      }));
  } catch { return []; }
}

export function arsaBul(api, d, x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const liste = arsalar(api);
  for (const a of liste) if (icinde(a, d, x0, z0)) return a;
  return undefined;
}
// ---- kiralama yardimcilari (v3.2) ----
export function kiraAktif(a) {
  return !!(a && a.kiraci && typeof a.kiraci.bitis === "number" && a.kiraci.bitis > Date.now());
}
function kiraciMi(a, ad) { return kiraAktif(a) && a.kiraci.ad === ad; }
function kalanGun(a) {
  if (!kiraAktif(a)) return 0;
  return (a.kiraci.bitis - Date.now()) / 86400000;
}
function kalanYazi(a) {
  const g = kalanGun(a);
  if (g <= 0) return "bitti";
  if (g >= 1) return `${Math.floor(g)} gun ${Math.floor((g % 1) * 24)} saat`;
  const saat = g * 24;
  return saat >= 1 ? `${Math.floor(saat)} saat` : `${Math.max(1, Math.floor(saat * 60))} dk`;
}
function sahipSayisi(api, ad) { return arsalar(api).filter(a => a.s === ad).length; }
function sayiOku(v) {
  const n = Number(String(v ?? "").replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}
// Kiracinin de insa hakki vardir; sahibi ve uyeler hakkini kaybetmez.
function yetkili(a, ad) { return a.s === ad || (a.u ?? []).includes(ad) || kiraciMi(a, ad); }
function alan(a) { return (a.x2 - a.x1 + 1) * (a.z2 - a.z1 + 1); }
function cakisiyorMu(api, d, x1, z1, x2, z2, haricId) {
  return arsalar(api).some(a =>
    a.d === d && a.id !== haricId &&
    !(x2 < a.x1 || x1 > a.x2 || z2 < a.z1 || z1 > a.z2));
}

// Secim (kose 1 ve 2) hem bellekte hem diskte durur: script yeniden
// yuklenince (dunya kapanip acilinca) secim kaybolmasin.
function secimOku(api, p) {
  const bellekte = kose.get(p.id);
  if (bellekte) return bellekte;
  let s = {};
  try {
    const hepsi = api.yukle(ARSA_CFG.koseAnahtar, {}) ?? {};
    const k = hepsi[p.name];
    if (k) s = (k.k1 || k.k2) ? k : { k1: k };   // eski tek-koseli bicim
  } catch { }
  kose.set(p.id, s);
  return s;
}
function secimYaz(api, p, s) {
  kose.set(p.id, s ?? {});
  try {
    const hepsi = api.yukle(ARSA_CFG.koseAnahtar, {}) ?? {};
    if (s && (s.k1 || s.k2)) hepsi[p.name] = s; else delete hepsi[p.name];
    api.kaydet(ARSA_CFG.koseAnahtar, hepsi);
  } catch { }
}

// ---- arsa sopasi ----
export function sopaMi(item) { return item?.typeId === SOPA_ID; }

export function sopaYap(mcRef) {
  const it = new mcRef.ItemStack(SOPA_ID, 1);
  it.nameTag = SOPA_AD;
  it.setLore(["§7Sol tık: 1. köşe", "§7Sağ tık: 2. köşe + satın al", "§7Havaya sağ tık: arsa menüsü"]);
  return it;
}

// Sopa ile secilen kose. no: 1 ya da 2.
function koseAyarla(api, p, no, x, z, d) {
  const s = secimOku(api, p);
  const yeni = { ...s };
  if (no === 1) yeni.k1 = { x, z, d }; else yeni.k2 = { x, z, d };
  // farkli boyutta secim yapildiysa digerini dusur
  if (yeni.k1 && yeni.k2 && yeni.k1.d !== yeni.k2.d) {
    if (no === 1) delete yeni.k2; else delete yeni.k1;
  }
  secimYaz(api, p, yeni);
  try { p.playSound(no === 1 ? "random.click" : "random.orb"); } catch { }

  if (yeni.k1 && yeni.k2) {
    const en = Math.abs(yeni.k1.x - yeni.k2.x) + 1;
    const boy = Math.abs(yeni.k1.z - yeni.k2.z) + 1;
    const fiyat = en * boy * ARSA_CFG.birimFiyat;
    try { p.onScreenDisplay.setActionBar(`§eKöşe ${no}: §f${x}, ${z}  §8|  §7${en}x${boy} = §a${api.fmt(fiyat)}`); } catch { }
  } else {
    try { p.onScreenDisplay.setActionBar(`§eKöşe ${no}: §f${x}, ${z}  §8|  §7şimdi karşı köşeye sağ tıkla`); } catch { }
  }
  return yeni;
}

// ---- koruma ----
// Arsa korumasini yalnizca "market_admin" etiketi gecer (ve ayar aciksa op'lar).
function korumayiGecer(api, p) {
  try { if (p.hasTag?.("market_admin")) return true; } catch { }
  if (ARSA_CFG.adminGecebilir) { try { return api.adminMi(p); } catch { } }
  return false;
}

// Izin varsa true, engellenecekse arsayi dondurur.
function engelliMi(api, player, d, x, z) {
  if (!player) return undefined;
  const a = arsaBul(api, d, x, z);
  if (!a) return undefined;
  if (yetkili(a, player.name)) return undefined;
  if (korumayiGecer(api, player)) return undefined;
  return a;
}

// Disaridan sorulabilsin diye (yon.js blok cevirmeden once bakiyor):
// bu oyuncu orada blok degistirebilir mi?
export function insaEdebilirMi(api, p, d, x, z) {
  return !engelliMi(api, p, d, Math.floor(x), Math.floor(z));
}

function uyar(p, a, tip) {
  system.run(() => {
    try {
      p.onScreenDisplay.setActionBar(`§c${a.ad} §7arsasinda ${tip} yapamazsin §8(${a.s})`);
      p.playSound("note.bass");
    } catch { }
  });
}

export function arsaKur(api) {
  const kayitEt = (ad, fn) => {
    try { fn(); KORUMA_DURUM[ad] = true; console.warn(`[Arsa] ${ad} korumasi aktif.`); }
    catch (e) { KORUMA_DURUM[ad] = false; console.warn(`[Arsa] ${ad} korumasi YOK: ${e}`); }
  };

  const blokEngel = (ev, tip) => {
    const p = ev.player ?? ev.source;
    const b = ev.block;
    if (!p || !b) return;
    const a = engelliMi(api, p, b.dimension.id, b.location.x, b.location.z);
    if (!a) return;
    ev.cancel = true;
    uyar(p, a, tip);
  };

  // ---- ARSA SOPASI ----
  // Sol tik (blok kirma) = 1. kose, sag tik = 2. kose + satin alma ekrani.
  // Sopa elde oldugu surece blok kirilmaz/kullanilmaz, sadece secim yapilir.
  kayitEt("kirma", () => world.beforeEvents.playerBreakBlock.subscribe(ev => {
    if (sopaMi(ev.itemStack)) {
      ev.cancel = true;
      const p = ev.player, b = ev.block;
      const x = Math.floor(b.location.x), z = Math.floor(b.location.z), d = b.dimension.id;
      system.run(() => { try { koseAyarla(api, p, 1, x, z, d); } catch (e) { console.warn("[Arsa] sopa: " + e); } });
      return;
    }
    blokEngel(ev, "kirma");
  }));

  kayitEt("koyma", () => world.beforeEvents.playerPlaceBlock.subscribe(ev => blokEngel(ev, "insaat")));

  kayitEt("etkilesim", () => world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    if (sopaMi(ev.itemStack)) {
      ev.cancel = true;
      const p = ev.player, b = ev.block;
      const x = Math.floor(b.location.x), z = Math.floor(b.location.z), d = b.dimension.id;
      sopaTik = system.currentTick;
      system.run(() => {
        try {
          const s = koseAyarla(api, p, 2, x, z, d);
          if (s.k1 && s.k2) arsaSatinAl(p, api);
        } catch (e) { console.warn("[Arsa] sopa: " + e); }
      });
      return;
    }
    blokEngel(ev, "etkilesim");
  }));

  // Havaya sag tik: arsa menusu. (Bloga tiklandiginda ustteki olay zaten
  // calisti, o yuzden ayni tikta menuyu acmiyoruz.)
  kayitEt("sopa menusu", () => world.afterEvents.itemUse.subscribe(ev => {
    if (!sopaMi(ev.itemStack)) return;
    if (system.currentTick - sopaTik <= 2) return;
    const p = ev.source;
    system.run(() => { try { arsaMenu(p, api); } catch (e) { console.warn("[Arsa] sopa menu: " + e); } });
  }));

  // Esya cercevesi, zirh standi, hayvan besleme/binme gibi VARLIK etkilesimleri.
  // Eskiden hic korunmuyordu: yabanci biri arsadaki cercevelerden esya alabiliyordu.
  kayitEt("varlik etkilesimi", () => world.beforeEvents.playerInteractWithEntity.subscribe(ev => {
    const p = ev.player;
    const h = ev.target;
    if (!p || !h || h.typeId === "minecraft:player") return;
    const a = engelliMi(api, p, h.dimension.id, h.location.x, h.location.z);
    if (!a) return;
    ev.cancel = true;
    uyar(p, a, "esyalara dokunma");
  }));

  // Vurma iptal edilemez; vurulan cani geri veriyoruz. Oyunculara karismaz (PvP serbest).
  if (ARSA_CFG.hayvanKorumasi) {
    kayitEt("hayvan", () => world.afterEvents.entityHurt.subscribe(ev => {
      const h = ev.hurtEntity;
      const vuran = ev.damageSource?.damagingEntity;
      if (!h || !vuran || vuran.typeId !== "minecraft:player") return;
      if (h.typeId === "minecraft:player") return;
      let a;
      try { a = engelliMi(api, vuran, h.dimension.id, h.location.x, h.location.z); } catch { return; }
      if (!a) return;
      system.run(() => {
        try {
          const can = h.getComponent("minecraft:health");
          if (can) can.setCurrentValue(Math.min(can.effectiveMax, can.currentValue + ev.damage));
        } catch { }
        uyar(vuran, a, "canlilara vurma");
      });
    }));
  }

  kayitEt("patlama", () => world.beforeEvents.explosion.subscribe(ev => {
    const bloklar = ev.getImpactedBlocks();
    const kalan = bloklar.filter(b => !arsaBul(api, b.dimension.id, b.location.x, b.location.z));
    if (kalan.length !== bloklar.length) ev.setImpactedBlocks(kalan);
  }));
}

// Her donguden cagirilir: arsaya girip cikinca bildirim
export function arsaTick(api, p) {
  if (!ARSA_CFG.girisBildirimi) return;
  const a = arsaBul(api, p.dimension.id, p.location.x, p.location.z);
  const simdi = a ? a.id : "yok";
  if (sonBolge.get(p.id) === simdi) return;
  sonBolge.set(p.id, simdi);
  try {
    if (a) {
      const benim = yetkili(a, p.name);
      const etiket = kiraciMi(a, p.name) ? " §8(kiralik)"
        : (a.sat ? " §8(satilik)" : (a.kira && !kiraAktif(a) ? " §8(kiralik ilan)" : ""));
      p.onScreenDisplay.setActionBar(benim
        ? `§a${a.ad} §7arsana girdin${etiket}`
        : `§e${a.ad} §7arsasina girdin §8(${kiraAktif(a) ? a.kiraci.ad + " kiraci" : a.s})${etiket}`);
    } else p.onScreenDisplay.setActionBar("§7Serbest bolge");
  } catch { }
}

// Arsanin sinirlarini parcacikla cizer: "arsam gercekten var mi" sorusunun cevabi.
function sinirlariGoster(p, a) {
  const y = Math.floor(p.location.y) + 1;
  const d = p.dimension;
  const nokta = (x, z) => {
    try { d.spawnParticle("minecraft:villager_happy", { x: x + 0.5, y, z: z + 0.5 }); } catch { }
  };
  const adim = Math.max(1, Math.floor(Math.max(a.x2 - a.x1, a.z2 - a.z1) / 60));
  for (let x = a.x1; x <= a.x2; x += adim) { nokta(x, a.z1); nokta(x, a.z2); }
  for (let z = a.z1; z <= a.z2; z += adim) { nokta(a.x1, z); nokta(a.x2, z); }
}

// ==================== ISINLANMA ====================
const sonIsinlanma = new Map();   // oyuncu.id -> zaman

// Arsanin isinlanma noktasi: sahibi ayarladiysa o, yoksa arsanin ortasi.
function isinlanmaNoktasi(a) {
  if (a.tp && typeof a.tp.x === "number") return { ...a.tp, ozel: true };
  return { x: Math.floor((a.x1 + a.x2) / 2), y: undefined, z: Math.floor((a.z1 + a.z2) / 2), ozel: false };
}

// Verilen x,z icin ustune basilabilecek guvenli yukseklik.
function guvenliY(boyut, x, z, tercih) {
  if (typeof tercih === "number") {
    try {
      const b = boyut.getBlock({ x, y: tercih - 1, z });
      if (b && !b.isAir) return tercih;
    } catch { }
  }
  try {
    const ust = boyut.getTopmostBlock?.({ x, z });
    if (ust) return ust.location.y + 1;
  } catch { }
  return typeof tercih === "number" ? tercih : 80;
}

// Bu oyuncu bu arsaya isinlanabilir mi?
export function isinlanabilirMi(p, a, api) {
  if (!a) return { olur: false, sebep: "Arsa bulunamadı." };
  if (a.s === p.name) return { olur: true };
  if (kiraciMi(a, p.name)) return { olur: true };   // v3.2: kiraladigin arsa
  if (ARSA_CFG.uyeIsinlanabilir && (a.u ?? []).includes(p.name)) return { olur: true };
  try { if (api.adminMi(p) && p.hasTag?.("market_admin")) return { olur: true }; } catch { }
  return { olur: false, sebep: "Burası senin arsan değil." };
}

export function arsayaIsinla(p, api, a) {
  if (!ARSA_CFG.isinlanma) { p.sendMessage("§c[Arsa] Işınlanma kapalı."); return false; }
  const izin = isinlanabilirMi(p, a, api);
  if (!izin.olur) { p.sendMessage(`§c[Arsa] ${izin.sebep}`); return false; }
  try { if (api.dovustaMi?.(p.name)) { p.sendMessage("§c[Arsa] Düello sırasında ışınlanamazsın."); return false; } } catch { }

  const bekle = ARSA_CFG.isinlanmaBekleme * 1000;
  const son = sonIsinlanma.get(p.id) ?? 0;
  if (bekle > 0 && Date.now() - son < bekle) {
    p.sendMessage(`§7[Arsa] Biraz bekle (${Math.ceil((bekle - (Date.now() - son)) / 1000)} sn).`);
    return false;
  }

  const nokta = isinlanmaNoktasi(a);
  let boyut;
  try { boyut = world.getDimension(a.d ?? "minecraft:overworld"); }
  catch { p.sendMessage("§c[Arsa] Arsanın boyutu bulunamadı."); return false; }
  const y = guvenliY(boyut, nokta.x, nokta.z, nokta.y);
  try {
    p.teleport({ x: nokta.x + 0.5, y, z: nokta.z + 0.5 },
      { dimension: boyut, rotation: typeof nokta.bakis === "number" ? { x: 0, y: nokta.bakis } : undefined });
  } catch (e) {
    console.warn("[Arsa] isinlanma hatasi: " + e);
    p.sendMessage("§c[Arsa] Işınlanamadın. §7Arsanın olduğu bölge yüklü olmayabilir, tekrar dene.");
    return false;
  }
  sonIsinlanma.set(p.id, Date.now());
  try { p.playSound("mob.endermen.portal"); } catch { }
  p.sendMessage(`§a[Arsa] §f${a.ad}§7 arsasına ışınlandın.${nokta.ozel ? "" : " §8(ortası)"}`);
  return true;
}

// !ev komutu: tek arsan varsa oraya isinlar, coksa listeyi acar
export function eveIsinla(p, api) {
  const benim = arsalar(api).filter(a => a.s === p.name || kiraciMi(a, p.name));
  if (benim.length === 0) { p.sendMessage("§7[Arsa] Henüz arsan yok. §f!arsa"); return false; }
  if (benim.length === 1) return arsayaIsinla(p, api, benim[0]);
  arsalarimMenu(p, api);
  return true;
}

// ==================== MENULER ====================
export function arsaMenu(p, api) {
  const hepsi = arsalar(api);
  const benim = hepsi.filter(a => a.s === p.name);
  const kiralarim = hepsi.filter(a => kiraciMi(a, p.name));
  const ilanlar = hepsi.filter(a => a.s !== p.name && ((a.sat && !kiraAktif(a)) || (a.kira && !kiraAktif(a))));
  const sec = secimOku(api, p);
  const burada = arsaBul(api, p.dimension.id, p.location.x, p.location.z);
  const x = Math.floor(p.location.x), z = Math.floor(p.location.z);
  const koseYazi = (k) => (k ? `${k.x}, ${k.z}` : "seçilmedi");
  let olcu = "";
  if (sec.k1) {
    const k2 = sec.k2 ?? { x, z };
    const en = Math.abs(sec.k1.x - k2.x) + 1, boy = Math.abs(sec.k1.z - k2.z) + 1;
    olcu = `\n§7Seçili alan: §f${en} x ${boy} §8= §a${api.fmt(en * boy * ARSA_CFG.birimFiyat)}` +
      (sec.k2 ? "" : " §8(2. köşe = durduğun yer)");
  }

  const f = new ActionFormData()
    .title("§lARSA / BÖLGE")
    .body(
      `§7Bakiyen: §a${api.fmt(api.paraOku(p))}\n` +
      `§7Arsan: §f${benim.length}§7 / ${ARSA_CFG.maxArsaOyuncu}  §8|  §7Kiraladığın: §f${kiralarim.length}  §8|  §7Dünyada: §f${hepsi.length}\n` +
      `§7Durduğun yer: §f${x}, ${z}\n` +
      `§7Buradasın: §f${burada ? `${burada.ad} (${burada.s})` : "serbest bölge"}\n` +
      `§7Köşe 1: §f${koseYazi(sec.k1)}  §8|  §7Köşe 2: §f${koseYazi(sec.k2)}${olcu}\n` +
      `§7Fiyat: §f${ARSA_CFG.birimFiyat}${api.simge}/blok  §8(en az ${ARSA_CFG.minKenar}x${ARSA_CFG.minKenar})`
    );

  const islem = [];
  const ekle = (yazi, ikon, fn) => { f.button(yazi, ikon); islem.push(fn); };

  ekle("§lArsa Sopası Al\n§r§7Sol tık 1. köşe, sağ tık 2. köşe", "textures/items/mk_sopa", () => {
    api.sopaVer(p);
    arsaMenu(p, api);
  });
  ekle("§lKöşe 1'i Buraya Koy\n§r§7Durduğun noktayı işaretle", "textures/items/wood_shovel", () => {
    secimYaz(api, p, { ...secimOku(api, p), k1: { x, z, d: p.dimension.id } });
    p.sendMessage(`§a[Arsa] §fKöşe 1: §e${x}, ${z}`);
    p.sendMessage("§7Şimdi karşı köşeye yürü ve 'Köşe 2 + Satın Al' de. §8(Sopayla: sağ tık)");
    try { p.playSound("random.orb"); } catch { }
    arsaMenu(p, api);
  });
  ekle("§lKöşe 2 + Arsayı Satın Al\n§r§7Alanı tamamla ve öde", "textures/items/gold_ingot",
    () => arsaSatinAl(p, api));
  if (sec.k1 || sec.k2) ekle("§7Seçimi Temizle", "textures/items/barrier", () => {
    secimYaz(api, p, undefined);
    p.sendMessage("§7[Arsa] Seçim temizlendi.");
    arsaMenu(p, api);
  });
  ekle(`§lArsalarım §7(${benim.length + kiralarim.length})\n§r§7Kendi arsana ışınlan, yönet`, "textures/items/mk_sopa",
    () => arsalarimMenu(p, api));
  if (benim.length > 0)
    ekle(`§lÜyeler\n§r§7Arsana birini al, çıkar`, "textures/items/name_tag",
      () => uyeArsaSec(p, api));
  if (ARSA_CFG.pazar)
    ekle(`§lArsa Pazarı §7(${ilanlar.length})\n§r§7Satılık ve kiralık arsalar`, "textures/items/emerald",
      () => pazarMenu(p, api));
  ekle("§lBurası Kimin?\n§r§7Bulunduğun bölgeyi sorgula", "textures/items/compass_item", () => {
    if (burada) {
      p.sendMessage(`§e[Arsa] §fBurası: §e${burada.ad}`);
      p.sendMessage(`§7Sahibi: §f${burada.s}  §7Üyeler: §f${(burada.u ?? []).join(", ") || "yok"}`);
      p.sendMessage(`§7Sınırlar: §f${burada.x1},${burada.z1} §7- §f${burada.x2},${burada.z2}`);
      if (ARSA_CFG.sinirGosterme) sinirlariGoster(p, burada);
    } else p.sendMessage("§7[Arsa] Burası serbest bölge, sahibi yok.");
    arsaMenu(p, api);
  });
  ekle("§7Koruma Durumu\n§r§8Ne çalışıyor, ne çalışmıyor", "textures/items/redstone_dust",
    () => arsaTeshis(p, api));
  f.button("§7< Geri"); islem.push(() => api.anaMenu(p));

  f.show(p).then(r => {
    if (r.canceled) return;
    try { islem[r.selection]?.(); }
    catch (e) { p.sendMessage(`§c[Arsa] Hata: ${e}`); }
  });
}

// "Calismiyor" dendiginde ilk bakilacak ekran: hangi koruma kayit olmus,
// kac arsa var, oyuncu korumadan muaf mi.
function arsaTeshis(p, api) {
  const g = arsalar(api);
  const satir = (ad) => `§7${ad}: ${KORUMA_DURUM[ad] === true ? "§aaktif" : KORUMA_DURUM[ad] === false ? "§ckayit olamadi" : "§8bilinmiyor"}`;
  const muaf = korumayiGecer(api, p);
  new ActionFormData()
    .title("§lKORUMA DURUMU")
    .body(
      `${satir("kirma")}\n${satir("koyma")}\n${satir("etkilesim")}\n` +
      `${satir("varlik etkilesimi")}\n${satir("hayvan")}\n${satir("patlama")}\n\n` +
      `§7Kayıtlı arsa: §f${g.length}\n` +
      `§7Sen korumadan muaf mısın: ${muaf ? "§cEVET" : "§aHAYIR"}\n` +
      (muaf
        ? "§8Muaf olduğun için kendi testlerinde koruma seni durdurmaz.\n§8Etiketi kaldır: /tag @s remove market_admin"
        : "§8Arsanın içinde başkası blok kıramaz, koyamaz, sandık açamaz.") +
      `\n\n§8Operatörler artık korumayı geçmiyor (ARSA_CFG.adminGecebilir=false).`
    )
    .button("§7< Geri")
    .show(p).then(r => { if (!r.canceled) arsaMenu(p, api); });
}

function arsaSatinAl(p, api) {
  const sec = secimOku(api, p);
  const k = sec.k1 ?? sec.k2;
  if (!k) { p.sendMessage("§c[Arsa] Önce bir köşe seçmelisin. §7Arsa sopasıyla sol tık, ya da menüden 'Köşe 1'i Buraya Koy'."); return arsaMenu(p, api); }
  if (k.d !== p.dimension.id) { p.sendMessage("§c[Arsa] Seçtiğin köşe başka bir boyutta."); return arsaMenu(p, api); }
  // 2. kose sopayla secilmediyse oyuncunun durdugu yer kullanilir
  const k2 = (sec.k1 && sec.k2) ? sec.k2 : { x: Math.floor(p.location.x), z: Math.floor(p.location.z) };

  const x1 = Math.min(k.x, k2.x);
  const x2 = Math.max(k.x, k2.x);
  const z1 = Math.min(k.z, k2.z);
  const z2 = Math.max(k.z, k2.z);
  const en = x2 - x1 + 1, boy = z2 - z1 + 1;

  if (en < ARSA_CFG.minKenar || boy < ARSA_CFG.minKenar)
    { p.sendMessage(`§c[Arsa] En küçük arsa ${ARSA_CFG.minKenar}x${ARSA_CFG.minKenar} olmalı. (şu an ${en}x${boy}) §7Köşeleri birbirinden daha uzağa koy.`); return arsaMenu(p, api); }
  if (en > ARSA_CFG.maxKenar || boy > ARSA_CFG.maxKenar)
    { p.sendMessage(`§c[Arsa] Tek kenar en fazla ${ARSA_CFG.maxKenar} olabilir. (şu an ${en}x${boy})`); return arsaMenu(p, api); }

  const hepsi = arsalar(api);
  if (hepsi.filter(a => a.s === p.name).length >= ARSA_CFG.maxArsaOyuncu)
    { p.sendMessage(`§c[Arsa] En fazla ${ARSA_CFG.maxArsaOyuncu} arsan olabilir.`); return arsaMenu(p, api); }
  const cakisan = arsalar(api).find(a => a.d === p.dimension.id && !(x2 < a.x1 || x1 > a.x2 || z2 < a.z1 || z1 > a.z2));
  if (cakisan)
    { p.sendMessage(`§c[Arsa] Bu alan "${cakisan.ad}" (${cakisan.s}) arsasıyla çakışıyor.`); return arsaMenu(p, api); }

  const fiyat = en * boy * ARSA_CFG.birimFiyat;
  const bakiye = api.paraOku(p);

  new ActionFormData()
    .title("§lARSA SATIN AL")
    .body(
      `§7Alan: §f${en} x ${boy} §8(${en * boy} blok)\n` +
      `§7Köşeler: §f${x1},${z1} §7- §f${x2},${z2}\n\n` +
      `§7Fiyat: §a${api.fmt(fiyat)}\n§7Bakiyen: §a${api.fmt(bakiye)}\n` +
      (bakiye >= fiyat ? `§7Kalan: §a${api.fmt(bakiye - fiyat)}` : "§cYeterli paran yok!")
    )
    .button(bakiye >= fiyat ? "§aSATIN AL" : "§8(Para yetersiz)", "textures/items/gold_ingot")
    .button("§cVazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return arsaMenu(p, api);
      if (api.paraOku(p) < fiyat) { p.sendMessage("§c[Arsa] Yeterli paran yok."); return arsaMenu(p, api); }

      new ModalFormData()
        .title("§lARSA ADI")
        .textField("Arsana bir ad ver", "örn: Çiftlik", { defaultValue: `${p.name} arsası` })
        .show(p).then(r2 => {
          if (r2.canceled) return arsaMenu(p, api);
          const ad = String(r2.formValues?.[0] ?? "").trim().slice(0, 24) || `${p.name} arsası`;
          if (cakisiyorMu(api, p.dimension.id, x1, z1, x2, z2)) { p.sendMessage("§c[Arsa] Alan bu arada kapılmış."); return arsaMenu(p, api); }
          if (api.paraOku(p) < fiyat) { p.sendMessage("§c[Arsa] Yeterli paran yok."); return arsaMenu(p, api); }

          api.paraEkle(p, -fiyat);
          const g = arsalar(api).slice();
          const yeni = { id: `a${Date.now()}${Math.floor(Math.random() * 999)}`, s: p.name, ad, d: p.dimension.id, x1, z1, x2, z2, u: [] };
          g.push(yeni);
          arsalariYaz(api, g);
          secimYaz(api, p, undefined);
          sonBolge.delete(p.id);
          try { p.playSound("random.levelup"); } catch { }
          p.sendMessage(`§a[Arsa] §f"${ad}" §aalındı! §7${en}x${boy}, §a-${api.fmt(fiyat)}`);
          p.sendMessage("§7Artık bu alanda senden ve üyelerinden başkası blok kıramaz, koyamaz, sandık açamaz.");
          if (ARSA_CFG.sinirGosterme) { try { sinirlariGoster(p, yeni); } catch { } }
          arsaMenu(p, api);
        });
    });
}

function arsalarimMenu(p, api) {
  const hepsi = arsalar(api);
  const benim = hepsi.filter(a => a.s === p.name);
  const kiralarim = hepsi.filter(a => kiraciMi(a, p.name));
  const liste = [...benim, ...kiralarim];
  if (liste.length === 0) {
    new ActionFormData().title("§lARSALARIM")
      .body("§7Henüz arsan yok.\n§8Köşe 1'i koy, karşı köşeye yürü, satın al.\n§8Ya da Arsa Pazarı'ndan hazır bir arsa al/kirala.")
      .button("§7< Geri").show(p).then(r => { if (!r.canceled) arsaMenu(p, api); });
    return;
  }
  const burada = arsaBul(api, p.dimension.id, p.location.x, p.location.z);
  const f = new ActionFormData().title("§lARSALARIM")
    .body(ARSA_CFG.isinlanma
      ? `§7Bir arsana bas, oraya §fışınlanırsın§7.\n§8Sadece kendi ve kiraladığın arsalara ışınlanabilirsin.\n§7Kendi arsan: §f${benim.length}§7 / ${ARSA_CFG.maxArsaOyuncu}  §8|  §7Kiraladığın: §f${kiralarim.length}`
      : `§7Yönetmek istediğine bas.\n§7Toplam: §f${liste.length}§7 arsa`);
  for (const a of liste) {
    const olcu = `${a.x2 - a.x1 + 1}x${a.z2 - a.z1 + 1}`;
    const sen = burada?.id === a.id ? " §a(buradasın)" : "";
    if (a.s === p.name) {
      const durum = kiraAktif(a) ? `§6kirada: ${a.kiraci.ad} (${kalanYazi(a)})`
        : a.sat ? `§asatılık ${api.fmt(a.sat.fiyat)}`
          : a.kira ? `§bkiralık ${api.fmt(a.kira.fiyat)}/${a.kira.gun}g`
            : `§8${(a.u ?? []).length} üye`;
      f.button(`§f${a.ad}${sen}\n§7${olcu} §8- ${durum}`, "textures/items/mk_sopa");
    } else {
      f.button(`§b${a.ad}${sen}\n§7${olcu} §8- kiracısısın, ${kalanYazi(a)} kaldı`, "textures/items/clock_item");
    }
  }
  f.button("§eArsaları Yönet\n§r§8Üye, satış, kira, ad, sil", "textures/items/book_writable");
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === liste.length) return arsaYonetListe(p, api);
    if (r.selection === liste.length + 1) return arsaMenu(p, api);
    const a = liste[r.selection];
    if (!ARSA_CFG.isinlanma) return a.s === p.name ? arsaYonet(p, api, a.id) : kiraciEkrani(p, api, a.id);
    arsayaIsinla(p, api, a);
  });
}

// Yonetim listesi (isinlanma listesinden ayri)
function arsaYonetListe(p, api) {
  const hepsi = arsalar(api);
  const benim = hepsi.filter(a => a.s === p.name);
  const kiralarim = hepsi.filter(a => kiraciMi(a, p.name));
  const liste = [...benim, ...kiralarim];
  if (liste.length === 0) return arsalarimMenu(p, api);
  const f = new ActionFormData().title("§lARSALARI YÖNET").body("§7Yönetmek istediğine bas.");
  for (const a of liste) {
    const olcu = `${a.x2 - a.x1 + 1}x${a.z2 - a.z1 + 1}`;
    if (a.s === p.name) f.button(`§f${a.ad}\n§7${olcu} §8- ${(a.u ?? []).length} üye`, "textures/items/book_normal");
    else f.button(`§b${a.ad} §8(kiracı)\n§7${olcu} §8- ${kalanYazi(a)} kaldı`, "textures/items/clock_item");
  }
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === liste.length) return arsalarimMenu(p, api);
    const a = liste[r.selection];
    if (a.s === p.name) arsaYonet(p, api, a.id);
    else kiraciEkrani(p, api, a.id);
  });
}

function arsaYonet(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return arsaYonetListe(p, api);
  if (a.s !== p.name) return kiraciEkrani(p, api, id);
  const alanBlok = alan(a);
  const iade = Math.floor(alanBlok * ARSA_CFG.birimFiyat * ARSA_CFG.iadeOrani);
  const kirada = kiraAktif(a);

  const durum = kirada
    ? `§6Kirada: §f${a.kiraci.ad}  §8(${kalanYazi(a)} kaldı)\n`
    : (a.sat ? `§aSatışta: §f${api.fmt(a.sat.fiyat)}\n` : "") +
      (a.kira ? `§bKiralık ilan: §f${api.fmt(a.kira.fiyat)} §7/ ${a.kira.gun} gün\n` : "");

  const f = new ActionFormData()
    .title(`§l${a.ad.toUpperCase()}`)
    .body(
      `§7Boyut: §f${a.x2 - a.x1 + 1} x ${a.z2 - a.z1 + 1} §8(${alanBlok} blok)\n` +
      `§7Sınırlar: §f${a.x1},${a.z1} §7- §f${a.x2},${a.z2}\n` +
      `§7Dünya: §f${a.d.replace("minecraft:", "")}\n` +
      `§7Üyeler: §f${(a.u ?? []).join(", ") || "yok"}\n` +
      `§7Işınlanma noktası: §f${a.tp ? `${a.tp.x}, ${a.tp.y}, ${a.tp.z}` : "arsanın ortası"}\n` +
      durum +
      `§7Silersen iade: §a${api.fmt(iade)}`
    );

  const islem = [];
  const ekle = (yazi, ikon, fn) => { f.button(yazi, ikon); islem.push(fn); };

  ekle("§aBuraya Işınlan", "textures/items/mk_sopa", () => { arsayaIsinla(p, api, a); });
  ekle("§eIşınlanma Noktasını Ayarla\n§r§8Durduğun yer", "textures/items/redstone_dust",
    () => isinlanmaNoktasiAyarla(p, api, id));
  ekle(`§aÜyeler §7(${(a.u ?? []).length})\n§r§8Ekle / çıkar`, "textures/items/name_tag",
    () => uyelerMenu(p, api, id));
  ekle("§eAdını Değiştir", "textures/items/book_writable", () => adDegistir(p, api, id));

  if (ARSA_CFG.pazar) {
    if (a.sat) ekle(`§cSatıştan Kaldır\n§r§8Şu an ${api.fmt(a.sat.fiyat)}`, "textures/items/barrier",
      () => ilanKaldir(p, api, id, "sat"));
    else ekle("§aSatışa Koy\n§r§8Fiyatını sen belirle", "textures/items/emerald",
      () => satisaKoy(p, api, id));

    if (kirada) ekle(`§cKiracıyı Çıkar\n§r§8Kalan gün iade edilir`, "textures/items/barrier",
      () => kiraciCikar(p, api, id));
    else if (a.kira) ekle(`§cKira İlanını Kaldır\n§r§8Şu an ${api.fmt(a.kira.fiyat)} / ${a.kira.gun} gün`, "textures/items/barrier",
      () => ilanKaldir(p, api, id, "kira"));
    else ekle("§bKiraya Ver\n§r§8Fiyat ve gün belirle", "textures/items/clock_item",
      () => kiralikYap(p, api, id));
  }

  ekle("§eSınırları Göster", "textures/items/redstone_dust", () => {
    if (a.d !== p.dimension.id) p.sendMessage("§c[Arsa] Bu arsa başka bir boyutta.");
    else { sinirlariGoster(p, a); p.sendMessage("§a[Arsa] §7Sınırlar parçacıkla çizildi."); }
    arsaYonet(p, api, id);
  });
  ekle("§cArsayı Sil", "textures/blocks/tnt_side", () => arsaSil(p, api, id, iade));
  f.button("§7< Geri"); islem.push(() => arsaYonetListe(p, api));

  f.show(p).then(r => {
    if (r.canceled) return;
    try { islem[r.selection]?.(); }
    catch (e) { p.sendMessage(`§c[Arsa] Hata: ${e}`); }
  });
}

// ==================== ARSA PAZARI (v3.2) ====================

// Kiraci ekrani: kiraladigin arsayla ne yapabilirsin
function kiraciEkrani(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a || !kiraciMi(a, p.name)) return arsalarimMenu(p, api);
  new ActionFormData()
    .title(`§l${a.ad.toUpperCase()} §7(KİRA)`)
    .body(
      `§7Sahibi: §f${a.s}\n` +
      `§7Boyut: §f${a.x2 - a.x1 + 1} x ${a.z2 - a.z1 + 1}\n` +
      `§7Sınırlar: §f${a.x1},${a.z1} §7- §f${a.x2},${a.z2}\n` +
      `§7Kalan süre: §f${kalanYazi(a)}\n` +
      (a.kira ? `§7Uzatma: §a${api.fmt(a.kira.fiyat)} §7/ ${a.kira.gun} gün\n` : "") +
      `§8Kira bitince inşa hakkın ve ışınlanman kapanır.`
    )
    .button("§aBuraya Işınlan", "textures/items/mk_sopa")
    .button(a.kira ? `§bKirayı Uzat\n§r§8${api.fmt(a.kira.fiyat)} / ${a.kira.gun} gün` : "§8(Sahibi uzatmaya kapattı)", "textures/items/clock_item")
    .button("§cKiradan Çık\n§r§8Para iadesi yok", "textures/items/barrier")
    .button("§7< Geri")
    .show(p).then(r => {
      if (r.canceled || r.selection === 3) return arsalarimMenu(p, api);
      if (r.selection === 0) { arsayaIsinla(p, api, a); return; }
      if (r.selection === 1) {
        if (!a.kira) { p.sendMessage("§7[Arsa] Sahibi kira ilanını kaldırmış, uzatamazsın."); return kiraciEkrani(p, api, id); }
        return kirayiOnayla(p, api, id, true);
      }
      if (r.selection === 2) return kiradanCik(p, api, id);
    });
}

function kiradanCik(p, api, id) {
  new ActionFormData().title("§c§lKİRADAN ÇIK")
    .body("§7Kirayı erken bırakıyorsun.\n§cÖdediğin para geri gelmez.")
    .button("§cEVET, ÇIK").button("§7Vazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return kiraciEkrani(p, api, id);
      const g = arsalar(api).slice();
      const t = g.find(x => x.id === id);
      if (!t || !kiraciMi(t, p.name)) return arsalarimMenu(p, api);
      delete t.kiraci;
      arsalariYaz(api, g);
      sonBolge.clear();
      p.sendMessage(`§7[Arsa] §f"${t.ad}" §7kirasından çıktın.`);
      try { world.getAllPlayers().find(x => x.name === t.s)?.sendMessage(`§e[Arsa] §f${p.name} §7"${t.ad}" kirasını bıraktı.`); } catch { }
      arsalarimMenu(p, api);
    });
}

// Sahibi: arsayi satisa koyar
function satisaKoy(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a || a.s !== p.name) return arsaYonetListe(p, api);
  if (kiraAktif(a)) { p.sendMessage("§c[Arsa] Kirada olan arsayı satışa koyamazsın."); return arsaYonet(p, api, id); }
  const oneri = alan(a) * ARSA_CFG.birimFiyat;
  new ModalFormData().title("§lSATIŞA KOY")
    .textField(`Fiyat (${api.simge}) - kuruluş bedeli ${api.fmt(oneri)}`, "sadece rakam", { defaultValue: String(oneri) })
    .show(p).then(r => {
      if (r.canceled) return arsaYonet(p, api, id);
      const fiyat = sayiOku(r.formValues?.[0]);
      if (!Number.isFinite(fiyat) || fiyat < 1 || fiyat > ARSA_CFG.maxFiyat) {
        p.sendMessage(`§c[Arsa] Fiyat 1 - ${api.fmt(ARSA_CFG.maxFiyat)} arası olmalı.`);
        return arsaYonet(p, api, id);
      }
      const g = arsalar(api).slice();
      const t = g.find(x => x.id === id);
      if (!t || t.s !== p.name) return arsaYonetListe(p, api);
      t.sat = { fiyat };
      arsalariYaz(api, g);
      p.sendMessage(`§a[Arsa] §f"${t.ad}" §asatışa kondu: §f${api.fmt(fiyat)}`);
      p.sendMessage("§8Diğer oyuncular Arsa Pazarı'ndan görebilir.");
      try { p.playSound("random.orb"); } catch { }
      arsaYonet(p, api, id);
    });
}

// Sahibi: arsayi kiraya verir
function kiralikYap(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a || a.s !== p.name) return arsaYonetListe(p, api);
  if (kiraAktif(a)) { p.sendMessage("§c[Arsa] Bu arsa zaten kirada."); return arsaYonet(p, api, id); }
  const oneri = Math.max(1, Math.floor(alan(a) * ARSA_CFG.birimFiyat * 0.1));
  const f = new ModalFormData().title("§lKİRAYA VER")
    .textField(`Kira bedeli (${api.simge})`, "sadece rakam", { defaultValue: String(oneri) })
    .textField(`Kaç gün (1 - ${ARSA_CFG.maxKiraGun})`, "sadece rakam", { defaultValue: "7" });
  f.show(p).then(r => {
    if (r.canceled) return arsaYonet(p, api, id);
    const fiyat = sayiOku(r.formValues?.[0]);
    const gun = sayiOku(r.formValues?.[1]);
    if (!Number.isFinite(fiyat) || fiyat < 1 || fiyat > ARSA_CFG.maxFiyat) {
      p.sendMessage(`§c[Arsa] Fiyat 1 - ${api.fmt(ARSA_CFG.maxFiyat)} arası olmalı.`);
      return arsaYonet(p, api, id);
    }
    if (!Number.isFinite(gun) || gun < 1 || gun > ARSA_CFG.maxKiraGun) {
      p.sendMessage(`§c[Arsa] Gün 1 - ${ARSA_CFG.maxKiraGun} arası olmalı.`);
      return arsaYonet(p, api, id);
    }
    const g = arsalar(api).slice();
    const t = g.find(x => x.id === id);
    if (!t || t.s !== p.name) return arsaYonetListe(p, api);
    t.kira = { fiyat, gun };
    arsalariYaz(api, g);
    p.sendMessage(`§a[Arsa] §f"${t.ad}" §akiralık: §f${api.fmt(fiyat)} §7/ ${gun} gün`);
    try { p.playSound("random.orb"); } catch { }
    arsaYonet(p, api, id);
  });
}

function ilanKaldir(p, api, id, tip) {
  const g = arsalar(api).slice();
  const t = g.find(x => x.id === id);
  if (!t || t.s !== p.name) return arsaYonetListe(p, api);
  delete t[tip];
  arsalariYaz(api, g);
  p.sendMessage(`§7[Arsa] §f"${t.ad}" §7${tip === "sat" ? "satıştan" : "kiralıktan"} kaldırıldı.`);
  arsaYonet(p, api, id);
}

// Sahibi kiraciyi cikarir: kalan gunun parasi kiraciya iade edilir
function kiraciCikar(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a || a.s !== p.name || !kiraAktif(a)) return arsaYonet(p, api, id);
  const odenen = a.kiraci.odenen ?? 0;
  const toplamMs = Math.max(1, (a.kiraci.bitis - (a.kiraci.basla ?? a.kiraci.bitis)));
  const oran = Math.max(0, Math.min(1, (a.kiraci.bitis - Date.now()) / toplamMs));
  const iade = Math.floor(odenen * oran);
  new ActionFormData().title("§c§lKİRACIYI ÇIKAR")
    .body(
      `§7Kiracı: §f${a.kiraci.ad}\n§7Kalan süre: §f${kalanYazi(a)}\n\n` +
      `§7Kiracıya iade edeceğin: §a${api.fmt(iade)}\n§7Bakiyen: §a${api.fmt(api.paraOku(p))}`
    )
    .button(api.paraOku(p) >= iade ? "§cEVET, ÇIKAR" : "§8(Para yetersiz)")
    .button("§7Vazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return arsaYonet(p, api, id);
      if (api.paraOku(p) < iade) { p.sendMessage("§c[Arsa] İade için paran yetmiyor."); return arsaYonet(p, api, id); }
      const g = arsalar(api).slice();
      const t = g.find(x => x.id === id);
      if (!t || !kiraAktif(t)) return arsaYonet(p, api, id);
      const kiraciAd = t.kiraci.ad;
      delete t.kiraci;
      arsalariYaz(api, g);
      if (iade > 0) { api.paraEkle(p, -iade); api.paraVer?.(kiraciAd, iade); }
      sonBolge.clear();
      p.sendMessage(`§a[Arsa] §f${kiraciAd} §7çıkarıldı, §a${api.fmt(iade)} §7iade edildi.`);
      try { world.getAllPlayers().find(x => x.name === kiraciAd)?.sendMessage(`§e[Arsa] §f${p.name} §7"${t.ad}" kiranı sonlandırdı. İade: §a${api.fmt(iade)}`); } catch { }
      arsaYonet(p, api, id);
    });
}

// Pazar: baskalarinin satilik / kiralik arsalari
export function pazarMenu(p, api, sayfa = 0) {
  if (!ARSA_CFG.pazar) { p.sendMessage("§c[Arsa] Arsa pazarı kapalı."); return arsaMenu(p, api); }
  const ilan = arsalar(api).filter(a =>
    a.s !== p.name && !kiraAktif(a) && (a.sat || a.kira));
  if (ilan.length === 0) {
    new ActionFormData().title("§lARSA PAZARI")
      .body("§7Şu an satılık ya da kiralık arsa yok.\n§8Kendi arsanı satışa koymak için: Arsalarım > Yönet > Satışa Koy")
      .button("§7< Geri").show(p).then(r => { if (!r.canceled) arsaMenu(p, api); });
    return;
  }
  const SAYFA = 20;
  const toplamSayfa = Math.ceil(ilan.length / SAYFA);
  const sf = Math.max(0, Math.min(sayfa, toplamSayfa - 1));
  const dilim = ilan.slice(sf * SAYFA, (sf + 1) * SAYFA);

  const f = new ActionFormData()
    .title(`§lARSA PAZARI §7(${sf + 1}/${toplamSayfa})`)
    .body(
      `§7Bakiyen: §a${api.fmt(api.paraOku(p))}\n` +
      `§7Kendi arsan: §f${sahipSayisi(api, p.name)}§7 / ${ARSA_CFG.maxArsaOyuncu}\n` +
      `§7Toplam §f${ilan.length}§7 ilan. Detay için bir arsaya bas.`
    );
  for (const a of dilim) {
    const olcu = `${a.x2 - a.x1 + 1}x${a.z2 - a.z1 + 1}`;
    const et = [];
    if (a.sat) et.push(`§aSatılık ${api.fmt(a.sat.fiyat)}`);
    if (a.kira) et.push(`§bKiralık ${api.fmt(a.kira.fiyat)}/${a.kira.gun}g`);
    f.button(`§f${a.ad} §8(${a.s})\n§7${olcu} §8- ${et.join(" §8| ")}`, "textures/items/emerald");
  }
  const ek = [];
  if (sf > 0) { f.button("§7<< Önceki"); ek.push("onceki"); }
  if (sf < toplamSayfa - 1) { f.button("§7Sonraki >>"); ek.push("sonraki"); }
  f.button("§7< Geri"); ek.push("geri");

  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection < dilim.length) return pazarDetay(p, api, dilim[r.selection].id, sf);
    switch (ek[r.selection - dilim.length]) {
      case "onceki": return pazarMenu(p, api, sf - 1);
      case "sonraki": return pazarMenu(p, api, sf + 1);
      default: return arsaMenu(p, api);
    }
  });
}

function pazarDetay(p, api, id, sayfa) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return pazarMenu(p, api, sayfa);
  const bakiye = api.paraOku(p);
  const kendi = sahipSayisi(api, p.name);
  const yerVar = kendi < ARSA_CFG.maxArsaOyuncu;

  const f = new ActionFormData()
    .title(`§l${a.ad.toUpperCase()}`)
    .body(
      `§7Sahibi: §f${a.s}\n` +
      `§7Boyut: §f${a.x2 - a.x1 + 1} x ${a.z2 - a.z1 + 1} §8(${alan(a)} blok)\n` +
      `§7Sınırlar: §f${a.x1},${a.z1} §7- §f${a.x2},${a.z2}\n` +
      `§7Dünya: §f${a.d.replace("minecraft:", "")}\n\n` +
      (a.sat ? `§aSatış fiyatı: §f${api.fmt(a.sat.fiyat)}\n` : "") +
      (a.kira ? `§bKira: §f${api.fmt(a.kira.fiyat)} §7/ ${a.kira.gun} gün\n` : "") +
      `§7Bakiyen: §a${api.fmt(bakiye)}\n` +
      `§7Arsan: §f${kendi}§7 / ${ARSA_CFG.maxArsaOyuncu}` +
      (yerVar ? "" : " §c(dolu, satın alamazsın)")
    );

  const islem = [];
  const ekle = (yazi, ikon, fn) => { f.button(yazi, ikon); islem.push(fn); };
  if (a.sat) ekle(
    !yerVar ? "§8(Arsa hakkın dolu)" : (bakiye >= a.sat.fiyat ? `§aSATIN AL\n§r§8${api.fmt(a.sat.fiyat)}` : "§8(Para yetersiz)"),
    "textures/items/gold_ingot", () => satisiOnayla(p, api, id, sayfa));
  if (a.kira) ekle(
    bakiye >= a.kira.fiyat ? `§bKİRALA\n§r§8${api.fmt(a.kira.fiyat)} / ${a.kira.gun} gün` : "§8(Para yetersiz)",
    "textures/items/clock_item", () => kirayiOnayla(p, api, id, false, sayfa));
  ekle("§7Sınırları Göster", "textures/items/redstone_dust", () => {
    if (a.d !== p.dimension.id) p.sendMessage("§c[Arsa] Bu arsa başka bir boyutta.");
    else { sinirlariGoster(p, a); p.sendMessage("§a[Arsa] §7Sınırlar parçacıkla çizildi."); }
    pazarDetay(p, api, id, sayfa);
  });
  f.button("§7< Geri"); islem.push(() => pazarMenu(p, api, sayfa));

  f.show(p).then(r => {
    if (r.canceled) return;
    try { islem[r.selection]?.(); }
    catch (e) { p.sendMessage(`§c[Arsa] Hata: ${e}`); }
  });
}

// Arsayi satin al: para satici oyuncuya (cevrimdisiysa bekleyen paraya) gider
function satisiOnayla(p, api, id, sayfa) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a || !a.sat) { p.sendMessage("§c[Arsa] Bu arsa artık satışta değil."); return pazarMenu(p, api, sayfa); }
  if (a.s === p.name) return pazarMenu(p, api, sayfa);
  if (kiraAktif(a)) { p.sendMessage("§c[Arsa] Arsa kirada, şimdi satın alınamaz."); return pazarMenu(p, api, sayfa); }
  if (sahipSayisi(api, p.name) >= ARSA_CFG.maxArsaOyuncu) {
    p.sendMessage(`§c[Arsa] En fazla ${ARSA_CFG.maxArsaOyuncu} arsan olabilir.`);
    return pazarMenu(p, api, sayfa);
  }
  const fiyat = a.sat.fiyat;
  if (api.paraOku(p) < fiyat) { p.sendMessage("§c[Arsa] Yeterli paran yok."); return pazarMenu(p, api, sayfa); }

  new ActionFormData().title("§lARSAYI SATIN AL")
    .body(
      `§7"§f${a.ad}§7" arsasını §f${a.s}§7 adlı oyuncudan alıyorsun.\n\n` +
      `§7Fiyat: §a${api.fmt(fiyat)}\n§7Bakiyen: §a${api.fmt(api.paraOku(p))}\n` +
      `§7Kalan: §a${api.fmt(api.paraOku(p) - fiyat)}\n\n` +
      `§8Arsanın üyeleri sıfırlanır, sahibi sen olursun.`
    )
    .button("§aEVET, SATIN AL", "textures/items/gold_ingot")
    .button("§7Vazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return pazarDetay(p, api, id, sayfa);
      const g = arsalar(api).slice();
      const t = g.find(x => x.id === id);
      // son kontroller: baskasi kapmis / fiyat degismis / para bitmis olabilir
      if (!t || !t.sat || t.sat.fiyat !== fiyat || t.s === p.name || kiraAktif(t)) {
        p.sendMessage("§c[Arsa] İlan değişti, işlem iptal edildi.");
        return pazarMenu(p, api, sayfa);
      }
      if (sahipSayisi(api, p.name) >= ARSA_CFG.maxArsaOyuncu) { p.sendMessage("§c[Arsa] Arsa hakkın dolu."); return pazarMenu(p, api, sayfa); }
      if (api.paraOku(p) < fiyat) { p.sendMessage("§c[Arsa] Yeterli paran yok."); return pazarMenu(p, api, sayfa); }

      const eskiSahip = t.s;
      api.paraEkle(p, -fiyat);
      api.paraVer?.(eskiSahip, fiyat);
      t.s = p.name;
      t.u = [];
      delete t.sat;
      delete t.kira;
      delete t.kiraci;
      arsalariYaz(api, g);
      sonBolge.clear();
      try { p.playSound("random.levelup"); } catch { }
      p.sendMessage(`§a[Arsa] §f"${t.ad}" §aartık senin! §c-${api.fmt(fiyat)}`);
      p.sendMessage("§7Adını değiştirebilir, üye ekleyebilir, ışınlanma noktası koyabilirsin.");
      try { world.getAllPlayers().find(x => x.name === eskiSahip)?.sendMessage(`§a[Arsa] §f${p.name} §7"${t.ad}" arsanı satın aldı. §a+${api.fmt(fiyat)}`); } catch { }
      arsalarimMenu(p, api);
    });
}

// Kirala / kirayi uzat
function kirayiOnayla(p, api, id, uzatma, sayfa = 0) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a || !a.kira) { p.sendMessage("§c[Arsa] Bu arsa artık kiralık değil."); return uzatma ? arsalarimMenu(p, api) : pazarMenu(p, api, sayfa); }
  if (a.s === p.name) { p.sendMessage("§7[Arsa] Kendi arsanı kiralayamazsın."); return arsaYonet(p, api, id); }
  if (!uzatma && kiraAktif(a)) { p.sendMessage("§c[Arsa] Arsa şu an başkasında kirada."); return pazarMenu(p, api, sayfa); }
  const { fiyat, gun } = a.kira;
  const kalan = uzatma ? kalanYazi(a) : "-";

  new ActionFormData().title(uzatma ? "§lKİRAYI UZAT" : "§lARSAYI KİRALA")
    .body(
      `§7"§f${a.ad}§7" - sahibi §f${a.s}\n\n` +
      `§7Bedel: §a${api.fmt(fiyat)}\n§7Süre: §f${gun} gün` +
      (uzatma ? ` §8(mevcut ${kalan} üstüne eklenir)` : "") + `\n` +
      `§7Bakiyen: §a${api.fmt(api.paraOku(p))}\n\n` +
      `§8Kira boyunca arsada inşa edebilir ve oraya ışınlanabilirsin.`
    )
    .button(api.paraOku(p) >= fiyat ? "§aEVET, ÖDE" : "§8(Para yetersiz)", "textures/items/gold_ingot")
    .button("§7Vazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return uzatma ? kiraciEkrani(p, api, id) : pazarDetay(p, api, id, sayfa);
      const g = arsalar(api).slice();
      const t = g.find(x => x.id === id);
      if (!t || !t.kira || t.kira.fiyat !== fiyat || t.kira.gun !== gun) {
        p.sendMessage("§c[Arsa] İlan değişti, işlem iptal edildi.");
        return uzatma ? arsalarimMenu(p, api) : pazarMenu(p, api, sayfa);
      }
      if (uzatma ? !kiraciMi(t, p.name) : kiraAktif(t)) {
        p.sendMessage("§c[Arsa] Kira durumu değişti, işlem iptal edildi.");
        return arsalarimMenu(p, api);
      }
      if (api.paraOku(p) < fiyat) { p.sendMessage("§c[Arsa] Yeterli paran yok."); return arsalarimMenu(p, api); }

      api.paraEkle(p, -fiyat);
      api.paraVer?.(t.s, fiyat);
      const simdi = Date.now();
      const eskiBitis = uzatma && kiraAktif(t) ? t.kiraci.bitis : simdi;
      t.kiraci = {
        ad: p.name,
        basla: uzatma && kiraAktif(t) ? (t.kiraci.basla ?? simdi) : simdi,
        bitis: eskiBitis + gun * 86400000,
        odenen: (uzatma && kiraAktif(t) ? (t.kiraci.odenen ?? 0) : 0) + fiyat
      };
      arsalariYaz(api, g);
      sonBolge.clear();
      try { p.playSound("random.levelup"); } catch { }
      p.sendMessage(`§a[Arsa] §f"${t.ad}" §a${uzatma ? "kirası uzatıldı" : "kiralandı"}! §7${kalanYazi(t)} kaldı. §c-${api.fmt(fiyat)}`);
      try { world.getAllPlayers().find(x => x.name === t.s)?.sendMessage(`§a[Arsa] §f${p.name} §7"${t.ad}" arsanı ${uzatma ? "kirasını uzattı" : "kiraladı"}. §a+${api.fmt(fiyat)}`); } catch { }
      arsalarimMenu(p, api);
    });
}

// Suresi dolan kiralari kapat. main.js dongusunden cagrilir.
export function kiraKontrol(api) {
  let liste;
  try { liste = arsalar(api); } catch { return 0; }
  const simdi = Date.now();
  const bitenler = liste.filter(a => a.kiraci && !(a.kiraci.bitis > simdi));
  if (bitenler.length === 0) return 0;
  const g = liste.slice();
  for (const a of g) {
    if (!a.kiraci || a.kiraci.bitis > simdi) continue;
    const kiraciAd = a.kiraci.ad;
    delete a.kiraci;
    try {
      world.getAllPlayers().find(x => x.name === kiraciAd)
        ?.sendMessage(`§e[Arsa] §f"${a.ad}" §7kiran doldu. Artık orada inşa edemezsin.`);
      world.getAllPlayers().find(x => x.name === a.s)
        ?.sendMessage(`§e[Arsa] §f"${a.ad}" §7kirası doldu (${kiraciAd}). Arsa yine senin.`);
    } catch { }
  }
  arsalariYaz(api, g);
  sonBolge.clear();
  return bitenler.length;
}

// Sahibi, arsanin icinde durdugu yeri isinlanma noktasi yapar.
function isinlanmaNoktasiAyarla(p, api, id) {
  const g = arsalar(api).slice();
  const t = g.find(x => x.id === id);
  if (!t) return arsaYonetListe(p, api);
  const x = Math.floor(p.location.x), y = Math.floor(p.location.y), z = Math.floor(p.location.z);
  if (p.dimension.id !== t.d || !icinde(t, p.dimension.id, x, z)) {
    p.sendMessage("§c[Arsa] Nokta arsanın İÇİNDE olmalı. §7Arsana git, sonra bu düğmeye bas.");
    return arsaYonet(p, api, id);
  }
  let bakis = 0;
  try { bakis = p.getRotation().y; } catch { }
  t.tp = { x, y, z, bakis };
  arsalariYaz(api, g);
  p.sendMessage(`§a[Arsa] §7Işınlanma noktası ayarlandı: §f${x}, ${y}, ${z}`);
  try { p.playSound("random.orb"); } catch { }
  arsaYonet(p, api, id);
}

// Uye ekranlari "geri" ile cagrildigi yere doner: hem Yonet ekranindan
// hem de dogrudan Uyeler ekranindan kullanilabiliyorlar.
function uyeEkle(p, api, id, geri) {
  const don = geri ?? (() => arsaYonet(p, api, id));
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return arsaYonetListe(p, api);
  const aday = world.getAllPlayers().filter(x => x.name !== p.name && !(a.u ?? []).includes(x.name));
  if (aday.length === 0) {
    // Cevrimdisi oyuncu da eklenebilsin: eskiden online kimse yoksa hic eklenemiyordu.
    return uyeElle(p, api, id, don);
  }

  const f = new ModalFormData().title("§lÜYE EKLE")
    .dropdown("Kimi ekleyeyim?", [...aday.map(x => x.name), "(elle isim yaz)"]);
  f.show(p).then(r => {
    if (r.canceled) return don();
    const ix = r.formValues?.[0] ?? 0;
    if (ix === aday.length) return uyeElle(p, api, id, don);
    uyeKaydet(p, api, id, aday[ix].name, don);
  });
}

function uyeElle(p, api, id, geri) {
  const don = geri ?? (() => arsaYonet(p, api, id));
  new ModalFormData().title("§lÜYE EKLE")
    .textField("Oyuncu adı (birebir yaz)", "örn: Ahmet123")
    .show(p).then(r => {
      if (r.canceled) return don();
      const ad = String(r.formValues?.[0] ?? "").trim();
      if (!ad) return don();
      uyeKaydet(p, api, id, ad, don);
    });
}

function uyeKaydet(p, api, id, ad, geri) {
  const don = geri ?? (() => arsaYonet(p, api, id));
  const g = arsalar(api).slice();
  const t = g.find(x => x.id === id);
  if (!t) return arsaYonetListe(p, api);
  if (t.s !== p.name) { p.sendMessage("§c[Arsa] Bu arsa senin değil."); return don(); }
  if (ad === t.s) { p.sendMessage("§7[Arsa] Sahibi zaten sensin."); return don(); }
  if ((t.u ?? []).includes(ad)) { p.sendMessage("§7[Arsa] Zaten üye."); return don(); }
  if (ad.length > 32) { p.sendMessage("§c[Arsa] Bu isim çok uzun."); return don(); }
  (t.u ??= []).push(ad);
  arsalariYaz(api, g);
  p.sendMessage(`§a[Arsa] §f${ad} §a"${t.ad}" arsasına üye yapıldı.`);
  p.sendMessage("§8Artık orada blok kırıp koyabilir, sandık açabilir.");
  try { world.getAllPlayers().find(x => x.name === ad)?.sendMessage(`§a[Arsa] §f${p.name} §7seni "${t.ad}" arsasına üye yaptı.`); } catch { }
  don();
}

function uyeSil(p, api, id, ad, geri) {
  const don = geri ?? (() => arsaYonet(p, api, id));
  const g = arsalar(api).slice();
  const t = g.find(x => x.id === id);
  if (!t) return arsaYonetListe(p, api);
  if (t.s !== p.name) { p.sendMessage("§c[Arsa] Bu arsa senin değil."); return don(); }
  t.u = (t.u ?? []).filter(x => x !== ad);
  arsalariYaz(api, g);
  p.sendMessage(`§a[Arsa] §f${ad} §7"${t.ad}" arsasından çıkarıldı.`);
  try { world.getAllPlayers().find(x => x.name === ad)?.sendMessage(`§e[Arsa] §f${p.name} §7seni "${t.ad}" arsasından çıkardı.`); } catch { }
  don();
}

function uyeCikar(p, api, id, geri) {
  const don = geri ?? (() => arsaYonet(p, api, id));
  const a = arsalar(api).find(x => x.id === id);
  if (!a || (a.u ?? []).length === 0) { p.sendMessage("§7[Arsa] Üye yok."); return don(); }
  new ModalFormData().title("§lÜYE ÇIKAR")
    .dropdown("Kimi çıkarayım?", a.u)
    .show(p).then(r => {
      if (r.canceled) return don();
      uyeSil(p, api, id, a.u[r.formValues?.[0] ?? 0], don);
    });
}

// ==================== ÜYELER EKRANI (v3.7) ====================
// Uye ekleme/cikarma dort menu derinde kaliyordu. Bu ekran arsa
// menusunden tek tikla aciliyor ve ikisini birden yapiyor.
export function uyelerMenu(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return uyeArsaSec(p, api);
  if (a.s !== p.name) { p.sendMessage("§c[Arsa] Sadece arsanın sahibi üye ekleyip çıkarabilir."); return arsaMenu(p, api); }
  const uyeler = a.u ?? [];
  const online = new Set(world.getAllPlayers().map(x => x.name));

  const f = new ActionFormData()
    .title(`§l${a.ad.toUpperCase()} - ÜYELER`)
    .body(
      `§7Sahibi: §f${a.s}\n` +
      `§7Üye sayısı: §f${uyeler.length}\n\n` +
      (uyeler.length
        ? "§7Üyeler bu arsada blok kırabilir, koyabilir, sandık açabilir.\n§8Çıkarmak için üyeye bas."
        : "§7Henüz üye yok.\n§8Çevrimdışı birini de elle adını yazarak ekleyebilirsin.")
    );

  for (const ad of uyeler)
    f.button(`§f${ad}${online.has(ad) ? " §a(çevrimiçi)" : ""}\n§8çıkarmak için bas`, "textures/items/name_tag");
  f.button("§aÜye Ekle\n§r§8Listeden seç ya da adını yaz", "textures/items/name_tag");
  f.button("§7< Geri");

  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection < uyeler.length)
      return uyeSil(p, api, id, uyeler[r.selection], () => uyelerMenu(p, api, id));
    if (r.selection === uyeler.length)
      return uyeEkle(p, api, id, () => uyelerMenu(p, api, id));
    arsaMenu(p, api);
  });
}

// Hangi arsanin uyeleri? Icinde durdugun arsa varsa dogrudan onu acar.
export function uyeArsaSec(p, api) {
  const benim = arsalar(api).filter(x => x.s === p.name);
  if (benim.length === 0) {
    p.sendMessage("§7[Arsa] Henüz arsan yok. §f!arsa");
    return arsaMenu(p, api);
  }
  const burada = arsaBul(api, p.dimension.id, p.location.x, p.location.z);
  if (burada && burada.s === p.name) return uyelerMenu(p, api, burada.id);
  if (benim.length === 1) return uyelerMenu(p, api, benim[0].id);

  const f = new ActionFormData().title("§lÜYELER").body("§7Hangi arsanın üyelerini düzenleyeceksin?");
  for (const a of benim)
    f.button(`§f${a.ad}\n§7${a.x2 - a.x1 + 1}x${a.z2 - a.z1 + 1} §8- ${(a.u ?? []).length} üye`, "textures/items/name_tag");
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === benim.length) return arsaMenu(p, api);
    uyelerMenu(p, api, benim[r.selection].id);
  });
}

function adDegistir(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return arsaYonetListe(p, api);
  new ModalFormData().title("§lADI DEĞİŞTİR")
    .textField("Yeni ad", "örn: Çiftlik", { defaultValue: a.ad })
    .show(p).then(r => {
      if (r.canceled) return arsaYonet(p, api, id);
      const yeni = String(r.formValues?.[0] ?? "").trim().slice(0, 24);
      if (!yeni) return arsaYonet(p, api, id);
      const g = arsalar(api).slice();
      const t = g.find(x => x.id === id);
      if (t) { t.ad = yeni; arsalariYaz(api, g); p.sendMessage(`§a[Arsa] Yeni ad: §f${yeni}`); }
      arsaYonet(p, api, id);
    });
}

function arsaSil(p, api, id, iade) {
  const a0 = arsalar(api).find(x => x.id === id);
  if (a0 && kiraAktif(a0)) {
    p.sendMessage(`§c[Arsa] Arsa kirada (${a0.kiraci.ad}). Önce kiracıyı çıkar.`);
    return arsaYonet(p, api, id);
  }
  new ActionFormData().title("§c§lARSAYI SİL")
    .body(`§cBu işlem geri alınamaz.\n§7Arsa silinince koruma kalkar ve\n§7sana §a${api.fmt(iade)} §7iade edilir.`)
    .button("§cEVET, SİL").button("§7Vazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return arsaYonet(p, api, id);
      const g = arsalar(api).slice();
      const ix = g.findIndex(x => x.id === id);
      if (ix === -1) return arsaYonetListe(p, api);
      if (kiraAktif(g[ix])) { p.sendMessage("§c[Arsa] Arsa kirada, silinemez."); return arsaYonet(p, api, id); }
      const [c] = g.splice(ix, 1);
      arsalariYaz(api, g);
      api.paraEkle(p, iade);
      sonBolge.clear();
      p.sendMessage(`§a[Arsa] §f"${c.ad}" §7silindi, §a${api.fmt(iade)} §7iade edildi.`);
      arsalarimMenu(p, api);
    });
}

// Admin: tum arsalari listele / zorla sil
export function arsaAdmin(p, api) {
  const g = arsalar(api);
  if (g.length === 0) { p.sendMessage("§7[Arsa] Hiç arsa yok."); return api.anaMenu(p); }
  const f = new ActionFormData().title("§c§lTÜM ARSALAR").body(`§7Toplam ${g.length} arsa. Silmek için bas.`);
  const dilim = g.slice(0, 40);
  for (const a of dilim) {
    const et = kiraAktif(a) ? ` · kirada: ${a.kiraci.ad}` : a.sat ? " · satılık" : a.kira ? " · kiralık" : "";
    f.button(`§f${a.ad}\n§8${a.s} · ${a.x1},${a.z1}${et}`, "textures/items/book_normal");
  }
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled || r.selection === dilim.length) return api.anaMenu(p);
    const hedef = dilim[r.selection];
    const yeni = arsalar(api).filter(x => x.id !== hedef.id);
    arsalariYaz(api, yeni);
    sonBolge.clear();
    p.sendMessage(`§a[Arsa] §f${hedef.s}§7 adlı oyuncunun "${hedef.ad}" arsası silindi.`);
    arsaAdmin(p, api);
  });
}
