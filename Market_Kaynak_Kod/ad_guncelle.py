#!/usr/bin/env python3
"""Esya ADI (ceviri anahtari) haritasini Mojang'in resmi dil dosyasindan uretir.

Market_BP/scripts/adlar.js dosyasini yeniden yazar:
  python3 ad_guncelle.py

NEDEN GEREKLI: Bedrock'ta esya id'si ile dil anahtari cogu zaman TUTMUYOR.
  acacia_planks  -> tile.planks.acacia.name        (item.acacia_planks.name YOK)
  white_wool     -> tile.wool.white.name
  acacia_boat    -> item.boat.acacia.name
  cod            -> item.fish.name
  golden_horse_armor -> item.horsearmorgold.name
Anahtar yoksa Minecraft anahtarin KENDISINI yaziyor; markette
"item.acacia_planks.name" gibi okunamaz satirlar cikiyordu.

Buradaki her anahtar, Mojang'in kendi en_US.lang dosyasinda GERCEKTEN
var diye dogrulanir. Dogrulanamayan esya haritaya YAZILMAZ; main.js o
zaman id'den okunakli bir metin uretir (ham anahtar asla gosterilmez).
Anahtarlar butun dillerde ayni oldugu icin oyuncunun dili neyse o gorunur.
"""
import json, re, subprocess, urllib.request, pathlib
from collections import defaultdict

SURUM = "v1.21.90.3"
YENI_DAL = "main"
KOK = "https://raw.githubusercontent.com/Mojang/bedrock-samples/{}/{}"
LANG = "resource_pack/texts/en_US.lang"
ESYA = "metadata/vanilladata_modules/mojang-items.json"
BLOK = "metadata/vanilladata_modules/mojang-blocks.json"
HEDEF = pathlib.Path(__file__).parent / "Market_BP" / "scripts" / "adlar.js"

# Bulanik eslesmenin bulamadigi, elle bilinen karsiliklar
ELLE = {
    "cod": "item.fish.name", "salmon": "item.salmon.name",
    "cooked_cod": "item.cooked_fish.name",
    "filled_map": "item.map.name", "empty_map": "item.emptyMap.name",
    "golden_horse_armor": "item.horsearmorgold.name",
    "iron_horse_armor": "item.horsearmoriron.name",
    "diamond_horse_armor": "item.horsearmordiamond.name",
    "leather_horse_armor": "item.horsearmorleather.name",
    "netherite_upgrade_smithing_template": "item.netherite_upgrade_smithing_template.name",
    # kova ailesi: id "<icindeki>_bucket", anahtar "bucket<Icindeki>"
    "cod_bucket": "item.bucketFish.name", "salmon_bucket": "item.bucketSalmon.name",
    "tropical_fish_bucket": "item.bucketTropical.name",
    "pufferfish_bucket": "item.bucketPuffer.name",
    "axolotl_bucket": "item.bucketAxolotl.name",
    "tadpole_bucket": "item.bucketTadpole.name",
    "powder_snow_bucket": "item.bucketPowderSnow.name",
    "lava_bucket": "item.bucketLava.name", "water_bucket": "item.bucketWater.name",
    "milk_bucket": "item.milk.name",
    # Bedrock'ta iksirin adi hep efektiyle geliyor ("Splash Potion of X");
    # efektsiz genel id icin duz bir anahtar yok. Atilan iksir VARLIGININ
    # adi dogru metni veriyor ve her dilde ceviri var.
    "lingering_potion": "entity.lingering_potion.name",
    "splash_potion": "entity.splash_potion.name",
}


def indir(dal, yol):
    with urllib.request.urlopen(KOK.format(dal, yol), timeout=60) as r:
        return r.read().decode("utf-8")


def lang_oku(metin, hedef):
    for satir in metin.split("\n"):
        s = satir.strip()
        if not s or s.startswith("#"):
            continue
        i = s.find("=")
        if i <= 0:
            continue
        hedef.setdefault(s[:i].strip(), s[i + 1:].split("\t")[0].strip())


