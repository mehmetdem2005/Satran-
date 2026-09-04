import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
import { ikon, VARSAYILAN } from "./icons.js";
import { fiyat, esyaDegeri, KATEGORILER, kategoriIndex, yasakMi, MAKAS } from "./fiyat.js";
import { katalog, aramaGruplari } from "./esyalar.js";
import * as Seviye from "./seviye.js";
import * as Dovus from "./dovus.js";
import * as Arsa from "./arsa.js";

const { world, system, ItemStack } = mc;
const { ActionFormData, ModalFormData } = ui;

// ==================== AYARLAR ====================
const CFG = {
  surum: "2.4",
  ad: "m",
  objective: "money",
  simge: "$",
  baslangicParasi: 500,
  komisyon: 0,
  maxIlanOyuncu: 15,
  maxIlanToplam: 300,
  minFiyat: 1,
  maxFiyat: 10000000,
  maxAdet: 2304,
  sayfaBoyu: 25,
  teklifSuresiSn: 300,
  ilanGunSuresi: 7,           // ilan bu kadar gun sonra sahibine iade edilir
  gecmisLimit: 200,           // fiyat rehberi icin saklanan satis sayisi
  sesler: true,
  duyuru: true,
  kitapGirisinde: true
};

const KITAP_ID = "mk:kontrol_kitabi";
const KITAP_AD = "§6Market Kontrol Kitabi";

const K_ILAN = "mk_ilan";
const K_PARA_BEKLEYEN = "mk_bpara";
const K_ESYA_BEKLEYEN = "mk_besya";
const K_GECMIS = "mk_gecmis";


// ==================== KAYIT ====================
const PARCA = 30000;
function kaydet(a, v) {
  const s = JSON.stringify(v);
  const n = Math.max(1, Math.ceil(s.length / PARCA));
  world.setDynamicProperty(`${a}_n`, n);
  for (let i = 0; i < n; i++) world.setDynamicProperty(`${a}_${i}`, s.slice(i * PARCA, (i + 1) * PARCA));
  for (let i = n; i < n + 5; i++) world.setDynamicProperty(`${a}_${i}`, undefined);
}
function yukle(a, def) {
  const n = world.getDynamicProperty(`${a}_n`);
  if (typeof n !== "number") return def;
  let s = "";
  for (let i = 0; i < n; i++) s += world.getDynamicProperty(`${a}_${i}`) ?? "";
  try { return JSON.parse(s); } catch { return def; }
}
const ilanlariOku = () => yukle(K_ILAN, []);
const ilanlariYaz = (v) => kaydet(K_ILAN, v);

// ==================== YARDIMCILAR ====================
// Bosluk, nokta, virgul ve yazi karakterlerini temizleyip sayiya cevirir.
// "1.500", "1 500", "250 coin" -> 1500 / 1500 / 250
function sayiOku(deger) {
  if (typeof deger === "number") return Number.isFinite(deger) ? Math.floor(deger) : NaN;
  const temiz = String(deger ?? "").replace(/[^\d]/g, "");
  if (temiz.length === 0) return NaN;
  const n = parseInt(temiz, 10);
  return Number.isFinite(n) ? n : NaN;
}
function ses(p, id) { if (CFG.sesler) { try { p.playSound(id); } catch { } } }
function bildir(p, metin) { try { p.onScreenDisplay.setActionBar(metin); } catch { } }

function obj() {
  return world.scoreboard.getObjective(CFG.objective) ?? world.scoreboard.addObjective(CFG.objective, "Para");
}
function paraOku(p) { try { return obj().getScore(p) ?? 0; } catch { return 0; } }
function paraYaz(p, v) { obj().setScore(p, Math.max(0, Math.floor(v))); }
function paraEkle(p, v) { paraYaz(p, paraOku(p) + v); }
function fmt(n) { return CFG.simge + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }

function adminMi(p) {
  try { if (p.hasTag?.("market_admin")) return true; } catch { }
  // playerPermissionLevel: 0 Ziyaretci, 1 Uye, 2 Operator
  try { if (p.playerPermissionLevel >= 2) return true; } catch { }
  // commandPermissionLevel'de esik 1 idi; hile acik dunyalarda sıradan
  // oyuncular da 1 dondurebiliyor ve herkes admin sayiliyordu.
  try { if (p.commandPermissionLevel >= 2) return true; } catch { }
  return false;
}

