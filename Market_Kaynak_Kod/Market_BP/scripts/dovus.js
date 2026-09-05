// ============ DUELLO / PVP ARENASI ============
// Iki oyuncu esit kitle, ayri bir arenada dovusur. Kimse envanterini
// kaybetmez: dovus baslarken envanter + zirh + konum kaydedilir, dovus
// bitince aynen geri verilir.
//
// Olum kacinilmaz degil: can esige (varsayilan 2 kalp) dusen kaybeder ve
// aninda iyilestirilir. Yine de biri olurse yedek plan devrede - dusen
// esyalar temizlenir, envanter kayittan geri yuklenir.

import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

const { world, system, ItemStack } = mc;
const { ActionFormData, ModalFormData } = ui;

export const DOVUS_CFG = {
  yedekAnahtar: "mk_dovus_yedek",   // dunya kapansa da envanter kaybolmasin
  arenaAnahtar: "mk_arena",
  odul: 250,                        // bahis yoksa kazanana verilen para
  maxBahis: 100000,
  sureSn: 300,                      // en fazla dovus suresi
  geriSayim: 5,                     // saniye
  bitisCani: 4,                     // bu canin altina dusen kaybeder (2 kalp)
  istekSuresiSn: 60,
  yariCap: 20,                      // arena zemininin yaricapi (41x41)
  yukseklik: 18,                    // duvar yuksekligi (elytra icin bol)
  arenaYaricap: 34,                 // bu mesafeden uzaklasan geri isinlanir
  arenaBeklemeTik: 300,             // chunk yuklenmesi icin en fazla bekleme (15 sn)
  maxKurtarma: 4,                   // ust uste bu kadar geri isinlama olursa iptal
  // Arena ayarlanmamissa ilk dovuste burada otomatik kurulur
  varsayilanArena: { x: 30000, y: 120, z: 30000, d: "minecraft:overworld" }
};

// Esit kit: iki oyuncuya da birebir ayni verilir.
// Bir id oyunda yoksa listedeki sonraki aday denenir.
export const KIT = {
  zirh: {
    Head: ["minecraft:diamond_helmet"],
    Chest: ["minecraft:diamond_chestplate"],
    Legs: ["minecraft:diamond_leggings"],
    Feet: ["minecraft:diamond_boots"],
    Offhand: ["minecraft:shield"]
  },
  esyalar: [
    // Silahlar DEMIR: dovus daha uzun surer, tek vurusta bitmez
    { aday: ["minecraft:iron_sword"], adet: 1 },
    { aday: ["minecraft:iron_axe"], adet: 1 },
    // "mizrak gibi sirik" silah
    { aday: ["minecraft:trident", "minecraft:iron_spear", "minecraft:diamond_spear", "minecraft:mace"], adet: 1 },
    // menzilli
    { aday: ["minecraft:bow"], adet: 1 },
    { aday: ["minecraft:crossbow"], adet: 1 },
    { aday: ["minecraft:arrow"], adet: 64 },
    // hareket: elytra envanterde durur, isteyen gogusluk yerine takar
    { aday: ["minecraft:elytra"], adet: 1 },
    { aday: ["minecraft:firework_rocket"], adet: 32 },
    { aday: ["minecraft:cooked_beef"], adet: 8 }
  ]
};

const YUVA = ["Head", "Chest", "Legs", "Feet", "Offhand", "Mainhand"];

// ---- durum ----
const istekler = new Map();   // id -> {kimden, kime, bahis, zaman}
let istekSayac = 0;
let aktif = null;             // {a, b, baslangic, bitis, bahis, durum, ...}
let dongu = null;

// ============ YARDIMCILAR ============
function kap(p) { return p.getComponent("minecraft:inventory")?.container; }
function ekipman(p) { try { return p.getComponent("minecraft:equippable"); } catch { return undefined; } }
function can(p) { try { return p.getComponent("minecraft:health"); } catch { return undefined; } }
function oyuncu(ad) { return world.getAllPlayers().find(x => x.name === ad); }
function ses(p, id) { try { p.playSound(id); } catch { } }
function baslik(p, ust, alt = "", kal = 30) {
  try { p.onScreenDisplay.setTitle(ust, { subtitle: alt, fadeInDuration: 2, stayDuration: kal, fadeOutDuration: 5 }); } catch { }
}

function ilkGecerli(adaylar, adet) {
  for (const id of adaylar) {
    try { return new ItemStack(id, adet); } catch { }
  }
  return undefined;
}