def kimlikler(dal):
    out = set()
    for yol in (ESYA, BLOK):
        try:
            d = json.loads(indir(dal, yol))
        except Exception:
            continue
        for grup in ("data_items", "data_blocks", "items", "blocks"):
            for e in d.get(grup, []) or []:
                ad = e.get("name") if isinstance(e, dict) else e
                if isinstance(ad, str):
                    out.add(ad.replace("minecraft:", ""))
    return out


duz = lambda s: re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def coz(a, adlar, ters, tum=None):
    """Bir esya id'si icin DOGRULANMIS dil anahtari bul (ya da None)."""
    # ELLE tablosu TUM anahtar kumesine karsi dogrulanir: iksirlerin adi
    # "entity.lingering_potion.name" gibi item./tile. disi anahtarlarda
    # duruyor. Otomatik eslesme ise sadece item./tile. icinde arar, yoksa
    # varlik adlari esyalara yanlis baglanabilir (inek esyasi/varligi).
    if a in ELLE and ELLE[a] in (tum or adlar):
        return ELLE[a]
    for k in (f"item.{a}.name", f"tile.{a}.name"):
        if k in adlar:
            return k
    # aile.varyant bicimi:  acacia_chest_boat -> item.chest_boat.acacia.name
    parca = a.split("_")
    for kes in range(1, len(parca)):
        onek, kalan = "_".join(parca[:kes]), "_".join(parca[kes:])
        for k in (f"item.{kalan}.{onek}.name", f"tile.{kalan}.{onek}.name",
                  f"item.{onek}.{kalan}.name", f"tile.{onek}.{kalan}.name"):
            if k in adlar:
                return k
    # Ingilizce karsiliktan geri bul: "acacia planks" -> tile.planks.acacia.name
    for aday in (duz(a), duz(a).replace("chest boat", "boat with chest")):
        if aday in ters:
            return sorted(ters[aday], key=len)[0]
    # camelCase / bitisik anahtar:  acacia_fence -> tile.acaciaFence.name
    #                               note_block   -> tile.noteblock.name
    kamel = parca[0] + "".join(p.capitalize() for p in parca[1:])
    bitisik = "".join(parca)
    for aday in (kamel, bitisik):
        for k in (f"tile.{aday}.name", f"item.{aday}.name"):
            if k in adlar:
                return k
    # oak_* bloklarinin bir kismi Bedrock'ta "wooden_*" adiyla duruyor
    if a.startswith("oak_"):
        for k in (f"tile.wooden_{a[4:]}.name", f"item.wooden_{a[4:]}.name"):
            if k in adlar:
                return k
    # Son care: "Raw X" bicimi.  mutton -> "Raw Mutton" (item.muttonRaw.name)
    # SADECE "raw" fazlaligina izin var. Serbest birakinca mutton'u
    # "Cooked Mutton"a baglayabiliyordu - yanlis ad, okunmayan addan beterdir.
    for onek in ("raw ",):
        if (onek + duz(a)) in ters:
            return sorted(ters[onek + duz(a)], key=len)[0]
    return None


def katalog_kimlikleri():
    """esyalar.js'in GERCEK katalogu (aile sablonlariyla uretilenler dahil).
    Bedrock'un kabul ettigi ama Mojang metadata'sinda gecmeyen takma adlar
    burada: note_block (gercek id noteblock), oak_button (wooden_button),
    nether_quartz_ore (quartz_ore)... Node ile esyalar.js'i calistirip
    katalog() ciktisini aliyoruz; elle regex'le tahmin etmiyoruz."""
    kok = pathlib.Path(__file__).parent
    betik = ("import('file://" + str(kok / "Market_BP/scripts/esyalar.js") + "')"
             ".then(m => console.log(m.katalog().join('\\n')))")
    try:
        c = subprocess.run(["node", "--input-type=module", "-e", betik],
                           capture_output=True, text=True, timeout=60)
        if c.returncode != 0:
            print("  UYARI: esyalar.js okunamadi ->", c.stderr.strip()[:200])
            return set()
        return {x.strip().replace("minecraft:", "") for x in c.stdout.split("\n") if x.strip()}
    except Exception as e:
        print("  UYARI: esyalar.js okunamadi ->", e)
        return set()


