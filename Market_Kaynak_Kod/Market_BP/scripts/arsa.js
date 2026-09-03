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
  maxArsaOyuncu: 3,
  iadeOrani: 0.5,       // arsa silinince paranin yarisi geri
  girisBildirimi: true,

  // v2.0 AYARLARI
  // Operatorler arsa korumasini GECMEZ. Eskiden gecerlerdi: dunya sahibi
  // ve butun op'lar korumadan muaftı, bu yuzden koruma "hic calismiyor"
  // gibi gorunuyordu. Gecmesi gereken biri varsa ona "market_admin"
  // etiketi ver: /tag "Oyuncu" add market_admin
  adminGecebilir: false,
  hayvanKorumasi: true, // arsadaki hayvan/esya cercevesi/zirh standi korunur
  sinirGosterme: true   // menude "Sinirlari Goster" (parcacikla cizer)
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
export function arsaBul(api, d, x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const liste = arsalar(api);
  for (const a of liste) if (icinde(a, d, x0, z0)) return a;
  return undefined;
}
function yetkili(a, ad) { return a.s === ad || (a.u ?? []).includes(ad); }
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
      p.onScreenDisplay.setActionBar(benim
        ? `§a${a.ad} §7arsana girdin`
        : `§e${a.ad} §7arsasina girdin §8(${a.s})`);
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

// ==================== MENULER ====================
export function arsaMenu(p, api) {
  const hepsi = arsalar(api);
  const benim = hepsi.filter(a => a.s === p.name);
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
      `§7Arsan: §f${benim.length}§7 / ${ARSA_CFG.maxArsaOyuncu}  §8|  §7Dünyada: §f${hepsi.length}\n` +
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
  ekle("§lArsalarım\n§r§7Üye ekle, sil, sınır göster", "textures/items/book_normal",
    () => arsalarimMenu(p, api));
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
  const benim = arsalar(api).filter(a => a.s === p.name);
  if (benim.length === 0) {
    new ActionFormData().title("§lARSALARIM").body("§7Henüz arsan yok.\n§8Köşe 1'i koy, karşı köşeye yürü, satın al.")
      .button("§7< Geri").show(p).then(r => { if (!r.canceled) arsaMenu(p, api); });
    return;
  }
  const f = new ActionFormData().title("§lARSALARIM").body("§7Yönetmek istediğine bas.");
  for (const a of benim) f.button(`§f${a.ad}\n§7${a.x2 - a.x1 + 1}x${a.z2 - a.z1 + 1} §8- ${(a.u ?? []).length} üye`, "textures/items/book_normal");
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === benim.length) return arsaMenu(p, api);
    arsaYonet(p, api, benim[r.selection].id);
  });
}

function arsaYonet(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return arsalarimMenu(p, api);
  const alanBlok = alan(a);
  const iade = Math.floor(alanBlok * ARSA_CFG.birimFiyat * ARSA_CFG.iadeOrani);

  new ActionFormData()
    .title(`§l${a.ad.toUpperCase()}`)
    .body(
      `§7Boyut: §f${a.x2 - a.x1 + 1} x ${a.z2 - a.z1 + 1} §8(${alanBlok} blok)\n` +
      `§7Sınırlar: §f${a.x1},${a.z1} §7- §f${a.x2},${a.z2}\n` +
      `§7Boyut: §f${a.d.replace("minecraft:", "")}\n` +
      `§7Üyeler: §f${(a.u ?? []).join(", ") || "yok"}\n` +
      `§7Silersen iade: §a${api.fmt(iade)}`
    )
    .button("§aÜye Ekle", "textures/items/name_tag")
    .button("§eÜye Çıkar", "textures/items/barrier")
    .button("§eAdını Değiştir", "textures/items/book_writable")
    .button("§eSınırları Göster", "textures/items/redstone_dust")
    .button("§cArsayı Sil", "textures/blocks/tnt_side")
    .button("§7< Geri")
    .show(p).then(r => {
      if (r.canceled || r.selection === 5) return arsalarimMenu(p, api);
      if (r.selection === 0) return uyeEkle(p, api, id);
      if (r.selection === 1) return uyeCikar(p, api, id);
      if (r.selection === 2) return adDegistir(p, api, id);
      if (r.selection === 3) {
        if (a.d !== p.dimension.id) p.sendMessage("§c[Arsa] Bu arsa başka bir boyutta.");
        else { sinirlariGoster(p, a); p.sendMessage("§a[Arsa] §7Sınırlar parçacıkla çizildi."); }
        return arsaYonet(p, api, id);
      }
      if (r.selection === 4) return arsaSil(p, api, id, iade);
    });
}

