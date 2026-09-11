#!/usr/bin/env python3
"""Uretim tariflerini Market_BP/scripts/tarifler.js dosyasina yazar.

  python3 arac/tarif_guncelle.py

Kaynak: arac/vanilla_tarifler.json (Mojang'in kendi tarif dosyalarindan
uretilmis 529 gercek craft tarifi). O dosya pakete girmiyor, bu yuzden
oyunda kullanilacak hali buraya derleniyor.

Bedrock'un tarif dosyalarindaki birkac ESKI id gunumuz id'sine cevriliyor
(netherstar -> nether_star, reeds -> sugar_cane...). Cozulemeyen id iceren
tarif YAZILMAZ - "dye" gibi joker girdiler boyle eleniyor.
"""
import json, pathlib, re

KOK = pathlib.Path(__file__).parent.parent
KAYNAK = KOK / "arac" / "vanilla_tarifler.json"
HEDEF = KOK / "Market_BP" / "scripts" / "tarifler.js"

ESKI_AD = {
    "netherstar": "nether_star", "reeds": "sugar_cane", "melon": "melon_block",
    "turtle_shell_piece": "turtle_scute", "chorus_fruit_popped": "popped_chorus_fruit",
    "carrotonastick": "carrot_on_a_stick", "emptymap": "empty_map",
    "frame": "item_frame", "glow_frame": "glow_item_frame",
    "horsearmorleather": "leather_horse_armor",
}
# Joker / cozulemeyen girdiler: bu tarifler atlanir
ATLA = {"dye"}

# Bedrock'ta boyalar tek bir "dye" esyasinin renk varyantlari. Girdisi
# "dye" olan tarifler joker sayilip elenir; gercekten onemli olanlari
# burada acik acik yaziyoruz. (Mumlar 16 renk: mum + o rengin boyasi.)
RENKLER = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
           "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"]
ELLE = {
    "bone_block": (1, [("bone_meal", 9)]),
    "lapis_block": (1, [("lapis_lazuli", 9)]),
    "cookie": (8, [("wheat", 2), ("cocoa_beans", 1)]),
    "writable_book": (1, [("book", 1), ("ink_sac", 1), ("feather", 1)]),
    "candle": (1, [("string", 1), ("honeycomb", 1)]),
    **{f"{r}_candle": (1, [("candle", 1), (f"{r}_dye", 1)]) for r in RENKLER},
}


def duzelt(x):
    return ESKI_AD.get(x, x)


AGAC = ["oak", "birch", "spruce", "jungle", "acacia", "dark_oak", "mangrove",
        "cherry", "pale_oak", "bamboo", "crimson", "warped"]
RENK16 = RENKLER
# Etiket (tag) girdileri: Bedrock'un tarif dosyalarinda "#minecraft:planks"
# gibi etiketler var; JSON dokumu bunlari cozemedigi icin o tarifler eksik
# kaliyor (cubuk, sandik, meshale, firin... - en cok kullanilanlar!).
# Etiketi burada acikca tanimliyoruz; uretim.js herhangi birini kabul eder.
ETIKET = {
    "@planks": [f"{a}_planks" for a in AGAC],
    "@logs": [f"{a}_log" for a in AGAC if a not in ("crimson", "warped", "bamboo")]
             + ["crimson_stem", "warped_stem", "bamboo_block"],
    "@wooden_slab": [f"{a}_slab" for a in AGAC],
    "@coals": ["coal", "charcoal"],
    "@wool": [f"{r}_wool" for r in RENK16],
    # Bedrock'un "stone_crafting_materials" etiketi: firin, piston, taş aletler
    "@stone": ["cobblestone", "blackstone", "cobbled_deepslate"],
}


def fiyat_tarifleri():
    """fiyat.js'teki TARIF tablosu. Mojang dokumunde ETIKETLI girdi kullanan
    tarifler eksik kaliyor; onlari buradan aliyoruz. Bu tablo zaten
    arac/arbitraj.mjs tarafindan kar acigina karsi denetleniyor."""
    kaynak = (KOK / "Market_BP" / "scripts" / "fiyat.js").read_text(encoding="utf-8")
    blok = kaynak[kaynak.index("const TARIF = {"):kaynak.index("// alet/zirh malzeme degerleri")]
    out = {}
    for m in re.finditer(r"^\s{2}([a-z_0-9]+):\s*\{ g: \[(.+?)\], n: (\d+) \}", blok, re.M):
        girdi = [[g, int(a)] for g, a in re.findall(r'\["([a-z_0-9]+)",\s*(\d+)\]', m.group(2))]
        if girdi:
            out[m.group(1)] = (int(m.group(3)), girdi)
    return out