// ---- envanter paketleme (esya kaybi olmasin diye tam kopya) ----
function esyaPaketle(it) {
  if (!it) return null;
  const d = { t: it.typeId, a: it.amount };
  if (it.nameTag) d.n = it.nameTag;
  const l = it.getLore?.(); if (l?.length) d.l = l;
  try {
    const e = it.getComponent("minecraft:enchantable");
    if (e) { const x = e.getEnchantments().map(y => [y.type.id, y.level]); if (x.length) d.e = x; }
  } catch { }
  try {
    const dur = it.getComponent("minecraft:durability");
    if (dur && dur.damage > 0) d.d = dur.damage;
  } catch { }
  return d;
}
function esyaAc(d) {
  if (!d) return undefined;
  let it;
  try { it = new ItemStack(d.t, d.a); } catch { return undefined; }
  if (d.n) it.nameTag = d.n;
  if (d.l) it.setLore(d.l);
  if (d.e) { try { const c = it.getComponent("minecraft:enchantable"); if (c) for (const [id, lv] of d.e) { try { c.addEnchantment({ type: id, level: lv }); } catch { } } } catch { } }
  if (d.d) { try { const c = it.getComponent("minecraft:durability"); if (c) c.damage = d.d; } catch { } }
  return it;
}

export function envanterKaydet(p) {
  const c = kap(p);
  const env = [];
  if (c) for (let i = 0; i < c.size; i++) env.push(esyaPaketle(c.getItem(i)));
  const eq = ekipman(p);
  const zirh = {};
  if (eq) for (const y of YUVA) { try { zirh[y] = esyaPaketle(eq.getEquipment(mc.EquipmentSlot[y])); } catch { } }
  const l = p.location;
  return {
    env, zirh,
    konum: { x: l.x, y: l.y, z: l.z, d: p.dimension.id },
    bakis: (() => { try { const r = p.getRotation(); return { x: r.x, y: r.y }; } catch { return undefined; } })(),
    zaman: Date.now()
  };
}

export function envanterTemizle(p) {
  const c = kap(p);
  if (c) for (let i = 0; i < c.size; i++) c.setItem(i, undefined);
  const eq = ekipman(p);
  if (eq) for (const y of YUVA) { try { eq.setEquipment(mc.EquipmentSlot[y], undefined); } catch { } }
}

export function envanterGeriYukle(p, yedek) {
  if (!yedek) return false;
  envanterTemizle(p);
  const c = kap(p);
  if (c && Array.isArray(yedek.env)) {
    for (let i = 0; i < Math.min(c.size, yedek.env.length); i++) {
      const it = esyaAc(yedek.env[i]);
      if (it) { try { c.setItem(i, it); } catch { } }
    }
  }
  const eq = ekipman(p);
  if (eq && yedek.zirh) {
    for (const y of YUVA) {
      const it = esyaAc(yedek.zirh[y]);
      if (it) { try { eq.setEquipment(mc.EquipmentSlot[y], it); } catch { } }
    }
  }
  const k = yedek.konum;
  if (k) {
    try {
      const boyut = world.getDimension(k.d ?? "minecraft:overworld");
      p.teleport({ x: k.x, y: k.y, z: k.z }, { dimension: boyut, rotation: yedek.bakis });
    } catch { try { p.teleport({ x: k.x, y: k.y, z: k.z }); } catch { } }
  }
  try { can(p)?.resetToMaxValue(); } catch { }
  return true;
}

function kitVer(p) {
  envanterTemizle(p);
  const eq = ekipman(p);
  if (eq) {
    for (const [yuva, adaylar] of Object.entries(KIT.zirh)) {
      const it = ilkGecerli(adaylar, 1);
      if (it) { try { eq.setEquipment(mc.EquipmentSlot[yuva], it); } catch { } }
    }
  }
  const c = kap(p);
  let slot = 0;
  for (const e of KIT.esyalar) {
    const it = ilkGecerli(e.aday, e.adet);
    if (it && c) { try { c.setItem(slot++, it); } catch { } }
  }
  try { can(p)?.resetToMaxValue(); } catch { }
  try {
    p.runCommand("effect @s clear");
    p.runCommand("effect @s saturation 10 1 true");
  } catch { }
}

// ============ YEDEK (dunya kapanirsa) ============
function yedekleriOku(api) { try { return api.yukle(DOVUS_CFG.yedekAnahtar, {}) ?? {}; } catch { return {}; } }
function yedekYaz(api, ad, veri) {
  const h = yedekleriOku(api);
  if (veri) h[ad] = veri; else delete h[ad];
  try { api.kaydet(DOVUS_CFG.yedekAnahtar, h); } catch { }
}
// Oyuncu dovus sirasinda cikip geri geldiyse esyalarini iade eder.
export function girisKontrol(api, p) {
  const h = yedekleriOku(api);
  const y = h[p.name];
  if (!y) return false;
  yedekYaz(api, p.name, undefined);
  envanterGeriYukle(p, y);
  p.sendMessage("§e[Düello] §fYarım kalan düellodan döndün, eşyaların geri verildi.");
  return true;
}