// ============ ISIM: tamamen oyunun kendi dil paketinden ============
const anahtarBellek = new Map();
function ceviriAnahtari(typeId) {
  if (anahtarBellek.has(typeId)) return anahtarBellek.get(typeId);
  let k;
  try { k = new ItemStack(typeId, 1).localizationKey; } catch { k = undefined; }
  if (typeof k !== "string" || k.length === 0) {
    // localizationKey yoksa vanilla .lang bicimini uret: item.X.name / tile.X.name
    const tam = String(typeId).includes(":") ? String(typeId) : `minecraft:${typeId}`;
    const ad = tam.replace(/^minecraft:/, "");
    let blokMu = false;
    try { blokMu = !!mc.BlockTypes.get(tam); } catch { }
    k = `${blokMu ? "tile" : "item"}.${ad}.name`;
  }
  anahtarBellek.set(typeId, k);
  return k;
}
function okunur(t) {
  const s = String(t).replace(/^minecraft:/, "").replace(/^mk:/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function adParca(typeId, nameTag) { return nameTag ? { text: nameTag } : { translate: ceviriAnahtari(typeId) }; }
function adParcaD(d) { return adParca(d.t, d.n); }
function adDuz(d) { return d.n ?? okunur(d.t); }
function raw(...p) { return { rawtext: p.flat() }; }
const T = (s) => ({ text: s });
// sendMessage RawMessage kabul eder -> chat mesajlarinda da oyunun dili kullanilir
function msj(p, ...parcalar) { try { p.sendMessage(raw(...parcalar)); } catch { } }

// ==================== ITEM ====================
function paketle(item) {
  const d = { t: item.typeId, a: item.amount };
  if (item.nameTag) d.n = item.nameTag;
  const lore = item.getLore(); if (lore?.length) d.l = lore;
  const e = item.getComponent("minecraft:enchantable");
  if (e) { const l = e.getEnchantments().map(x => [x.type.id, x.level]); if (l.length) d.e = l; }
  const dur = item.getComponent("minecraft:durability");
  if (dur && dur.damage > 0) d.d = dur.damage;
  return d;
}
function ac(d) {
  const it = new ItemStack(d.t, d.a);
  if (d.n) it.nameTag = d.n;
  if (d.l) it.setLore(d.l);
  if (d.e) { const c = it.getComponent("minecraft:enchantable"); if (c) for (const [id, lv] of d.e) { try { c.addEnchantment({ type: id, level: lv }); } catch { } } }
  if (d.d) { const c = it.getComponent("minecraft:durability"); if (c) c.damage = d.d; }
  return it;
}
function ikonGuvenli(t) {
  if (t === KITAP_ID) return "textures/items/mk_kitap";
  try { return ikon(t) || VARSAYILAN; } catch { return VARSAYILAN; }
}
function kap(p) { return p.getComponent("minecraft:inventory")?.container; }
// addItem mevcut yigini doldurup ARTANI geri dondurur; artan yok sayilirsa esya kaybolur.
function envantereVer(p, item) {
  const c = kap(p);
  if (!c) { try { p.dimension.spawnItem(item, p.location); } catch { } return; }
  let artan;
  try { artan = c.addItem(item); } catch { artan = item; }
  if (artan) {
    try { p.dimension.spawnItem(artan, p.location); } catch { }
    p.sendMessage("\u00a7e[Market] \u00a7fEnvanterin doldu, kalan esya yere birakildi.");
  }
}

// Istenen adedi yigin yigin verir ve GERCEKTEN kacinin ulastigini olcup dondurur.
function guvenliVer(p, typeId, adet) {
  const oncesi = itemSay(p, typeId);
  let enFazlaYigin = 64;
  try { enFazlaYigin = new ItemStack(typeId, 1).maxAmount || 64; } catch { }
  let kalan = adet;
  while (kalan > 0) {
    const par = Math.min(kalan, enFazlaYigin);
    let yigin;
    try { yigin = new ItemStack(typeId, par); } catch { break; }
    envantereVer(p, yigin);
    kalan -= par;
  }
  return Math.max(0, itemSay(p, typeId) - oncesi);
}
function itemSay(p, t) {
  const c = kap(p); if (!c) return 0;
  let n = 0;
  for (let i = 0; i < c.size; i++) { const it = c.getItem(i); if (it?.typeId === t) n += it.amount; }
  return n;
}
// Bir turden `adet` kadar satar. Her yigin KENDI degerinden hesaplanir
// (hasarli alet ucuz, buyulu esya pahali), duz tur fiyatindan degil.
function satTip(p, t, adet) {
  const c = kap(p);
  if (!c) return { satilan: 0, kazanc: 0 };
  let kalan = adet, satilan = 0, kazanc = 0;
  for (let i = 0; i < c.size && kalan > 0; i++) {
    const it = c.getItem(i);
    if (it?.typeId !== t || ozelEsya(it)) continue;
    const birim = esyaDegeri(it);
    const bu = Math.min(it.amount, kalan);
    if (it.amount <= bu) c.setItem(i, undefined);
    else { const y = it.clone(); y.amount = it.amount - bu; c.setItem(i, y); }
    kalan -= bu; satilan += bu; kazanc += birim * bu;
  }
  return { satilan, kazanc: Math.round(kazanc) };
}

function itemCikar(p, t, adet) {
  const c = kap(p);
  if (!c || itemSay(p, t) < adet) return false;
  let kalan = adet;
  for (let i = 0; i < c.size && kalan > 0; i++) {
    const it = c.getItem(i);
    if (it?.typeId !== t) continue;
    if (it.amount <= kalan) { kalan -= it.amount; c.setItem(i, undefined); }
    else { const y = it.clone(); y.amount = it.amount - kalan; c.setItem(i, y); kalan = 0; }
  }
  return kalan === 0;
}
function gecerliItem(t) { try { new ItemStack(t, 1); return true; } catch { return false; } }

// ==================== OFFLINE TESLIMAT ====================
function paraTeslim(ad, miktar) {
  const on = world.getAllPlayers().find(p => p.name === ad);
  if (on) { paraEkle(on, miktar); on.sendMessage(`§a[Market] §a+${fmt(miktar)}`); ses(on, "random.orb"); return; }
  const b = yukle(K_PARA_BEKLEYEN, {});
  b[ad] = (b[ad] ?? 0) + miktar;
  kaydet(K_PARA_BEKLEYEN, b);
}
function esyaTeslim(ad, d) {
  const on = world.getAllPlayers().find(p => p.name === ad);
  if (on) { envantereVer(on, ac(d)); msj(on, T("§a[Market] §fTeslim: §e"), adParca(d.t), T(` x${d.a}`)); ses(on, "random.orb"); return; }
  const b = yukle(K_ESYA_BEKLEYEN, {});
  (b[ad] ??= []).push(d);
  kaydet(K_ESYA_BEKLEYEN, b);
}

// ==================== FIYAT REHBERI ====================
function gecmiseEkle(typeId, toplamFiyat, adet) {
  if (adet < 1) return;
  const g = yukle(K_GECMIS, []);
  g.push({ t: typeId, b: Math.round(toplamFiyat / adet), a: adet, z: Date.now() });
  while (g.length > CFG.gecmisLimit) g.shift();
  kaydet(K_GECMIS, g);
}
function fiyatRehberi(typeId) {
  const g = yukle(K_GECMIS, []).filter(x => x.t === typeId);
  if (g.length === 0) return null;
  const son = g.slice(-20);
  const toplam = son.reduce((s, x) => s + x.b, 0);
  return {
    ortalama: Math.round(toplam / son.length),
    enDusuk: Math.min(...son.map(x => x.b)),
    enYuksek: Math.max(...son.map(x => x.b)),
    satisAdedi: g.length
  };
}

// ==================== KONTROL KITABI ====================
function kitapMi(it) {
  if (!it) return false;
  if (it.typeId === KITAP_ID) return true;
  return it.typeId === "minecraft:book" && it.nameTag === KITAP_AD;
}
// Kontrol kitabi ve arsa sopasi markete konamaz, satilamaz.
function ozelEsya(it) { return kitapMi(it) || Arsa.sopaMi(it); }

function sopasiVarMi(p) {
  const c = kap(p); if (!c) return false;
  for (let i = 0; i < c.size; i++) if (Arsa.sopaMi(c.getItem(i))) return true;
  return false;
}
// Arsa sopasi: craft masasinda 2x2 cubukla yapilir. Menuden isteyene de
// envanterindeki 4 cubugun karsiliginda verilir.
function sopaVer(p) {
  if (sopasiVarMi(p)) { p.sendMessage("§e[Market] Arsa sopan zaten var."); return; }
  if (itemSay(p, "minecraft:stick") < 4) {
    p.sendMessage("§c[Market] Arsa sopası için §f4 çubuk §cgerekiyor.");
    p.sendMessage("§7Craft masasında da yapabilirsin: §f2x2 çubuk§7.");
    return;
  }
  if (!itemCikar(p, "minecraft:stick", 4)) { p.sendMessage("§c[Market] Çubuklar alınamadı."); return; }
  let it;
  try { it = Arsa.sopaYap(mc); } catch (e) { p.sendMessage(`§c[Market] Sopa yapılamadı: ${e}`); return; }
  envantereVer(p, it);
  ses(p, "random.orb");
  p.sendMessage("§a[Market] §fArsa sopası verildi. §74 çubuk harcandı.");
  p.sendMessage("§7Sol tık: 1. köşe  §8|  §7Sağ tık: 2. köşe + satın alma  §8|  §7Havaya sağ tık: menü");
}
function kitapYap() {
  let it;
  try { it = new ItemStack(KITAP_ID, 1); } catch { it = new ItemStack("minecraft:book", 1); }
  it.nameTag = KITAP_AD;
  it.setLore(["§7Market, takas ve para islemleri", `§8v${CFG.surum}`]);
  return it;
}
function kitabiVarMi(p) {
  const c = kap(p); if (!c) return false;
  for (let i = 0; i < c.size; i++) if (kitapMi(c.getItem(i))) return true;
  return false;
}
function kitapVer(p) {
  if (kitabiVarMi(p)) return p.sendMessage("§e[Market] Kontrol kitabin zaten var.");
  envantereVer(p, kitapYap());
  p.sendMessage("§a[Market] §fKontrol kitabi verildi.");
}

// ==================== TEKLIFLER ====================
const teklifler = new Map();
let teklifSayac = 0;
function tekliflerim(p) {
  const simdi = Date.now();
  const liste = [];
  for (const [id, t] of teklifler) {
    if (simdi - t.zaman > CFG.teklifSuresiSn * 1000) { teklifler.delete(id); continue; }
    if (t.kime === p.name) liste.push(t);
  }
  return liste;
}

// ==================== ANA MENU ====================
function kitapMenu(p) {
  if (Dovus.dovustaMi(p.name)) {
    p.sendMessage("§c[Market] Düello sırasında market kullanılamaz.");
    return;
  }
  const ilanlar = ilanlariOku();
  const benim = ilanlar.filter(i => i.s === p.name).length;
  const gelen = tekliflerim(p).length;
  const admin = adminMi(p);

  const f = new ActionFormData()
    .title(`\u00a7lMARKET KONTROL \u00a77v${CFG.surum}`)
    .body(`\u00a77Bakiyen: \u00a7a${fmt(paraOku(p))}\n${seviyeSatiri(p)}\n\u00a77Markette \u00a7f${ilanlar.length}\u00a77 ilan  \u00a78|  \u00a77Senin: \u00a7f${benim}\n`);

  const islem = [];
  const ekle = (yazi, ikonId, fn) => { f.button(yazi, ikonGuvenli(ikonId)); islem.push(fn); };

  ekle("\u00a7lHaz\u0131r Market\n\u00a7r\u00a77Sabit fiyatl\u0131 al-sat", "minecraft:emerald_block", () => sistemKategoriler(p));
  ekle("\u00a7lOyuncu Marketi\n\u00a7r\u00a77\u0130lanlar\u0131 ara ve sat\u0131n al", "minecraft:emerald", () => marketEkrani(p, { sayfa: 0 }));
  ekle("\u00a7lPara Kar\u015f\u0131l\u0131\u011f\u0131 Sat\n\u00a7r\u00a77Kendi fiyat\u0131nla ilan ver", "minecraft:gold_ingot", () => envanterSec(p, "\u00a7lSATILACAK E\u015eYAYI SE\u00c7", slot => satFormu(p, slot)));
  ekle("\u00a7lMarkete Takas Koy\n\u00a7r\u00a77E\u015fya kar\u015f\u0131l\u0131\u011f\u0131 ilan", "minecraft:diamond", () => envanterSec(p, "\u00a7lTAKASA KONACAK E\u015eYAYI SE\u00c7", slot => marketTakas(p, slot)));
  ekle("\u00a7lAl\u0131m \u0130lan\u0131 Ver\n\u00a7r\u00a77Arad\u0131\u011f\u0131na para teklif et", "minecraft:hopper", () => alimIlani(p));
  ekle("\u00a7lKi\u015fiye Takas Teklifi\n\u00a7r\u00a77Belirli bir oyuncuya", "minecraft:name_tag", () => kisiSec(p));
  ekle(`\u00a7lGelen Teklifler \u00a77(${gelen})`, "minecraft:paper", () => gelenTeklifler(p));
  ekle("\u00a7l\u0130lanlar\u0131m\n\u00a7r\u00a77Geri \u00e7ek veya kontrol et", "minecraft:book", () => ilanlarimEkrani(p));
  ekle("\u00a7lArsa / B\u00f6lge\n\u00a7r\u00a77Yerini koru, \u00fcye ekle", "minecraft:grass_block", () => Arsa.arsaMenu(p, API));
  ekle("\u00a7lPara / E\u015fya G\u00f6nder", "minecraft:ender_pearl", () => paraMenu(p));
  ekle(`\u00a7lD\u00fcello / PvP${Dovus.gelenIstekler(p).length ? ` \u00a7c(${Dovus.gelenIstekler(p).length})` : ""}\n\u00a7r\u00a77E\u015fit kit, arena, e\u015fya kayb\u0131 yok`, "minecraft:diamond_sword", () => Dovus.dovusMenu(p, API));
  ekle(`\u00a7lTicaret Seviyesi \u00a7r\u00a77Lv ${Seviye.seviye(p)}\n\u00a7r\u00a77Ne zaman ne a\u00e7\u0131l\u0131yor`, "minecraft:experience_bottle", () => seviyeEkrani(p));
  ekle("\u00a7lFiyat Rehberi\n\u00a7r\u00a77Piyasa ortalamalar\u0131", "minecraft:clock", () => rehberSec(p));
  ekle("\u00a7lBilgi ve Komutlar", "minecraft:writable_book", () => yardim(p));
  if (admin) ekle("\u00a7c\u00a7lAdmin Paneli", "minecraft:command_block", () => adminPanel(p));
  f.button("\u00a77Kapat"); islem.push(() => { });

  f.show(p).then(r => { if (!r.canceled) islem[r.selection]?.(); });
}

function yardim(p) {
  new ActionFormData()
    .title(`§lBILGI VE KOMUTLAR §7v${CFG.surum}`)
    .body(
      `§e§lSATIS TURLERI\n` +
      `§f- Para Karsiligi Sat§7: esyayi fiyat koyup satarsin.\n` +
      `§f- Markete Takas Koy§7: para yerine baska esya istersin.\n` +
      `§f- Alim Ilani§7: aradigin esya icin para teklif edersin, parayi\n  §7ilan verirken bloke ederiz, satan cikinca otomatik oder.\n` +
      `§f- Kisiye Teklif§7: sadece sectigin oyuncunun gordugu ozel takas.\n\n` +
      `§e§lMARKET EKRANI\n§7Ara, fiyata gore sirala, turlere gore filtrele.\n` +
      `§7Ilanlar §f${CFG.ilanGunSuresi} gun§7 sonra otomatik sahibine iade edilir.\n\n` +
      `§e§lFIYAT REHBERI\n§7Son satislara bakip bir esyanin piyasa ortalamasini,\n§7en dusuk ve en yuksek fiyatini gosterir.\n\n` +
      `§e§lPARA\n§7Baslangic §a${fmt(CFG.baslangicParasi)}§7, komisyon yok.\n§7Scoreboard: §f${CFG.objective}\n\n` +
      `§e§lFIYAT YAZARKEN\n§7Sadece rakam yeter. §f1.500§7, §f1 500§7, §f1500 coin§7 hepsi calisir.\n§7Bos birakirsan hata verir.\n\n` +
      `§e§lCHAT KOMUTLARI\n` +
      `§f!menu !market !ara <kelime> !sat <adet> <fiyat>\n§f!takas <adet> !alim !teklif !teklifler\n` +
      `§f!para !ilanlarim !rehber !bakiye !id !kitap !sopa !seviye !dovus\n`+
      `§f!yenile§7 (esya listesini tazeler) §f!liste§7 (liste durumu)\n\n` +
      `§e§lSLASH\n§f/${CFG.ad}:menu  /${CFG.ad}:market  /${CFG.ad}:sat  /${CFG.ad}:takas  /${CFG.ad}:para\n\n` +
      `§e§lTİCARET SEVİYESİ\n§7Ticaret yaptıkça XP kazanır, §f10 seviyeye§7 kadar çıkarsın.\n` +
      `§7Pahalı eşyalar seviye ile açılır; §fsatmak her zaman serbest§7,\n§7kilit sadece satın almada. §f!seviye\n\n` +
      `§e§lARSA / BÖLGE\n§7Köşe 1'i koy, karşı köşeye yürü, satın al.\n` +
      `§7Arsanda senden ve üyelerinden başkası blok kıramaz, koyamaz,\n§7sandık açamaz, hayvanlarına vuramaz.\n` +
      `§7Arsa sopası: §f2x2 çubuk§7 ile yapılır (§f!sopa§7 da verir).\n` +
      `§7Sopayla §fsol tık§7 = 1. köşe, §fsağ tık§7 = 2. köşe + satın alma,\n§7havaya sağ tık = arsa menüsü.\n` +
      `§7Bir şey çalışmıyorsa: §fArsa menüsü > Koruma Durumu§7.\n\n` +
      `§e§lKITAP KAYBOLURSA\n§f!kitap§7 , §f/give @s mk:kontrol_kitabi§7 ya da\n§7Crafting Table'da §f1 Kitap + 1 Gold Ingot§7.`
    )
    .button("§7< Geri")
    .show(p).then(r => { if (!r.canceled) kitapMenu(p); });
}

// ==================== SECICILER ====================
function envanterSec(p, baslik, geriCagir) {
  const c = kap(p); if (!c) return;
  const dolu = [];
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it && !ozelEsya(it)) dolu.push({ slot: i, item: it });
  }
  if (dolu.length === 0) { p.sendMessage("§c[Market] Envanterinde uygun esya yok."); return kitapMenu(p); }

  const f = new ActionFormData().title(baslik).body("§7Listeden bir esya sec.");
  for (const d of dolu) f.button(raw(adParca(d.item.typeId, d.item.nameTag), T(` §7x${d.item.amount}`)), ikonGuvenli(d.item.typeId));
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === dolu.length) return kitapMenu(p);
    geriCagir(dolu[r.selection].slot);
  });
}

// ==================== ESYA LISTESI ====================
// v2.0: liste artik TEK bir kaynaga baglı degil. Oyunun esya/blok kayitlari
// bazi surumlerde eksik donuyordu; eksik donunce markette ve takasta esyalar
// gorunmuyordu. Simdi paketle gelen vanilla katalogu da harmanlaniyor ve her
// aday `new ItemStack` ile dogrulaniyor -> olmayan id sessizce eleniyor.
let TUM_ITEMLER = null;
let TUM_SET = null;
let LISTE_SAGLAM = false;      // kurulum makul sayida esya buldu mu
let LISTE_KURULUYOR = false;
let SON_KURULUM = 0;
const RAPOR = { kayit: 0, blok: 0, katalog: 0, oyuncu: 0, aday: 0, gecerli: 0 };

function adayIdler() {
  const kume = new Set();
  const ekle = (id) => {
    if (typeof id !== "string" || id.length === 0) return;
    kume.add(id.includes(":") ? id : `minecraft:${id}`);
  };
  let n = 0;

  // 1) Oyunun esya kaydi
  try { for (const t of mc.ItemTypes.getAll()) ekle(t?.id); }
  catch (e) { console.warn("[Market] ItemTypes.getAll calismadi: " + e); }
  RAPOR.kayit = kume.size - n; n = kume.size;

  // 2) Blok kaydi (bloklarin esya hali)
  try { for (const b of mc.BlockTypes.getAll()) ekle(b?.id); }
  catch (e) { console.warn("[Market] BlockTypes.getAll calismadi: " + e); }
  RAPOR.blok = kume.size - n; n = kume.size;

  // 3) Paketle gelen vanilla katalogu — asil eksik kapatan kaynak
  try { for (const id of katalog()) ekle(id); }
  catch (e) { console.warn("[Market] katalog() calismadi: " + e); }
  RAPOR.katalog = kume.size - n; n = kume.size;

  // 4) Varsa vanilla enum
  try {
    const enumlar = mc.MinecraftItemTypes ?? {};
    for (const v of Object.values(enumlar)) ekle(typeof v === "string" ? v : v?.id);
  } catch { }

  // 5) Oyuncularin envanteri ve acik ilanlar (baska addon'larin esyalari dahil)
  try {
    for (const pl of world.getAllPlayers()) {
      const c = kap(pl);
      if (!c) continue;
      for (let i = 0; i < c.size; i++) ekle(c.getItem(i)?.typeId);
    }
  } catch { }
  try {
    for (const i of ilanlariOku()) { ekle(i?.i?.t); ekle(i?.ist?.t); }
  } catch { }
  RAPOR.oyuncu = kume.size - n;

  kume.delete(KITAP_ID);
  kume.delete(Arsa.SOPA_ID);
  RAPOR.aday = kume.size;
  return [...kume];
}

