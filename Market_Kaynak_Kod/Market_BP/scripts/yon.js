// ============ BLOK YONU CEVIRME - YON ANAHTARI (v4.6) ============
// YON ANAHTARI (9 cubuk, craft masasi) elindeyken bloga SAG TIK ->
// blok bir adim doner. EGILIP tiklarsan TERS yone doner.
// Gozlemci, huni, firin, piston, merdiven, kutuk, meshale, kaldirac...
// "Yonu olan" her blok dahil; liste elle yazilmiyor, blogun KENDI durum
// (state) tablosuna bakiliyor. Yani oyuna yeni bir yonlu blok gelse bile
// kod degistirmeden calisir.
//
// v4.5'te her aletle calisiyordu; baltayla kabuk soymak, kurekle patika
// acmak gibi normal isler egilipken calismaz olmustu. Artik sadece bu
// ozel alet ceviriyor, baska hicbir esyanin davranisi degismiyor.

import * as mc from "@minecraft/server";
const { world, system } = mc;

export const YON_CFG = {
  acik: true,
  bekleme: 180,        // ms - ayni oyuncu bu sureden once tekrar ceviremez
  ses: true,
  sesAdi: "random.click",
  bildir: true         // action bar'da yeni yonu yaz
};

// ---- Yon Anahtari ----
export const ANAHTAR_ID = "mk:yon_anahtari";
export function aletMi(item) { return item?.typeId === ANAHTAR_ID; }

// Envantere bir tane koymak icin (komut / admin).
export function anahtarYap(mcRef) {
  const it = new mcRef.ItemStack(ANAHTAR_ID, 1);
  try {
    it.setLore([
      "\u00a77Sa\u011f t\u0131k: blo\u011fun y\u00f6n\u00fcn\u00fc bir ad\u0131m \u00e7evirir",
      "\u00a77E\u011filip sa\u011f t\u0131k: ters y\u00f6ne \u00e7evirir",
      "\u00a78G\u00f6zlemci, huni, f\u0131r\u0131n, merdiven, k\u00fct\u00fck..."
    ]);
  } catch { }
  return it;
}

// ---- Donus eksenleri ----
// Sira onemli: bir blokta birden fazla varsa ILKI ana eksendir.
// Degerler dongusel; sondan basa doner.
const sayilar = (n) => Array.from({ length: n }, (_, i) => i);
const DORT_YON = ["north", "east", "south", "west"];
const ALTI_YON = [...DORT_YON, "up", "down"];

const EKSENLER = [
  // yeni (1.21 sonrasi) isimlendirilmis durumlar
  ["minecraft:cardinal_direction", DORT_YON],
  ["minecraft:facing_direction", ALTI_YON],
  ["minecraft:block_face", ALTI_YON],
  // eski sayisal durumlar  (0=asagi 1=yukari 2=kuzey 3=guney 4=bati 5=dogu)
  ["facing_direction", [2, 5, 3, 4, 1, 0]],
  ["direction", sayilar(4)],
  ["weirdo_direction", sayilar(4)],
  ["coral_direction", sayilar(4)],
  ["ground_sign_direction", sayilar(16)],
  ["rail_direction", sayilar(10)],
  ["torch_facing_direction", ["north", "east", "south", "west", "top"]],
  ["lever_direction", ["north", "east", "south", "west",
    "up_north_south", "up_east_west", "down_north_south", "down_east_west"]],
  ["orientation", ["north_up", "east_up", "south_up", "west_up",
    "down_north", "down_east", "down_south", "down_west",
    "up_north", "up_east", "up_south", "up_west"]],
  ["attachment", ["standing", "side", "hanging", "multiple"]],
  ["pillar_axis", ["y", "x", "z"]],
  ["multi_face_direction_bits", [1, 2, 4, 8, 16, 32]]
];

// Ana eksen bir tam tur atinca bunlar bir adim ilerler (kilometre sayaci
// mantigi). Boylece merdivenin 4 yonu bitince ters/duz da degisiyor.
const IKINCIL = [
  ["minecraft:vertical_half", ["bottom", "top"]],
  ["upside_down_bit", [false, true]],
  ["door_hinge_bit", [false, true]]
];