// ============ ARENA ============
export function arenaOku(api) {
  try { return api.yukle(DOVUS_CFG.arenaAnahtar, null); } catch { return null; }
}
export function arenaYaz(api, a) { api.kaydet(DOVUS_CFG.arenaAnahtar, a); }

const R = DOVUS_CFG.yariCap, H = DOVUS_CFG.yukseklik;

function boyutGetir(id) {
  try { return world.getDimension(id ?? "minecraft:overworld"); }
  catch { return world.getDimension("minecraft:overworld"); }
}

// Chunk yuklu mu? Yuklu degilse getBlock undefined doner ya da hata firlatir.
// ESKI HATA: bu kontrol yoktu; uzaktaki arena chunk'lari yuklu olmadigi icin
// /fill komutlari sessizce basarisiz oluyor, oyuncular BOSLUGA isinlaniyor,
// dusuyor, sinir kontrolu onlari yukari geri atiyordu -> sonsuz dongu.
function blokOku(boyut, x, y, z) {
  try { return boyut.getBlock({ x, y, z }); } catch { return undefined; }
}
function chunkYuklu(boyut, x, y, z) { return !!blokOku(boyut, x, y, z); }

function arenaNoktalari(merkez) {
  const { x, y, z } = merkez;
  return {
    merkez: { x, y, z, d: merkez.d ?? "minecraft:overworld" },
    a: { x: x - 8, y, z, bakis: -90 },
    b: { x: x + 8, y, z, bakis: 90 },
    kuruldu: true
  };
}

// Arena zemini yerinde mi?
function arenaSaglam(merkez) {
  const boyut = boyutGetir(merkez.d);
  for (const nokta of [[merkez.x, merkez.z], [merkez.x - 8, merkez.z], [merkez.x + 8, merkez.z]]) {
    const alt = blokOku(boyut, nokta[0], merkez.y - 1, nokta[1]);
    if (!alt || alt.isAir) return false;
  }
  return true;
}

// Bloklari doser. Chunk yuklu degilse false doner (komutlar bosa gitmesin).
function arenaInsaEt(api, merkez) {
  const { x, y, z } = merkez;
  const boyut = boyutGetir(merkez.d);
  if (!chunkYuklu(boyut, x, y, z)) return false;

  const kmt = (c) => {
    try { return (boyut.runCommand(c)?.successCount ?? 0) > 0; }
    catch (e) { console.warn("[Duello] komut basarisiz: " + c + " -> " + e); return false; }
  };
  kmt(`fill ${x - R} ${y} ${z - R} ${x + R} ${y + H} ${z + R} air`);
  const zemin = kmt(`fill ${x - R} ${y - 1} ${z - R} ${x + R} ${y - 1} ${z + R} polished_andesite`);
  // gorunmez duvarlar + tavan: kimse arenadan cikamasin (elytra ile de)
  kmt(`fill ${x - R - 1} ${y} ${z - R - 1} ${x + R + 1} ${y + H} ${z - R - 1} barrier`);
  kmt(`fill ${x - R - 1} ${y} ${z + R + 1} ${x + R + 1} ${y + H} ${z + R + 1} barrier`);
  kmt(`fill ${x - R - 1} ${y} ${z - R - 1} ${x - R - 1} ${y + H} ${z + R + 1} barrier`);
  kmt(`fill ${x + R + 1} ${y} ${z - R - 1} ${x + R + 1} ${y + H} ${z + R + 1} barrier`);
  kmt(`fill ${x - R - 1} ${y + H + 1} ${z - R - 1} ${x + R + 1} ${y + H + 1} ${z + R + 1} barrier`);

  if (!zemin || !arenaSaglam(merkez)) return false;
  arenaYaz(api, arenaNoktalari(merkez));
  return true;
}

// Arenayi kullanima HAZIR hale getirir. Chunk yuklu degilse tickingarea ile
// yukletir ve yuklenene kadar bekler; hazir olunca geriCagir(arena) calisir,
// olmazsa geriCagir(null). Isinlanma ANCAK zemin dogrulaninca yapilir.
function arenaHazirla(api, haberVer, geriCagir) {
  const kayit = arenaOku(api);
  const merkez = (kayit?.merkez) ?? DOVUS_CFG.varsayilanArena;
  const boyut = boyutGetir(merkez.d);
  const { x, y, z } = merkez;

  // chunk'lari kalici olarak yuklet
  try {
    boyut.runCommand(`tickingarea add ${x - R - 2} ${y - 2} ${z - R - 2} ${x + R + 2} ${y + H + 3} ${z + R + 2} mk_arena`);
  } catch { }

  let deneme = 0;
  const dene = () => {
    deneme++;
    if (chunkYuklu(boyut, x, y, z)) {
      if (arenaSaglam(merkez)) return geriCagir(arenaNoktalari(merkez));
      haberVer("§7[Düello] Arena kuruluyor...");
      if (arenaInsaEt(api, merkez)) return geriCagir(arenaNoktalari(merkez));
      return geriCagir(null);
    }
    if (deneme === 1) haberVer("§7[Düello] Arena bölgesi yükleniyor, bekle...");
    if (deneme > DOVUS_CFG.arenaBeklemeTik / 10) return geriCagir(null);
    system.runTimeout(dene, 10);
  };
  dene();
}

