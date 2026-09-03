#!/usr/bin/env python3
"""Esya ikonlarini Mojang'in resmi vanilla resource pack verisinden uretir.

Market_BP/scripts/ikonlar.js dosyasini yeniden yazar. Minecraft yeni surum
cikardiginda calistir:  python3 ikon_guncelle.py
Internet yoksa hicbir sey degistirmez.
"""
import json, re, sys, textwrap, urllib.request, pathlib

KOK = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/"
KAYNAKLAR = {
    "esya":    KOK + "metadata/vanilladata_modules/mojang-items.json",
    "item_tx": KOK + "resource_pack/textures/item_texture.json",
    "tas_tx":  KOK + "resource_pack/textures/terrain_texture.json",
    "bloklar": KOK + "resource_pack/blocks.json",
}
HEDEF = pathlib.Path(__file__).parent / "Market_BP" / "scripts" / "ikonlar.js"

# Bulanik eslesmenin bulamadigi, elle bilinen karsiliklar
ELLE = {
    "bone_meal": "textures/items/dye_powder_white", "ink_sac": "textures/items/dye_powder_black_new",
    "lapis_lazuli": "textures/items/dye_powder_blue_new", "cocoa_beans": "textures/items/dye_powder_brown",
    "glow_ink_sac": "textures/items/glow_ink_sac", "cooked_cod": "textures/items/fish_cooked",
    "glass_bottle": "textures/items/potion_bottle_empty", "fire_charge": "textures/items/fireball",
    "firework_rocket": "textures/items/fireworks", "firework_star": "textures/items/fireworks_charge",
    "glistering_melon_slice": "textures/items/melon_speckled",
    "enchanted_golden_apple": "textures/items/apple_golden",
    "iron_chain": "textures/blocks/chain1", "banner": "textures/items/banner_white",
    "oak_sign": "textures/items/sign", "sign": "textures/items/sign",
    "grass_block": "textures/blocks/grass_side_carried",
    "melon_slice": "textures/items/melon", "lodestone_compass": "textures/items/compass_item",
    "chest": "textures/items/market_sandik", "trapped_chest": "textures/items/market_sandik",
    "barrel": "textures/items/market_sandik", "ender_chest": "textures/items/market_endersandik",
}
# Yapisal ekler: kendi dokusu yoksa kok blogun dokusu kullanilir
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


def main():
    try:
        veri = {k: indir(u) for k, u in KAYNAKLAR.items()}
    except Exception as e:
        print(f"HATA: indirilemedi ({e}). Dosya degistirilmedi.")
        return 1

    esyalar = sorted({x["name"].replace("minecraft:", "") for x in veri["esya"]["data_items"]})
    it = veri["item_tx"]["texture_data"]
    tt = veri["tas_tx"]["texture_data"]
    bl = veri["bloklar"]

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
        if e.startswith("music_disc_"):          # plaklarin doku adi "record_*"
            aday = f"textures/items/record_{e[11:]}"
            if aday in tum: return aday
        y = tek(it[e]) if e in it else None
        if not y: y = blok_yolu(e)
        if not y: y = bulanik(e)
        if not y and derinlik < 2:                    # kok bloga dus
            for ek in EKLER:
                if e.endswith(ek) and len(e) > len(ek):
                    kok = e[: -len(ek)]
                    for aday in (kok, kok + "s", kok + "_block", kok + "_planks"):
                        y = coz(aday, derinlik + 1)
                        if y: return y
        return y

    harita, kayip = {}, []
    for e in esyalar:
        y = coz(e)
        if y: harita[e] = y
        else: kayip.append(e)

    kisa, blok_gibi = {}, []
    for k, v in harita.items():
        if v == f"textures/blocks/{k}": blok_gibi.append(k); continue
        if v == f"textures/items/{k}": continue          # varsayilan tahmin zaten dogru
        kisa[k] = v.replace("textures/items/", "i:").replace("textures/blocks/", "b:")

    def sar(s, genislik=100):
        return "\n".join('  "%s",' % x for x in
                         textwrap.wrap(s, width=genislik, break_long_words=False,
                                       break_on_hyphens=False)).rstrip(",")

    icerik = f'''// ============ ESYA IKON HARITASI ============
// ikon_guncelle.py tarafindan Mojang'in resmi vanilla resource pack
// verisinden uretilmistir (bedrock-samples: item_texture.json,
// terrain_texture.json, blocks.json). ELLE DUZENLEME: uretici yeniden
// calisinca ustune yazar; kalici degisiklik icin icons.js icindeki
// OZEL tablosunu kullan.
//
// Bicim: "<esya_id>=<yol>" ciftleri. "i:" = textures/items/, "b:" = textures/blocks/
// Burada olmayan ama BLOK olan esyalar BLOK_GIBI listesinde
// (yolu textures/blocks/<id>); geri kalan icin textures/items/<id> denenir.
// Uretim tarihi verisi: {len(harita)} esya cozuldu, {len(kayip)} cozulemedi.

const HARITA_HAM = [
{sar(" ".join(f"{k}={v}" for k, v in sorted(kisa.items())))}
].join(" ");

const BLOK_GIBI_HAM = [
{sar(" ".join(sorted(blok_gibi)))}
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

// Esya id'sinin (minecraft: oneki olmadan) resmi texture yolu, yoksa undefined.
export function resmiIkon(ad) {{ return HARITA.get(ad); }}
export const IKON_SAYISI = HARITA.size;
'''
    HEDEF.write_text(icerik, encoding="utf-8")
    print(f"Tamam: {len(harita)}/{len(esyalar)} esya cozuldu "
          f"({len(kisa)} ozel yol, {len(blok_gibi)} blok), {len(kayip)} cozulemedi -> {HEDEF}")
    if kayip: print("Cozulemeyenler:", ", ".join(kayip[:25]))
    print("Simdi 'bash paketle.sh' ile yeni .mcaddon uret.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
