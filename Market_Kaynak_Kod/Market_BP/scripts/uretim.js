// ============ TOPLU URETIM (v4.8) ============
// Minecraft'ta 64 tane bir sey craftlamak icin sonuc yuvasina basili
// tutup beklemek gerekiyor. Burada tek tikla istedigin adedi uretiyorsun -
// ama teker teker uretmek de duruyor, secim senin.
//
// ONEMLI: vanilla craft masasi arayuzune DOKUNULMUYOR. Bir behavior pack
// o ekrana dugme ekleyemez (oyunun kendi arayuzu, script erisimi yok).
// Onun yerine ayni bloga EGILEREK sag tiklayinca miktar secme ekrani
// aciliyor. Normal sag tik eskisi gibi craft masasini aciyor.
//
// Tarifler Mojang'in kendi tarif dosyalarindan geliyor (tarifler.js),
// yani burada uretilen hicbir sey oyunda uretilemeyecek bir sey degil.

import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
import { TARIFLER, ETIKETLER, TARIF_SAYISI } from "./tarifler.js";
const { world, system } = mc;

export const URETIM_CFG = {
  acik: true,
  masalar: ["minecraft:crafting_table", "minecraft:cartography_table",
            "minecraft:smithing_table", "minecraft:loom"],
  enFazla: 2304,        // tek seferde uretilebilecek en fazla adet (36 yigin)
  sayfa: 40,
  bekleme: 250
};

const HIZLI = [1, 8, 16, 32, 64];   // miktar ekranindaki hazir dugmeler

// ---- Envanter yardimcilari ----
function kap(p) { try { return p.getComponent("minecraft:inventory")?.container; } catch { return undefined; } }

function sayim(c) {
  const m = new Map();
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it) continue;
    m.set(it.typeId, (m.get(it.typeId) ?? 0) + it.amount);
  }
  return m;
}

// Bir girdinin kabul ettigi id'ler: etiketse tum uyeleri, degilse kendisi.
function adaylar(girdi) {
  return girdi.startsWith("@") ? (ETIKETLER[girdi] ?? []) : [girdi];
}

// Bu tariften eldeki malzemeyle EN FAZLA kac kere yapilabilir?
export function kacKere(tarif, eldeki) {
  let en = Infinity;
  for (const [girdi, adet] of tarif.g) {
    let var_ = 0;
    for (const a of adaylar(girdi)) var_ += eldeki.get(a) ?? 0;
    en = Math.min(en, Math.floor(var_ / adet));
    if (en <= 0) return 0;
  }
  return Number.isFinite(en) ? en : 0;
}

// Su an yapilabilecek tarifler: [{ id, tarif, kere, uretilen }]
export function yapilabilirler(p) {
  const c = kap(p);
  if (!c) return [];
  const eldeki = sayim(c);
  const out = [];
  for (const [id, liste] of TARIFLER) {
    for (const tarif of liste) {
      const kere = kacKere(tarif, eldeki);
      if (kere > 0) out.push({ id, tarif, kere, uretilen: kere * tarif.n });
    }
  }
  out.sort((a, b) => b.uretilen - a.uretilen);
  return out;
}

// Envanterden `adet` kadar girdiyi GERCEKTEN dusurur.
// Doner: dusurulebildi mi. Kismi dusum birakmaz (once sayar, sonra siler).
function girdiyiAl(c, girdi, adet) {
  const kabul = adaylar(girdi);
  let kalan = adet;
  for (let i = 0; i < c.size && kalan > 0; i++) {
    const it = c.getItem(i);
    if (!it || !kabul.includes(it.typeId)) continue;
    const al = Math.min(it.amount, kalan);
    if (al >= it.amount) c.setItem(i, undefined);
    else { it.amount -= al; c.setItem(i, it); }
    kalan -= al;
  }
  return kalan === 0;
}

// Envanterde bu esyadan kac tane daha durabilir? (malzeme dusmeden ONCE
// bakiyoruz, yani AZ tahmin ediyoruz - fazla tahmin esya kaybettirir.)
function bosYer(c, typeId, enFazlaYigin) {
  let yer = 0;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it) yer += enFazlaYigin;
    else if (it.typeId === typeId) yer += Math.max(0, enFazlaYigin - it.amount);
  }
  return yer;
}