// Isinlamadan once AYAGININ ALTINDA blok var mi diye bakar. Bosluga
// isinlamak eski surumdeki "yukaridan dusup takilma" hatasinin sebebiydi.
function isinla(p, nokta, boyutId) {
  try {
    const boyut = boyutGetir(boyutId);
    const alt = blokOku(boyut, Math.floor(nokta.x), nokta.y - 1, Math.floor(nokta.z));
    if (!alt || alt.isAir) { console.warn("[Duello] isinlama noktasinin altinda zemin yok"); return false; }
    p.teleport({ x: nokta.x + 0.5, y: nokta.y, z: nokta.z + 0.5 },
      { dimension: boyut, rotation: { x: 0, y: nokta.bakis ?? 0 } });
    return true;
  } catch (e) { console.warn("[Duello] isinlanamadi: " + e); return false; }
}

// ============ ISTEK ============
export function istekGonder(p, hedef, bahis, api) {
  if (aktif) { p.sendMessage("§c[Düello] Şu an başka bir düello sürüyor, bitmesini bekle."); return; }
  if (hedef.name === p.name) { p.sendMessage("§c[Düello] Kendine istek atamazsın."); return; }
  bahis = Math.max(0, Math.min(DOVUS_CFG.maxBahis, Math.floor(bahis) || 0));
  if (bahis > 0) {
    if (api.paraOku(p) < bahis) { p.sendMessage("§c[Düello] Bahis için yeterli paran yok."); return; }
    if (api.paraOku(hedef) < bahis) { p.sendMessage(`§c[Düello] §f${hedef.name}§c bu bahsi karşılayamıyor.`); return; }
  }
  const id = `d${++istekSayac}`;
  istekler.set(id, { kimden: p.name, kime: hedef.name, bahis, zaman: Date.now() });
  p.sendMessage(`§a[Düello] §f${hedef.name}§7 adlı oyuncuya istek gönderildi.${bahis ? ` §7Bahis: §a${api.fmt(bahis)}` : ""}`);
  hedef.sendMessage(`§6[Düello] §f${p.name}§7 seni düelloya çağırıyor!${bahis ? ` §7Bahis: §a${api.fmt(bahis)}` : ""}`);
  hedef.sendMessage("§7Kabul etmek için: §f!dovus§7 → Gelen İstekler");
  ses(hedef, "random.orb");
  baslik(hedef, "§6DÜELLO İSTEĞİ", `§f${p.name}`, 40);
  system.run(() => { try { istekEkrani(hedef, api); } catch { } });
}

export function gelenIstekler(p) {
  const simdi = Date.now();
  const liste = [];
  for (const [id, t] of istekler) {
    if (simdi - t.zaman > DOVUS_CFG.istekSuresiSn * 1000) { istekler.delete(id); continue; }
    if (t.kime === p.name) liste.push({ id, ...t });
  }
  return liste;
}

function istekEkrani(p, api) {
  const liste = gelenIstekler(p);
  if (liste.length === 0) {
    new ActionFormData().title("§lDÜELLO İSTEKLERİ").body("§7Bekleyen isteğin yok.")
      .button("§7< Geri").show(p).then(r => { if (!r.canceled) dovusMenu(p, api); });
    return;
  }
  const f = new ActionFormData().title("§lDÜELLO İSTEKLERİ")
    .body("§7Kabul edersen ikiniz de arenaya ışınlanır.\n§7Eşyaların saklanır, dövüş bitince geri gelir.");
  for (const t of liste) f.button(`§f${t.kimden}\n§7${t.bahis ? `Bahis: ${api.fmt(t.bahis)}` : "Bahissiz"}`, "textures/items/diamond_sword");
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === liste.length) return dovusMenu(p, api);
    const t = liste[r.selection];
    new ActionFormData().title("§lDÜELLO")
      .body(`§f${t.kimden}§7 ile düello:\n\n` +
        `§7Kit: §fElmas zırh, demir silahlar, yay/arbalet, elytra\n` +
        `§7İkinize de birebir aynı verilir.\n` +
        `§7Eşyaların saklanır, dövüş bitince §fyerinde geri§7 alırsın.\n` +
        `§7Bahis: §a${t.bahis ? api.fmt(t.bahis) : "yok"}\n` +
        `§7Kazanan ödül: §a${api.fmt(t.bahis ? t.bahis * 2 : DOVUS_CFG.odul)}`)
      .button("§aKABUL ET").button("§cREDDET")
      .show(p).then(r2 => {
        if (r2.canceled) return istekEkrani(p, api);
        istekler.delete(t.id);
        const rakip = oyuncu(t.kimden);
        if (r2.selection === 1) {
          rakip?.sendMessage(`§c[Düello] §f${p.name}§7 isteğini reddetti.`);
          return dovusMenu(p, api);
        }
        if (!rakip) { p.sendMessage("§c[Düello] Rakip çevrimdışı."); return dovusMenu(p, api); }
        dovusBaslat(api, rakip, p, t.bahis);
      });
  });
}