# fiyat.js tek bir agac turu yaziyor (oak_planks); uretimde HEPSI kabul
# edilsin diye etikete cevriliyor.
# NOT: "stone" (duz tas) genellenmiyor - tas kesici tarifi gercekten duz
# tas istiyor, cobblestone kabul etmiyor.
GENELLE = {"oak_planks": "@planks", "oak_log": "@logs", "oak_slab": "@wooden_slab",
           "coal": "@coals", "white_wool": "@wool", "cobblestone": "@stone"}


def main():
    veri = json.loads(KAYNAK.read_text(encoding="utf-8"))
    satirlar, atlanan = [], []
    for t in veri["tarifler"]:
        if t.get("t") != "c":
            continue
        cikti = duzelt(t["o"])
        if cikti in ATLA:
            atlanan.append(t["o"]); continue
        girdi = []
        kotu = False
        for g, adet in t["g"]:
            gg = duzelt(g)
            if gg in ATLA:
                kotu = True; break
            girdi.append(f"{gg}:{adet}")
        if kotu:
            atlanan.append(t["o"]); continue
        satirlar.append(f"{cikti}|{t['n']}|{','.join(girdi)}")

    # Mojang dokumunde eksik kalan (etiketli girdi kullanan) tarifler
    yazilan0 = {x.split("|")[0] for x in satirlar}
    etiketli = 0
    for cikti, (adet, girdi) in sorted(fiyat_tarifleri().items()):
        if cikti in yazilan0 or cikti in ELLE:
            continue
        parcalar = []
        for g, n in girdi:
            parcalar.append(f"{GENELLE.get(g, g)}:{n}")
        ad = f"mk:{cikti}" if cikti.startswith("ametis_") else cikti
        satirlar.append(f"{ad}|{adet}|{','.join(parcalar)}")
        etiketli += 1

    # Elle yazilan tarifler (joker girdi yuzunden elenmis ama onemli olanlar)
    yazilan = {x.split("|")[0] for x in satirlar}
    elle = 0
    for cikti, (adet, girdi) in ELLE.items():
        if cikti in yazilan:
            continue
        satirlar.append(f"{cikti}|{adet}|{','.join(f'{g}:{n}' for g, n in girdi)}")
        elle += 1

    satirlar.sort()
    # 3'erli satirlar: dosya okunabilir kalsin
    bloklar = []
    for i in range(0, len(satirlar), 3):
        bloklar.append("  " + " ".join(f'"{x}",' for x in satirlar[i:i + 3]))

    etiket_js = ",\n".join(
        '  "%s": [%s]' % (k, ", ".join(f'"minecraft:{x}"' for x in v))
        for k, v in ETIKET.items())
    metin = f'''// ============ URETIM TARIFLERI ============
// arac/tarif_guncelle.py tarafindan Mojang'in kendi tarif dosyalarindan
// uretilmistir. ELLE DUZENLEME: uretici yeniden calisinca ustune yazar.
//
// Kaynak: {veri["kaynak"]}
// {len(satirlar)} tarif ({elle} tanesi elle eklendi: Bedrock joker "dye" girdisi).
//
// Bicim: "<cikti>|<adet>|<girdi>:<adet>,<girdi>:<adet>"

const HAM = [
{chr(10).join(bloklar)}
];

// Etiketli girdiler: "@planks" = herhangi bir kalas. Bedrock'un tarif
// dosyalari etiket kullaniyor, JSON dokumu bunlari cozemiyordu; en cok
// kullanilan tarifler (cubuk, sandik, meshale, firin) boyle geri geldi.
export const ETIKETLER = {{
{etiket_js}
}};

// cikti id -> [{{ n, g: [[girdi, adet], ...] }}, ...]   (bir ciktinin birden
// fazla tarifi olabilir: farkli agac turleri, farkli tas turleri...)
export const TARIFLER = new Map();
for (const satir of HAM) {{
  const [cikti, adet, girdiler] = satir.split("|");
  const g = girdiler.split(",").map(x => {{
    const i = x.lastIndexOf(":");
    const ad = x.slice(0, i);
    return [ad.startsWith("@") || ad.includes(":") ? ad : `minecraft:${{ad}}`, +x.slice(i + 1)];
  }});
  const id = cikti.includes(":") ? cikti : `minecraft:${{cikti}}`;
  if (!TARIFLER.has(id)) TARIFLER.set(id, []);
  TARIFLER.get(id).push({{ n: +adet, g }});
}}

export const TARIF_SAYISI = HAM.length;
'''
    HEDEF.write_text(metin, encoding="utf-8")
    print(f"{HEDEF} yazildi: {len(satirlar)} tarif ({etiketli} etiketli + {elle} elle), {len(atlanan)} atlandi.")
    if atlanan:
        print("  atlananlar:", " ".join(sorted(set(atlanan))))


if __name__ == "__main__":
    main()