// `kere` kere uretir. Doner: { uretilen, kere, sigmayan }
export function uret(p, id, tarif, kere) {
  const c = kap(p);
  if (!c) return { uretilen: 0, kere: 0, sigmayan: 0 };
  const eldeki = sayim(c);
  kere = Math.max(0, Math.min(kere, kacKere(tarif, eldeki)));
  // ENVANTERE SIGACAK KADAR uret. Eskiden malzeme dusuruluyor, cikti
  // sigmayinca da iade edilmeye calisiliyordu - ama envanter zaten dolu
  // oldugu icin iade de sigmiyor ve malzeme YOK OLUYORDU.
  // Test: 34 yuva dolu + 64 kutuk -> 128 kalas urettik, 32 kutuk buhar oldu.
  let enFazlaYigin = 64;
  try { enFazlaYigin = new mc.ItemStack(id, 1).maxAmount || 64; } catch { }
  const yer = bosYer(c, id, enFazlaYigin);
  kere = Math.min(kere, Math.floor(yer / tarif.n));
  if (kere <= 0) return { uretilen: 0, kere: 0, sigmayan: 0, yerYok: yer < tarif.n };

  // Once malzemeyi dusur. Bir girdi dusurulemezse (olmamali, saydik) dur.
  for (const [girdi, adet] of tarif.g) {
    if (!girdiyiAl(c, girdi, adet * kere)) {
      console.warn(`[Üretim] ${girdi} dusurulemedi - uretim iptal`);
      return { uretilen: 0, kere: 0, sigmayan: 0, hata: true };
    }
  }

  // Sonra ciktiyi ver. Yukarida yere gore kirptigimiz icin hepsi sigmali.
  const toplam = kere * tarif.n;
  let verilen = 0;
  let kalan = toplam;
  while (kalan > 0) {
    const par = Math.min(kalan, enFazlaYigin);
    let yigin;
    try { yigin = new mc.ItemStack(id, par); } catch { break; }
    let artan;
    try { artan = c.addItem(yigin); } catch { artan = yigin; }
    const kondu = par - (artan?.amount ?? 0);
    verilen += kondu;
    if (artan) break;              // envanter doldu
    kalan -= par;
  }

  // Olmamasi gereken artik: yere birak, esya kaybolmasin.
  const sigmayan = toplam - verilen;
  if (sigmayan > 0) {
    let n = sigmayan;
    while (n > 0) {
      const par = Math.min(n, enFazlaYigin);
      try { p.dimension.spawnItem(new mc.ItemStack(id, par), p.location); } catch { }
      n -= par;
    }
  }
  return { uretilen: verilen, kere, sigmayan };
}

// ---- Ekranlar ----
let api = null;
const okunur = (id) => String(id).replace(/^minecraft:/, "").replace(/^mk:/, "").replace(/_/g, " ");
const ad = (id) => api?.adParca ? api.adParca(id) : { text: okunur(id) };
const raw = (...p) => ({ rawtext: p.flat() });
const T = (s) => ({ text: s });