// ============ DOVUS ============
export function dovusBaslat(api, a, b, bahis) {
  if (aktif) { a.sendMessage("§c[Düello] Şu an başka bir düello sürüyor."); return; }
  if (bahis > 0 && (api.paraOku(a) < bahis || api.paraOku(b) < bahis)) {
    a.sendMessage("§c[Düello] Bahis karşılanamıyor, iptal.");
    b.sendMessage("§c[Düello] Bahis karşılanamıyor, iptal.");
    return;
  }
  a.sendMessage("§7[Düello] Arena hazırlanıyor...");
  b.sendMessage("§7[Düello] Arena hazırlanıyor...");
  arenaHazirla(api, (m) => { a.sendMessage(m); b.sendMessage(m); }, (arena) => {
    if (!arena) {
      const uyari = "§c[Düello] Arena hazırlanamadı, düello iptal. §7Yönetici: Düello menüsü > Arenayı Buraya Kur.";
      a.sendMessage(uyari); b.sendMessage(uyari);
      return;
    }
    if (!a?.isValid || !b?.isValid || aktif) return;
    dovusuKur(api, a, b, bahis, arena);
  });
}

function dovusuKur(api, a, b, bahis, arena) {
  const yedekA = envanterKaydet(a), yedekB = envanterKaydet(b);
  yedekYaz(api, a.name, yedekA);
  yedekYaz(api, b.name, yedekB);

  if (bahis > 0) { api.paraEkle(a, -bahis); api.paraEkle(b, -bahis); }

  aktif = {
    api, bahis, arena,
    ad: { a: a.name, b: b.name },
    yedek: { [a.name]: yedekA, [b.name]: yedekB },
    durum: "gerisayim",
    sayac: DOVUS_CFG.geriSayim,
    baslangic: Date.now(),
    bitisZamani: Date.now() + (DOVUS_CFG.geriSayim + DOVUS_CFG.sureSn) * 1000
  };

  let hepsiIsindi = true;
  for (const [p, nokta] of [[a, arena.a], [b, arena.b]]) {
    if (!isinla(p, nokta, arena.merkez.d)) hepsiIsindi = false;
  }
  if (!hepsiIsindi) {
    // zemin dogrulanamadi: kimseyi bosluga birakma, her seyi geri al
    for (const p of [a, b]) { envanterGeriYukle(p, aktif.yedek[p.name]); yedekYaz(api, p.name, undefined); }
    if (bahis > 0) { api.paraEkle(a, bahis); api.paraEkle(b, bahis); }
    aktif = null;
    a.sendMessage("§c[Düello] Arena zemini doğrulanamadı, düello iptal edildi.");
    b.sendMessage("§c[Düello] Arena zemini doğrulanamadı, düello iptal edildi.");
    return;
  }
  for (const [p] of [[a], [b]]) {
    kitVer(p);
    baslik(p, "§6HAZIRLAN", `§f${p.name === a.name ? b.name : a.name} §7ile düello`, 30);
    ses(p, "random.anvil_use");
  }
  aktif.kurtarma = { [a.name]: 0, [b.name]: 0 };
  world.sendMessage(`§6[Düello] §f${a.name} §7vs §f${b.name}${bahis ? ` §7- bahis §a${api.fmt(bahis)}` : ""}`);
  donguBaslat();
}

function ikisi() {
  if (!aktif) return [];
  return [oyuncu(aktif.ad.a), oyuncu(aktif.ad.b)];
}

function donguBaslat() {
  if (dongu !== null) return;
  dongu = system.runInterval(() => { try { tik(); } catch (e) { console.warn("[Duello] tik: " + e); } }, 4);
}