function listeyiBitir(gecerli) {
  gecerli.sort();
  TUM_ITEMLER = gecerli;
  TUM_SET = new Set(gecerli);
  RAPOR.gecerli = gecerli.length;
  LISTE_SAGLAM = gecerli.length >= 200;
  LISTE_KURULUYOR = false;
  SON_KURULUM = Date.now();
  KAT_LISTE = null;               // kategoriler yeni listeye gore kurulsun
  SEVIYE_DAGILIM = null;
  console.warn(`[Market] Esya listesi: ${gecerli.length} gecerli / ${RAPOR.aday} aday ` +
    `(esya kaydi ${RAPOR.kayit}, blok kaydi ${RAPOR.blok}, katalog +${RAPOR.katalog}, oyuncu +${RAPOR.oyuncu})`);
  if (!LISTE_SAGLAM) console.warn("[Market] UYARI: liste beklenenden kisa, bir sonraki aramada yeniden kurulacak.");
}

function dogrula(adaylar) {
  const gecerli = [];
  for (const id of adaylar) { try { new ItemStack(id, 1); gecerli.push(id); } catch { } }
  return gecerli;
}

// Arka planda, tik basina parca parca kurar (dunya acilisinda kullanilir).
function* kurumJob(adaylar) {
  const gecerli = [];
  let i = 0;
  for (const id of adaylar) {
    try { new ItemStack(id, 1); gecerli.push(id); } catch { }
    if (++i % 150 === 0) yield;
  }
  listeyiBitir(gecerli);
}

function listeyiKur(arkaPlan) {
  if (LISTE_KURULUYOR) return;
  LISTE_KURULUYOR = true;
  let adaylar;
  try { adaylar = adayIdler(); }
  catch (e) { LISTE_KURULUYOR = false; console.warn("[Market] aday listesi kurulamadi: " + e); return; }

  if (arkaPlan && typeof system.runJob === "function") {
    try { system.runJob(kurumJob(adaylar)); return; }
    catch (e) { console.warn("[Market] runJob yok, senkron kuruluyor: " + e); }
  }
  listeyiBitir(dogrula(adaylar));
}

function tumItemler() {
  if (TUM_ITEMLER && LISTE_SAGLAM) return TUM_ITEMLER;
  // Saglıksız liste onbellege CAKILMAZ: 30 sn sonra yeniden denenir.
  if (TUM_ITEMLER && Date.now() - SON_KURULUM < 30000) return TUM_ITEMLER;
  LISTE_KURULUYOR = false;       // arka plandaki is takildiysa kilidi ac
  listeyiKur(false);
  return TUM_ITEMLER ?? [];
}

// Oyuncunun envanterindeki (ozellikle baska addon'lardan gelen) esyalari
// listeye aninda katar; boylece hicbir esya "listede yok" diye takasa girmez.
function envanterdekileriKat(p) {
  if (!TUM_ITEMLER || !TUM_SET) return;
  const c = kap(p); if (!c) return;
  let degisti = false;
  for (let i = 0; i < c.size; i++) {
    const t = c.getItem(i)?.typeId;
    if (!t || t === KITAP_ID || TUM_SET.has(t)) continue;
    TUM_SET.add(t); TUM_ITEMLER.push(t); degisti = true;
  }
  if (degisti) { TUM_ITEMLER.sort(); KAT_LISTE = null; }
}

// Turkce arama: "elmas", "beyaz yun", "mese tahta" gibi yazimlar da bulur.
function aramaSuz(liste, arama) {
  let gruplar = [];
  try { gruplar = aramaGruplari(arama); } catch { gruplar = []; }
  if (gruplar.length === 0) return liste;
  const uyan = liste.filter(id => {
    const d = id.toLowerCase();
    return gruplar.every(g => g.some(t => d.includes(t)));
  });
  if (uyan.length > 0) return uyan;
  // hepsi birden tutmadiysa herhangi biri tutsun
  const gevsek = gruplar.flat();
  return liste.filter(id => { const d = id.toLowerCase(); return gevsek.some(t => d.includes(t)); });
}

function listeDurumu() {
  if (LISTE_SAGLAM) return "";
  return "\n\u00a7cListe eksik kurulmus olabilir \u00a78(!yenile ile tazele)";
}

const SECICI_SAYFA = 60;

function istenenSec(p, geriCagir, geriDon, d = {}) {
  const durum = { sayfa: 0, arama: "", ...d };
  const hepsi = tumItemler();
  envanterdekileriKat(p);

  if (hepsi.length === 0) {
    new ActionFormData().title("\u00a7lESYA SEC")
      .body("\u00a7cEsya listesi cekilemedi.\n\u00a77Bu surumde oyunun esya kaydina erisilemiyor.\n\u00a77Content Log'a bak: [Market] satirlari sebebini yaziyor.")
      .button("\u00a7eEnvanterimden Sec").button("\u00a7eElle ID Yaz").button("\u00a77< Geri")
      .show(p).then(r => {
        if (r.canceled) return;
        if (r.selection === 0) return envanterdenTip(p, geriCagir, geriDon);
        if (r.selection === 1) return elleId(p, geriCagir, geriDon);
        geriDon();
      });
    return;
  }

  const liste = durum.arama ? aramaSuz(hepsi, durum.arama) : hepsi;

  if (liste.length === 0) {
    new ActionFormData().title("\u00a7lESYA SEC")
      .body(`\u00a77"\u00a7f${durum.arama}\u00a77" icin sonuc yok.\n\u00a78Turkce de yazabilirsin: elmas, beyaz yun, mese tahta.`)
      .button("\u00a7eYeniden ara").button("\u00a77Tum esyalar").button("\u00a77< Geri")
      .show(p).then(r => {
        if (r.canceled) return;
        if (r.selection === 0) return aramaKutusu(p, geriCagir, geriDon, durum);
        if (r.selection === 1) return istenenSec(p, geriCagir, geriDon, {});
        geriDon();
      });
    return;
  }

  const toplam = Math.ceil(liste.length / SECICI_SAYFA);
  const sayfa = Math.max(0, Math.min(durum.sayfa, toplam - 1));
  const dilim = liste.slice(sayfa * SECICI_SAYFA, (sayfa + 1) * SECICI_SAYFA);

  const f = new ActionFormData()
    .title(`\u00a7lESYA SEC \u00a77(${sayfa + 1}/${toplam})`)
    .body(`\u00a77Oyundaki \u00a7f${hepsi.length}\u00a77 esyanin tamami listede.${durum.arama ? `\n\u00a77Arama: \u00a7f${durum.arama} \u00a78(${liste.length} sonuc)` : ""}${listeDurumu()}`);

  for (const id of dilim) {
    const r = fiyatRehberi(id);
    f.button(raw(adParca(id), T(r ? `\n\u00a78ort. ${fmt(r.ortalama)}/adet` : "")), ikonGuvenli(id));
  }

  const ek = [];
  if (sayfa > 0) { f.button("\u00a77<< Onceki"); ek.push("onceki"); }
  if (sayfa < toplam - 1) { f.button("\u00a77Sonraki >>"); ek.push("sonraki"); }
  f.button(`\u00a7eAra \u00a78(${durum.arama || "-"})`); ek.push("ara");
  f.button("\u00a7eEnvanterimden Sec"); ek.push("env");
  f.button("\u00a7eElle ID Yaz"); ek.push("id");
  f.button("\u00a77< Geri"); ek.push("geri");

  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection < dilim.length) return geriCagir(dilim[r.selection]);
    switch (ek[r.selection - dilim.length]) {
      case "onceki": return istenenSec(p, geriCagir, geriDon, { ...durum, sayfa: sayfa - 1 });
      case "sonraki": return istenenSec(p, geriCagir, geriDon, { ...durum, sayfa: sayfa + 1 });
      case "ara": return aramaKutusu(p, geriCagir, geriDon, durum);
      case "env": return envanterdenTip(p, geriCagir, geriDon);
      case "id": return elleId(p, geriCagir, geriDon);
      default: return geriDon();
    }
  });
}

function aramaKutusu(p, geriCagir, geriDon, durum) {
  new ModalFormData().title("\u00a7lESYA ARA")
    .textField("Esya adi (turkce ya da ingilizce)", "orn: elmas, beyaz yun, oak_log", { defaultValue: durum.arama ?? "" })
    .show(p).then(r => {
      if (r.canceled) return istenenSec(p, geriCagir, geriDon, durum);
      istenenSec(p, geriCagir, geriDon, { arama: String(r.formValues[0] ?? "").trim(), sayfa: 0 });
    });
}

function envanterdenTip(p, geriCagir, geriDon) {
  const c = kap(p); if (!c) return geriDon();
  const tipler = [];
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it && !ozelEsya(it) && !tipler.includes(it.typeId)) tipler.push(it.typeId);
  }
  if (tipler.length === 0) { p.sendMessage("\u00a7c[Market] Envanterin bos."); return istenenSec(p, geriCagir, geriDon); }
  const f = new ActionFormData().title("\u00a7lENVANTERIMDEN").body("\u00a77Bir esya turu sec.");
  for (const id of tipler) f.button(raw(adParca(id)), ikonGuvenli(id));
  f.button("\u00a77< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === tipler.length) return istenenSec(p, geriCagir, geriDon);
    geriCagir(tipler[r.selection]);
  });
}

function elleId(p, geriCagir, geriDon) {
  new ModalFormData().title("\u00a7lELLE ID YAZ")
    .textField("Esya id", "orn: minecraft:diamond")
    .show(p).then(r => {
      if (r.canceled) return istenenSec(p, geriCagir, geriDon);
      const ham = String(r.formValues[0] ?? "").trim();
      if (!ham) return istenenSec(p, geriCagir, geriDon);
      const id = ham.includes(":") ? ham : `minecraft:${ham}`;
      if (!gecerliItem(id)) {
        p.sendMessage(`\u00a7c[Market] "${id}" diye bir esya yok.`);
        return istenenSec(p, geriCagir, geriDon);
      }
      geriCagir(id);
    });
}

// ==================== ILAN OLUSTURMA ====================
function ilanKontrol(p) {
  const l = ilanlariOku();
  if (l.length >= CFG.maxIlanToplam) { p.sendMessage("§c[Market] Market dolu."); return null; }
  if (l.filter(i => i.s === p.name).length >= CFG.maxIlanOyuncu) {
    p.sendMessage(`§c[Market] En fazla ${CFG.maxIlanOyuncu} ilanin olabilir.`); return null;
  }
  return l;
}
function slottanAl(p, slot, adet) {
  const c = kap(p);
  const it = c?.getItem(slot);
  if (!it) { p.sendMessage("§c[Market] Esya bulunamadi."); return null; }
  if (ozelEsya(it)) { p.sendMessage("§c[Market] Kontrol kitabi ve arsa sopasi markete konamaz."); return null; }
  if (!Number.isInteger(adet) || adet < 1 || adet > it.amount) { p.sendMessage("§c[Market] Adet gecersiz."); return null; }
  const cikan = it.clone(); cikan.amount = adet;
  if (it.amount === adet) c.setItem(slot, undefined);
  else { const k = it.clone(); k.amount = it.amount - adet; c.setItem(slot, k); }
  return cikan;
}
function ilanEkle(p, kayit) {
  const l = ilanKontrol(p); if (!l) return false;
  l.push({ id: `${Date.now()}${Math.floor(Math.random() * 1000)}`, s: p.name, z: Date.now(), ...kayit });
  ilanlariYaz(l);
  return true;
}
// min==max slider Bedrock'ta sorunlu; tek adet varsa slider koymayiz
function adetSlider(form, etiket, enFazla) {
  if (enFazla <= 1) return false;
  form.slider(etiket, 1, enFazla, { defaultValue: enFazla, valueStep: 1 });
  return true;
}

function satFormu(p, slot) {
  const it = kap(p)?.getItem(slot);
  if (!it) return kitapMenu(p);
  const rehber = fiyatRehberi(it.typeId);
  const ipucu = rehber ? `§7Piyasa ortalamasi: §a${fmt(rehber.ortalama)}§7/adet` : "§7Bu esya icin henuz satis kaydi yok.";

  const f = new ModalFormData().title("§lPARA KARSILIGI SAT");
  const sliderVar = adetSlider(f, "Kac adet satiyorsun?", it.amount);
  f.textField(`Toplam fiyat  ${ipucu}`, "sadece rakam, orn: 250", { defaultValue: "100" });

  f.show(p).then(r => {
    if (r.canceled) return kitapMenu(p);
    const adet = sliderVar ? Math.floor(r.formValues[0]) : 1;
    const fiyat = sayiOku(r.formValues[sliderVar ? 1 : 0]);

    if (!Number.isFinite(fiyat) || fiyat < CFG.minFiyat || fiyat > CFG.maxFiyat) {
      p.sendMessage(`§c[Market] Fiyat okunamadi. Sadece rakam yaz (${CFG.minFiyat} - ${CFG.maxFiyat}).`);
      return satFormu(p, slot);
    }
    if (!ilanKontrol(p)) return;
    const cikan = slottanAl(p, slot, adet); if (!cikan) return;
    const veri = paketle(cikan);
    if (!ilanEkle(p, { tur: "para", f: fiyat, i: veri })) { envantereVer(p, cikan); return; }
    ses(p, "random.orb");
    msj(p, T("§a[Market] §f"), adParcaD(veri), T(` §7x${adet} markete kondu - §a${fmt(fiyat)}`));
    if (CFG.duyuru) world.sendMessage(raw(T(`§6[Market] §f${p.name}§7: §e`), adParcaD(veri), T(` x${adet} §7- §a${fmt(fiyat)}`)));
    kitapMenu(p);
  });
}

