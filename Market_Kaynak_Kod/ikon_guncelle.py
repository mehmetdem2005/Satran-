#!/usr/bin/env python3
"""Esya ikonlarini Mojang'in resmi vanilla resource pack verisinden uretir.

Market_BP/scripts/ikonlar.js dosyasini yeniden yazar:
  python3 ikon_guncelle.py

NEDEN SURUM ETIKETI: "main" dali preview surumunun verisini tasir. Oradaki
doku yollari (ornegin yeni alt klasorler) eski surumlerde bulunmaz ve oyunda
mor-siyah "eksik doku" karesi olarak gorunur. Bu yuzden ANA kaynak, addon'un
min_engine_version'i ile ayni etiket; "main" yalnizca daha yeni surumlerde
eklenen esyalar icin EK kaynak olarak kullanilir.

Ayrica uretilen her yol, o surumun kendi texture tanimlarinda gercekten
geciyor mu diye dogrulanir; gecmiyorsa haritaya HIC yazilmaz (icons.js o
zaman soru isareti gorseline duser, mor-siyah kare cikmaz).
"""
import json, re, sys, textwrap, urllib.request, pathlib

SURUM = "v1.21.90.3"      # Market_BP/manifest.json -> min_engine_version
YENI_DAL = "main"         # daha yeni surumlerde eklenen esyalar icin ek kaynak

DOSYALAR = {
    "esya":    "metadata/vanilladata_modules/mojang-items.json",
    "item_tx": "resource_pack/textures/item_texture.json",
    "tas_tx":  "resource_pack/textures/terrain_texture.json",
    "bloklar": "resource_pack/blocks.json",
}
HEDEF = pathlib.Path(__file__).parent / "Market_BP" / "scripts" / "ikonlar.js"

# Bulanik eslesmenin bulamadigi, elle bilinen karsiliklar
ELLE = {
    "bone_meal": "textures/items/dye_powder_white", "ink_sac": "textures/items/dye_powder_black_new",
    "lapis_lazuli": "textures/items/dye_powder_blue_new", "cocoa_beans": "textures/items/dye_powder_brown",
    "cooked_cod": "textures/items/fish_cooked", "glass_bottle": "textures/items/potion_bottle_empty",
    "fire_charge": "textures/items/fireball", "firework_rocket": "textures/items/fireworks",
    "firework_star": "textures/items/fireworks_charge", "glistering_melon_slice": "textures/items/melon_speckled",
    "enchanted_golden_apple": "textures/items/apple_golden", "melon_slice": "textures/items/melon",
    "lodestone_compass": "textures/items/compass_item", "oak_sign": "textures/items/sign",
    "sign": "textures/items/sign", "dark_oak_planks": "textures/blocks/planks_big_oak",
    "slime_ball": "textures/items/slimeball", "sugar_cane": "textures/items/reeds",
    "totem_of_undying": "textures/items/totem", "tropical_fish": "textures/items/fish_clownfish_raw",
    "turtle_scute": "textures/items/turtle_shell_piece", "scute": "textures/items/turtle_shell_piece",
    "grass_block": "textures/blocks/grass_carried", "glow_ink_sac": "textures/items/dye_powder_black_new",
    "tropical_fish_bucket": "textures/items/bucket_tropical",
    "tropical_fish_spawn_egg": "textures/items/spawn_eggs/spawn_egg_tropicalfish",
    "zombie_pigman_spawn_egg": "textures/items/spawn_eggs/spawn_egg_zombie_pigman",
    # kendi cizdigimiz gorseller (dogrulama disi)
    "chest": "textures/items/market_sandik", "trapped_chest": "textures/items/market_sandik",
    "barrel": "textures/items/market_sandik", "ender_chest": "textures/items/market_endersandik",
}
BIZIM = {v for v in ELLE.values() if "/market_" in v or "/mk_" in v}

EKLER = ["_double_slab", "_slab", "_stairs", "_wall", "_fence_gate", "_fence", "_button",
         "_pressure_plate", "_trapdoor", "_door", "_cushion", "_shelf", "_sign", "_hanging_sign"]