function tik() {
  if (!aktif) return;
  const [a, b] = ikisi();

  // biri cikmis: kalan kazanir
  if (!a?.isValid || !b?.isValid) {
    const kalan = a?.isValid ? a : b?.isValid ? b : null;
    const kacan = a?.isValid ? aktif.ad.b : aktif.ad.a;
    return dovusBitir(kalan?.name ?? null, `§f${kacan}§7 ayrıldı`);
  }

  if (aktif.durum === "gerisayim") {
    const gecen = (Date.now() - aktif.baslangic) / 1000;
    const kalanSn = Math.ceil(DOVUS_CFG.geriSayim - gecen);
    // geri sayimda gelen hasari geri ver
    for (const p of [a, b]) { try { can(p)?.resetToMaxValue(); } catch { } }
    if (kalanSn !== aktif.sayac && kalanSn > 0) {
      aktif.sayac = kalanSn;
      for (const p of [a, b]) { baslik(p, `§e${kalanSn}`, "", 10); ses(p, "note.hat"); }
    }
    if (gecen >= DOVUS_CFG.geriSayim) {
      aktif.durum = "dovus";
      for (const p of [a, b]) { baslik(p, "§c§lBAŞLA!", "", 20); ses(p, "random.levelup"); }
    }
    return;
  }

  // Arenadan cikani geri koy. DIKKAT: geri koyma basarisiz olursa (zemin yok)
  // oyuncu dusmeye devam eder ve her tikte tekrar isinlanir -> sonsuz dongu.
  // Bu yuzden kurtarma sayilir; ust uste birkac kez gerekiyorsa dovus iptal.
  const m = aktif.arena.merkez;
  for (const p of [a, b]) {
    const l = p.location;
    const disarida = Math.hypot(l.x - m.x, l.z - m.z) > DOVUS_CFG.arenaYaricap
      || l.y < m.y - 3 || p.dimension.id !== m.d;
    if (!disarida) { aktif.kurtarma[p.name] = 0; continue; }

    aktif.kurtarma[p.name] = (aktif.kurtarma[p.name] ?? 0) + 1;
    if (aktif.kurtarma[p.name] > DOVUS_CFG.maxKurtarma) {
      for (const q of [a, b]) q.sendMessage("§c[Düello] Arena bozuk görünüyor (zemin yok), düello iptal edildi.");
      for (const q of [a, b]) q.sendMessage("§7Yönetici: Düello menüsü > §fArenayı Buraya Kur§7 ile sağlam bir arena kur.");
      return dovusIptal("arena bozuk");
    }
    const kondu = isinla(p, p.name === aktif.ad.a ? aktif.arena.a : aktif.arena.b, m.d);
    try { p.onScreenDisplay.setActionBar(kondu ? "§cArenadan çıkamazsın" : "§cArena zemini yok!"); } catch { }
  }

  // can esigi: olum beklemeden bitir
  const canA = can(a)?.currentValue ?? 20;
  const canB = can(b)?.currentValue ?? 20;
  try {
    a.onScreenDisplay.setActionBar(`§c${Math.ceil(canA)} ❤ §8sen  §7|  §f${b.name} §c${Math.ceil(canB)} ❤`);
    b.onScreenDisplay.setActionBar(`§c${Math.ceil(canB)} ❤ §8sen  §7|  §f${a.name} §c${Math.ceil(canA)} ❤`);
  } catch { }
  if (canA <= DOVUS_CFG.bitisCani || canB <= DOVUS_CFG.bitisCani) {
    return dovusBitir(canA > canB ? a.name : b.name, "nakavt");
  }

  // sure doldu: cani fazla olan kazanir
  if (Date.now() >= aktif.bitisZamani) {
    if (Math.abs(canA - canB) < 0.5) return dovusBitir(null, "süre doldu - berabere");
    return dovusBitir(canA > canB ? a.name : b.name, "süre doldu");
  }
}

// Kimse kazanmadan iptal: bahisler iade edilir, esyalar geri verilir.
function dovusIptal(sebep) {
  if (!aktif) return;
  const { api, bahis, ad } = aktif;
  for (const isim of [ad.a, ad.b]) {
    const p = oyuncu(isim);
    if (p && bahis > 0) api.paraEkle(p, bahis);
  }
  return dovusBitir(null, sebep, true);
}

