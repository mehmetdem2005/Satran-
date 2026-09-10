# The Skitter — Minecraft Bedrock Addon

Bu klasör, **The Skitter** (`spiderhunt`, Fabric 1.20.1–1.20.4, yazar: *Adalances*)
Java modunun **Minecraft Bedrock** sürümüdür. Mod `.jar` dosyasından decompile
edilip Bedrock'un davranış paketi + kaynak paketi + Script API mimarisine
birebir taşındı.

```
dist/TheSkitter.mcaddon      <- oyuna çift tıklayıp kurabileceğin dosya
dist/TheSkitter_BP.mcpack    <- sadece davranış paketi
dist/TheSkitter_RP.mcpack    <- sadece kaynak paketi
```

## Kurulum

1. `./build.sh` çalıştır (veya hazır `dist/TheSkitter.mcaddon` dosyasını kullan).
2. `.mcaddon` dosyasına çift tıkla — Minecraft paketleri kendisi içeri alır.
3. Dünyayı oluştururken/düzenlerken:
   - **Davranış Paketleri** → *The Skitter [Davranış]* → Etkinleştir
   - **Kaynak Paketleri** → *The Skitter [Kaynak]* → Etkinleştir (davranış
     paketi zaten bağımlılık olarak çeker)
   - **Deneysel Ayarlar → Beta API'leri** gerekmez; pakette yalnızca kararlı
     `@minecraft/server 1.11.0` modülü kullanılıyor.

Dünyaya ilk giren oyuncunun yakınında yaratık kendiliğinden doğar — Java
modundaki `WorldState` davranışının aynısı (15–35 blok mesafe, av açık).

## Komutlar

Java'daki `/spider ...` komut ağacı Bedrock'ta `/scriptevent` üzerinden
sunuluyor (Bedrock'un kararlı Script API'si kendi komutunu kaydedemiyor).
Operatör yetkisi gerekir — Java'daki `requires(permission level 2)` ile aynı.

| Java | Bedrock |
| --- | --- |
| `/spider summon [faz]` | `/scriptevent skitter:summon 3` |
| `/spider remove` | `/scriptevent skitter:remove` |
| `/spider hunt on\|off` | `/scriptevent skitter:hunt on` |
| `/spider phase <1-5>` | `/scriptevent skitter:phase 4` |
| `/spider status` | `/scriptevent skitter:status` |
| `/spider scale <0.1-20>` | `/scriptevent skitter:scale 2.5` |
| `/spider cosmetic [widow\|husk]` | `/scriptevent skitter:cosmetic husk` |
| `/spider reload` | `/scriptevent skitter:reload` |
| ModMenu / cloth-config ekranı | `/scriptevent skitter:config <anahtar> <değer>` |
| — | `/scriptevent skitter:resetworld` (avı sıfırdan başlatır) |