def main():
    tum = {}
    for dal in (SURUM, YENI_DAL):
        lang_oku(indir(dal, LANG), tum)
    adlar = {k: v for k, v in tum.items()
             if (k.startswith("item.") or k.startswith("tile.")) and k.endswith(".name")}
    ters = defaultdict(list)
    for k, v in adlar.items():
        if "%" not in v:
            ters[duz(v)].append(k)

    hepsi = kimlikler(SURUM) | kimlikler(YENI_DAL) | katalog_kimlikleri()
    harita, eksik = {}, []
    for a in sorted(hepsi):
        k = coz(a, adlar, ters, tum)
        if k:
            harita[a] = k
        else:
            eksik.append(a)

    # Tahmin edilebilir olanlari yazma: main.js zaten item./tile. deniyor.
    kisa = {a: k for a, k in harita.items()
            if k not in (f"item.{a}.name", f"tile.{a}.name")}
    # ... ama tile./item. hangisi oldugu da bilinmeli, o yuzden hepsini tut:
    kisa = harita

    satirlar = []
    tampon = []
    for a, k in sorted(kisa.items()):
        # "tile.X.name" -> "t:X" , "item.X.name" -> "i:X"  (dosya boyutu icin)
        if k.startswith("tile.") and k.endswith(".name"):
            kod = "t:" + k[5:-5]
        elif k.startswith("item.") and k.endswith(".name"):
            kod = "i:" + k[5:-5]
        else:
            kod = "=" + k
        tampon.append(f"{a}={kod}")
        if len(tampon) >= 6:
            satirlar.append('  "' + " ".join(tampon) + '",')
            tampon = []
    if tampon:
        satirlar.append('  "' + " ".join(tampon) + '",')

    metin = f'''// ============ ESYA ADI (DIL ANAHTARI) HARITASI ============
// ad_guncelle.py tarafindan Mojang'in resmi en_US.lang dosyasindan
// uretilmistir. ELLE DUZENLEME: uretici yeniden calisinca ustune yazar.
//
// NEDEN: Bedrock'ta esya id'si ile dil anahtari cogu zaman tutmuyor.
//   acacia_planks -> tile.planks.acacia.name   (item.acacia_planks.name YOK)
//   white_wool    -> tile.wool.white.name
//   cod           -> item.fish.name
// Anahtar yoksa Minecraft anahtarin KENDISINI yazar; markette
// "item.acacia_planks.name" gibi okunamaz satirlar cikiyordu.
//
// Buradaki her anahtar Mojang'in kendi lang dosyasinda GERCEKTEN var diye
// dogrulandi. Listede olmayan esya icin main.js id'den okunakli metin
// uretir - ham anahtar asla ekrana gelmez.
//
// Kaynak: {SURUM} + {YENI_DAL}. {len(kisa)} esya cozuldu, {len(eksik)} cozulemedi.
// Bicim: "<id>=<kod>"  ->  t: = tile.<...>.name , i: = item.<...>.name

const HAM = [
{chr(10).join(satirlar)}
];

const HARITA = new Map();
for (const satir of HAM) {{
  for (const parca of satir.split(" ")) {{
    const i = parca.indexOf("=");
    if (i < 0) continue;
    const id = parca.slice(0, i), kod = parca.slice(i + 1);
    HARITA.set(id,
      kod.startsWith("t:") ? `tile.${{kod.slice(2)}}.name`
      : kod.startsWith("i:") ? `item.${{kod.slice(2)}}.name`
      : kod.slice(1));
  }}
}}

// Dogrulanmis dil anahtari. Yoksa undefined doner; cagiran duz metne duser.
export function adAnahtari(typeId) {{
  return HARITA.get(String(typeId).replace(/^minecraft:/, ""));
}}
export const ADET = HARITA.size;
'''
    HEDEF.write_text(metin, encoding="utf-8")
    print(f"{HEDEF} yazildi: {len(kisa)} esya cozuldu, {len(eksik)} cozulemedi.")
    if eksik:
        print("  cozulemeyenler (id'den metin uretilecek):", " ".join(eksik[:30]),
              f"... (+{max(0, len(eksik) - 30)})")


if __name__ == "__main__":
    main()
