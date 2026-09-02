import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

const { world, system } = mc;
const { ActionFormData, ModalFormData } = ui;

export const ARSA_CFG = {
  anahtar: "mk_arsa",
  birimFiyat: 2,        // blok basina fiyat (alan * bu)
  maxKenar: 128,        // tek kenar en fazla
  minKenar: 5,
  maxArsaOyuncu: 3,
  iadeOrani: 0.5,       // arsa silinince paranin yarisi geri
  girisBildirimi: true
};

const kose = new Map();      // oyuncu.id -> {x,z,d}
const sonBolge = new Map();  // oyuncu.id -> arsa id / "yok"

// ---- veri ----
function arsalar(api) { return api.yukle(ARSA_CFG.anahtar, []); }
function arsalariYaz(api, v) { api.kaydet(ARSA_CFG.anahtar, v); }

function icinde(a, d, x, z) {
  return a.d === d && x >= a.x1 && x <= a.x2 && z >= a.z1 && z <= a.z2;
}
export function arsaBul(api, d, x, z) {
  return arsalar(api).find(a => icinde(a, d, Math.floor(x), Math.floor(z)));
}
function yetkili(a, ad) { return a.s === ad || (a.u ?? []).includes(ad); }
function alan(a) { return (a.x2 - a.x1 + 1) * (a.z2 - a.z1 + 1); }
function cakisiyorMu(api, d, x1, z1, x2, z2, hariçId) {
  return arsalar(api).some(a =>
    a.d === d && a.id !== hariçId &&
    !(x2 < a.x1 || x1 > a.x2 || z2 < a.z1 || z1 > a.z2));
}

// ---- koruma ----
function korumaKontrol(api, player, blok) {
  if (!player || !blok) return true;
  const a = arsaBul(api, blok.dimension.id, blok.location.x, blok.location.z);
  if (!a) return true;
  if (yetkili(a, player.name)) return true;
  if (api.adminMi(player)) return true;
  return false;
}

export function arsaKur(api) {
  const engelle = (ev, tip) => {
    const p = ev.player ?? ev.source;
    if (korumaKontrol(api, p, ev.block)) return;
    ev.cancel = true;
    const a = arsaBul(api, ev.block.dimension.id, ev.block.location.x, ev.block.location.z);
    system.run(() => {
      try {
        p.onScreenDisplay.setActionBar(`§c${a.ad} §7arsasinda ${tip} yapamazsin §8(${a.s})`);
        p.playSound("note.bass");
      } catch { }
    });
  };

  try {
    world.beforeEvents.playerBreakBlock.subscribe(ev => engelle(ev, "kirma"));
    console.warn("[Arsa] kirma korumasi aktif.");
  } catch (e) { console.warn("[Arsa] kirma korumasi yok: " + e); }

  try {
    world.beforeEvents.playerPlaceBlock.subscribe(ev => engelle(ev, "insaat"));
    console.warn("[Arsa] koyma korumasi aktif.");
  } catch (e) { console.warn("[Arsa] koyma korumasi yok: " + e); }

  try {
    world.beforeEvents.playerInteractWithBlock.subscribe(ev => engelle(ev, "etkilesim"));
    console.warn("[Arsa] etkilesim korumasi aktif.");
  } catch (e) { console.warn("[Arsa] etkilesim korumasi yok: " + e); }

  try {
    world.beforeEvents.explosion.subscribe(ev => {
      const bloklar = ev.getImpactedBlocks();
      const kalan = bloklar.filter(b => !arsaBul(api, b.dimension.id, b.location.x, b.location.z));
      if (kalan.length !== bloklar.length) ev.setImpactedBlocks(kalan);
    });
    console.warn("[Arsa] patlama korumasi aktif.");
  } catch (e) { console.warn("[Arsa] patlama korumasi yok: " + e); }
}

// Her donguden cagirilir: arsaya girip cikinca bildirim
export function arsaTick(api, p) {
  if (!ARSA_CFG.girisBildirimi) return;
  const a = arsaBul(api, p.dimension.id, p.location.x, p.location.z);
  const simdi = a ? a.id : "yok";
  if (sonBolge.get(p.id) === simdi) return;
  sonBolge.set(p.id, simdi);
  try {
    if (a) p.onScreenDisplay.setActionBar(`§e${a.ad} §7arsasina girdin §8(${a.s})`);
    else p.onScreenDisplay.setActionBar("§7Serbest bolge");
  } catch { }
}

