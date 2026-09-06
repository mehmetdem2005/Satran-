// ============ DUELLO / STADYUM ARENASI ============
// Kural: KIMSENIN ESYASINA DOKUNULMAZ. Herkes kendi envanteri ve zirhiyla
// dovusur. Mod sadece konumu kaydeder, arenaya isinlar, dovus bitince eski
// yerine geri gonderir.
//
// v2.9'da degisenler:
//  - Kit kaldirildi. Eskiden envanter bosaltilip kit veriliyordu; envanteri
//    temizleyen satir hata firlatirsa dovusBitir yarida kesiliyor, oyuncu ne
//    esyasini geri aliyor ne de arenadan cikabiliyordu. Artik envantere hic
//    dokunulmadigi icin bu hata sinifi tamamen yok.
//  - Bitis akisi saglamlastirildi: her oyuncu ayri try/catch icinde, isinlama
//    her halukarda deneniyor, bir saniye sonra "hala arenada mi" diye
//    dogrulaniyor.
//  - Arena stadyuma cevrildi: 61x61 cim saha, kosu pisti, 4 katli tribun,
//    dis duvar, aydinlatma. Komutlar tik tik calisiyor, oyun donmuyor.

import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

const { world, system } = mc;
const { ActionFormData, ModalFormData } = ui;

export const DOVUS_CFG = {
  konumAnahtar: "mk_dovus_yedek",   // sadece KONUM yedegi (esya degil)
  arenaAnahtar: "mk_arena",
  arenaSurum: 2,                    // stadyum. Eski kayit gorulurse yeniden kurulur.
  odul: 250,                        // bahis yoksa kazanana verilen para
  maxBahis: 100000,
  sureSn: 300,
  geriSayim: 5,
  bitisCani: 6,                     // 3 kalbin altina dusen kaybeder (kendi esyasi riskte)
  istekSuresiSn: 60,

  // --- stadyum olculeri ---
  saha: 30,        // cim saha yaricapi -> 61x61
  pist: 4,         // saha cevresindeki kosu pisti genisligi
  tribunKat: 4,    // tribun kat sayisi
  tribunEn: 3,     // her katin genisligi
  tavan: 25,       // sahanin uzerindeki gorunmez tavan yuksekligi
  duvarYuksek: 14, // dis duvar yuksekligi

  arenaYaricap: 40,                 // bu mesafeden uzaklasan geri isinlanir
  arenaBeklemeTik: 300,             // chunk yuklenmesi icin en fazla bekleme
  maxKurtarma: 4,                   // ust uste bu kadar geri isinlama olursa iptal
  komutTikBasina: 5,                // insaatta tik basina komut (oyun donmesin)
  varsayilanArena: { x: 30000, y: 120, z: 30000, d: "minecraft:overworld" }
};

// ---- durum ----
const istekler = new Map();
let istekSayac = 0;
let aktif = null;
let dongu = null;

// ============ YARDIMCILAR ============
function oyuncu(ad) { return world.getAllPlayers().find(x => x.name === ad); }
function can(p) { try { return p.getComponent("minecraft:health"); } catch { return undefined; } }
function ses(p, id) { try { p.playSound(id); } catch { } }
function baslik(p, ust, alt = "", kal = 30) {
  try { p.onScreenDisplay.setTitle(ust, { subtitle: alt, fadeInDuration: 2, stayDuration: kal, fadeOutDuration: 5 }); } catch { }
}
function boyutGetir(id) {
  try { return world.getDimension(id ?? "minecraft:overworld"); }
  catch { return world.getDimension("minecraft:overworld"); }
}
function blokOku(boyut, x, y, z) {
  try { return boyut.getBlock({ x, y, z }); } catch { return undefined; }
}
function chunkYuklu(boyut, x, y, z) { return !!blokOku(boyut, x, y, z); }

// Sadece konum kaydedilir; envantere DOKUNULMAZ.
export function konumKaydet(p) {
  const l = p.location;
  let bakis;
  try { const r = p.getRotation(); bakis = { x: r.x, y: r.y }; } catch { }
  return { konum: { x: l.x, y: l.y, z: l.z, d: p.dimension.id }, bakis, zaman: Date.now() };
}