function marketTakas(p, slot) {
  const it = kap(p)?.getItem(slot);
  if (!it) return kitapMenu(p);
  istenenSec(p, (istenenId) => {
    const f = new ModalFormData().title("§lMARKETE TAKAS KOY");
    const sliderVar = adetSlider(f, "Kac adet veriyorsun?", it.amount);
    f.textField("Karsiliginda kac adet istiyorsun?", "sadece rakam", { defaultValue: "1" });
    f.show(p).then(r => {
      if (r.canceled) return kitapMenu(p);
      const verilecek = sliderVar ? Math.floor(r.formValues[0]) : 1;
      const istenen = sayiOku(r.formValues[sliderVar ? 1 : 0]);
      if (!Number.isFinite(istenen) || istenen < 1 || istenen > CFG.maxAdet) {
        p.sendMessage(`§c[Market] Adet okunamadi. 1 - ${CFG.maxAdet} arasi bir rakam yaz.`);
        return marketTakas(p, slot);
      }
      if (!ilanKontrol(p)) return;
      const cikan = slottanAl(p, slot, verilecek); if (!cikan) return;
      const veri = paketle(cikan);
      if (!ilanEkle(p, { tur: "takas", f: 0, i: veri, ist: { t: istenenId, a: istenen } })) { envantereVer(p, cikan); return; }
      ses(p, "random.orb");
      msj(p, T("§a[Market] §fTakas ilani: §e"), adParcaD(veri), T(` x${verilecek} §7<-> §b`), adParca(istenenId), T(` x${istenen}`));
      if (CFG.duyuru) world.sendMessage(raw(T(`§6[Market] §f${p.name}§7 takas: §e`), adParcaD(veri), T(` x${verilecek} §7<-> §b`), adParca(istenenId), T(` x${istenen}`)));
      kitapMenu(p);
    });
  }, () => kitapMenu(p));
}

// ---- ALIM ILANI (parayi bloke eder) ----
function alimIlani(p) {
  istenenSec(p, (istenenId) => {
    const rehber = fiyatRehberi(istenenId);
    const ipucu = rehber ? `§7Piyasa: §a${fmt(rehber.ortalama)}§7/adet` : "§7Satis kaydi yok.";
    new ModalFormData()
      .title("§lALIM ILANI VER")
      .textField("Kac adet ariyorsun?", "sadece rakam", { defaultValue: "1" })
      .textField(`Toplam ne kadar odeyeceksin?  ${ipucu}`, "sadece rakam", { defaultValue: "100" })
      .show(p).then(r => {
        if (r.canceled) return kitapMenu(p);
        const adet = sayiOku(r.formValues[0]);
        const fiyat = sayiOku(r.formValues[1]);
        if (!Number.isFinite(adet) || adet < 1 || adet > CFG.maxAdet) {
          p.sendMessage(`§c[Market] Adet okunamadi. 1 - ${CFG.maxAdet} arasi rakam yaz.`);
          return alimIlani(p);
        }
        if (!Number.isFinite(fiyat) || fiyat < CFG.minFiyat || fiyat > CFG.maxFiyat) {
          p.sendMessage("§c[Market] Fiyat okunamadi. Sadece rakam yaz.");
          return alimIlani(p);
        }
        if (paraOku(p) < fiyat) return p.sendMessage(`§c[Market] Yeterli paran yok. Gereken: ${fmt(fiyat)}`);
        if (!ilanKontrol(p)) return;

        paraEkle(p, -fiyat);   // para bloke edilir
        if (!ilanEkle(p, { tur: "alim", f: fiyat, ist: { t: istenenId, a: adet } })) { paraEkle(p, fiyat); return; }
        ses(p, "random.orb");
        msj(p, T("§a[Market] §fAlim ilani: §b"), adParca(istenenId), T(` x${adet} §7icin §a${fmt(fiyat)} §7bloke edildi.`));
        if (CFG.duyuru) world.sendMessage(raw(T(`§6[Market] §f${p.name} §7ariyor: §b`), adParca(istenenId), T(` x${adet} §7- §a${fmt(fiyat)}`)));
        kitapMenu(p);
      });
  }, () => kitapMenu(p));
}

// ==================== KISIYE TEKLIF ====================
function onlineDigerleri(p) { return world.getAllPlayers().filter(x => x.name !== p.name); }

function kisiSec(p) {
  const k = onlineDigerleri(p);
  if (k.length === 0) { p.sendMessage("§c[Market] Su an online baska oyuncu yok."); return kitapMenu(p); }
  const f = new ActionFormData().title("§lKIME TEKLIF?").body("§7Oyuncu sec.");
  for (const x of k) f.button(`§f${x.name}`, ikonGuvenli("minecraft:name_tag"));
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === k.length) return kitapMenu(p);
    const hedef = k[r.selection];
    envanterSec(p, "§lNE VERECEKSIN?", slot => teklifKur(p, hedef.name, slot));
  });
}

function teklifKur(p, kime, slot) {
  const it = kap(p)?.getItem(slot);
  if (!it) return kitapMenu(p);
  istenenSec(p, (istenenId) => {
    const f = new ModalFormData().title(`§lTEKLIF: ${kime}`);
    const sliderVar = adetSlider(f, "Kac adet veriyorsun?", it.amount);
    f.textField("Karsiliginda kac adet istiyorsun?", "sadece rakam", { defaultValue: "1" });
    f.show(p).then(r => {
      if (r.canceled) return kitapMenu(p);
      const verilecek = sliderVar ? Math.floor(r.formValues[0]) : 1;
      const istenen = sayiOku(r.formValues[sliderVar ? 1 : 0]);
      if (!Number.isFinite(istenen) || istenen < 1 || istenen > CFG.maxAdet) {
        p.sendMessage(`§c[Market] Adet okunamadi. 1 - ${CFG.maxAdet} arasi rakam yaz.`);
        return teklifKur(p, kime, slot);
      }
      const hedef = world.getAllPlayers().find(x => x.name === kime);
      if (!hedef) return p.sendMessage("§c[Market] Oyuncu cikis yapmis.");
      const kontrol = kap(p)?.getItem(slot);
      if (!kontrol || kontrol.typeId !== it.typeId || kontrol.amount < verilecek)
        return p.sendMessage("§c[Market] Esya degismis, teklif iptal.");

      const ornek = kontrol.clone(); ornek.amount = verilecek;
      const id = `t${++teklifSayac}`;
      teklifler.set(id, { id, kimden: p.name, kime, zaman: Date.now(), ver: paketle(ornek), iste: { t: istenenId, a: istenen } });
      ses(p, "random.orb");
      p.sendMessage(`§a[Market] §fTeklif gonderildi -> §e${kime}`);
      hedef.sendMessage(`§6[Market] §f${p.name} §7sana takas teklifi gonderdi! §f!teklifler`);
      bildir(hedef, "§6Yeni takas teklifi!");
      ses(hedef, "note.pling");
      kitapMenu(p);
    });
  }, () => kitapMenu(p));
}

function gelenTeklifler(p) {
  const liste = tekliflerim(p);
  if (liste.length === 0) {
    new ActionFormData().title("§lGELEN TEKLIFLER").body("§7Bekleyen teklif yok.")
      .button("§7< Geri").show(p).then(r => { if (!r.canceled) kitapMenu(p); });
    return;
  }
  const f = new ActionFormData().title("§lGELEN TEKLIFLER").body("§7Bir teklife bas.");
  for (const t of liste) {
    f.button(raw(T(`§f${t.kimden}\n§a`), adParcaD(t.ver), T(` x${t.ver.a} §7<-> §b`), adParca(t.iste.t), T(` x${t.iste.a}`)), ikonGuvenli(t.ver.t));
  }
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === liste.length) return kitapMenu(p);
    teklifOnay(p, liste[r.selection].id);
  });
}

function teklifOnay(p, id) {
  const t = teklifler.get(id);
  if (!t) { p.sendMessage("§c[Market] Teklif gecersiz."); return gelenTeklifler(p); }
  const sende = itemSay(p, t.iste.t);
  const yeter = sende >= t.iste.a;

  new ActionFormData()
    .title("§lTAKAS TEKLIFI")
    .body(raw(
      T(`§f${t.kimden} §7sana su teklifi yapiyor:\n\n§aSANA: `), adParcaD(t.ver), T(` §fx${t.ver.a}\n`),
      T("§cSENDEN: "), adParca(t.iste.t), T(` §fx${t.iste.a}\n\n§7Sende: §f${sende} adet\n`),
      T(yeter ? "§aTakas yapilabilir." : "§cYeterli esyan yok!")
    ))
    .button(yeter ? "§aKABUL ET" : "§8(Esya yetersiz)", ikonGuvenli(t.ver.t))
    .button("§cREDDET")
    .button("§7< Geri")
    .show(p).then(r => {
      if (r.canceled || r.selection === 2) return gelenTeklifler(p);
      if (r.selection === 1) {
        teklifler.delete(id);
        world.getAllPlayers().find(x => x.name === t.kimden)?.sendMessage(`§c[Market] §f${p.name} §7teklifini reddetti.`);
        return gelenTeklifler(p);
      }
      if (!yeter) { p.sendMessage("§c[Market] Yeterli esyan yok."); return gelenTeklifler(p); }
      if (!teklifler.get(id)) { p.sendMessage("§c[Market] Teklif gecersiz."); return gelenTeklifler(p); }
      const gonderen = world.getAllPlayers().find(x => x.name === t.kimden);
      if (!gonderen) { p.sendMessage("§c[Market] Gonderen cikis yapmis."); return gelenTeklifler(p); }
      if (itemSay(gonderen, t.ver.t) < t.ver.a) {
        p.sendMessage("§c[Market] Karsi tarafta o esya kalmamis.");
        gonderen.sendMessage("§c[Market] Teklif ettigin esya yok, takas iptal.");
        teklifler.delete(id);
        return gelenTeklifler(p);
      }
      if (!itemCikar(p, t.iste.t, t.iste.a)) { p.sendMessage("§c[Market] Esyalar alinamadi."); return gelenTeklifler(p); }
      if (!itemCikar(gonderen, t.ver.t, t.ver.a)) {
        envantereVer(p, ac({ t: t.iste.t, a: t.iste.a }));
        p.sendMessage("§c[Market] Karsi taraftan esya alinamadi, iptal.");
        return gelenTeklifler(p);
      }
      teklifler.delete(id);
      envantereVer(p, ac(t.ver));
      envantereVer(gonderen, ac({ t: t.iste.t, a: t.iste.a }));
      ses(p, "random.levelup"); ses(gonderen, "random.levelup");
      msj(p, T("§a[Market] §fTakas tamam! §e"), adParcaD(t.ver), T(` x${t.ver.a}`));
      msj(gonderen, T(`§a[Market] §f${p.name} §7kabul etti. §e`), adParca(t.iste.t), T(` x${t.iste.a} §7aldin.`));
      gelenTeklifler(p);
    });
}

// ==================== MARKET EKRANI ====================
function etiketParca(i) {
  if (i.tur === "takas") return [T("§b<-> "), adParca(i.ist.t), T(` x${i.ist.a}`)];
  if (i.tur === "alim") return [T(`§d ARANIYOR §a${fmt(i.f)}`)];
  return [T(`§a${fmt(i.f)}`)];
}
function ilanBaslikParca(i) {
  if (i.tur === "alim") return [adParca(i.ist.t), T(` §7x${i.ist.a}`)];
  return [adParcaD(i.i), T(` §7x${i.i.a}`)];
}
function ilanIkon(i) { return ikonGuvenli(i.tur === "alim" ? i.ist.t : i.i.t); }
function ilanBirim(i) {
  if (i.tur === "alim") return i.f / i.ist.a;
  if (i.tur === "para") return i.f / i.i.a;
  return Infinity;
}
function ilanArananMetin(i) {
  const id = i.tur === "alim" ? i.ist.t : i.i.t;
  return `${okunur(id)} ${id} ${i.i?.n ?? ""} ${i.s}`.toLowerCase();
}