// ==================== MENULER ====================
export function arsaMenu(p, api) {
  const hepsi = arsalar(api);
  const benim = hepsi.filter(a => a.s === p.name);
  const k = kose.get(p.id);
  const burada = arsaBul(api, p.dimension.id, p.location.x, p.location.z);

  new ActionFormData()
    .title("§lARSA / BÖLGE")
    .body(
      `§7Bakiyen: §a${api.fmt(api.paraOku(p))}\n` +
      `§7Arsan: §f${benim.length}§7 / ${ARSA_CFG.maxArsaOyuncu}\n` +
      `§7Buradasın: §f${burada ? `${burada.ad} (${burada.s})` : "serbest bölge"}\n` +
      `§7Köşe 1: §f${k ? `${k.x}, ${k.z}` : "seçilmedi"}\n` +
      `§7Fiyat: §f${ARSA_CFG.birimFiyat}${api.simge}/blok`
    )
    .button("§lKöşe 1'i Buraya Koy\n§r§7Durduğun noktayı işaretle", "textures/items/wooden_shovel")
    .button("§lKöşe 2 + Arsayı Satın Al\n§r§7Alanı tamamla ve öde", "textures/items/gold_ingot")
    .button("§lArsalarım\n§r§7Üye ekle, sil, bilgi", "textures/items/book_normal")
    .button("§lBurası Kimin?\n§r§7Bulunduğun bölgeyi sorgula", "textures/items/compass_item")
    .button("§7< Geri")
    .show(p).then(r => {
      if (r.canceled) return;
      switch (r.selection) {
        case 0: {
          kose.set(p.id, { x: Math.floor(p.location.x), z: Math.floor(p.location.z), d: p.dimension.id });
          p.sendMessage(`§a[Arsa] §fKöşe 1: §e${Math.floor(p.location.x)}, ${Math.floor(p.location.z)}`);
          p.sendMessage("§7Şimdi diğer köşeye yürü ve 'Köşe 2 + Satın Al' de.");
          try { p.playSound("random.orb"); } catch { }
          return arsaMenu(p, api);
        }
        case 1: return arsaSatinAl(p, api);
        case 2: return arsalarimMenu(p, api);
        case 3: {
          if (burada) {
            p.sendMessage(`§e[Arsa] §fBurası: §e${burada.ad}`);
            p.sendMessage(`§7Sahibi: §f${burada.s}  §7Üyeler: §f${(burada.u ?? []).join(", ") || "yok"}`);
            p.sendMessage(`§7Sınırlar: §f${burada.x1},${burada.z1} §7- §f${burada.x2},${burada.z2}`);
          } else p.sendMessage("§7[Arsa] Burası serbest bölge, sahibi yok.");
          return arsaMenu(p, api);
        }
        default: return api.anaMenu(p);
      }
    });
}

function arsaSatinAl(p, api) {
  const k = kose.get(p.id);
  if (!k) { p.sendMessage("§c[Arsa] Önce Köşe 1'i koymalısın."); return arsaMenu(p, api); }
  if (k.d !== p.dimension.id) { p.sendMessage("§c[Arsa] Köşe 1 başka bir boyutta."); return arsaMenu(p, api); }

  const x1 = Math.min(k.x, Math.floor(p.location.x));
  const x2 = Math.max(k.x, Math.floor(p.location.x));
  const z1 = Math.min(k.z, Math.floor(p.location.z));
  const z2 = Math.max(k.z, Math.floor(p.location.z));
  const en = x2 - x1 + 1, boy = z2 - z1 + 1;

  if (en < ARSA_CFG.minKenar || boy < ARSA_CFG.minKenar)
    { p.sendMessage(`§c[Arsa] En küçük arsa ${ARSA_CFG.minKenar}x${ARSA_CFG.minKenar} olmalı. (şu an ${en}x${boy})`); return arsaMenu(p, api); }
  if (en > ARSA_CFG.maxKenar || boy > ARSA_CFG.maxKenar)
    { p.sendMessage(`§c[Arsa] Tek kenar en fazla ${ARSA_CFG.maxKenar} olabilir. (şu an ${en}x${boy})`); return arsaMenu(p, api); }

  const hepsi = arsalar(api);
  if (hepsi.filter(a => a.s === p.name).length >= ARSA_CFG.maxArsaOyuncu)
    { p.sendMessage(`§c[Arsa] En fazla ${ARSA_CFG.maxArsaOyuncu} arsan olabilir.`); return arsaMenu(p, api); }
  if (cakisiyorMu(api, p.dimension.id, x1, z1, x2, z2))
    { p.sendMessage("§c[Arsa] Bu alan başka bir arsayla çakışıyor."); return arsaMenu(p, api); }

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
          const ad = String(r2.formValues[0] ?? "").trim().slice(0, 24) || `${p.name} arsası`;
          if (cakisiyorMu(api, p.dimension.id, x1, z1, x2, z2)) { p.sendMessage("§c[Arsa] Alan bu arada kapılmış."); return arsaMenu(p, api); }
          if (api.paraOku(p) < fiyat) { p.sendMessage("§c[Arsa] Yeterli paran yok."); return arsaMenu(p, api); }

          api.paraEkle(p, -fiyat);
          const g = arsalar(api);
          g.push({ id: `a${Date.now()}${Math.floor(Math.random() * 999)}`, s: p.name, ad, d: p.dimension.id, x1, z1, x2, z2, u: [] });
          arsalariYaz(api, g);
          kose.delete(p.id);
          try { p.playSound("random.levelup"); } catch { }
          p.sendMessage(`§a[Arsa] §f"${ad}" §aalındı! §7${en}x${boy}, §a-${api.fmt(fiyat)}`);
          p.sendMessage("§7Artık bu alanda senden ve üyelerinden başkası blok kıramaz, koyamaz, sandık açamaz.");
          arsaMenu(p, api);
        });
    });
}

