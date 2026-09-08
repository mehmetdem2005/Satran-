// ============ BAKIR GOLEMI HIZLANDIRICI ============
// Vanilla bakir golemi (minecraft:copper_golem) bakir sandiktan TEK yigin
// alip en yakin sandiga birakir, sonra bekler. Buyuk bir depoda bu cok
// yavas kalir.
//
// Bu modul golemi "akilli" calistirir: golemin cevresindeki bakir
// sandiklardan bir turda GOLEM_CFG.partiBoyutu kadar yigini (varsayilan 10)
// ayni anda uygun sandiklara dagitir.
//
// Vanilla davranisin aynisi korunur, sadece hizlandirilir:
//   - kaynak: bakir sandiklar (8 pas durumu)
//   - hedef : sandik, kapanli sandik, varil
//   - yerlestirme: once AYNI esyanin bulundugu sandik, yoksa bos yeri olan
//
// Mojang'in entity dosyasi DEGISTIRILMEZ. Boylece oyun surumu degisince
// golem bozulmaz; bu modul golem yoksa hicbir sey yapmaz.

import * as mc from "@minecraft/server";
const { world, system } = mc;

export const GOLEM_CFG = {
  acik: true,
  partiBoyutu: 10,      // bir turda tasinacak en fazla yigin
  yaricap: 8,           // golem cevresinde kac blok taranir (yatay)
  dikeyYaricap: 3,      // ustunde/altinda kac blok
  tikAraligi: 20,       // kac tikte bir calisir (20 tik = 1 saniye)
  taramaPeriyodu: 10,   // kac turda bir blok taramasi yenilenir
  maxGolem: 6,          // ayni turda islenecek en fazla golem
  maxKaynak: 12,        // taramada kaydedilecek en fazla bakir sandik
  maxHedef: 24,         // taramada kaydedilecek en fazla hedef sandik
  ses: true,
  arsaGuvenligi: true   // kaynak ve hedef ayni arsada olmali
};

const GOLEM_ID = "minecraft:copper_golem";

// Vanilla'nin source_container_types listesi (copper_golem.json)
const KAYNAK_BLOK = new Set([
  "minecraft:copper_chest", "minecraft:exposed_copper_chest",
  "minecraft:weathered_copper_chest", "minecraft:oxidized_copper_chest",
  "minecraft:waxed_copper_chest", "minecraft:waxed_exposed_copper_chest",
  "minecraft:waxed_weathered_copper_chest", "minecraft:waxed_oxidized_copper_chest"
]);

// Vanilla destination_container_types + varil (golem varile de koyabilsin)
const HEDEF_BLOK = new Set([
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel"
]);

// golem.id -> { tur, kaynak: [{x,y,z}], hedef: [{x,y,z}] }
const onbellek = new Map();
let tur = 0;
let dongu = null;
export const DURUM = { golem: 0, tasinan: 0, sonTur: 0, calisti: false };

function kap(boyut, k) {
  try {
    const b = boyut.getBlock(k);
    if (!b) return undefined;
    return b.getComponent("minecraft:inventory")?.container;
  } catch { return undefined; }
}

function blokTipi(boyut, k) {
  try { return boyut.getBlock(k)?.typeId; } catch { return undefined; }
}

// Golemin cevresini tarayip kaynak/hedef sandiklari bulur.
function tara(golem) {
  const boyut = golem.dimension;
  const l = golem.location;
  const mx = Math.floor(l.x), my = Math.floor(l.y), mz = Math.floor(l.z);
  const R = GOLEM_CFG.yaricap, DY = GOLEM_CFG.dikeyYaricap;
  const kaynak = [], hedef = [];

  for (let dy = -DY; dy <= DY; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        if (kaynak.length >= GOLEM_CFG.maxKaynak && hedef.length >= GOLEM_CFG.maxHedef) break;
        const k = { x: mx + dx, y: my + dy, z: mz + dz };
        const t = blokTipi(boyut, k);
        if (!t) continue;
        if (KAYNAK_BLOK.has(t)) { if (kaynak.length < GOLEM_CFG.maxKaynak) kaynak.push(k); }
        else if (HEDEF_BLOK.has(t)) { if (hedef.length < GOLEM_CFG.maxHedef) hedef.push(k); }
      }
    }
  }
  return { tur, kaynak, hedef };
}

// Hedef sandikta bu esyadan zaten var mi (ve yer var mi)?
function ayniVarMi(c, tip) {
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it && it.typeId === tip && it.amount < it.maxAmount) return true;
  }
  return false;
}
function bosYerVarMi(c) {
  try { if (typeof c.emptySlotsCount === "number") return c.emptySlotsCount > 0; } catch { }
  for (let i = 0; i < c.size; i++) if (!c.getItem(i)) return true;
  return false;
}