// Blogun durum tablosunda VAR ama o blokta gercekten kullanilmayan degerler.
// Huni yukari bakamaz; denersek gorunmez/bozuk huni olusuyor.
// Anahtarlar KISA ad (kisaAd ile aranir, "minecraft:" onekisiz).
const YASAK_DEGER = {
  hopper: { facing_direction: [1] }
};

// Iki parcali yapilar: tek yariyi dondurmek bozuk gorunum birakir.
// Kapiyi iki yarisiyla birlikte donduruyoruz; yatak/bitki gibi YANYANA
// duranlarda ikinci parcanin yerini de tasimak gerekirdi, o yuzden disarida.
const CIFT_KATLI = /_door$/;
const DISARIDA = [
  /_bed$/, /^bed$/, /piston_arm/, /^double_/, /_head$/, /_skull$/,
  /^chest$/, /trapped_chest/,      // sandik: cift sandik yon degisince bozulur
  /_sign$/, /_banner$/             // tabela/sancak: 16 adim, yanlislikla donmesin
];

const kisaAd = (t) => String(t).replace(/^minecraft:/, "");

function disaridaMi(typeId) {
  const a = kisaAd(typeId);
  return DISARIDA.some(r => r.test(a));
}

// Blogun cevrilebilir eksenlerini bulur. Yoksa null.
export function eksenBul(durumlar, typeId) {
  if (!durumlar) return null;
  const ana = EKSENLER.find(([ad]) => durumlar[ad] !== undefined);
  if (!ana) return null;
  const ikincil = IKINCIL.filter(([ad]) => durumlar[ad] !== undefined);
  const yasak = YASAK_DEGER[typeId]?.[ana[0]] ?? [];
  const degerler = ana[1].filter(v => !yasak.includes(v));
  return { ad: ana[0], degerler, ikincil };
}

// Bir adim sonraki durum haritasini hesaplar (blogu DEGISTIRMEZ).
// adim = +1 ileri, -1 geri (egilerek tiklaninca).
export function sonrakiDurum(durumlar, typeId, adim = 1) {
  const e = eksenBul(durumlar, typeId);
  if (!e || e.degerler.length < 2) return null;
  const n = e.degerler.length;
  const i = e.degerler.indexOf(durumlar[e.ad]);
  const j = ((i + adim) % n + n) % n;
  const yeni = { [e.ad]: e.degerler[j] };
  // Ana eksen basa sardiysa ikincil ekseni de bir adim kaydir.
  const sardi = adim > 0 ? (i >= 0 && j === 0) : (i === 0);
  if (sardi && e.ikincil.length) {
    const [ad2, degerler2] = e.ikincil[0];
    const m = degerler2.length;
    const k = degerler2.indexOf(durumlar[ad2]);
    yeni[ad2] = degerler2[((k + adim) % m + m) % m];
  }
  return yeni;
}

// ---- Turkce yon adlari ----
const YON_ADI = {
  north: "kuzey", south: "güney", east: "doğu", west: "batı",
  up: "yukarı", down: "aşağı", top: "tavan", bottom: "taban",
  y: "dikey", x: "doğu-batı", z: "kuzey-güney",
  standing: "ayakta", hanging: "asılı", side: "yanda", multiple: "iki yanda"
};
const SAYI_YON = { 0: "aşağı", 1: "yukarı", 2: "kuzey", 3: "güney", 4: "batı", 5: "doğu" };
// Merdivenlerde sabit: 0=dogu 1=bati 2=guney 3=kuzey
const MERDIVEN_YON = { 0: "doğu", 1: "batı", 2: "güney", 3: "kuzey" };
// NOT: "direction" durumunun sayi->yon karsiligi BLOKTAN BLOGA degisiyor
// (kapida 0=dogu, tekrarlayicida 0=guney). Yanlis yon yazmaktansa kacinci
// adimda oldugunu yaziyoruz.