function arsalarimMenu(p, api) {
  const benim = arsalar(api).filter(a => a.s === p.name);
  if (benim.length === 0) {
    new ActionFormData().title("§lARSALARIM").body("§7Henüz arsan yok.")
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
      `§7Üyeler: §f${(a.u ?? []).join(", ") || "yok"}\n` +
      `§7Silersen iade: §a${api.fmt(iade)}`
    )
    .button("§aÜye Ekle", "textures/items/name_tag")
    .button("§eÜye Çıkar", "textures/items/barrier")
    .button("§eAdını Değiştir", "textures/items/book_writable")
    .button("§cArsayı Sil", "textures/blocks/tnt_side")
    .button("§7< Geri")
    .show(p).then(r => {
      if (r.canceled || r.selection === 4) return arsalarimMenu(p, api);
      if (r.selection === 0) return uyeEkle(p, api, id);
      if (r.selection === 1) return uyeCikar(p, api, id);
      if (r.selection === 2) return adDegistir(p, api, id);
      if (r.selection === 3) return arsaSil(p, api, id, iade);
    });
}

function uyeEkle(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a) return arsalarimMenu(p, api);
  const aday = world.getAllPlayers().filter(x => x.name !== p.name && !(a.u ?? []).includes(x.name));
  if (aday.length === 0) { p.sendMessage("§c[Arsa] Eklenebilecek online oyuncu yok."); return arsaYonet(p, api, id); }

  new ModalFormData().title("§lÜYE EKLE")
    .dropdown("Kimi ekleyeyim?", aday.map(x => x.name))
    .show(p).then(r => {
      if (r.canceled) return arsaYonet(p, api, id);
      const hedef = aday[r.formValues[0]];
      const g = arsalar(api);
      const t = g.find(x => x.id === id);
      if (!t) return arsalarimMenu(p, api);
      (t.u ??= []).push(hedef.name);
      arsalariYaz(api, g);
      p.sendMessage(`§a[Arsa] §f${hedef.name} §aeklendi.`);
      hedef.sendMessage(`§a[Arsa] §f${p.name} §7seni "${t.ad}" arsasına üye yaptı.`);
      arsaYonet(p, api, id);
    });
}

function uyeCikar(p, api, id) {
  const a = arsalar(api).find(x => x.id === id);
  if (!a || (a.u ?? []).length === 0) { p.sendMessage("§7[Arsa] Üye yok."); return arsaYonet(p, api, id); }
  new ModalFormData().title("§lÜYE ÇIKAR")
    .dropdown("Kimi çıkarayım?", a.u)
    .show(p).then(r => {
      if (r.canceled) return arsaYonet(p, api, id);
      const ad = a.u[r.formValues[0]];
      const g = arsalar(api);
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
      const yeni = String(r.formValues[0] ?? "").trim().slice(0, 24);
      if (!yeni) return arsaYonet(p, api, id);
      const g = arsalar(api);
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
      const g = arsalar(api);
      const ix = g.findIndex(x => x.id === id);
      if (ix === -1) return arsalarimMenu(p, api);
      const [c] = g.splice(ix, 1);
      arsalariYaz(api, g);
      api.paraEkle(p, iade);
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
    p.sendMessage(`§a[Arsa] §f${hedef.s}§7 adlı oyuncunun "${hedef.ad}" arsası silindi.`);
    arsaAdmin(p, api);
  });
}