// Bir golem icin tek tur: en fazla partiBoyutu kadar yigin tasir.
function golemiCalistir(api, golem, yerlesim) {
  const boyut = golem.dimension;
  const arsaId = (k) => {
    if (!GOLEM_CFG.arsaGuvenligi || !api?.arsaVar) return null;
    try { return api.arsaVar(boyut.id, k.x, k.z)?.id ?? null; } catch { return null; }
  };

  let tasinan = 0;
  for (const kk of yerlesim.kaynak) {
    if (tasinan >= GOLEM_CFG.partiBoyutu) break;
    const kc = kap(boyut, kk);
    if (!kc) continue;
    const kaynakArsa = arsaId(kk);

    for (let i = 0; i < kc.size && tasinan < GOLEM_CFG.partiBoyutu; i++) {
      const yigin = kc.getItem(i);
      if (!yigin) continue;

      // 1) once ayni esyanin bulundugu sandik, 2) sonra bos yeri olan
      let kondu = false;
      for (const asama of [1, 2]) {
        for (const hk of yerlesim.hedef) {
          if (arsaId(hk) !== kaynakArsa) continue;      // arsalar arasi tasima yok
          const hc = kap(boyut, hk);
          if (!hc) continue;
          if (asama === 1 ? !ayniVarMi(hc, yigin.typeId) : !bosYerVarMi(hc)) continue;
          let artan;
          try { artan = hc.addItem(yigin); }
          catch { continue; }
          if (artan && artan.amount === yigin.amount) continue;   // hic girmedi
          try { kc.setItem(i, artan); } catch { }
          tasinan++;
          kondu = true;
          break;
        }
        if (kondu) break;
      }
    }
  }

  if (tasinan > 0 && GOLEM_CFG.ses) {
    try {
      boyut.playSound("random.pop", golem.location, { volume: 0.6, pitch: 1.4 });
      boyut.spawnParticle("minecraft:villager_happy", {
        x: golem.location.x, y: golem.location.y + 1, z: golem.location.z
      });
    } catch { }
  }
  return tasinan;
}

function golemleriBul() {
  const bulunan = [];
  const gorulen = new Set();
  for (const p of world.getAllPlayers()) {
    let liste;
    try {
      liste = p.dimension.getEntities({
        type: GOLEM_ID,
        location: p.location,
        maxDistance: 48
      });
    } catch { continue; }
    for (const g of liste) {
      if (gorulen.has(g.id)) continue;
      gorulen.add(g.id);
      bulunan.push(g);
      if (bulunan.length >= GOLEM_CFG.maxGolem) return bulunan;
    }
  }
  return bulunan;
}

function birTur(api) {
  if (!GOLEM_CFG.acik) return;
  tur++;
  const golemler = golemleriBul();
  DURUM.golem = golemler.length;
  DURUM.sonTur = tur;
  if (golemler.length === 0) return;

  let toplam = 0;
  for (const g of golemler) {
    if (!g?.isValid) { onbellek.delete(g?.id); continue; }
    // heykele donmekte olan golem calismasin
    try { if (g.getProperty?.("minecraft:is_becoming_statue") === true) continue; } catch { }

    let y = onbellek.get(g.id);
    if (!y || tur - y.tur >= GOLEM_CFG.taramaPeriyodu) {
      y = tara(g);
      onbellek.set(g.id, y);
    }
    if (y.kaynak.length === 0 || y.hedef.length === 0) continue;
    try { toplam += golemiCalistir(api, g, y); }
    catch (e) { console.warn("[Golem] tur hatasi: " + e); }
  }
  DURUM.tasinan += toplam;
}

export function kur(api) {
  if (dongu !== null) return;
  dongu = system.runInterval(() => {
    try { birTur(api); } catch (e) { console.warn("[Golem] dongu: " + e); }
  }, GOLEM_CFG.tikAraligi);
  DURUM.calisti = true;
  console.warn(`[Golem] Bakir golem hizlandirici aktif (tur basina ${GOLEM_CFG.partiBoyutu} yigin).`);
}

// Oyuncunun cevresindeki golemlerin durumu (!golem komutu)
export function rapor(p) {
  const satir = [];
  let liste = [];
  try {
    liste = p.dimension.getEntities({ type: GOLEM_ID, location: p.location, maxDistance: 32 });
  } catch { }
  satir.push(`§7Yakinda §f${liste.length}§7 bakir golem var.`);
  satir.push(`§7Tur basina en fazla §f${GOLEM_CFG.partiBoyutu}§7 yigin, §f${GOLEM_CFG.tikAraligi / 20}§7 saniyede bir.`);
  for (const g of liste.slice(0, 5)) {
    const y = onbellek.get(g.id) ?? tara(g);
    onbellek.set(g.id, y);
    const l = g.location;
    satir.push(`§8- ${Math.floor(l.x)}, ${Math.floor(l.y)}, ${Math.floor(l.z)}: ` +
      `§f${y.kaynak.length}§7 bakir sandik, §f${y.hedef.length}§7 hedef sandik`);
  }
  if (liste.length === 0)
    satir.push("§8Golem, bakir sandiktan alip normal sandiga/varile koyar. Ikisi de 8 blok icinde olmali.");
  satir.push(`§8Toplam tasinan yigin: ${DURUM.tasinan}`);
  return satir;
}