export function ekran(p, apiRef, d = {}) {
  if (apiRef) api = apiRef;
  const durum = { sayfa: 0, arama: "", ...d };
  let liste = yapilabilirler(p);
  if (durum.arama) {
    const k = durum.arama.toLowerCase();
    liste = liste.filter(x => okunur(x.id).toLowerCase().includes(k));
  }

  if (!liste.length) {
    new ui.ActionFormData().title("§lTOPLU ÜRETİM")
      .body(durum.arama
        ? `§7"§f${durum.arama}§7" için üretilebilir bir şey yok.`
        : "§7Şu an envanterinle üretebileceğin bir şey yok.\n§8Malzeme topla, sonra tekrar gel.")
      .button("§eAra").button("§7< Geri")
      .show(p).then(r => {
        if (r.canceled) return;
        if (r.selection === 0) return arama(p, durum);
        api?.anaMenu?.(p);
      });
    return;
  }

  const toplamSayfa = Math.ceil(liste.length / URETIM_CFG.sayfa);
  const sayfa = Math.max(0, Math.min(durum.sayfa, toplamSayfa - 1));
  const dilim = liste.slice(sayfa * URETIM_CFG.sayfa, (sayfa + 1) * URETIM_CFG.sayfa);

  const f = new ui.ActionFormData()
    .title(`§lTOPLU ÜRETİM §7(${sayfa + 1}/${toplamSayfa})`)
    .body(`§7Elindeki malzemeyle §f${liste.length}§7 çeşit üretebilirsin.\n`
      + "§8Seç → miktarı seç → tek tıkla üret.");
  for (const x of dilim) {
    f.button(raw(ad(x.id), T(`\n§8en fazla §a${x.uretilen}§8 adet`)), ikon(x.id));
  }
  const ek = [];
  if (sayfa > 0) { f.button("§7<< Önceki"); ek.push("onceki"); }
  if (sayfa < toplamSayfa - 1) { f.button("§7Sonraki >>"); ek.push("sonraki"); }
  f.button(`§eAra §8(${durum.arama || "-"})`); ek.push("ara");
  f.button("§7< Geri"); ek.push("geri");

  f.show(p).then(r => {
    if (r.canceled) return;
    if (r.selection < dilim.length) return miktar(p, dilim[r.selection], { ...durum, sayfa });
    switch (ek[r.selection - dilim.length]) {
      case "onceki": return ekran(p, null, { ...durum, sayfa: sayfa - 1 });
      case "sonraki": return ekran(p, null, { ...durum, sayfa: sayfa + 1 });
      case "ara": return arama(p, durum);
      default: return api?.anaMenu?.(p);
    }
  });
}

function ikon(id) {
  try { return api?.ikon ? api.ikon(id) : undefined; } catch { return undefined; }
}

function arama(p, durum) {
  const f = new ui.ModalFormData().title("§lÜRÜN ARA");
  f.textField("Ne üretmek istiyorsun?", "örn: kalas, çubuk, merdiven",
    { defaultValue: durum.arama ?? "" });
  f.show(p).then(r => {
    if (r.canceled) return ekran(p, null, durum);
    ekran(p, null, { arama: String(r.formValues[0] ?? "").trim(), sayfa: 0 });
  });
}

// Miktar ekrani: hazir dugmeler + "hepsi" + serbest sayi.
function miktar(p, secim, durum) {
  const { id, tarif } = secim;
  const eldeki = sayim(kap(p));
  const kere = kacKere(tarif, eldeki);
  let yigin = 64;
  try { yigin = new mc.ItemStack(id, 1).maxAmount || 64; } catch { }
  const yer = bosYer(kap(p), id, yigin);
  const enCok = Math.min(kere * tarif.n, Math.floor(yer / tarif.n) * tarif.n, URETIM_CFG.enFazla);

  const malzeme = tarif.g
    .map(([g, n]) => `§8${n}x §7${g.startsWith("@") ? etiketAdi(g) : okunur(g)}`)
    .join("  §8+  ");

  const f = new ui.ActionFormData()
    .title("§lKAÇ TANE?")
    .body(raw(
      ad(id),
      T(`\n\n§7Tarif: §f1 seferde ${tarif.n} adet\n${malzeme}\n\n`),
      T(`§7Malzemen yeter: §a${kere * tarif.n}§7 adete kadar`),
      T(enCok < kere * tarif.n ? `\n§eEnvanterine §f${enCok}§e tanesi sığıyor` : "")
    ));
  const islem = [];
  // Tarifin verdigi adedin katlari: 4'luk tarifte 1 degil 4 mantikli.
  const secenekler = [...new Set([tarif.n, ...HIZLI.filter(x => x >= tarif.n)])]
    .filter(x => x <= enCok).sort((a, b) => a - b);
  for (const n of secenekler) {
    f.button(`§f${n} adet`);
    islem.push(() => yap(p, secim, n, durum));
  }
  if (enCok > 0 && !secenekler.includes(enCok)) {
    f.button(`§a§lHEPSİ §r§a(${enCok})`);
    islem.push(() => yap(p, secim, enCok, durum));
  }
  f.button("§eBaşka bir sayı...");
  islem.push(() => serbest(p, secim, enCok, durum));
  f.button("§7< Geri");
  islem.push(() => ekran(p, null, durum));
  f.show(p).then(r => { if (!r.canceled) islem[r.selection]?.(); });
}