// Isinlamadan once ayagin altinda zemin var mi diye bakar.
function isinla(p, nokta, boyutId) {
  try {
    const boyut = boyutGetir(boyutId);
    const alt = blokOku(boyut, Math.floor(nokta.x), Math.round(nokta.y) - 1, Math.floor(nokta.z));
    if (!alt || alt.isAir) { console.warn("[Duello] isinlama noktasinda zemin yok"); return false; }
    p.teleport({ x: nokta.x + 0.5, y: nokta.y, z: nokta.z + 0.5 },
      { dimension: boyut, rotation: { x: 0, y: nokta.bakis ?? 0 } });
    return true;
  } catch (e) { console.warn("[Duello] isinlanamadi: " + e); return false; }
}

// Yedegi olmayan oyuncu icin guvenli bir nokta bulur:
// once kendi yatak/dogma noktasi, sonra dunya dogma noktasi.
// Dunya dogma noktasinda y "belirsiz" (buyuk sayi) olabilir; o zaman
// en ustteki blogun uzerini kullanir.
function guvenliNokta(p) {
  try {
    const kendi = p.getSpawnPoint?.();
    if (kendi && Math.abs(kendi.y) < 1000)
      return { konum: { x: kendi.x, y: kendi.y, z: kendi.z, d: kendi.dimension?.id ?? "minecraft:overworld" } };
  } catch { }
  try {
    const s = world.getDefaultSpawnLocation();
    const ow = boyutGetir("minecraft:overworld");
    if (s) {
      if (Math.abs(s.y) < 1000)
        return { konum: { x: s.x, y: s.y, z: s.z, d: "minecraft:overworld" } };
      const ust = ow.getTopmostBlock?.({ x: s.x, z: s.z });
      if (ust) return { konum: { x: s.x, y: ust.location.y + 1, z: s.z, d: "minecraft:overworld" } };
    }
  } catch { }
  return null;
}

// Oyuncuyu kaydedilen yerine dondurur. Zemin kontrolu YOK: eve donus her
// zaman calismali. Yedek yoksa guvenli bir dogma noktasi bulunur.
function eveGonder(p, yedek) {
  const dene = (y) => {
    const k = y?.konum;
    if (!k) return false;
    try {
      p.teleport({ x: k.x, y: k.y, z: k.z }, { dimension: boyutGetir(k.d), rotation: y.bakis });
      return true;
    } catch (e) { console.warn("[Duello] eve donus hatasi: " + e); }
    try { p.teleport({ x: k.x, y: k.y, z: k.z }); return true; } catch { }
    return false;
  };
  if (dene(yedek)) return true;
  if (dene(guvenliNokta(p))) return true;
  console.warn(`[Duello] ${p.name} eve gonderilemedi (yedek de dogma noktasi da yok).`);
  return false;
}

// ============ KONUM YEDEGI (dunya kapanirsa) ============
function yedekleriOku(api) { try { return api.yukle(DOVUS_CFG.konumAnahtar, {}) ?? {}; } catch { return {}; } }
function yedekYaz(api, ad, veri) {
  const h = yedekleriOku(api);
  if (veri) h[ad] = veri; else delete h[ad];
  try { api.kaydet(DOVUS_CFG.konumAnahtar, h); } catch { }
}

// Oyuncu dovus sirasinda cikip geri geldiyse eski yerine gonderir.
export function girisKontrol(api, p) {
  const h = yedekleriOku(api);
  const y = h[p.name];
  if (y) {
    yedekYaz(api, p.name, undefined);
    eveGonder(p, y);
    p.sendMessage("§e[Düello] §fYarım kalan düellodan döndün, eski yerine gönderildin.");
    return true;
  }
  // Yedegi yok ama arenada duruyorsa (eski surumden kalma takilma) kurtar
  if (!dovustaMi(p.name) && arenadaMi(api, p)) {
    eveGonder(p, null);
    p.sendMessage("§e[Düello] §fArenada takılı kalmışsın, dışarı gönderildin.");
    return true;
  }
  return false;
}

// ============ ARENA ============
export function arenaOku(api) {
  try { return api.yukle(DOVUS_CFG.arenaAnahtar, null); } catch { return null; }
}
export function arenaYaz(api, a) { api.kaydet(DOVUS_CFG.arenaAnahtar, a); }