ES = {"light_gray": "silver", "dark_oak": "darkoak", "wooden": "wood", "golden": "gold"}
EK_IYI = {"raw", "normal", "item", "new", "standby", "off", "empty", "side", "top", "front", "on"}


def indir(url):
    with urllib.request.urlopen(url, timeout=90) as c:
        return json.loads(re.sub(r"^\s*//.*$", "", c.read().decode("utf-8"), flags=re.M))


def yollar(v):
    t = v.get("textures") if isinstance(v, dict) else v
    if isinstance(t, str): return [t]
    if isinstance(t, dict): return yollar(t.get("path") or t)
    if isinstance(t, list):
        c = []
        for x in t: c += yollar(x)
        return c
    return []


def parcala(s):
    s = s.lower()
    for a, b in ES.items(): s = s.replace(a, b)
    return [x for x in re.split(r"[_/.\-]+", s) if x]


def coz_hepsi(ref):
    """Bir surumun verisinden {esya: yol} haritasi uretir."""
    try:
        veri = {k: indir(f"https://raw.githubusercontent.com/Mojang/bedrock-samples/{ref}/{u}")
                for k, u in DOSYALAR.items()}
    except Exception as e:
        print(f"  {ref}: indirilemedi ({e})")
        return None, [], []

    esyalar = sorted({x["name"].replace("minecraft:", "") for x in veri["esya"]["data_items"]})
    it, tt, bl = veri["item_tx"]["texture_data"], veri["tas_tx"]["texture_data"], veri["bloklar"]

    def tek(v):
        y = yollar(v)
        return y[0] if y else None

    def blok_yolu(bid):
        b = bl.get(bid)
        if not isinstance(b, dict): return None
        t = b.get("textures")
        if isinstance(t, dict):
            t = t.get("side") or t.get("up") or t.get("north") or next(iter(t.values()), None)
        if isinstance(t, list): t = t[0] if t else None
        return tek(tt[t]) if isinstance(t, str) and t in tt else None

    tum = set()
    for kaynak in (it, tt):
        for v in kaynak.values(): tum.update(p for p in yollar(v) if isinstance(p, str))

    indeks = {}
    for p in sorted(tum):
        indeks.setdefault(frozenset(parcala(p.rsplit("/", 1)[-1])), []).append(p)

    def bulanik(e):
        hedef = frozenset(parcala(e))
        if hedef in indeks: return sorted(indeks[hedef], key=len)[0]
        en_iyi, en_puan = None, -99
        for kume, liste in indeks.items():
            if not hedef <= kume: continue
            ek = kume - hedef
            if len(ek) > 2: continue
            puan = 10 - 3 * len(ek) + sum(2 for x in ek if x in EK_IYI)
            if puan > en_puan: en_iyi, en_puan = sorted(liste, key=len)[0], puan
        return en_iyi

    def coz(e, derinlik=0):
        if e in ELLE: return ELLE[e]
        if e.startswith("music_disc_"):
            aday = f"textures/items/record_{e[11:]}"
            if aday in tum: return aday
        y = tek(it[e]) if e in it else None
        if not y: y = blok_yolu(e)
        if not y: y = bulanik(e)
        if not y and e.endswith("_spawn_egg") and "textures/items/spawn_egg" in tum:
            y = "textures/items/spawn_egg"
        if not y and derinlik < 2:
            for ek in EKLER:
                if e.endswith(ek) and len(e) > len(ek):
                    kok = e[: -len(ek)]
                    for aday in (kok, kok + "s", kok + "_block", kok + "_planks"):
                        y = coz(aday, derinlik + 1)
                        if y: return y
        return y

    harita, kayip, atilan = {}, [], []
    for e in esyalar:
        y = coz(e)
        if not y:
            kayip.append(e)
        elif y in tum or y in BIZIM:
            harita[e] = y
        else:
            atilan.append(f"{e} -> {y}")     # yol bu surumde yok: kullanma
    return harita, kayip, atilan


def sar(s, genislik=100):
    return "\n".join('  "%s",' % x for x in
                     textwrap.wrap(s, width=genislik, break_long_words=False,
                                   break_on_hyphens=False)).rstrip(",")