function marketEkrani(p, d = {}) {
  const durum = { sayfa: 0, filtre: "hepsi", sirala: "yeni", arama: "", ...d };
  let liste = ilanlariOku();

  if (durum.filtre === "para") liste = liste.filter(i => i.tur === "para");
  else if (durum.filtre === "takas") liste = liste.filter(i => i.tur === "takas");
  else if (durum.filtre === "alim") liste = liste.filter(i => i.tur === "alim");
  else if (durum.filtre === "benim") liste = liste.filter(i => i.s === p.name);

  if (durum.arama) {
    const q = durum.arama.toLowerCase();
    liste = liste.filter(i => ilanArananMetin(i).includes(q));
  }

  if (durum.sirala === "ucuz") liste = [...liste].sort((a, b) => ilanBirim(a) - ilanBirim(b));
  else if (durum.sirala === "pahali") liste = [...liste].sort((a, b) => ilanBirim(b) - ilanBirim(a));
  else liste = [...liste].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));

  const siraAd = { yeni: "En yeni", ucuz: "En ucuz", pahali: "En pahali" }[durum.sirala];
  const filtreAd = { hepsi: "Tumu", para: "Satilik", takas: "Takas", alim: "Alim ilani", benim: "Benim" }[durum.filtre];

  if (liste.length === 0) {
    new ActionFormData().title("§lMARKET")
      .body(`§7Sonuc yok.\n§7Filtre: §f${filtreAd}§7  Arama: §f${durum.arama || "-"}\n\n§7Bakiyen: §a${fmt(paraOku(p))}`)
      .button("§7Filtreyi sifirla").button("§7Ara").button("§7< Geri")
      .show(p).then(r => {
        if (r.canceled) return;
        if (r.selection === 0) marketEkrani(p, { sayfa: 0 });
        else if (r.selection === 1) aramaFormu(p, durum);
        else kitapMenu(p);
      });
    return;
  }

  const toplam = Math.ceil(liste.length / CFG.sayfaBoyu);
  const sayfa = Math.max(0, Math.min(durum.sayfa, toplam - 1));
  const dilim = liste.slice(sayfa * CFG.sayfaBoyu, (sayfa + 1) * CFG.sayfaBoyu);

  const f = new ActionFormData()
    .title(`§lMARKET §7(${sayfa + 1}/${toplam})`)
    .body(`§7Bakiye: §a${fmt(paraOku(p))}  §8|  §7${liste.length} sonuc\n§7${filtreAd} · ${siraAd}${durum.arama ? ` · "${durum.arama}"` : ""}`);

  for (const i of dilim) {
    const benim = i.s === p.name ? " §8(senin)" : "";
    f.button(raw(ilanBaslikParca(i), T(`${benim}\n`), etiketParca(i), T(` §8- ${i.s}`)), ilanIkon(i));
  }

  const ek = [];
  if (sayfa > 0) { f.button("§7<< Onceki"); ek.push("onceki"); }
  if (sayfa < toplam - 1) { f.button("§7Sonraki >>"); ek.push("sonraki"); }
  f.button(`§eAra §8(${durum.arama || "-"})`); ek.push("ara");
  f.button(`§eFiltre §8(${filtreAd})`); ek.push("filtre");
  f.button(`§eSirala §8(${siraAd})`); ek.push("sirala");
  f.button("§7< Geri"); ek.push("geri");

  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection < dilim.length) return onayEkrani(p, dilim[r.selection].id, { ...durum, sayfa });
    switch (ek[r.selection - dilim.length]) {
      case "onceki": return marketEkrani(p, { ...durum, sayfa: sayfa - 1 });
      case "sonraki": return marketEkrani(p, { ...durum, sayfa: sayfa + 1 });
      case "ara": return aramaFormu(p, durum);
      case "filtre": return filtreMenu(p, durum);
      case "sirala": return siralaMenu(p, durum);
      default: return kitapMenu(p);
    }
  });
}

function aramaFormu(p, durum) {
  new ModalFormData().title("§lARAMA")
    .textField("Esya veya oyuncu adi", "orn: elmas / diamond / Ahmet", { defaultValue: durum.arama ?? "" })
    .show(p).then(r => {
      if (r.canceled) return marketEkrani(p, durum);
      marketEkrani(p, { ...durum, arama: String(r.formValues[0] ?? "").trim(), sayfa: 0 });
    });
}
function filtreMenu(p, durum) {
  const f = new ActionFormData().title("§lFILTRE")
    .button("§fTumu")
    .button("§aSatilik (para)", ikonGuvenli("minecraft:gold_ingot"))
    .button("§bTakas", ikonGuvenli("minecraft:emerald"))
    .button("§dAlim ilanlari", ikonGuvenli("minecraft:hopper"))
    .button("§eBenim ilanlarim", ikonGuvenli("minecraft:book"))
    .button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled || r.selection === 5) return marketEkrani(p, durum);
    marketEkrani(p, { ...durum, filtre: ["hepsi", "para", "takas", "alim", "benim"][r.selection], sayfa: 0 });
  });
}
function siralaMenu(p, durum) {
  new ActionFormData().title("§lSIRALAMA")
    .button("§fEn yeni").button("§aEn ucuz (birim)").button("§cEn pahali (birim)").button("§7< Geri")
    .show(p).then(r => {
      if (r.canceled || r.selection === 3) return marketEkrani(p, durum);
      marketEkrani(p, { ...durum, sirala: ["yeni", "ucuz", "pahali"][r.selection], sayfa: 0 });
    });
}

function ilanIptal(p, id, doner) {
  const g = ilanlariOku();
  const ix = g.findIndex(x => x.id === id);
  if (ix === -1) { p.sendMessage("§e[Market] Ilan bu arada kapanmis."); return doner(); }
  const [c] = g.splice(ix, 1);
  ilanlariYaz(g);
  if (c.tur === "alim") { paraEkle(p, c.f); p.sendMessage(`§a[Market] §fAlim ilani iptal, §a${fmt(c.f)} §fiade edildi.`); }
  else { envantereVer(p, ac(c.i)); msj(p, T("§a[Market] §fIlan geri cekildi: §e"), adParcaD(c.i), T(` x${c.i.a}`)); }
  ses(p, "random.pop");
  doner();
}

function onayEkrani(p, id, durum) {
  const ilan = ilanlariOku().find(x => x.id === id);
  const doner = () => marketEkrani(p, durum);
  if (!ilan) { p.sendMessage("§c[Market] Bu ilan artik yok."); return doner(); }

  if (ilan.s === p.name) {
    new ActionFormData().title("§lKENDI ILANIN")
      .body(raw(ilanBaslikParca(ilan), T("\n§7Karsiligi: "), etiketParca(ilan), T("\n\n§7Iptal etmek ister misin?")))
      .button("§eIPTAL ET / GERI CEK", ilanIkon(ilan)).button("§7Vazgec")
      .show(p).then(r => {
        if (r.canceled || r.selection !== 0) return doner();
        ilanIptal(p, id, doner);
      });
    return;
  }

  const rehber = fiyatRehberi(ilan.tur === "alim" ? ilan.ist.t : ilan.i.t);
  const rehberMetin = rehber ? `\n§8Piyasa ort. ${fmt(rehber.ortalama)}/adet (${rehber.satisAdedi} satis)` : "";

  let govde, yeter, btn, baslik;
  if (ilan.tur === "alim") {
    const sende = itemSay(p, ilan.ist.t);
    yeter = sende >= ilan.ist.a;
    baslik = "§lSATIS ONAYI";
    govde = raw(
      T(`§f${ilan.s} §7bu esyayi ariyor:\n§b`), adParca(ilan.ist.t), T(` §fx${ilan.ist.a}\n\n`),
      T(`§7Verirsen kazanacagin: §a${fmt(ilan.f)}\n§7Sende: §f${sende} adet\n`),
      T(yeter ? "§aSatis yapilabilir." : "§cYeterli esyan yok!"), T(rehberMetin)
    );
    btn = yeter ? "§aEVET, SAT" : "§8(Esya yetersiz)";
  } else if (ilan.tur === "takas") {
    const sende = itemSay(p, ilan.ist.t);
    yeter = sende >= ilan.ist.a;
    baslik = "§lTAKAS ONAYI";
    govde = raw(
      T(`§f${ilan.s} §7adli oyuncudan\n§e${ilan.i.a} adet §f`), adParcaD(ilan.i),
      T("\n§7almak icin karsiliginda\n§b"), adParca(ilan.ist.t), T(` §7x${ilan.ist.a} vereceksin.\n\n§7Sende: §f${sende} adet\n`),
      T(yeter ? "§aTakas yapilabilir." : "§cYeterli esyan yok!"), T(rehberMetin)
    );
    btn = yeter ? "§aEVET, TAKAS YAP" : "§8(Esya yetersiz)";
  } else {
    const bak = paraOku(p);
    const sd = Seviye.SEVIYE_CFG.oyuncuMarketiKilitli
      ? Seviye.alabilirMi(p, fiyat(ilan.i.t)?.alis ?? 0) : { olur: true };
    yeter = bak >= ilan.f && sd.olur;
    baslik = "§lSATIN ALMA ONAYI";
    govde = raw(
      T(`§f${ilan.s} §7adli oyuncudan\n§e${ilan.i.a} adet §f`), adParcaD(ilan.i),
      T(`\n§a${fmt(ilan.f)} §7karsiliginda almak istiyor musun?\n§8(birim ${fmt(ilan.f / ilan.i.a)})\n\n§7Bakiyen: §a${fmt(bak)}\n`),
      T(!sd.olur ? `§cKilitli: Ticaret Lv ${sd.gerekli} gerekiyor` : yeter ? `§7Kalan: §a${fmt(bak - ilan.f)}` : "§cYeterli paran yok!"), T(rehberMetin)
    );
    btn = !sd.olur ? `§8(Lv ${sd.gerekli} gerekli)` : yeter ? "§aEVET, SATIN AL" : "§8(Para yetersiz)";
  }

  new ActionFormData().title(baslik).body(govde)
    .button(btn, ilanIkon(ilan))
    .button("§cHAYIR, VAZGEC")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return doner();
      if (!yeter) { p.sendMessage("§c[Market] Karsiligini odeyemiyorsun."); return doner(); }

      const g = ilanlariOku();
      const ix = g.findIndex(x => x.id === id);
      if (ix === -1) { p.sendMessage("§c[Market] Bu ilani az once baskasi kapatti."); return doner(); }
      const h = g[ix];

      if (h.tur === "alim") {
        if (!itemCikar(p, h.ist.t, h.ist.a)) { p.sendMessage("§c[Market] Esyalar alinamadi."); return doner(); }
        g.splice(ix, 1); ilanlariYaz(g);
        paraEkle(p, h.f);                       // bloke para satana gecer
        esyaTeslim(h.s, { t: h.ist.t, a: h.ist.a });
        gecmiseEkle(h.ist.t, h.f, h.ist.a);
        Seviye.xpVer(p, Seviye.xpSatistan(h.f));
        ses(p, "random.levelup");
        msj(p, T("§a[Market] §fSattin: §e"), adParca(h.ist.t), T(` x${h.ist.a} §7(+${fmt(h.f)})`));
      } else if (h.tur === "takas") {
        if (!itemCikar(p, h.ist.t, h.ist.a)) { p.sendMessage("§c[Market] Gerekli esyalar bulunamadi."); return doner(); }
        g.splice(ix, 1); ilanlariYaz(g);
        esyaTeslim(h.s, { t: h.ist.t, a: h.ist.a });
        envantereVer(p, ac(h.i));
        Seviye.xpVer(p, Seviye.SEVIYE_CFG.xpTakas);
        ses(p, "random.levelup");
        msj(p, T("§a[Market] §fTakas tamam: §e"), adParcaD(h.i), T(` x${h.i.a}`));
      } else {
        if (paraOku(p) < h.f) { p.sendMessage("§c[Market] Yeterli paran yok."); return doner(); }
        g.splice(ix, 1); ilanlariYaz(g);
        paraEkle(p, -h.f);
        paraTeslim(h.s, h.f);
        envantereVer(p, ac(h.i));
        gecmiseEkle(h.i.t, h.f, h.i.a);
        Seviye.xpVer(p, Seviye.xpAlistan(h.f));
        ses(p, "random.levelup");
        msj(p, T("§a[Market] §fSatin alindi: §e"), adParcaD(h.i), T(` x${h.i.a} §7(-${fmt(h.f)})`));
      }
      doner();
    });
}

function ilanlarimEkrani(p) {
  const benim = ilanlariOku().filter(i => i.s === p.name);
  if (benim.length === 0) {
    new ActionFormData().title("§lILANLARIM").body("§7Aktif ilanin yok.")
      .button("§7< Geri").show(p).then(r => { if (!r.canceled) kitapMenu(p); });
    return;
  }
  const f = new ActionFormData().title("§lILANLARIM").body(`§7${benim.length} aktif ilan. Iptal icin bas.`);
  for (const i of benim) {
    const gun = Math.max(0, CFG.ilanGunSuresi - Math.floor((Date.now() - (i.z ?? Date.now())) / 86400000));
    f.button(raw(ilanBaslikParca(i), T("\n"), etiketParca(i), T(` §8- ${gun}g kaldi`)), ilanIkon(i));
  }
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection === benim.length) return kitapMenu(p);
    ilanIptal(p, benim[r.selection].id, () => ilanlarimEkrani(p));
  });
}

// ==================== FIYAT REHBERI EKRANI ====================
function rehberSec(p) {
  istenenSec(p, (id) => rehberGoster(p, id), () => kitapMenu(p));
}
function rehberGoster(p, id) {
  const r = fiyatRehberi(id);
  const aktif = ilanlariOku().filter(i => (i.tur === "alim" ? i.ist.t : i.i.t) === id);
  const govde = r
    ? raw(adParca(id), T(`\n\n§7Ortalama birim: §a${fmt(r.ortalama)}\n§7En dusuk: §a${fmt(r.enDusuk)}\n§7En yuksek: §c${fmt(r.enYuksek)}\n§7Kayitli satis: §f${r.satisAdedi}\n§7Su an markette: §f${aktif.length} ilan`))
    : raw(adParca(id), T(`\n\n§7Bu esya icin henuz satis kaydi yok.\n§7Su an markette: §f${aktif.length} ilan`));

  new ActionFormData().title("§lFIYAT REHBERI").body(govde)
    .button("§eBu esyayi markette ara", ikonGuvenli(id))
    .button("§7Baska esya sec")
    .button("§7< Geri")
    .show(p).then(res => {
      if (res.canceled) return;
      if (res.selection === 0) return marketEkrani(p, { arama: okunur(id).toLowerCase(), sayfa: 0 });
      if (res.selection === 1) return rehberSec(p);
      kitapMenu(p);
    });
}