const disYaricap = () => DOVUS_CFG.saha + DOVUS_CFG.pist + 1
  + DOVUS_CFG.tribunKat * DOVUS_CFG.tribunEn + 2;

export function arenadaMi(api, p) {
  const a = arenaOku(api);
  const m = a?.merkez;
  if (!m) return false;
  if (p.dimension.id !== m.d) return false;
  const l = p.location;
  return Math.hypot(l.x - m.x, l.z - m.z) <= disYaricap() + 5 && Math.abs(l.y - m.y) < 40;
}

function arenaNoktalari(merkez) {
  const { x, y, z } = merkez;
  const uzak = Math.floor(DOVUS_CFG.saha * 0.65);
  return {
    merkez: { x, y, z, d: merkez.d ?? "minecraft:overworld" },
    a: { x: x - uzak, y, z, bakis: -90 },
    b: { x: x + uzak, y, z, bakis: 90 },
    surum: DOVUS_CFG.arenaSurum
  };
}

// Zemin yerinde mi?
function arenaSaglam(merkez) {
  const boyut = boyutGetir(merkez.d);
  const uzak = Math.floor(DOVUS_CFG.saha * 0.65);
  for (const [dx, dz] of [[0, 0], [-uzak, 0], [uzak, 0]]) {
    const alt = blokOku(boyut, merkez.x + dx, merkez.y - 1, merkez.z + dz);
    if (!alt || alt.isAir) return false;
  }
  return true;
}