def yaz(harita, bilgi):
    kisa, blok_gibi, item_gibi = {}, [], []
    for k, v in harita.items():
        if v == f"textures/blocks/{k}": blok_gibi.append(k); continue
        if v == f"textures/items/{k}": item_gibi.append(k); continue
        kisa[k] = v.replace("textures/items/", "i:").replace("textures/blocks/", "b:")

    icerik = f'''// ============ ESYA IKON HARITASI ============
// ikon_guncelle.py tarafindan Mojang'in resmi vanilla resource pack
// verisinden uretilmistir. ELLE DUZENLEME: uretici yeniden calisinca
// ustune yazar; kalici degisiklik icin icons.js icindeki OZEL tablosunu
// ya da ikon_guncelle.py icindeki ELLE tablosunu kullan.
//
// {bilgi}
// Buradaki her yol, kaynak surumun kendi texture tanimlarinda GECIYOR diye
// dogrulanmistir; dogrulanamayan yol haritaya hic yazilmaz (icons.js soru
// isareti gorseline duser, oyunda mor-siyah kare cikmaz).
//
// Bicim: "<esya_id>=<yol>" ciftleri. "i:" = textures/items/, "b:" = textures/blocks/

const HARITA_HAM = [
{sar(" ".join(f"{k}={v}" for k, v in sorted(kisa.items())))}
].join(" ");

const BLOK_GIBI_HAM = [
{sar(" ".join(sorted(blok_gibi)))}
].join(" ");

// Yolu dogrudan textures/items/<id> olanlar
const ITEM_GIBI_HAM = [
{sar(" ".join(sorted(item_gibi)))}
].join(" ");

const HARITA = new Map();
for (const cift of HARITA_HAM.split(" ")) {{
  if (!cift) continue;
  const i = cift.indexOf("=");
  if (i < 1) continue;
  const yol = cift.slice(i + 1)
    .replace(/^i:/, "textures/items/")
    .replace(/^b:/, "textures/blocks/");
  HARITA.set(cift.slice(0, i), yol);
}}
for (const ad of BLOK_GIBI_HAM.split(" ")) if (ad) HARITA.set(ad, `textures/blocks/${{ad}}`);
for (const ad of ITEM_GIBI_HAM.split(" ")) if (ad) HARITA.set(ad, `textures/items/${{ad}}`);

// Esya id'sinin (minecraft: oneki olmadan) dogrulanmis texture yolu, yoksa undefined.
export function resmiIkon(ad) {{ return HARITA.get(ad); }}
export const IKON_SAYISI = HARITA.size;
'''
    HEDEF.write_text(icerik, encoding="utf-8")
    print(f"Yazildi: {len(harita)} esya ({len(kisa)} ozel yol, {len(blok_gibi)} blok, {len(item_gibi)} item) -> {HEDEF}")


def main():
    print(f"Ana kaynak (oyun surumu): {SURUM}")
    harita, kayip, atilan = coz_hepsi(SURUM)
    if harita is None:
        print("HATA: ana kaynak indirilemedi. Dosya degistirilmedi.")
        return 1
    print(f"  cozuldu {len(harita)} | cozulemedi {len(kayip)} | yolu dogrulanamayip atilan {len(atilan)}")
    if kayip: print("  cozulemeyen:", ", ".join(kayip[:20]))
    if atilan: print("  atilan:", ", ".join(atilan[:10]))

    print(f"Ek kaynak (yeni surum esyalari): {YENI_DAL}")
    yeni, _, _ = coz_hepsi(YENI_DAL)
    eklenen = 0
    if yeni:
        for k, v in yeni.items():
            if k not in harita: harita[k] = v; eklenen += 1
    print(f"  {eklenen} yeni esya eklendi")

    yaz(harita, f"Kaynak: {SURUM} ({len(harita) - eklenen} esya) + {YENI_DAL} (+{eklenen} yeni esya).")
    print("Simdi 'bash paketle.sh' ile yeni .mcaddon uret.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