// ==================== GONDERME ====================
function paraMenu(p) {
  new ActionFormData().title("§lGONDER").body(`§7Bakiyen: §a${fmt(paraOku(p))}`)
    .button("§lPara Gonder", ikonGuvenli("minecraft:gold_ingot"))
    .button("§lEsya Gonder", ikonGuvenli("minecraft:diamond"))
    .button("§7< Geri")
    .show(p).then(r => {
      if (r.canceled) return;
      if (r.selection === 0) paraGonder(p);
      else if (r.selection === 1) envanterSec(p, "§lGONDERILECEK ESYAYI SEC", slot => esyaGonder(p, slot));
      else kitapMenu(p);
    });
}
function paraGonder(p) {
  const k = onlineDigerleri(p);
  if (k.length === 0) { p.sendMessage("§c[Market] Online baska oyuncu yok."); return paraMenu(p); }
  new ModalFormData().title("§lPARA GONDER")
    .dropdown("Kime?", k.map(x => x.name))
    .textField(`Miktar §7(bakiyen: ${fmt(paraOku(p))})`, "sadece rakam")
    .show(p).then(r => {
      if (r.canceled) return paraMenu(p);
      const hedef = k[r.formValues[0]];
      const m = sayiOku(r.formValues[1]);
      if (!Number.isFinite(m) || m <= 0) { p.sendMessage("§c[Market] Miktar okunamadi, sadece rakam yaz."); return paraGonder(p); }
      if (paraOku(p) < m) { p.sendMessage("§c[Market] Yeterli paran yok."); return paraGonder(p); }
      if (!hedef.isValid) return p.sendMessage("§c[Market] Oyuncu cikis yapmis.");
      paraEkle(p, -m); paraEkle(hedef, m);
      ses(p, "random.orb"); ses(hedef, "random.orb");
      p.sendMessage(`§a[Market] §f${hedef.name} -> §a${fmt(m)}`);
      hedef.sendMessage(`§a[Market] §f${p.name} sana §a${fmt(m)} §fgonderdi!`);
    });
}
function esyaGonder(p, slot) {
  const it = kap(p)?.getItem(slot);
  if (!it) return p.sendMessage("§c[Market] Esya bulunamadi.");
  const k = onlineDigerleri(p);
  if (k.length === 0) { p.sendMessage("§c[Market] Online baska oyuncu yok."); return paraMenu(p); }
  const f = new ModalFormData().title("§lESYA GONDER").dropdown("Kime?", k.map(x => x.name));
  const sliderVar = adetSlider(f, "Kac adet?", it.amount);
  f.show(p).then(r => {
    if (r.canceled) return paraMenu(p);
    const hedef = k[r.formValues[0]];
    const adet = sliderVar ? Math.floor(r.formValues[1]) : 1;
    if (!hedef.isValid) return p.sendMessage("§c[Market] Oyuncu cikis yapmis.");
    const cikan = slottanAl(p, slot, adet); if (!cikan) return;
    const veri = paketle(cikan);
    envantereVer(hedef, cikan);
    ses(hedef, "random.orb");
    msj(p, T(`§a[Market] §f${hedef.name} -> §e`), adParcaD(veri), T(` x${adet}`));
    msj(hedef, T(`§a[Market] §f${p.name} sana §e`), adParcaD(veri), T(` x${adet} §fgonderdi!`));
  });
}

// ==================== ADMIN ====================
function adminPanel(p) {
  if (!adminMi(p)) return kitapMenu(p);
  const ilanlar = ilanlariOku();
  const gecmis = yukle(K_GECMIS, []);
  const f = new ActionFormData().title("§c§lADMIN PANELI")
    .body(`§7Toplam ilan: §f${ilanlar.length}\n§7Kayitli satis: §f${gecmis.length}\n` +
      `§7Online: §f${world.getAllPlayers().length}\n§7Esya listesi: §f${tumItemler().length}§7 esya` +
      `§8 (aday ${RAPOR.aday}, esya kaydi ${RAPOR.kayit}, blok ${RAPOR.blok}, katalog +${RAPOR.katalog})`);
  const islem = [];
  const ekle = (yazi, ikonId, fn) => { f.button(yazi, ikonGuvenli(ikonId)); islem.push(fn); };
  ekle("§ePara Ver / Al", "minecraft:gold_ingot", () => adminPara(p));
  ekle("§eIlan Sil (zorla)", "minecraft:barrier", () => adminIlanSil(p));
  ekle("§cFiyat Gecmisini Temizle", "minecraft:hopper", () => {
    kaydet(K_GECMIS, []); p.sendMessage("§a[Market] Fiyat gecmisi temizlendi."); adminPanel(p);
  });
  ekle("§eEsya Listesini Yenile", "minecraft:compass", () => { listeYenile(p); adminPanel(p); });
  ekle("§eTicaret Seviyesi Ayarla", "minecraft:experience_bottle", () => adminSeviye(p));
  ekle("§eArsa Yonetimi", "minecraft:grass_block", () => Arsa.arsaAdmin(p, API));
  f.button("§7< Geri"); islem.push(() => kitapMenu(p));
  f.show(p).then(r => { if (!r.canceled) islem[r.selection]?.(); });
}
// Esya listesini sifirdan kurar. Oyuncu "markette esya eksik" derse ilk care.
function listeYenile(p) {
  TUM_ITEMLER = null; TUM_SET = null; LISTE_SAGLAM = false;
  LISTE_KURULUYOR = false; SON_KURULUM = 0; KAT_LISTE = null; SEVIYE_DAGILIM = null;
  const n = tumItemler().length;
  p?.sendMessage(`§a[Market] §fEsya listesi yenilendi: §e${n}§f esya ` +
    `§8(${RAPOR.aday} aday denendi)`);
  return n;
}

function adminPara(p) {
  const k = world.getAllPlayers();
  new ModalFormData().title("§c§lPARA VER / AL")
    .dropdown("Oyuncu", k.map(x => x.name))
    .textField("Miktar (basina - koyarsan alir)", "orn: 1000 veya -500")
    .show(p).then(r => {
      if (r.canceled) return adminPanel(p);
      const hedef = k[r.formValues[0]];
      const ham = String(r.formValues[1] ?? "").trim();
      const eksi = ham.startsWith("-");
      const m = sayiOku(ham);
      if (!Number.isFinite(m) || m <= 0) { p.sendMessage("§c[Market] Miktar okunamadi."); return adminPara(p); }
      const delta = eksi ? -m : m;
      paraEkle(hedef, delta);
      p.sendMessage(`§a[Market] §f${hedef.name}: §a${delta > 0 ? "+" : ""}${fmt(Math.abs(delta))} §7(yeni: ${fmt(paraOku(hedef))})`);
      hedef.sendMessage(`§e[Market] Bakiyen guncellendi: §a${fmt(paraOku(hedef))}`);
      adminPanel(p);
    });
}
function adminSeviye(p) {
  const k = world.getAllPlayers();
  new ModalFormData().title("§c§lSEVIYE AYARLA")
    .dropdown("Oyuncu", k.map(x => `${x.name} (Lv ${Seviye.seviye(x)})`))
    .slider("Yeni seviye", 1, Seviye.SEVIYE_CFG.maxSeviye, { defaultValue: 1, valueStep: 1 })
    .show(p).then(r => {
      if (r.canceled) return adminPanel(p);
      const hedef = k[r.formValues?.[0] ?? 0];
      const lv = Math.floor(r.formValues?.[1] ?? 1);
      if (!hedef) return adminPanel(p);
      Seviye.xpAyarla(hedef, Seviye.ESIK[lv - 1] ?? 0);
      p.sendMessage(`§a[Market] §f${hedef.name} §7-> §eLv ${Seviye.seviye(hedef)}`);
      hedef.sendMessage(`§e[Market] Ticaret seviyen §fLv ${Seviye.seviye(hedef)}§e olarak ayarlandi.`);
      adminPanel(p);
    });
}

function adminIlanSil(p) {
  const ilanlar = ilanlariOku();
  if (ilanlar.length === 0) { p.sendMessage("§7[Market] Ilan yok."); return adminPanel(p); }
  const f = new ActionFormData().title("§c§lILAN SIL").body("§7Silinen ilan sahibine iade edilir.");
  const dilim = ilanlar.slice(0, 40);
  for (const i of dilim) f.button(raw(ilanBaslikParca(i), T(`\n§8${i.s}`)), ilanIkon(i));
  f.button("§7< Geri");
  f.show(p).then(r => {
    if (r.canceled || r.selection === dilim.length) return adminPanel(p);
    const hedef = dilim[r.selection];
    const g = ilanlariOku();
    const ix = g.findIndex(x => x.id === hedef.id);
    if (ix === -1) return adminIlanSil(p);
    const [c] = g.splice(ix, 1);
    ilanlariYaz(g);
    if (c.tur === "alim") paraTeslim(c.s, c.f); else esyaTeslim(c.s, c.i);
    p.sendMessage(`§a[Market] Ilan silindi ve §f${c.s}§a sahibine iade edildi.`);
    adminIlanSil(p);
  });
}

// ==================== SURESI DOLAN ILANLAR ====================
function suresiDolanlariIsle() {
  const g = ilanlariOku();
  const simdi = Date.now();
  const omur = CFG.ilanGunSuresi * 86400000;
  const kalan = [];
  let iade = 0;
  for (const i of g) {
    if (simdi - (i.z ?? simdi) > omur) {
      if (i.tur === "alim") paraTeslim(i.s, i.f); else esyaTeslim(i.s, i.i);
      iade++;
    } else kalan.push(i);
  }
  if (iade > 0) ilanlariYaz(kalan);
}

// ==================== KOMUTLAR ====================
function calistir(p, komut, arg) {
  // Duello sirasinda market/arsa kapali: kit satilip para basilmasin.
  if (Dovus.dovustaMi(p.name) && !["dovus", "duello", "pvp", "bakiye", "seviye"].includes(komut)) {
    p.sendMessage("§c[Market] Düello sırasında market kullanılamaz.");
    return;
  }
  switch (komut) {
    case "sat": {
      const a = sayiOku(arg[0]), f = sayiOku(arg[1]);
      if (!Number.isFinite(a) || !Number.isFinite(f)) return p.sendMessage("§c[Market] Kullanim: §f!sat <adet> <fiyat>");
      const c = kap(p), slot = p.selectedSlotIndex;
      if (!c?.getItem(slot)) return p.sendMessage("§c[Market] Elinde bir esya yok.");
      if (f < CFG.minFiyat || f > CFG.maxFiyat) return p.sendMessage("§c[Market] Fiyat gecersiz.");
      if (!ilanKontrol(p)) return;
      const cikan = slottanAl(p, slot, a); if (!cikan) return;
      const veri = paketle(cikan);
      if (!ilanEkle(p, { tur: "para", f, i: veri })) { envantereVer(p, cikan); return; }
      ses(p, "random.orb");
      msj(p, T("§a[Market] §f"), adParcaD(veri), T(` §7x${a} markete kondu - §a${fmt(f)}`));
      if (CFG.duyuru) world.sendMessage(raw(T(`§6[Market] §f${p.name}§7: §e`), adParcaD(veri), T(` x${a} §7- §a${fmt(f)}`)));
      return;
    }
    case "takas": {
      const slot = p.selectedSlotIndex;
      if (!kap(p)?.getItem(slot)) return p.sendMessage("§c[Market] Elinde bir esya yok.");
      return marketTakas(p, slot);
    }
    case "alim": return alimIlani(p);
    case "hazir": case "shop": return sistemKategoriler(p);
    case "arsa": case "claim": return Arsa.arsaMenu(p, API);
    case "topluSat": case "toplusat": return topluSat(p);
    case "ara": return marketEkrani(p, { arama: arg.join(" "), sayfa: 0 });
    case "rehber": return rehberSec(p);
    case "teklif": return kisiSec(p);
    case "teklifler": return gelenTeklifler(p);
    case "market": return marketEkrani(p, { sayfa: 0 });
    case "menu": case "kontrol": return kitapMenu(p);
    case "para": return paraMenu(p);
    case "ilanlarim": return ilanlarimEkrani(p);
    case "admin": return adminMi(p) ? adminPanel(p) : p.sendMessage("§c[Market] Yetkin yok.");
    case "bakiye": return p.sendMessage(`§a[Market] §fBakiyen: §a${fmt(paraOku(p))}`);
    case "kitap": return kitapVer(p);
    case "sopa": case "arsasopasi": return sopaVer(p);
    case "seviye": case "level": case "lvl": return seviyeEkrani(p);
    case "dovus": case "duello": case "pvp": return Dovus.dovusMenu(p, API);
    case "yenile": case "refresh": return void listeYenile(p);
    case "liste": return p.sendMessage(
      `§7[Market] §fListe: §e${tumItemler().length}§f esya §8(aday ${RAPOR.aday}, ` +
      `esya kaydi ${RAPOR.kayit}, blok kaydi ${RAPOR.blok}, katalog +${RAPOR.katalog}, oyuncu +${RAPOR.oyuncu})`);
    case "id": {
      const it = kap(p)?.getItem(p.selectedSlotIndex);
      return p.sendMessage(it ? `§a[Market] §fElindeki: §e${it.typeId}` : "§c[Market] Elinde bir esya yok.");
    }
    default:
      p.sendMessage("§7[Market] §f!menu !market !ara !sat !takas !alim !teklif !teklifler !para !arsa !hazir !ilanlarim !rehber !bakiye !id !kitap !sopa !seviye !dovus !yenile !liste");
  }
}