// --- stadyum insaat komutlari ---
function stadyumKomutlari(merkez) {
  const { x, y, z } = merkez;
  const C = DOVUS_CFG;
  const k = [];
  const fill = (x1, y1, z1, x2, y2, z2, blok) =>
    k.push(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${blok}`);
  // ic..dis yaricapli halka: 4 dikdortgen
  const halka = (ic, dis, y1, y2, blok) => {
    fill(x - dis, y1, z - dis, x + dis, y2, z - ic, blok);   // kuzey
    fill(x - dis, y1, z + ic, x + dis, y2, z + dis, blok);   // guney
    fill(x - dis, y1, z - ic + 1, x - ic, y2, z + ic - 1, blok); // bati
    fill(x + ic, y1, z - ic + 1, x + dis, y2, z + ic - 1, blok); // dogu
  };
  const kare = (r, y1, y2, blok) => fill(x - r, y1, z - r, x + r, y2, z + r, blok);

  const R = disYaricap();
  // 1) alani temizle - 3'er katman halinde (fill blok siniri asilmasin)
  for (let yy = y - 1; yy <= y + C.tavan + 2; yy += 3)
    kare(R, yy, Math.min(yy + 2, y + C.tavan + 2), "air");

  // 2) cim saha + saha cizgisi + orta nokta
  kare(C.saha, y - 1, y - 1, "grass_block");
  halka(C.saha - 1, C.saha, y - 1, y - 1, "white_concrete");
  fill(x - 2, y - 1, z - 2, x + 2, y - 1, z + 2, "white_concrete");
  fill(x - C.saha, y - 1, z, x + C.saha, y - 1, z, "white_concrete");   // orta cizgi

  // 3) kosu pisti
  halka(C.saha + 1, C.saha + C.pist, y - 1, y - 1, "red_concrete");

  // 4) gorunmez saha duvari + tavan (kimse ucup kacmasin)
  const bariyer = C.saha + C.pist + 1;
  halka(bariyer, bariyer, y, y + C.tavan, "barrier");
  kare(bariyer, y + C.tavan + 1, y + C.tavan + 1, "barrier");

  // 5) tribunler: her kat biraz daha yuksek ve disarida
  let ic = bariyer + 1;
  for (let i = 0; i < C.tribunKat; i++) {
    const dis = ic + C.tribunEn - 1;
    const ust = y + 1 + i * 2;
    halka(ic, dis, y - 1, ust, "stone_bricks");
    halka(ic, dis, ust + 1, ust + 1, "quartz_slab");     // oturma sirasi
    ic = dis + 1;
  }

  // 6) dis duvar + tepesinde aydinlatma
  halka(ic, ic + 1, y - 1, y + C.duvarYuksek, "stone_bricks");
  halka(ic, ic + 1, y + C.duvarYuksek + 1, y + C.duvarYuksek + 1, "sea_lantern");

  // 7) saha aydinlatmasi: gorunmez isik bloklari (mob dogmasin)
  for (let d = -C.saha + 5; d <= C.saha - 5; d += 10)
    fill(x - C.saha + 5, y + 1, z + d, x + C.saha - 5, y + 1, z + d, "light_block_15");

  return k;
}

// Komutlari tik tik calistirir (tek tikta calistirmak oyunu dondurur).
function komutlariIsle(boyut, komutlar, bitince) {
  let i = 0, hata = 0;
  const adim = () => {
    for (let n = 0; n < DOVUS_CFG.komutTikBasina && i < komutlar.length; n++, i++) {
      try { boyut.runCommand(komutlar[i]); }
      catch (e) { hata++; if (hata < 4) console.warn("[Duello] komut: " + komutlar[i] + " -> " + e); }
    }
    if (i < komutlar.length) system.runTimeout(adim, 1);
    else bitince(hata);
  };
  adim();
}

function arenaInsaEt(api, merkez, bitince) {
  const boyut = boyutGetir(merkez.d);
  if (!chunkYuklu(boyut, merkez.x, merkez.y, merkez.z)) return bitince(false);
  const komutlar = stadyumKomutlari(merkez);
  console.warn(`[Duello] Stadyum kuruluyor: ${komutlar.length} komut.`);
  komutlariIsle(boyut, komutlar, (hata) => {
    const tamam = arenaSaglam(merkez);
    if (tamam) arenaYaz(api, arenaNoktalari(merkez));
    console.warn(`[Duello] Stadyum ${tamam ? "kuruldu" : "KURULAMADI"} (${hata} komut hatasi).`);
    bitince(tamam);
  });
}

// Arenayi kullanima hazir hale getirir: chunk yukle -> gerekiyorsa kur ->
// zemini dogrula. Hazir olunca geriCagir(arena), olmazsa geriCagir(null).
function arenaHazirla(api, haberVer, geriCagir) {
  const kayit = arenaOku(api);
  const merkez = (kayit?.merkez) ?? DOVUS_CFG.varsayilanArena;
  const boyut = boyutGetir(merkez.d);
  const { x, y, z } = merkez;
  const R = disYaricap();

  try {
    boyut.runCommand(`tickingarea add ${x - R - 2} ${y - 2} ${z - R - 2} ${x + R + 2} ${y + DOVUS_CFG.tavan + 3} ${z + R + 2} mk_arena`);
  } catch { }

  let deneme = 0;
  const dene = () => {
    deneme++;
    if (chunkYuklu(boyut, x, y, z)) {
      const eskiSurum = (kayit?.surum ?? 1) !== DOVUS_CFG.arenaSurum;
      if (!eskiSurum && arenaSaglam(merkez)) return geriCagir(arenaNoktalari(merkez));
      haberVer(eskiSurum ? "§7[Düello] Stadyum yenileniyor, birkaç saniye..." : "§7[Düello] Stadyum kuruluyor...");
      return arenaInsaEt(api, merkez, (oldu) => geriCagir(oldu ? arenaNoktalari(merkez) : null));
    }
    if (deneme === 1) haberVer("§7[Düello] Arena bölgesi yükleniyor, bekle...");
    if (deneme > DOVUS_CFG.arenaBeklemeTik / 10) return geriCagir(null);
    system.runTimeout(dene, 10);
  };
  dene();
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
  hedef.sendMessage("§c§lDİKKAT: §7Kendi eşyalarınla dövüşürsün.");
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
    .body("§7Kabul edersen ikiniz de stadyuma ışınlanır.\n§7Kendi eşyalarınla dövüşürsün, eşyaya dokunulmaz.");
  for (const t of liste) f.button(`§f${t.kimden}\n§7${t.bahis ? `Bahis: ${api.fmt(t.bahis)}` : "Bahissiz"}`, "textures/items/iron_sword");
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === liste.length) return dovusMenu(p, api);
    const t = liste[r.selection];
    new ActionFormData().title("§lDÜELLO")
      .body(`§f${t.kimden}§7 ile düello:\n\n` +
        `§7Kendi eşyalarınla dövüşürsün — §fmod eşya vermez, almaz§7.\n` +
        `§7Canı §f${DOVUS_CFG.bitisCani / 2} kalbin§7 altına düşen kaybeder;\n§7ölüm beklenmez, eşya düşmez.\n` +
        `§7Bittiğinde ikiniz de §feski yerinize§7 dönersiniz.\n` +
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
  a.sendMessage("§7[Düello] Stadyum hazırlanıyor...");
  b.sendMessage("§7[Düello] Stadyum hazırlanıyor...");
  arenaHazirla(api, (m) => { a.sendMessage(m); b.sendMessage(m); }, (arena) => {
    if (!arena) {
      const uyari = "§c[Düello] Stadyum hazırlanamadı, düello iptal. §7Yönetici: Düello menüsü > Arenayı Buraya Kur.";
      a.sendMessage(uyari); b.sendMessage(uyari);
      return;
    }
    if (!a?.isValid || !b?.isValid || aktif) return;
    dovusuKur(api, a, b, bahis, arena);
  });
}

function dovusuKur(api, a, b, bahis, arena) {
  const yedekA = konumKaydet(a), yedekB = konumKaydet(b);
  yedekYaz(api, a.name, yedekA);
  yedekYaz(api, b.name, yedekB);

  aktif = {
    api, bahis, arena,
    ad: { a: a.name, b: b.name },
    yedek: { [a.name]: yedekA, [b.name]: yedekB },
    kurtarma: { [a.name]: 0, [b.name]: 0 },
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
    for (const p of [a, b]) { try { eveGonder(p, aktif.yedek[p.name]); } catch { } yedekYaz(api, p.name, undefined); }
    aktif = null;
    a.sendMessage("§c[Düello] Stadyum zemini doğrulanamadı, düello iptal edildi.");
    b.sendMessage("§c[Düello] Stadyum zemini doğrulanamadı, düello iptal edildi.");
    return;
  }

  if (bahis > 0) { api.paraEkle(a, -bahis); api.paraEkle(b, -bahis); }
  for (const p of [a, b]) {
    baslik(p, "§6HAZIRLAN", `§f${p.name === a.name ? b.name : a.name} §7ile düello`, 30);
    ses(p, "random.anvil_use");
    p.sendMessage("§7[Düello] Kendi eşyalarınla dövüşüyorsun, eşyalarına dokunulmadı.");
  }
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

  if (!a?.isValid || !b?.isValid) {
    const kalan = a?.isValid ? a : b?.isValid ? b : null;
    const kacan = a?.isValid ? aktif.ad.b : aktif.ad.a;
    return dovusBitir(kalan?.name ?? null, `§f${kacan}§7 ayrıldı`);
  }

  if (aktif.durum === "gerisayim") {
    const gecen = (Date.now() - aktif.baslangic) / 1000;
    const kalanSn = Math.ceil(DOVUS_CFG.geriSayim - gecen);
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

  // Sahadan cikani geri koy; ust uste gerekiyorsa arena bozuktur -> iptal
  const m = aktif.arena.merkez;
  for (const p of [a, b]) {
    const l = p.location;
    const disarida = Math.hypot(l.x - m.x, l.z - m.z) > DOVUS_CFG.arenaYaricap
      || l.y < m.y - 3 || p.dimension.id !== m.d;
    if (!disarida) { aktif.kurtarma[p.name] = 0; continue; }
    aktif.kurtarma[p.name] = (aktif.kurtarma[p.name] ?? 0) + 1;
    if (aktif.kurtarma[p.name] > DOVUS_CFG.maxKurtarma) {
      for (const q of [a, b]) q.sendMessage("§c[Düello] Stadyum bozuk görünüyor, düello iptal edildi.");
      return dovusIptal("stadyum bozuk");
    }
    const kondu = isinla(p, p.name === aktif.ad.a ? aktif.arena.a : aktif.arena.b, m.d);
    try { p.onScreenDisplay.setActionBar(kondu ? "§cSahadan çıkamazsın" : "§cSaha zemini yok!"); } catch { }
  }

  const canA = can(a)?.currentValue ?? 20;
  const canB = can(b)?.currentValue ?? 20;
  try {
    a.onScreenDisplay.setActionBar(`§c${Math.ceil(canA)} §8sen  §7|  §f${b.name} §c${Math.ceil(canB)}`);
    b.onScreenDisplay.setActionBar(`§c${Math.ceil(canB)} §8sen  §7|  §f${a.name} §c${Math.ceil(canA)}`);
  } catch { }
  if (canA <= DOVUS_CFG.bitisCani || canB <= DOVUS_CFG.bitisCani) {
    return dovusBitir(canA > canB ? a.name : b.name, "nakavt");
  }

  if (Date.now() >= aktif.bitisZamani) {
    if (Math.abs(canA - canB) < 0.5) return dovusBitir(null, "süre doldu - berabere");
    return dovusBitir(canA > canB ? a.name : b.name, "süre doldu");
  }
}

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

  // EVE DONUS: her oyuncu KENDI try/catch'inde. Biri hata verirse digeri
  // yine de donsun. (Eski surumde tek hata butun bitis akisini kesiyordu.)
  for (const isim of [ad.a, ad.b]) {
    try {
      const p = oyuncu(isim);
      if (p?.isValid) {
        eveGonder(p, yedek[isim]);
        try { can(p)?.resetToMaxValue(); } catch { }
        try { p.runCommand("effect @s clear"); } catch { }
        yedekYaz(api, isim, undefined);
      }
      // cevrimdisiysa yedek dursun: girisKontrol geri gonderir
    } catch (e) { console.warn(`[Duello] ${isim} eve gonderilemedi: ${e}`); }
  }

  // GUVENLIK AGI: bir saniye sonra hala arenadaysa tekrar dene
  system.runTimeout(() => {
    for (const isim of [ad.a, ad.b]) {
      try {
        const p = oyuncu(isim);
        if (p?.isValid && arenadaMi(api, p) && !dovustaMi(isim)) {
          eveGonder(p, yedek[isim]);
          p.sendMessage("§7[Düello] Stadyumdan çıkarıldın.");
        }
      } catch { }
    }
  }, 20);

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

// Arenada takilan icin acil cikis
export function arenadanCik(p, api) {
  if (dovustaMi(p.name)) { p.sendMessage("§c[Düello] Dövüş sürerken çıkamazsın."); return false; }
  if (!arenadaMi(api, p)) { p.sendMessage("§7[Düello] Zaten stadyumda değilsin."); return false; }
  const y = yedekleriOku(api)[p.name];
  yedekYaz(api, p.name, undefined);
  const oldu = eveGonder(p, y);
  if (oldu) p.sendMessage("§a[Düello] §7Stadyumdan çıkarıldın.");
  else p.sendMessage("§c[Düello] Çıkarılamadın. §7Yatağında uyu ya da yönetici /tp ile alsın.");
  return oldu;
}

// ============ MENULER ============
export function dovusMenu(p, api) {
  const gelen = gelenIstekler(p).length;
  const arena = arenaOku(api);
  const s = aktif ? `§c${aktif.ad.a} vs ${aktif.ad.b}` : "§7yok";

  const f = new ActionFormData()
    .title("§lDÜELLO / PVP")
    .body(
      `§7Kendi eşyalarınla dövüşürsün — §fmod eşya vermez, almaz§7.\n` +
      `§7Canı ${DOVUS_CFG.bitisCani / 2} kalbin altına düşen kaybeder; ölüm yok.\n` +
      `§7Süren düello: ${s}\n` +
      `§7Stadyum: §f${arena?.merkez ? `${Math.round(arena.merkez.x)}, ${Math.round(arena.merkez.z)}` : "kurulmadı (ilk düelloda otomatik)"}\n` +
      `§7Bakiyen: §a${api.fmt(api.paraOku(p))}`
    );
  const islem = [];
  const ekle = (yazi, ikon, fn) => { f.button(yazi, ikon); islem.push(fn); };

  ekle("§lMeydan Oku\n§r§7Bir oyuncuya istek gönder", "textures/items/iron_sword", () => kisiSec(p, api));
  ekle(`§lGelen İstekler §7(${gelen})`, "textures/items/paper", () => istekEkrani(p, api));
  ekle("§lKurallar", "textures/items/book_normal", () => kurallar(p, api));
  if (arenadaMi(api, p) && !dovustaMi(p.name))
    ekle("§e§lStadyumdan Çık\n§r§7Takıldıysan buradan çık", "textures/blocks/barrier", () => { arenadanCik(p, api); dovusMenu(p, api); });
  if (api.adminMi(p)) {
    ekle("§c§lStadyumu Buraya Kur\n§r§7Durduğun yere inşa eder", "textures/blocks/stonebrick", () => arenaKurOnay(p, api));
    if (aktif) ekle("§c§lDüelloyu İptal Et", "textures/items/barrier", () => {
      dovusIptal("yönetici iptal etti"); dovusMenu(p, api);
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
  new ActionFormData().title("§lKURALLAR")
    .body(
      `§e§lEŞYA\n` +
      `§f- Mod eşya VERMEZ, envanterine DOKUNMAZ.\n` +
      `§f- Kendi zırhın, silahın, yiyeceğinle dövüşürsün.\n` +
      `§f- Karşılıklı adil olması size kalmış.\n\n` +
      `§e§lNASIL İŞLER\n` +
      `§f1.§7 İstek gönderirsin, karşı taraf kabul eder.\n` +
      `§f2.§7 Konumunuz kaydedilir, ikiniz sahanın iki ucuna ışınlanır.\n` +
      `§f3.§7 §f${DOVUS_CFG.geriSayim} saniye§7 geri sayım (bu sırada canınız dolar).\n` +
      `§f4.§7 Canı §f${DOVUS_CFG.bitisCani / 2} kalbin§7 altına düşen kaybeder.\n` +
      `§7   Ölüm beklenmez, o yüzden §feşyan düşmez§7.\n` +
      `§f5.§7 Biter bitmez ikiniz de §feski yerinize§7 dönersiniz.\n\n` +
      `§e§lSTADYUM\n` +
      `§7${DOVUS_CFG.saha * 2 + 1}x${DOVUS_CFG.saha * 2 + 1} çim saha, koşu pisti, ${DOVUS_CFG.tribunKat} katlı tribün,\n` +
      `§7dış duvar ve aydınlatma. Sahanın çevresi ve üstü görünmez\n§7duvarla kapalı; sahadan çıkamazsın.\n` +
      `§8Takılırsan: Düello menüsü > Stadyumdan Çık (ya da §f!cik§8).\n\n` +
      `§e§lÖDÜL\n` +
      `§7Bahissiz: kazanana §a${api.fmt(DOVUS_CFG.odul)}\n` +
      `§7Bahisli: iki bahis de kazanana. Berabere ise iade.\n` +
      `§8Süre sınırı ${DOVUS_CFG.sureSn / 60} dakika; dolarsa canı fazla olan kazanır.`
    )
    .button("§7< Geri").show(p).then(r => { if (!r.canceled) dovusMenu(p, api); });
}

function arenaKurOnay(p, api) {
  const l = p.location;
  const x = Math.floor(l.x), y = Math.floor(l.y), z = Math.floor(l.z);
  const R = disYaricap();
  new ActionFormData().title("§c§lSTADYUM KUR")
    .body(`§7Stadyum §f${x}, ${y}, ${z}§7 merkezli kurulacak.\n` +
      `§c${R * 2 + 1}x${R * 2 + 1} alan temizlenir§7: çim saha, koşu pisti,\n` +
      `§7${DOVUS_CFG.tribunKat} katlı tribün, dış duvar ve aydınlatma.\n\n` +
      `§8Buradaki yapıların silinir. Boş bir yer seç.\n§8Durduğun yer sahanın ZEMİNİ olur.`)
    .button("§aEVET, KUR").button("§7Vazgeç")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return dovusMenu(p, api);
      const merkez = { x, y, z, d: p.dimension.id };
      try {
        p.dimension.runCommand(`tickingarea add ${x - R - 2} ${y - 2} ${z - R - 2} ${x + R + 2} ${y + DOVUS_CFG.tavan + 3} ${z + R + 2} mk_arena`);
      } catch { }
      p.sendMessage("§7[Düello] Stadyum kuruluyor, birkaç saniye...");
      arenaInsaEt(api, merkez, (oldu) => {
        p.sendMessage(oldu ? `§a[Düello] §7Stadyum kuruldu: §f${x}, ${y}, ${z}`
                           : "§c[Düello] Stadyum kurulamadı. §7Buranın yüklü ve inşaata uygun olduğundan emin ol.");
        dovusMenu(p, api);
      });
    });
}