export function dovusBitir(kazananAd, sebep, bahisIadeEdildi) {
  if (!aktif) return;
  const { api, bahis, yedek, ad } = aktif;
  const bitti = aktif;
  aktif = null;
  if (dongu !== null) { try { system.clearRun(dongu); } catch { } dongu = null; }

  for (const isim of [ad.a, ad.b]) {
    const p = oyuncu(isim);
    if (p?.isValid) {
      // dovus alanina dusmus esyalari temizle (kit cogaltmasin)
      try {
        for (const e of p.dimension.getEntities({ type: "minecraft:item", location: p.location, maxDistance: 40 })) e.remove();
      } catch { }
      envanterGeriYukle(p, yedek[isim]);
      try { p.runCommand("effect @s clear"); } catch { }
      yedekYaz(api, isim, undefined);          // iade edildi, yedek gerekmiyor
    }
    // Cevrimdisi (ya da gecersiz) oyuncunun yedegi DURUR: bir daha
    // girdiginde girisKontrol esyalarini iade eder.
  }

  const kazanan = kazananAd ? oyuncu(kazananAd) : null;
  const odul = bahis > 0 ? bahis * 2 : DOVUS_CFG.odul;
  if (kazananAd) {
    if (kazanan) {
      api.paraEkle(kazanan, odul);
      baslik(kazanan, "§6§lKAZANDIN", `§a+${api.fmt(odul)}`, 50);
      ses(kazanan, "random.levelup");
      kazanan.sendMessage(`§a[Düello] §fKazandın! §a+${api.fmt(odul)} §7(${sebep})`);
    }
    const kaybedenAd = kazananAd === ad.a ? ad.b : ad.a;
    const kaybeden = oyuncu(kaybedenAd);
    if (kaybeden) {
      baslik(kaybeden, "§c§lKAYBETTİN", `§7${sebep}`, 50);
      kaybeden.sendMessage(`§c[Düello] §fKaybettin. §7(${sebep})`);
    }
    world.sendMessage(`§6[Düello] §a${kazananAd}§7 kazandı! §8(${sebep})`);
  } else {
    // berabere: bahisler iade
    for (const isim of [ad.a, ad.b]) {
      const p = oyuncu(isim);
      if (p && bahis > 0 && !bahisIadeEdildi) api.paraEkle(p, bahis);
      p?.sendMessage(`§e[Düello] §7Berabere. ${bahis ? "Bahis iade edildi." : ""} §8(${sebep})`);
      if (p) baslik(p, "§e§lBERABERE", `§7${sebep}`, 40);
    }
    world.sendMessage(`§6[Düello] §7${ad.a} vs ${ad.b} berabere bitti.`);
  }
  return bitti;
}

// Olum yedek plani: can esigi yetismezse
export function olumKontrol(oyuncuAdi) {
  if (!aktif) return false;
  if (oyuncuAdi !== aktif.ad.a && oyuncuAdi !== aktif.ad.b) return false;
  const kazanan = oyuncuAdi === aktif.ad.a ? aktif.ad.b : aktif.ad.a;
  dovusBitir(kazanan, "rakip öldü");
  return true;
}

export function dovustaMi(ad) { return !!aktif && (aktif.ad.a === ad || aktif.ad.b === ad); }
export function aktifDovus() { return aktif; }

// ============ MENULER ============
export function dovusMenu(p, api) {
  const gelen = gelenIstekler(p).length;
  const arena = arenaOku(api);
  const s = aktif ? `§c${aktif.ad.a} vs ${aktif.ad.b}` : "§7yok";

  const f = new ActionFormData()
    .title("§lDÜELLO / PVP")
    .body(
      `§7Eşit kit, ayrı arena, eşya kaybı yok.\n` +
      `§7Kit: §fElmas zırh, demir silahlar, yay/arbalet, elytra\n` +
      `§7Süren düello: ${s}\n` +
      `§7Arena: §f${arena?.merkez ? `${Math.round(arena.merkez.x)}, ${Math.round(arena.merkez.z)}` : "kurulmadı (ilk düelloda otomatik)"}\n` +
      `§7Bakiyen: §a${api.fmt(api.paraOku(p))}`
    );
  const islem = [];
  const ekle = (yazi, ikon, fn) => { f.button(yazi, ikon); islem.push(fn); };

  ekle("§lMeydan Oku\n§r§7Bir oyuncuya istek gönder", "textures/items/diamond_sword", () => kisiSec(p, api));
  ekle(`§lGelen İstekler §7(${gelen})`, "textures/items/paper", () => istekEkrani(p, api));
  ekle("§lKit ve Kurallar", "textures/items/book_normal", () => kurallar(p, api));
  if (api.adminMi(p)) {
    ekle("§c§lArenayı Buraya Kur\n§r§7Durduğun yere inşa eder", "textures/blocks/barrier", () => arenaKurOnay(p, api));
    if (aktif) ekle("§c§lDüelloyu İptal Et", "textures/items/barrier", () => {
      dovusBitir(null, "yönetici iptal etti"); dovusMenu(p, api);
    });
  }
  f.button("§7< Geri"); islem.push(() => api.anaMenu(p));
  f.show(p).then(r => { if (!r.canceled) islem[r.selection]?.(); });
}