function etiketAdi(g) {
  return { "@planks": "kalas (herhangi)", "@logs": "kütük (herhangi)",
           "@wooden_slab": "ahşap yarım blok", "@coals": "kömür/odun kömürü",
           "@wool": "yün (herhangi renk)", "@stone": "taş (cobble/blackstone/deepslate)" }[g] ?? g;
}

function serbest(p, secim, enCok, durum) {
  const f = new ui.ModalFormData().title("§lKAÇ TANE?");
  f.textField(`Adet (en fazla ${enCok})`, "sadece rakam", { defaultValue: String(Math.min(64, enCok)) });
  f.show(p).then(r => {
    if (r.canceled) return miktar(p, secim, durum);
    const n = Math.floor(Number(String(r.formValues[0] ?? "").replace(/[^0-9]/g, "")));
    if (!Number.isFinite(n) || n < 1) return p.sendMessage("§c[Üretim] Geçerli bir sayı yaz.");
    yap(p, secim, Math.min(n, enCok), durum);
  });
}

function yap(p, secim, istenen, durum) {
  const { id, tarif } = secim;
  // Tarif 4'erli veriyorsa 7 adet istenince 8 uretilir (2 kere).
  const kere = Math.max(1, Math.ceil(istenen / tarif.n));
  const sonuc = uret(p, id, tarif, kere);
  if (sonuc.hata) { p.sendMessage("§c[Üretim] Malzeme alınamadı, hiçbir şey değişmedi."); return ekran(p, null, durum); }
  if (sonuc.uretilen <= 0) {
    p.sendMessage(sonuc.yerYok
      ? "§c[Üretim] Envanterinde yer yok."
      : "§c[Üretim] Malzemen yetmiyor.");
    return ekran(p, null, durum);
  }
  try { p.playSound("random.pop"); } catch { }
  const mesaj = [T("§a[Üretim] §f"), ad(id), T(` §7x${sonuc.uretilen} üretildi`)];
  if (sonuc.sigmayan > 0) mesaj.push(T(` §e(${sonuc.sigmayan} sığmadı, yere bırakıldı)`));
  try { p.sendMessage(raw(mesaj)); } catch { }
  ekran(p, null, durum);
}

// ---- Kurulum ----
const sonTik = new Map();

export function kur(apiRef) {
  api = apiRef;
  if (!URETIM_CFG.acik) return;
  // Craft masasina EGILEREK sag tik -> miktar ekrani.
  // Egilmeden sag tik oyunun kendi craft masasini aciyor; ona dokunmuyoruz.
  world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    const p = ev.player, b = ev.block;
    if (!p || !b || !p.isSneaking) return;
    if (!URETIM_CFG.masalar.includes(b.typeId)) return;
    if (ev.itemStack) return;               // elinde bir sey varsa karisma (blok koyma vs.)
    const simdi = Date.now();
    if (simdi - (sonTik.get(p.id) ?? 0) < URETIM_CFG.bekleme) { ev.cancel = true; return; }
    sonTik.set(p.id, simdi);
    ev.cancel = true;
    system.run(() => { try { ekran(p, api); } catch (e) { console.warn("[Üretim] " + e); } });
  });
  console.warn(`[Üretim] Toplu üretim aktif (${TARIF_SAYISI} tarif). Craft masasına eğilip sağ tık.`);
}

export function rapor(p) {
  const liste = yapilabilirler(p);
  const satir = [`§6Toplu Üretim §7- ${TARIF_SAYISI} tarif`,
                 `§7Şu an üretebileceğin: §f${liste.length}§7 çeşit`];
  for (const x of liste.slice(0, 5)) satir.push(`§8- §f${okunur(x.id)} §7x${x.uretilen}`);
  satir.push("§8Craft masasına eğilip sağ tık, ya da §f!uret");
  return satir;
}
