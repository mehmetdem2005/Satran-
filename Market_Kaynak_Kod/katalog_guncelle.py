#!/usr/bin/env python3
"""Vanilla esya katalogunu Mojang'in resmi metadata'sindan tazeler.

Minecraft yeni surum cikardiginda calistir:  python3 katalog_guncelle.py
Market_BP/scripts/esyalar.js icindeki VANILLA blogunu yeniden yazar.
Internet yoksa hicbir sey degistirmez.
"""
import json, textwrap, sys, urllib.request, pathlib

KAYNAK = ("https://raw.githubusercontent.com/Mojang/bedrock-samples/main/"
          "metadata/vanilladata_modules/mojang-items.json")
HEDEF = pathlib.Path(__file__).parent / "Market_BP" / "scripts" / "esyalar.js"
BAS = "// >>> VANILLA_BASLA"
SON = "// <<< VANILLA_BITTI"

def main():
    print(f"Indiriliyor: {KAYNAK}")
    try:
        with urllib.request.urlopen(KAYNAK, timeout=60) as c:
            veri = json.load(c)
    except Exception as e:
        print(f"HATA: indirilemedi ({e}). Dosya degistirilmedi.")
        return 1

    idler = sorted({x["name"].replace("minecraft:", "") for x in veri["data_items"]})
    if len(idler) < 500:
        print(f"HATA: liste sasirtici derecede kisa ({len(idler)}). Dosya degistirilmedi.")
        return 1

    satirlar = textwrap.wrap(" ".join(idler), width=104,
                             break_long_words=False, break_on_hyphens=False)
    blok = "\n".join('  "%s",' % s for s in satirlar).rstrip(",")
    yeni = (f'{BAS} (katalog_guncelle.py bu blogu yeniden yazar)\n'
            f'const VANILLA = [\n{blok}\n].join(" ").split(" ");\n{SON}')

    metin = HEDEF.read_text(encoding="utf-8")
    i, j = metin.find(BAS), metin.find(SON)
    if i == -1 or j == -1:
        print("HATA: esyalar.js icinde VANILLA isaretleri bulunamadi.")
        return 1
    HEDEF.write_text(metin[:i] + yeni + metin[j + len(SON):], encoding="utf-8")
    print(f"Tamam: {len(idler)} esya yazildi -> {HEDEF}")
    print("Simdi 'bash paketle.sh' ile yeni .mcaddon uret.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