function yonYazi(ad, deger, toplam) {
  if (typeof deger === "boolean") return deger ? "ters" : "düz";
  if (ad === "facing_direction") return SAYI_YON[deger] ?? String(deger);
  if (ad === "weirdo_direction") return MERDIVEN_YON[deger] ?? String(deger);
  if (typeof deger === "number") return `yön ${deger + 1}${toplam ? "/" + toplam : ""}`;
  return YON_ADI[deger] ?? String(deger);
}

// ---- Cevirme ----
// Doner: yeni yonun yazisi, ya da null (cevrilemedi).
export function cevir(blok, adim = 1) {
  if (!blok) return null;
  let durumlar;
  try { durumlar = blok.permutation.getAllStates(); } catch { return null; }
  const yeni = sonrakiDurum(durumlar, kisaAd(blok.typeId), adim);
  if (!yeni) return null;

  const uygula = (b) => {
    let perm = b.permutation;
    for (const [ad, deger] of Object.entries(yeni)) perm = perm.withState(ad, deger);
    b.setPermutation(perm);
  };

  try { uygula(blok); } catch { return null; }
  // Kapinin diger yarisi da ayni yone donsun.
  if (CIFT_KATLI.test(kisaAd(blok.typeId))) {
    const ustte = durumlar["upper_block_bit"] === true;
    try {
      const es = blok.dimension.getBlock({
        x: blok.location.x, y: blok.location.y + (ustte ? -1 : 1), z: blok.location.z
      });
      if (es && es.typeId === blok.typeId) uygula(es);
    } catch { }
  }

  const [ad, deger] = Object.entries(yeni)[0];
  const e = eksenBul(durumlar, kisaAd(blok.typeId));
  return yonYazi(ad, deger, e?.ad === ad ? e.degerler.length : undefined);
}

// Blok cevrilebilir mi? (olay iptal edilmeden ONCE bakilir; okuma serbest)
export function cevrilebilirMi(blok) {
  if (!blok || blok.isAir) return false;
  const t = kisaAd(blok.typeId);
  if (disaridaMi(t)) return false;
  try { return !!sonrakiDurum(blok.permutation.getAllStates(), t); } catch { return false; }
}

// ---- Kurulum ----
const sonTik = new Map();       // oyuncu id -> ms
export const DURUM = { cevrilen: 0, engellenen: 0 };

// izinVar(p, blok) -> true ise cevirebilir. Arsa korumasi buradan baglanir.
export function kur(izinVar) {
  if (!YON_CFG.acik) return;
  world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    const p = ev.player, b = ev.block;
    if (!p || !b) return;
    if (!aletMi(ev.itemStack)) return;   // sadece Yon Anahtari
    if (!cevrilebilirMi(b)) return;          // yonu yoksa olaya hic karisma

    const simdi = Date.now();
    if (simdi - (sonTik.get(p.id) ?? 0) < YON_CFG.bekleme) { ev.cancel = true; return; }
    sonTik.set(p.id, simdi);

    // Anahtarin bloga yapacagi baska bir sey yok; olayi biz alalim.
    ev.cancel = true;
    const adim = p.isSneaking ? -1 : 1;      // egilip tiklarsan ters yon
    const konum = { x: b.location.x, y: b.location.y, z: b.location.z };
    const boyut = b.dimension;
    const tip = b.typeId;

    system.run(() => {
      try {
        if (izinVar && !izinVar(p, boyut.id, konum)) { DURUM.engellenen++; return; }
        const taze = boyut.getBlock(konum);
        if (!taze || taze.typeId !== tip) return;
        const yazi = cevir(taze, adim);
        if (!yazi) return;
        DURUM.cevrilen++;
        if (YON_CFG.ses) { try { p.playSound(YON_CFG.sesAdi); } catch { } }
        if (YON_CFG.bildir) {
          try {
            p.onScreenDisplay.setActionBar({
              rawtext: [{ text: "§d↻ §f" }, { translate: `tile.${kisaAd(tip)}.name` },
                        { text: `§7 → §f${yazi}` }]
            });
          } catch { }
        }
      } catch (e) { console.warn("[Yon] " + e); }
    });
  });
  console.warn("[Yon] Yon Anahtari aktif (sag tik cevirir, egilip tiklayinca ters).");
}