// ==================== TICARET SEVIYESI ====================
function seviyeSatiri(p) {
  const i = Seviye.ilerleme(p);
  return `\u00a77Ticaret: \u00a7eLv ${i.seviye} \u00a78${i.unvan}  ${Seviye.cubuk(i.yuzde, 10)}` +
    (i.son ? " \u00a76MAKS" : ` \u00a78${i.kalan} XP`);
}

// Hangi seviyede kac esya aciliyor (esya listesinden hesaplanir)
let SEVIYE_DAGILIM = null;
function seviyeDagilimi() {
  if (SEVIYE_DAGILIM) return SEVIYE_DAGILIM;
  const d = new Array(Seviye.SEVIYE_CFG.maxSeviye).fill(0);
  for (const id of tumItemler()) {
    const f = fiyat(id);
    if (!f) continue;
    d[Seviye.esyaSeviyesi(f.alis) - 1]++;
  }
  SEVIYE_DAGILIM = d;
  return d;
}

function seviyeEkrani(p) {
  const i = Seviye.ilerleme(p);
  const d = seviyeDagilimi();
  let toplam = 0;
  const satirlar = d.map((n, ix) => {
    toplam += n;
    const lv = ix + 1;
    const acik = lv <= i.seviye;
    return `${acik ? "\u00a7a[+]" : "\u00a78[x]"} \u00a7fLv ${String(lv).padStart(2)} \u00a78${Seviye.UNVAN[ix]}` +
      ` \u00a77${n} e\u015fya \u00a78(toplam ${toplam})` +
      (acik ? "" : ` \u00a78- ${Seviye.ESIK[ix]} XP`);
  }).join("\n");

  new ActionFormData()
    .title("\u00a7lT\u0130CARET SEV\u0130YES\u0130")
    .body(
      `\u00a77Seviyen: \u00a7e\u00a7lLv ${i.seviye}\u00a7r \u00a7f${i.unvan}\n` +
      `${Seviye.cubuk(i.yuzde, 22)} \u00a7f%${i.yuzde}\n` +
      (i.son ? `\u00a76En \u00fcst seviyedesin. \u00a78Toplam ${i.xp} XP\n\n`
             : `\u00a77XP: \u00a7f${i.xp} \u00a78/ ${i.ust}  \u00a77Sonraki seviyeye: \u00a7f${i.kalan} XP\n\n`) +
      `\u00a77XP nas\u0131l kazan\u0131l\u0131r:\n` +
      `\u00a78- Markete e\u015fya sat: her ${Seviye.SEVIYE_CFG.xpSatisBolen}${CFG.simge} = 1 XP\n` +
      `\u00a78- Marketten al: her ${Seviye.SEVIYE_CFG.xpAlisBolen}${CFG.simge} = 1 XP\n` +
      `\u00a78- Oyuncu ilan\u0131 sat/al, takas yap\n\n` +
      `\u00a77Seviyeler:\n${satirlar}\n\n` +
      `\u00a78Sat\u0131\u015f her seviyede serbesttir; kilit sadece sat\u0131n almadad\u0131r.`
    )
    .button("\u00a77< Geri")
    .show(p).then(r => { if (!r.canceled) kitapMenu(p); });
}

// ==================== HAZIR (SISTEM) MARKET ====================
// Katalog artik elle yazilmiyor: oyundaki TUM esyalar kategorilere
// otomatik dagitiliyor, fiyatlari fiyat.js motoru hesapliyor.
let KAT_LISTE = null;
function kategoriListeleri() {
  if (KAT_LISTE) return KAT_LISTE;
  const gruplar = KATEGORILER.map(() => []);
  for (const id of tumItemler()) {
    if (yasakMi(id)) continue;
    let i = 0;
    try { i = kategoriIndex(id); } catch { i = KATEGORILER.length - 1; }
    (gruplar[i] ?? gruplar[gruplar.length - 1]).push(id);
  }
  KAT_LISTE = gruplar;
  console.warn("[Market] Kategoriler: " + gruplar.map((g, i) => `${KATEGORILER[i].ad}=${g.length}`).join(", "));
  return KAT_LISTE;
}

const MARKET_SAYFA = 50;

function sistemKategoriler(p) {
  tumItemler();
  envanterdekileriKat(p);
  const gruplar = kategoriListeleri();
  const toplam = gruplar.reduce((n, g) => n + g.length, 0);

  const f = new ActionFormData()
    .title("\u00a7lHAZIR MARKET")
    .body(`\u00a77Her zaman a\u00e7\u0131k, s\u0131n\u0131rs\u0131z stok. \u00a7f${toplam}\u00a77 e\u015fya listede.\n${seviyeSatiri(p)}\n\u00a77Bakiyen: \u00a7a${fmt(paraOku(p))}\n\u00a78Fiyatlar ham madde de\u011ferinden hesaplan\u0131r; i\u015flenmi\u015f \u00fcr\u00fcn her zaman girdisinden pahal\u0131d\u0131r.${listeDurumu()}`);

  const islem = [];
  gruplar.forEach((g, i) => {
    if (g.length === 0) return;
    f.button(`\u00a7f${KATEGORILER[i].ad}\n\u00a78${g.length} e\u015fya`, ikonGuvenli(KATEGORILER[i].ikon));
    islem.push(() => sistemUrunler(p, i, {}));
  });
  f.button(`\u00a7fT\u00fcm E\u015fyalar\n\u00a78${toplam} e\u015fya`, ikonGuvenli("minecraft:chest")); islem.push(() => sistemUrunler(p, -1, {}));
  f.button("\u00a7eE\u015fya Ara", ikonGuvenli("minecraft:compass")); islem.push(() => marketArama(p, -1, {}));
  f.button("\u00a7eEnvanterimi Toplu Sat", ikonGuvenli("minecraft:hopper")); islem.push(() => topluSat(p));
  f.button("\u00a77< Geri"); islem.push(() => kitapMenu(p));

  f.show(p).then(r => { if (!r.canceled) islem[r.selection]?.(); });
}

function sistemUrunler(p, idx, d = {}) {
  const durum = { sayfa: 0, arama: "", ...d };
  const gruplar = kategoriListeleri();
  let liste = idx >= 0 ? gruplar[idx] : gruplar.flat();
  const baslik = idx >= 0 ? KATEGORILER[idx].ad : "T\u00fcm E\u015fyalar";

  if (durum.arama) liste = aramaSuz(liste, durum.arama);
  if (liste.length === 0) {
    new ActionFormData().title("\u00a7lHAZIR MARKET")
      .body(`\u00a77"\u00a7f${durum.arama}\u00a77" i\u00e7in sonu\u00e7 yok.\n\u00a78T\u00fcrk\u00e7e de yazabilirsin: elmas, beyaz y\u00fcn, me\u015fe tahta.`)
      .button("\u00a7eYeniden ara").button("\u00a77< Geri")
      .show(p).then(r => {
        if (r.canceled) return;
        if (r.selection === 0) return marketArama(p, idx, durum);
        sistemKategoriler(p);
      });
    return;
  }

  const toplamSayfa = Math.ceil(liste.length / MARKET_SAYFA);
  const sayfa = Math.max(0, Math.min(durum.sayfa, toplamSayfa - 1));
  const dilim = liste.slice(sayfa * MARKET_SAYFA, (sayfa + 1) * MARKET_SAYFA);

  const f = new ActionFormData()
    .title(`\u00a7l${baslik.toUpperCase()} \u00a77(${sayfa + 1}/${toplamSayfa})`)
    .body(`\u00a77Bakiyen: \u00a7a${fmt(paraOku(p))}  \u00a78|  \u00a77${liste.length} e\u015fya\n${seviyeSatiri(p)}\n\u00a7aSat\u0131\u015f \u00a78/ \u00a7cAl\u0131\u015f \u00a78(adet ba\u015f\u0131)  \u00a78| \u00a78kilitliyi satabilirsin`);

  const benimSeviye = Seviye.seviye(p);
  for (const id of dilim) {
    const fi = fiyat(id);
    const elde = itemSay(p, id);
    const gerekli = Seviye.esyaSeviyesi(fi.alis);
    const kilitli = gerekli > benimSeviye;
    f.button(raw(adParca(id), T(kilitli
      ? `\n\u00a78Lv ${gerekli} gerekli \u00a78| \u00a7a${fmt(fi.alis)} sat\u0131\u015f`
      : `\n\u00a7a${fmt(fi.alis)} \u00a78/ \u00a7c${fmt(fi.satis)}${elde ? ` \u00a78(sende ${elde})` : ""}`)),
      ikonGuvenli(kilitli ? "minecraft:iron_bars" : id));
  }

  const ek = [];
  if (sayfa > 0) { f.button("\u00a77<< \u00d6nceki"); ek.push("onceki"); }
  if (sayfa < toplamSayfa - 1) { f.button("\u00a77Sonraki >>"); ek.push("sonraki"); }
  f.button(`\u00a7eAra \u00a78(${durum.arama || "-"})`); ek.push("ara");
  f.button("\u00a77< Geri"); ek.push("geri");

  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection < dilim.length) return sistemUrun(p, idx, dilim[r.selection], { ...durum, sayfa });
    switch (ek[r.selection - dilim.length]) {
      case "onceki": return sistemUrunler(p, idx, { ...durum, sayfa: sayfa - 1 });
      case "sonraki": return sistemUrunler(p, idx, { ...durum, sayfa: sayfa + 1 });
      case "ara": return marketArama(p, idx, durum);
      default: return sistemKategoriler(p);
    }
  });
}

function marketArama(p, idx, durum) {
  new ModalFormData().title("\u00a7lE\u015eYA ARA")
    .textField("E\u015fya (t\u00fcrk\u00e7e ya da ingilizce)", "\u00f6rn: elmas, beyaz y\u00fcn, oak_log", { defaultValue: durum.arama ?? "" })
    .show(p).then(r => {
      if (r.canceled) return idx >= 0 ? sistemUrunler(p, idx, durum) : sistemKategoriler(p);
      sistemUrunler(p, idx, { arama: String(r.formValues[0] ?? "").trim(), sayfa: 0 });
    });
}

function sistemUrun(p, idx, id, durum) {
  const fi = fiyat(id);
  if (!fi) return sistemUrunler(p, idx, durum);
  const elde = itemSay(p, id);
  const bakiye = paraOku(p);
  const seviyeDurum = Seviye.alabilirMi(p, fi.alis);
  const alabilir = seviyeDurum.olur ? Math.floor(bakiye / fi.satis) : 0;
  const reh = fiyatRehberi(id);

  new ActionFormData()
    .title("\u00a7lHAZIR MARKET")
    .body(raw(
      adParca(id),
      T(`\n\n\u00a77Markete satarsan: \u00a7a${fmt(fi.alis)}\u00a77/adet\n\u00a77Marketten al\u0131rsan: \u00a7c${fmt(fi.satis)}\u00a77/adet\n`),
      T(`\u00a78Bir y\u0131\u011f\u0131n (64): \u00a7a${fmt(fi.alis * 64)} \u00a78/ \u00a7c${fmt(fi.satis * 64)}\n\n`),
      T(`\u00a77Sende: \u00a7f${elde} adet\n\u00a77Bakiyen: \u00a7a${fmt(bakiye)} \u00a78(${alabilir} adet alabilirsin)`),
      T(seviyeDurum.olur
        ? `\n\u00a78Gerekli seviye: ${seviyeDurum.gerekli} \u00a78(sende ${seviyeDurum.seviye})`
        : `\n\u00a7cKilitli: \u00a7fTicaret Lv ${seviyeDurum.gerekli}\u00a7c gerekiyor \u00a78(sende ${seviyeDurum.seviye})\n\u00a77Satmak serbest \u2014 satarak seviye kazan\u0131rs\u0131n.`),
      T(reh ? `\n\u00a78Oyuncu piyasas\u0131 ort. ${fmt(reh.ortalama)}/adet` : "")
    ))
    .button(elde > 0 ? "\u00a7aSAT" : "\u00a78(Sende yok)", ikonGuvenli(id))
    .button(!seviyeDurum.olur ? `\u00a78(Lv ${seviyeDurum.gerekli} gerekli)` : alabilir > 0 ? "\u00a7cSATIN AL" : "\u00a78(Para yetersiz)",
      ikonGuvenli(seviyeDurum.olur ? "minecraft:gold_ingot" : "minecraft:iron_bars"))
    .button("\u00a77< Geri")
    .show(p).then(r => {
      if (r.canceled || r.selection === 2) return sistemUrunler(p, idx, durum);

      if (r.selection === 0) {
        if (elde <= 0) return sistemUrunler(p, idx, durum);
        return sistemMiktar(p, "\u00a7lKA\u00c7 ADET SATACAKSIN?", elde, adet => {
          const sonuc = satTip(p, id, adet);
          if (sonuc.satilan <= 0) { p.sendMessage("\u00a7c[Market] E\u015fyalar al\u0131namad\u0131."); return sistemUrunler(p, idx, durum); }
          const kazanc = sonuc.kazanc;
          paraEkle(p, kazanc);
          gecmiseEkle(id, kazanc, sonuc.satilan);
          Seviye.xpVer(p, Seviye.xpSatistan(kazanc));
          ses(p, "random.orb");
          const fark = kazanc !== sonuc.satilan * fi.alis ? " \u00a78(b\u00fcy\u00fc/hasar dahil)" : "";
          msj(p, T("\u00a7a[Market] \u00a7f"), adParca(id), T(` \u00a77x${sonuc.satilan} sat\u0131ld\u0131 \u00a7a+${fmt(kazanc)}${fark}`));
          sistemUrunler(p, idx, durum);
        });
      }

      if (!seviyeDurum.olur) {
        p.sendMessage(`\u00a7c[Market] Bu e\u015fya i\u00e7in §fTicaret Lv ${seviyeDurum.gerekli}§c gerekiyor. §7(Sende Lv ${seviyeDurum.seviye})`);
        p.sendMessage("\u00a77Markete e\u015fya satarak XP kazan\u0131rs\u0131n. §f!seviye");
        return sistemUrunler(p, idx, durum);
      }
      if (alabilir <= 0) return sistemUrunler(p, idx, durum);
      sistemMiktar(p, "\u00a7lKA\u00c7 ADET ALACAKSIN?", Math.min(alabilir, 640), adet => {
        const tutar = adet * fi.satis;
        if (paraOku(p) < tutar) { p.sendMessage("\u00a7c[Market] Yeterli paran yok."); return sistemUrunler(p, idx, durum); }
        paraEkle(p, -tutar);
        const verilen = guvenliVer(p, id, adet);
        if (verilen < adet) {
          const iade = (adet - verilen) * fi.satis;
          paraEkle(p, iade);
          p.sendMessage(`\u00a7e[Market] Sadece \u00a7f${verilen}\u00a7e adet s\u0131\u011fd\u0131, \u00a7a${fmt(iade)} \u00a7eiade edildi.`);
        }
        if (verilen === 0) return sistemUrunler(p, idx, durum);
        Seviye.xpVer(p, Seviye.xpAlistan(verilen * fi.satis));
        ses(p, "random.levelup");
        msj(p, T("\u00a7a[Market] \u00a7f"), adParca(id), T(` \u00a77x${verilen} al\u0131nd\u0131 \u00a7c-${fmt(verilen * fi.satis)}`));
        sistemUrunler(p, idx, durum);
      });
    });
}