function kisiSec(p, api) {
  const aday = world.getAllPlayers().filter(x => x.name !== p.name);
  if (aday.length === 0) {
    new ActionFormData().title("§lMEYDAN OKU").body("§7Çevrimiçi başka oyuncu yok.")
      .button("§7< Geri").show(p).then(r => { if (!r.canceled) dovusMenu(p, api); });
    return;
  }
  new ModalFormData().title("§lMEYDAN OKU")
    .dropdown("Kime meydan okuyorsun?", aday.map(x => x.name))
    .textField("Bahis (boş = bahissiz)", "sadece rakam", { defaultValue: "0" })
    .show(p).then(r => {
      if (r.canceled) return dovusMenu(p, api);
      const hedef = aday[r.formValues?.[0] ?? 0];
      const bahis = parseInt(String(r.formValues?.[1] ?? "0").replace(/[^\d]/g, ""), 10) || 0;
      if (!hedef) return dovusMenu(p, api);
      istekGonder(p, hedef, bahis, api);
    });
}

function kurallar(p, api) {
  new ActionFormData().title("§lKİT VE KURALLAR")
    .body(
      `§e§lKİT §7(ikisine de birebir aynı)\n` +
      `§f- Elmas zırh takımı + kalkan\n` +
      `§f- Demir kılıç, demir balta\n` +
      `§f- Mızrak (üç dişli mızrak)\n` +
      `§f- Yay, arbalet, 64 ok\n` +
      `§f- Elytra + 32 havai fişek §8(envanterde, isteyen takar)\n` +
      `§f- 8 pişmiş biftek\n\n` +
      `§e§lNASIL İŞLER\n` +
      `§f1.§7 İstek gönderirsin, karşı taraf kabul eder.\n` +
      `§f2.§7 Envanterin, zırhın ve konumun kaydedilir.\n` +
      `§f3.§7 İkiniz arenaya ışınlanır, kit verilir.\n` +
      `§f4.§7 §f${DOVUS_CFG.geriSayim} saniye§7 geri sayım, sonra dövüş.\n` +
      `§f5.§7 Canı §f${DOVUS_CFG.bitisCani / 2} kalbin§7 altına düşen kaybeder.\n` +
      `§f6.§7 Herkes §fkendi eski yerine§7 ışınlanır, envanteri ve zırhı\n   §7aynen geri gelir.\n\n` +
      `§e§lÖDÜL\n` +
      `§7Bahissiz: kazanana §a${api.fmt(DOVUS_CFG.odul)}\n` +
      `§7Bahisli: iki bahis de kazanana gider.\n\n` +
      `§8Süre sınırı ${DOVUS_CFG.sureSn / 60} dakika; süre dolarsa canı fazla olan kazanır.\n` +
      `§8Oyundan çıkarsan rakip kazanır, eşyaların girişte iade edilir.`
    )
    .button("§7< Geri").show(p).then(r => { if (!r.canceled) dovusMenu(p, api); });
}

function arenaKurOnay(p, api) {
  const l = p.location;
  const x = Math.floor(l.x), y = Math.floor(l.y), z = Math.floor(l.z);
  new ActionFormData().title("§c§lARENA KUR")
    .body(`§7Arena §f${x}, ${y}, ${z}§7 merkezli kurulacak.\n` +
      `§c${DOVUS_CFG.yariCap * 2 + 1}x${DOVUS_CFG.yariCap * 2 + 1} alan temizlenir§7, zemin döşenir,\n` +
      `§7görünmez duvar ve tavan örülür (${DOVUS_CFG.yukseklik} blok yüksek).\n\n` +
      `§8Buradaki yapıların silinir. Boş bir yer seç.\n§8Durduğun yer arenanın ZEMİNİ olur.`)
    .button("§aEVET, KUR").button("§7Vazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return dovusMenu(p, api);
      const merkez = { x, y, z, d: p.dimension.id };
      try {
        p.dimension.runCommand(`tickingarea add ${x - DOVUS_CFG.yariCap - 2} ${y - 2} ${z - DOVUS_CFG.yariCap - 2} ${x + DOVUS_CFG.yariCap + 2} ${y + DOVUS_CFG.yukseklik + 3} ${z + DOVUS_CFG.yariCap + 2} mk_arena`);
      } catch { }
      if (arenaInsaEt(api, merkez)) p.sendMessage(`§a[Düello] §7Arena kuruldu ve doğrulandı: §f${x}, ${y}, ${z}`);
      else p.sendMessage("§c[Düello] Arena kurulamadı. §7Buranın yüklü ve inşaata uygun olduğundan emin ol.");
      dovusMenu(p, api);
    });
}