function uyeEkle(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return arsalarimMenu(p, api);
  const aday = world.getAllPlayers().filter(x => x.name !== p.name && !(a.u ?? []).includes(x.name));
  if (aday.length === 0) {
    // Cevrimdisi oyuncu da eklenebilsin: eskiden online kimse yoksa hic eklenemiyordu.
    return uyeElle(p, api, id);
  }

  const f = new ModalFormData().title("§lÜYE EKLE")
    .dropdown("Kimi ekleyeyim?", [...aday.map(x => x.name), "(elle isim yaz)"]);
  f.show(p).then(r => {
    if (r.canceled) return arsaYonet(p, api, id);
    const ix = r.formValues?.[0] ?? 0;
    if (ix === aday.length) return uyeElle(p, api, id);
    uyeKaydet(p, api, id, aday[ix].name);
  });
}

function uyeElle(p, api, id) {
  new ModalFormData().title("§lÜYE EKLE")
    .textField("Oyuncu adı (birebir yaz)", "örn: Ahmet123")
    .show(p).then(r => {
      if (r.canceled) return arsaYonet(p, api, id);
      const ad = String(r.formValues?.[0] ?? "").trim();
      if (!ad) return arsaYonet(p, api, id);
      uyeKaydet(p, api, id, ad);
    });
}

function uyeKaydet(p, api, id, ad) {
  const g = arsalar(api).slice();
  const t = g.find(x => x.id === id);
  if (!t) return arsalarimMenu(p, api);
  if (ad === t.s) { p.sendMessage("§7[Arsa] Sahibi zaten sensin."); return arsaYonet(p, api, id); }
  if ((t.u ?? []).includes(ad)) { p.sendMessage("§7[Arsa] Zaten üye."); return arsaYonet(p, api, id); }
  (t.u ??= []).push(ad);
  arsalariYaz(api, g);
  p.sendMessage(`§a[Arsa] §f${ad} §aeklendi.`);
  try { world.getAllPlayers().find(x => x.name === ad)?.sendMessage(`§a[Arsa] §f${p.name} §7seni "${t.ad}" arsasına üye yaptı.`); } catch { }
  arsaYonet(p, api, id);
}

function uyeCikar(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a || (a.u ?? []).length === 0) { p.sendMessage("§7[Arsa] Üye yok."); return arsaYonet(p, api, id); }
  new ModalFormData().title("§lÜYE ÇIKAR")
    .dropdown("Kimi çıkarayım?", a.u)
    .show(p).then(r => {
      if (r.canceled) return arsaYonet(p, api, id);
      const ad = a.u[r.formValues?.[0] ?? 0];
      const g = arsalar(api).slice();
      const t = g.find(x => x.id === id);
      if (!t) return arsalarimMenu(p, api);
      t.u = (t.u ?? []).filter(x => x !== ad);
      arsalariYaz(api, g);
      p.sendMessage(`§a[Arsa] §f${ad} §7çıkarıldı.`);
      arsaYonet(p, api, id);
    });
}

function adDegistir(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return arsalarimMenu(p, api);
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
  new ActionFormData().title("§c§lARSAYI SİL")
    .body(`§cBu işlem geri alınamaz.\n§7Arsa silinince koruma kalkar ve\n§7sana §a${api.fmt(iade)} §7iade edilir.`)
    .button("§cEVET, SİL").button("§7Vazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return arsaYonet(p, api, id);
      const g = arsalar(api).slice();
      const ix = g.findIndex(x => x.id === id);
      if (ix === -1) return arsalarimMenu(p, api);
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
  for (const a of dilim) f.button(`§f${a.ad}\n§8${a.s} · ${a.x1},${a.z1}`, "textures/items/book_normal");
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