function sistemMiktar(p, baslik, enFazla, geriCagir) {
  const f = new ModalFormData().title(baslik);
  const sliderVar = adetSlider(f, `Adet (en fazla ${enFazla})`, enFazla);
  if (!sliderVar) f.textField(`Adet (en fazla ${enFazla})`, "sadece rakam", { defaultValue: "1" });
  f.show(p).then(r => {
    if (r.canceled) return;
    const adet = sliderVar ? Math.floor(r.formValues[0]) : sayiOku(r.formValues[0]);
    if (!Number.isFinite(adet) || adet < 1 || adet > enFazla) return p.sendMessage(`\u00a7c[Market] Adet 1 - ${enFazla} aras\u0131 olmal\u0131.`);
    geriCagir(adet);
  });
}

function topluSat(p) {
  const c = kap(p);
  if (!c) return;
  const bulunan = new Map();   // typeId -> {adet, deger}
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it || ozelEsya(it)) continue;
    if (!fiyat(it.typeId)) continue;
    const v = bulunan.get(it.typeId) ?? { adet: 0, deger: 0 };
    v.adet += it.amount;
    v.deger += esyaDegeri(it) * it.amount;   // her yigin kendi degerinden
    bulunan.set(it.typeId, v);
  }
  if (bulunan.size === 0) {
    new ActionFormData().title("\u00a7lTOPLU SATI\u015e").body("\u00a77Envanterinde sat\u0131labilir bir \u015fey yok.")
      .button("\u00a77< Geri").show(p).then(r => { if (!r.canceled) sistemKategoriler(p); });
    return;
  }
  let toplam = 0;
  const satirlar = [];
  const sirali = [...bulunan.entries()].sort((a, b) => b[1].deger - a[1].deger);
  for (const [id, v] of sirali.slice(0, 25))
    satirlar.push(T("\u00a77- \u00a7f"), adParca(id), T(` \u00a77x${v.adet} \u00a78= \u00a7a${fmt(Math.round(v.deger))}\n`));
  for (const [, v] of sirali) toplam += v.deger;
  toplam = Math.round(toplam);

  new ActionFormData()
    .title("\u00a7lTOPLU SATI\u015e")
    .body(raw(
      T(`\u00a77Envanterindeki \u00a7f${bulunan.size}\u00a77 t\u00fcr e\u015fya sat\u0131lacak:\n\n`), satirlar,
      T(sirali.length > 25 ? `\u00a78... ve ${sirali.length - 25} t\u00fcr daha\n` : ""),
      T(`\n\u00a77Toplam: \u00a7a${fmt(toplam)}`)
    ))
    .button("\u00a7aHEPS\u0130N\u0130 SAT", ikonGuvenli("minecraft:hopper"))
    .button("\u00a77Vazge\u00e7")
    .show(p).then(r => {
      if (r.canceled || r.selection !== 0) return sistemKategoriler(p);
      let kazanilan = 0;
      for (const [id, v] of bulunan) {
        const sonuc = satTip(p, id, v.adet);
        if (sonuc.satilan <= 0) continue;
        kazanilan += sonuc.kazanc;
        gecmiseEkle(id, sonuc.kazanc, sonuc.satilan);
      }
      paraEkle(p, kazanilan);
      Seviye.xpVer(p, Seviye.xpSatistan(kazanilan));
      ses(p, "random.levelup");
      p.sendMessage(`\u00a7a[Market] \u00a7fToplu sat\u0131\u015f tamam: \u00a7a+${fmt(kazanilan)}`);
      sistemKategoriler(p);
    });
}

// Arsa modulunun ihtiyac duydugu kopru
const API = {
  yukle, kaydet, paraOku, paraEkle, fmt, adminMi, sopaVer,
  esyaVer: envantereVer,
  simge: CFG.simge,
  anaMenu: (p) => kitapMenu(p)
};

// ==================== OLAYLAR ====================
function guvenli(etiketAdi, fn) {
  try { fn(); console.warn(`[Market] ${etiketAdi} aktif.`); }
  catch (e) { console.warn(`[Market] ${etiketAdi} YUKLENEMEDI: ${e}`); }
}

guvenli("itemUse (kitap)", () => {
  world.afterEvents.itemUse.subscribe(ev => {
    if (!kitapMi(ev.itemStack)) return;
    const p = ev.source;
    system.run(() => { try { kitapMenu(p); } catch (e) { p.sendMessage(`§c[Market] Hata: ${e}`); } });
  });
});
guvenli("chatSend (!komutlar)", () => {
  world.beforeEvents.chatSend.subscribe(ev => {
    const msg = ev.message.trim();
    if (!msg.startsWith("!")) return;
    ev.cancel = true;
    const parca = msg.slice(1).split(/\s+/).filter(Boolean);
    const p = ev.sender;
    system.run(() => { try { calistir(p, (parca[0] ?? "").toLowerCase(), parca.slice(1)); } catch (e) { p.sendMessage(`§c[Market] Hata: ${e}`); } });
  });
});
guvenli("scriptEvent yedegi", () => {
  system.afterEvents.scriptEventReceive.subscribe(ev => {
    if (!ev.id.startsWith("mk:")) return;
    const p = ev.sourceEntity;
    if (p?.typeId !== "minecraft:player") return;
    const arg = (ev.message ?? "").split(/\s+/).filter(Boolean);
    system.run(() => { try { calistir(p, ev.id.slice(3).toLowerCase(), arg); } catch (e) { p.sendMessage(`§c[Market] Hata: ${e}`); } });
  });
});
guvenli("slash komutlari", () => {
  system.beforeEvents.startup.subscribe(ev => {
    const reg = ev.customCommandRegistry;
    if (!reg) return;
    const TP = mc.CustomCommandParamType, S = mc.CustomCommandStatus, L = mc.CommandPermissionLevel;
    const oyuncu = (o) => (o.sourceEntity?.typeId === "minecraft:player" ? o.sourceEntity : undefined);
    const kayit = (isim, aciklama, fn, zorunlu = []) => {
      reg.registerCommand(
        { name: `${CFG.ad}:${isim}`, description: aciklama, permissionLevel: L.Any, mandatoryParameters: zorunlu },
        (o, ...a) => {
          const p = oyuncu(o);
          if (!p) return { status: S.Failure, message: "Sadece oyuncu kullanabilir." };
          system.run(() => fn(p, ...a));
          return { status: S.Success };
        });
    };
    kayit("menu", "Kontrol menusu", (p) => kitapMenu(p));
    kayit("market", "Marketi ac", (p) => marketEkrani(p, { sayfa: 0 }));
    kayit("sat", "Elindekini paraya sat", (p, a, f) => calistir(p, "sat", [String(a), String(f)]),
      [{ name: "adet", type: TP.Integer }, { name: "fiyat", type: TP.Integer }]);
    kayit("takas", "Markete takas koy", (p) => calistir(p, "takas", []));
    kayit("alim", "Alim ilani ver", (p) => alimIlani(p));
    kayit("rehber", "Fiyat rehberi", (p) => rehberSec(p));
    kayit("teklif", "Kisiye takas teklifi", (p) => kisiSec(p));
    kayit("teklifler", "Gelen teklifler", (p) => gelenTeklifler(p));
    kayit("para", "Para / esya gonder", (p) => paraMenu(p));
    kayit("kitap", "Kontrol kitabini al", (p) => kitapVer(p));
    kayit("id", "Elindeki esyanin id'si", (p) => calistir(p, "id", []));
  });
});

// ==================== OYUNCU HAZIRLIGI ====================
const hazirlananlar = new Set();
function oyuncuyuHazirla(p) {
  if (!p?.isValid) return;
  if (Dovus.dovustaMi(p.name)) return;   // duelloda envantere karisma

  // Duello ortasinda cikmissa once esyalarini iade et, sonra normal hazirlik
  try { Dovus.girisKontrol(API, p); } catch (e) { console.warn("[Market] duello iade: " + e); }
  let mevcut;
  try { mevcut = obj().getScore(p); } catch { mevcut = undefined; }
  if (mevcut === undefined) {
    paraYaz(p, CFG.baslangicParasi);
    p.sendMessage(`§a[Market] §fHosgeldin! Baslangic paran: §a${fmt(CFG.baslangicParasi)}`);
  }
  if (CFG.kitapGirisinde && !kitabiVarMi(p)) {
    envantereVer(p, kitapYap());
    p.sendMessage("§a[Market] §fKontrol kitabi envanterine kondu.");
  }
  if (hazirlananlar.has(p.id)) return;
  hazirlananlar.add(p.id);


  const bp = yukle(K_PARA_BEKLEYEN, {});
  if (bp[p.name]) {
    const t = bp[p.name]; delete bp[p.name]; kaydet(K_PARA_BEKLEYEN, bp);
    paraEkle(p, t);
    p.sendMessage(`§a[Market] §fBekleyen odemen: §a+${fmt(t)}`);
  }
  const be = yukle(K_ESYA_BEKLEYEN, {});
  if (be[p.name]?.length) {
    const l = be[p.name]; delete be[p.name]; kaydet(K_ESYA_BEKLEYEN, be);
    for (const d of l) envantereVer(p, ac(d));
    p.sendMessage(`§a[Market] §fBekleyen §e${l.length} paket §fesya teslim edildi.`);
  }
}

guvenli("arsa korumasi", () => Arsa.arsaKur(API));

guvenli("duello olum kontrolu", () => {
  world.afterEvents.entityDie.subscribe(ev => {
    const e = ev.deadEntity;
    if (e?.typeId !== "minecraft:player") return;
    system.run(() => { try { Dovus.olumKontrol(e.name); } catch (er) { console.warn("[Market] duello olum: " + er); } });
  });
});

guvenli("playerSpawn", () => {
  world.afterEvents.playerSpawn.subscribe(ev => {
    if (!ev.initialSpawn) return;
    system.run(() => { try { oyuncuyuHazirla(ev.player); } catch (e) { console.warn("[Market] hazirlik: " + e); } });
  });
});

let sayac = 0;
guvenli("dongu kontrolu", () => {
  // 20 tik = ~1 sn. Arsa giris/cikis bildirimi eskiden 5 saniyede bir
  // bakiliyordu; oyuncu arsaya girip cikinca hicbir sey gormuyordu.
  system.runInterval(() => {
    sayac++;
    const oyuncular = world.getAllPlayers();
    for (const p of oyuncular) {
      if (Dovus.dovustaMi(p.name)) continue;
      try { Arsa.arsaTick(API, p); } catch { }
    }
    if (sayac % 5 === 0) for (const p of oyuncular) { try { oyuncuyuHazirla(p); } catch { } }
    if (sayac % 150 === 0) { try { suresiDolanlariIsle(); } catch (e) { console.warn("[Market] sure: " + e); } }
  }, 20);
});

// Esya listesini dunya acilir acilmaz arka planda kur: oyuncu menuyu actiginda
// hazir olsun, ilk acilista donma olmasin.
guvenli("esya listesi", () => {
  system.run(() => { try { listeyiKur(true); } catch (e) { console.warn("[Market] liste kurulamadi: " + e); } });
});

console.warn(`[Market] Script yuklendi. Surum ${CFG.surum}`);