Sohbet kısayolu da var: `!spider status`, `!spider summon 3` … (bazı Bedrock
sürümlerinde sohbet olayı script'e açık değil; o zaman `/scriptevent` kullan.)

## Ayarlar

`config/spiderhunt.json` yerine ayarlar dünyanın dynamic property'sinde tutulur.
`the_skitter_BP/scripts/config.js` içindeki `DEFAULTS` bloğu Java'daki
`ConfigData` sınıfının **birebir** aynısıdır — 44 alanın hepsi, aynı isim ve
aynı varsayılan değerle.

```
/scriptevent skitter:config list                 # varsayılandan sapan değerler
/scriptevent skitter:config poisonChance         # tek değeri oku
/scriptevent skitter:config poisonChance 0.9     # değeri değiştir (kalıcı)
/scriptevent skitter:config reset                # hepsini sıfırla
```

## Neler birebir taşındı

Aşağıdakilerin tamamı Java kaynağındaki formül, eşik, olasılık ve sayaçlarla
**aynı değerlerle** çalışıyor:

* **Hunt** — 5 faz, `growthFactor^(faz-1)` büyüme, `killsBase + killsStep*(faz-1)`
  ile faz atlama, faz başına hasar / menzil / hız / can / görüş yarıçapı.
* **Creature** — özel hareket motoru: ivmelenme + frenleme mesafesi, dönüş hızı,
  adım-yukarı / eksen-ayırma çarpışma çözümü, yer çekimi ve iniş, tırmanma
  (`tryStartClimb`, duvara kilitlenme, 300 tick sınırı), gömülme (`burrow`),
  kazarak alçalma (`digDescend`), zıplarken blok parçalama (`smashThrough`).
* **Bacaklar** — `LimbLayout`'un 4 sıra × 2 yan yerleşimi, segment uzunlukları,
  adım tetikleme mesafeleri, adım süresi/kaldırma yüksekliği, yürüyüş ve dörtnal
  bacak grupları, ayak basma sesleri; gövde yüksekliği yere basan ayakların
  ortalamasından, gövde eğimi (`pitch`/`roll`) ayakların eğiminden hesaplanıyor.
* **HunterBrain** — hedef seçimi ve kin (grudge) sistemi, sinsi takip
  (`silentPursuit`), sabit bakış (`stalk`), sahte hücum (`mock`), geri çekilme
  (`retreat`) ve karşı sıçrama, merhamet (`mercy`), av kapma ve yeme, oyuncuyu
  ağla kapıp ağzına çekme, ağ çekişi (`webPull`), zıplama şarjı/uçuşu/inişi,
  iniş sarsıntısı ve zemin ezmesi, sıkışma tespiti ve kaybolma, kaçış (`flee`).
* **MiniHunterBrain** — 25 blok algı, 1.3 menzil, 15 tick ısırık aralığı,
  %20 zehir.
* **BlockBreaker** — duvar ve dikey tarama kutuları, sertlik → tick dönüşümü
  (4–40 arası), faza bağlı eşzamanlı iş sayısı `clamp(2*faz-2, 2, 8)`,
  25 tick "coast" süresi.
* **GameMaster** — oyuncunun arkasında 20–30 blok mesafeye yeniden doğurma.
* **WorldState** — ilk doğum, dünya kaydından geri yükleme, faz/öldürme sayısı.
* **HuntingKt** — hasar + 10 tick hasar bekleme, ölüm, faz 5'te ağ patlaması ve
  yavru sürüsü, avlanabilirlik filtreleri (su canlıları hariç, yaratıcı/izleyici
  oyuncular hariç).

## Bedrock'ta zorunlu olarak farklı olanlar

Java modu görüntüyü **block display** entity'leriyle çiziyor ve her bacağı FABRIK
ters kinematiğiyle çözüyor. Bedrock'ta böyle bir entity yok, bu yüzden:

| Java | Bedrock karşılığı |
| --- | --- |
| ~40 block-display + `Interaction` hitbox + gizli silverfish "decoy" | tek bir gerçek `skitter:skitter` entity'si; model, hitbox ve hasar kaynağı aynı anda |
| FABRIK ile çözülen bacak eklemleri (sadece çizim için) | aynı bacak yerleşiminden üretilmiş kemikli model + aynı yürüyüş gruplarıyla üretilmiş animasyon; **fizik tarafı** (ayak basma, gövde yüksekliği, eğim) yine birebir simüle ediliyor |
| `setBlockBreakingInfo` çatlak katmanı | kazılan blokta toz partikülü + kazma sesi (kırılma süresi aynı) |
| `class_8043` hurt-animation paketi ile ekran sarsma | `/camerashake` (Bedrock'un gerçek kamera sarsıntısı) |
| `player.isBlocking()` | Bedrock'ta kalkan çömelirken bloklar: *elde kalkan + çömelme*; 0.35'lik bakış açısı testi aynı |
| `disableShield()` | Bedrock'ta API yok — faz 5'te kalkan kırılma sesi çalınır, itme uygulanır |
| Demir golemleri decoy'a saldırtan tarama | entity `monster`/`undead` ailesinde olduğu için golemler zaten kendiliğinden saldırır |
| `BlockState.getDestroySpeed()` | Script API sertlik vermiyor; `world_util.js` içindeki tablo vanilla sertlik değerlerini taşıyor (bilinmeyen blok = 1.5) |
| `spawnParticle(..., extra)` hız parametresi | Bedrock'un `spawnParticle`'ında karşılığı yok; sayı, dağılım ve konum aynı, partikül hızı yok |
| Brigadier `/spider` komutu | `/scriptevent skitter:*` (yukarıdaki tablo) |
| ModMenu + cloth-config ekranı | `/scriptevent skitter:config` |
| `config/spiderhunt.json` | dünya dynamic property'si |
| `data/spiderhunt_state.json` | dünya dynamic property'si |

`Hunt.announce` Java'da bilerek boş bırakılmış (yaratık kendini anlatmaz);
port da aynı şekilde sessiz — hata ayıklamak için `hunt.js` içindeki
`Hunt.verbose` açılabilir.

## Görsel

İki kozmetik de modeldeki blok paletinden üretildi:

* **widow** — blackstone / polished blackstone / polished basalt gövde,
  brown terracotta diz, kemik blok zehir dişleri, parlayan kırmızı redstone gözler.
* **husk** — calcite / tuff / kemik gövde, parlayan soul-sand çekirdek.

Gözler ve çekirdek `entity_emissive_alpha` malzemesiyle karanlıkta parlar.
Boyut tamamen script'ten geliyor (`skitter:scale` özelliği), yani `/spider scale`
karşılığı Bedrock'ta da sürekli ölçekte çalışır.

## Geliştirme

```
./build.sh                    # üret + doğrula + test et + paketle
python3 tools/generate_assets.py   # model/animasyon/doku üret
python3 tools/validate.py          # paket içi tutarlılık denetimi
node tools/testbed/parity.mjs      # Java ile sayısal denklik testi
node tools/testbed/run.mjs         # davranış paketini oyunsuz çalıştır
```

İki ayrı doğrulama katmanı var:

* **`tools/testbed/parity.mjs`** — Java kaynağındaki sabitlerden bağımsız olarak
  üretilen `parity_expected.json` ile portun ürettiği değerleri karşılaştırır:
  44 config alanı, 5 fazın 9 türev değeri (boyut, görüş yarıçapı, hasar, menzil,
  dikey menzil, hız, can, öldürme eşiği) ve hem ana yaratığın hem yavruların
  `LimbLayout` sabitleri + 8 bacağın kalça/ev/segment vektörleri ve yürüyüş
  grupları. Toplam **301 değer**, hepsi birebir tutuyor.
* **`tools/testbed/run.mjs`** — küçük bir `@minecraft/server` taklidiyle davranış
  paketini gerçek bir tick döngüsünde ~4400 tick koşturur (çağırma, faz
  değiştirme, hasar, faz-5 ölümü ve yavru sürüsü, duvar kazma, tırmanma, tüm
  animasyon durumları). Import ve çalışma zamanı hataları oyuna girmeden burada
  yakalanır.

`tools/validate.py` de paket içi çapraz referansları denetler (geometri/doku/
animasyon adları, kemik isimleri, entity property'leri, component group'lar).

## Dosya haritası

```
the_skitter_BP/
  entities/skitter.json          faz başına collision box + entity property'ler
  scripts/
    main.js                      SpiderHuntMod (giriş noktası, tick döngüsü, olaylar)
    creature.js                  Creature + Limb + LimbLayout
    brains.js                    HunterBrain + MiniHunterBrain
    breaker.js                   BlockBreaker
    hunt.js                      Hunt
    hunting.js                   HuntingKt (hasar, ölüm, av filtreleri)
    gamemaster.js                GameMaster
    state.js                     AppState + WorldState
    commands.js                  CommandsKt
    config.js                    ConfigData + SpiderConfig
    entity_link.js               simülasyon <-> Bedrock entity köprüsü
    entity_info.js               Bedrock'ta olmayan entity boyut bilgileri
    world_util.js                UtilitiesKt (ışın izleme, ses, partikül, sertlik)
    vec.js                       Vector + MathsKt
    players.js                   oyuncu filtreleri (Java'daki üç ayrı filtre)
    hooks.js                     döngüsel import'ları kırmak için küçük ara katman
the_skitter_RP/
  entity/, models/, animations/, animation_controllers/,
  render_controllers/, textures/          hepsi tools/generate_assets.py ile üretilir
tools/
  generate_assets.py, validate.py, png.py, testbed/
```

## Lisans

Orijinal mod gibi MIT. Prosedürel animasyon fikri Heledron'un videolarından
ilham almıştır; uygulama özgündür (orijinal modun kendi açıklamasındaki not).
