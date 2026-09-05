# Market & Ekonomi — Kaynak Kod (v2.6)

Bu klasör Minecraft Bedrock için yazılan Market/Ekonomi addon'ının tüm
kaynak dosyalarını içerir. `.mcaddon` sadece bunların zip'lenmiş hali;
burada olan her şey aynen o dosyanın içinde de var — fark, bunun
düzenlenebilir/okunabilir halde durması.

## v2.0'da ne düzeldi: "markette ve takasta tüm itemler yok"

Eski sürümde eşya listesi **yalnızca** oyunun çalışma zamanı kayıtlarından
(`ItemTypes.getAll()` + `BlockTypes.getAll()`) kuruluyordu. Bu iki kayıt
bazı Bedrock yapılarında eksik dönüyor; eksik dönünce markette ve takasta
eşyaların büyük kısmı hiç görünmüyordu. Üstelik liste ilk kurulduğu haliyle
oturum boyunca önbelleğe çakılıyordu — kötü bir ilk kurulum kalıcı oluyordu.

v2.0'da:

1. **Pakete gömülü vanilla katalog** (`scripts/esyalar.js`) eklendi.
   Listenin ana kaynağı Mojang'ın kendi metadata dosyası
   (`bedrock-samples/metadata/vanilladata_modules/mojang-items.json`) —
   oyunun **1607 vanilla eşya id'sinin tamamı**. Bu şart, çünkü Bedrock'ta
   id'lerin çoğu tahmin edilemiyor: meşe kapısı `oak_door` değil
   `wooden_door`, meşe çiti `oak_fence_gate` değil `fence_gate`, yatak
   `white_bed` değil `bed`. İlk denemede bunları şablonla üretmeye
   çalışmıştım ve 264 gerçek eşyayı kaçırıyordu. Resmî listenin yanında
   eski sürüm/takma adlar için aile şablonları da duruyor. Her aday
   `new ItemStack` ile deneniyor; oyunda olmayan id sessizce eleniyor.
   Listeyi tazelemek için: `python3 katalog_guncelle.py`.
2. **Kaynaklar harmanlanıyor:** oyunun eşya kaydı + blok kaydı + gömülü
   katalog + oyuncuların envanteri + açık ilanlar. Bir kaynak boş dönerse
   diğerleri listeyi tamamlıyor.
3. **Kötü liste artık kalıcı değil.** Kurulum 200'ün altında eşya bulursa
   liste "sağlıksız" işaretlenip 30 saniye sonra yeniden kuruluyor.
   `!yenile` ile elle de tazelenebilir, `!liste` durumu yazar.
4. **Yasak listesi küçültüldü.** Doğurma yumurtaları, kafalar, yazılı kitap,
   harita, ejderha yumurtası gibi tamamen ticarete uygun eşyalar eskiden
   yasaklıydı ve hiç görünmüyordu. Artık sadece verilemez teknik bloklar
   (hava, su, lav, komut bloğu, bariyer...) dışarıda.
5. **Fiyat motoru yeni aileleri tanıyor** — doğurma yumurtası, kafa, çanak
   kırıntısı, bakır aşamaları, mercan, froglight, vagonlar, demirci
   şablonları... Hepsi MAKAS kuralına uyuyor (işlenmiş ürün girdisinden
   pahalı, sonsuz para açığı yok).
6. **Kategoriler yenilendi:** Doğurma Yumurtaları ve Kırmızı Taş &
   Mekanizma eklendi, Renkli & Dekor ayrıldı. Hazır Market'e "Tüm Eşyalar"
   sayfası kondu.
7. **Türkçe arama.** "elmas", "beyaz yün", "meşe tahta", "inek yumurtası"
   gibi aramalar çalışıyor; sözlük `esyalar.js` içindeki `ARAMA_SOZLUK`.
8. **Admin panelindeki buton/indeks hatası düzeldi** ("< Geri" arsa
   yönetimini açıyordu) ve panele "Eşya Listesini Yenile" eklendi.

Aynı test ortamında (oyun kaydı bilerek eksik döndürülerek) eski kod 460
eşya listeliyordu, yeni kod 1601 eşya listeliyor.

## Arsa / bölge sistemi (v2.0'da düzeltilenler)

**"Koruma çalışmıyor" sorununun asıl nedeni:** `adminMi()` fonksiyonu
`commandPermissionLevel >= 1` diyordu. Hile açık bir dünyada dünya sahibi ve
bütün operatörler bu eşiği geçiyor, `korumaKontrol` onlara "izinli" diyor ve
arsa koruması hiç uygulanmıyordu. Test eden kişi genelde dünyanın sahibi
olduğu için sistem "hiç çalışmıyor" gibi görünüyordu.

Düzeltmeler:

1. **Operatörler artık arsa korumasını geçmiyor.** Muafiyet yalnızca
   `market_admin` etiketiyle: `/tag "Oyuncu" add market_admin`. Operatörlerin
   yine geçmesini istersen `arsa.js` içinde `ARSA_CFG.adminGecebilir = true`
   yap. Market admin paneli için eşik de sıkılaştırıldı.
2. **Varlık koruması eklendi.** Eskiden sadece blok kırma/koyma/etkileşim
   korunuyordu; yabancı biri arsadaki eşya çerçevelerinden eşya alabiliyor,
   zırh standını soyabiliyor, hayvanları öldürebiliyordu. Artık
   `playerInteractWithEntity` engelleniyor ve arsadaki canlılara vuran
   yabancının verdiği hasar geri veriliyor (`ARSA_CFG.hayvanKorumasi`).
   Tek vuruşta öldüren hasar geri alınamaz — bu bir caydırıcı, mutlak kalkan
   değil.
3. **Veri önbelleğe alındı.** Her blok kırmada ve her tikte dynamic property
   okunup `JSON.parse` ediliyordu; kalabalık dünyada belirgin gecikme
   yapıyordu. Artık bellekte tutuluyor, yazınca tazeleniyor.
4. **Giriş/çıkış bildirimi 5 saniyede bir yerine ~1 saniyede bir.** Oyuncu
   arsaya girip çıktığında çoğu zaman hiçbir şey görmüyordu.
5. **Köşe 1 artık diske yazılıyor.** Script yeniden yüklenince (dünya
   kapanıp açılınca) seçtiğin köşe kaybolmuyor.
6. **"Koruma Durumu" ekranı eklendi** (Arsa menüsü > Koruma Durumu): hangi
   korumanın kayıt olduğunu, kaç arsa olduğunu ve senin muaf olup
   olmadığını yazar. Bir şey çalışmıyorsa ilk buraya bak.
7. **"Sınırları Göster"**: arsanın sınırlarını parçacıkla çizer — arsanın
   gerçekten nerede olduğunu gözle görürsün.
8. **Çevrimdışı oyuncu üye eklenebiliyor** (elle isim yazarak). Eskiden
   online kimse yoksa üye eklenemiyordu.
9. Çakışma mesajı artık hangi arsayla çakıştığını söylüyor; küçük alan
   uyarısı ne yapman gerektiğini yazıyor.

Arsa ayarları `arsa.js` en başındaki `ARSA_CFG` içinde: blok başı fiyat,
en küçük/en büyük kenar, oyuncu başına arsa sayısı, iade oranı.

## Düello / PvP arenası (v2.3)

İki oyuncu **eşit kitle**, ayrı bir arenada dövüşür. Kimse envanterini
kaybetmez.

**Akış:** `!dovus` → Meydan Oku → oyuncu ve (isteğe bağlı) bahis seç →
karşı tarafa istek gider → kabul edilirse ikisi de arenaya ışınlanır →
5 saniye geri sayım → dövüş → kazanan ödülü alır → **herkes isteği kabul
ettiği konuma geri ışınlanır, envanteri ve zırhı aynen geri gelir.**

**Kit** (ikisine de birebir aynı, `dovus.js` içindeki `KIT`):

- Elmas zırh takımı + kalkan (el dışı slotta)
- **Demir** kılıç ve balta — dövüş tek vuruşta bitmesin diye demir
- Mızrak (üç dişli mızrak / trident)
- Yay, arbalet, 64 ok
- Elytra + 32 havai fişek — envanterde durur, isteyen göğüslük yerine takar
- 8 pişmiş biftek

**Eşya kaybı neden olmuyor:**

1. Dövüş başlarken envanter + zırh + el dışı slot + konum + bakış açısı
   kaydedilir. Kayıt dünyanın dynamic property'sine yazılır, yani oyun
   çökse bile durur.
2. Canı `bitisCani` (varsayılan 2 kalp) altına düşen kaybeder — ölüm
   beklenmez, dolayısıyla eşya düşmez.
3. Yine de biri ölürse yedek plan: `entityDie` dövüşü bitirir, dövüş
   alanına düşmüş eşyalar silinir (kit çoğalmasın), envanter kayıttan
   geri yüklenir.
4. Oyuncu dövüş sırasında çıkarsa rakip kazanır; çıkan oyuncunun kaydı
   durur ve **oyuna girdiği anda** eşyaları iade edilir.
5. Dövüş sırasında market ve arsa menüleri kapalıdır — yoksa kit satılıp
   para basılabilirdi.

**Arena (v2.6'da baştan yazıldı).** Eski sürümdeki hata şuydu: arena
uzak bir koordinatta (30000, 120, 30000) kuruluyordu ama **o bölgenin
chunk'ları yüklü değildi**, dolayısıyla `/fill` komutları sessizce
başarısız oluyordu. Zemin hiç oluşmuyor, oyuncular boşluğa ışınlanıyor,
düşüyor, sınır kontrolü onları tekrar yukarı atıyordu — sonsuz döngü.

Şimdi:

1. Düello kabul edilince önce `tickingarea` eklenip **chunk'lar yüklenene
   kadar beklenir** (15 saniyeye kadar, oyunculara "arena yükleniyor"
   yazar). Yüklenmezse düello iptal edilir — kimse ışınlanmaz.
2. Zemin yoksa arena kurulur ve **zemin bloğu okunarak doğrulanır**.
   Doğrulanamazsa düello başlamaz.
3. Işınlama, hedefin **ayağının altında blok var mı** diye bakar; yoksa
   ışınlamaz. Bu iki kontrol boşluğa düşmeyi tamamen kapatıyor.
4. Dövüş sırasında biri arena dışına çıkarsa geri konur; ama geri koyma
   üst üste 4 kez gerekirse (zemin bozulmuş demektir) düello iptal edilip
   herkes eşyalarıyla eski yerine döner — döngü kırılır.

Arena 41x41, duvarları 18 blok yüksek ve **tavanı da kapalı** (elytra ile
kaçılmasın). Admin "Arenayı Buraya Kur" ile durduğu yere kurabilir — o
noktanın chunk'ı zaten yüklü olduğu için en garantili yol budur.

**Ödül:** Bahissizse kazanana 250$ (sistemden). Bahisliyse iki bahis de
kazanana gider; berabere biterse bahisler iade edilir. Süre sınırı 5
dakika — dolarsa canı fazla olan kazanır.

Ayarlar `scripts/dovus.js` içindeki `DOVUS_CFG` ve `KIT` sabitlerinde.

## Fiyatlandırma (v2.4'te elden geçti)

Fiyatlar artık üç katmanda hesaplanıyor:

1. **Ham madde tabanı** (`TABAN`): kazılarak/toplanarak elde edilen ~200
   şeyin değeri elle verilir. Tek "gerçek" girdi burasıdır.
2. **Craft tarifleri** (`TARIF`, ~150 tarif): işlenmiş eşyanın değeri
   girdilerinden hesaplanır — `değer = toplam(girdi) / çıktı adedi × 1.15`.
   Sandık artık "5" değil, 8 tahtanın karşılığı. Kule (beacon) nether
   yıldızından pahalı, örs 3 demir bloğu + 4 külçe kadar.
   Ahşap aileler (kapı, çit, tabela, merdiven, plaka, kayık...) tek tek
   yazılmaz; her ağaç türü için aynı tarif kendi tahtasından işletilir.
3. **Türetme kuralları**: tarifi olmayanlar için aile kuralları
   (9'luk bloklar, cevherler, alet/zırh malzemesi, bakır aşamaları,
   renk aileleri, eski Bedrock adları...).

Sonuç: varsayılan fiyata düşen eşya sayısı **140'tan 81'e** indi (%6),
ve bunların çoğu zaten gerçekten o değerde olması gerekenler.

**Büyü ve hasar artık fiyata giriyor.** Satış yolları düz tür fiyatını
değil `esyaDegeri(yığın)` değerini kullanıyor:

- Hasarlı alet: tam sağlam ×1.0 → kırılmak üzere ×0.2
- Büyülü eşya: her büyü seviyesi +%12 (en fazla 3 kat)
- Adlandırılmış eşya: +%5

Örnek: düz elmas kılıç 209$, 10 seviye büyülü 460$, %90 yıpranmış 59$.
Toplu satış da yığın yığın hesaplar.

**Sonsuz para açığı denetimi:** `node arac/arbitraj.mjs` her tarifi,
eritmeyi ve 9'luk blok çevrimini tek tek sınar — "ucuz al → craftla →
pahalı sat" ile para basılabiliyor mu diye. Şu an 197 kontrol, 0 açık.
Fiyat değiştirdiğinde bunu çalıştır.

## Eşya görselleri (v2.2)

İkon yolları tahmin edilmiyor. `scripts/ikonlar.js`, Mojang'ın resmî
vanilla resource pack verisinden (`item_texture.json`,
`terrain_texture.json`, `blocks.json`) üretilmiş id → doku yolu haritasını
taşıyor. Bedrock'ta doku adları id'den bağımsız olduğu için (kitap →
`book_normal`, çiğ et → `beef_raw`, boya → `dye_powder_*`, plak →
`record_*`) bu şart.

**v2.4'te mor-siyah kareler düzeldi.** İki nedeni vardı:

- Harita `main` dalından (preview sürüm) üretiliyordu; oradaki yollar
  1.21.90'da bulunmuyor. Artık ana kaynak **oyunun sürümüyle eşleşen
  etiket** (`v1.21.90.3`), `main` yalnızca daha yeni sürümlerde eklenen
  eşyalar için ek kaynak.
- Üretilen her yol, o sürümün kendi texture tanımlarında **gerçekten
  geçiyor mu** diye doğrulanıyor; geçmiyorsa haritaya hiç yazılmıyor.
  `icons.js` de artık yol uyduramıyor: doğrulanmış yol yoksa soru işareti
  görselini koyuyor (mor-siyah kare yerine).

Ölçüm: 1.21.90'daki 1396 eşyanın **1395'i** doğrulanmış bir dokuya
işaret ediyor.

Çözülemeyenler için sırasıyla: `icons.js` içindeki `OZEL` tablosu, renk
ailesi şablonları, kök blok ikonu, son çare `textures/items/<id>` tahmini.
Listeyi tazelemek için: `python3 ikon_guncelle.py`.

## Arsa sopası (claim wand)

Craft masasında **2x2 çubuk (4 çubuk)** ile yapılır. `!sopa` komutu ya da
Arsa menüsündeki "Arsa Sopası Al" düğmesi de envanterindeki 4 çubuğu alıp
sopayı verir.

| Hareket | Ne yapar |
|---|---|
| Bloğa **sol tık** | 1. köşeyi işaretler (blok kırılmaz) |
| Bloğa **sağ tık** | 2. köşeyi işaretler ve satın alma ekranını açar |
| Havaya **sağ tık** | Arsa menüsünü açar |

Seçim diske yazılır: dünya kapanıp açılsa da köşeler durur. Menüde iki köşe
ve seçili alanın fiyatı görünür, "Seçimi Temizle" ile sıfırlanır. 2. köşeyi
sopayla seçmediysen durduğun yer 2. köşe sayılır (eski davranış).

Sopa ve kontrol kitabı markete konamaz, satılamaz.

Dosyaları: `Market_BP/items/arsa_sopasi.json`,
`Market_BP/recipes/arsa_sopasi.json`, `Market_RP/textures/items/mk_sopa.png`.

## Klasör yapısı

```
Market_BP/                 Behavior Pack (mantık, script, tarifler)
  manifest.json             Pack kimliği, sürüm, script/RP bağımlılığı
  pack_icon.png              Pack kapak görseli
  items/
    kontrol_kitabi.json      Custom "Market Kontrol Kitabı" item tanımı
    arsa_sopasi.json         Custom "Arsa Sopası" item tanımı
  recipes/
    kontrol_kitabi.json      Crafting Table tarifi (1 Kitap + 1 Gold Ingot)
    arsa_sopasi.json         Crafting Table tarifi (2x2 çubuk)
  scripts/
    main.js                  Ana mantık: menüler, ilanlar, komutlar, olaylar
    esyalar.js               Gömülü vanilla eşya katalogu + Türkçe arama sözlüğü
    ikonlar.js               Resmî RP verisinden üretilmiş ikon haritası
    dovus.js                 Düello/PvP arenası (kit, yedekleme, ödül)
    fiyat.js                 Fiyat motoru: ham madde tabanları + türetme kuralları
    arsa.js                  Arsa/bölge koruma sistemi
    icons.js                 Item id -> texture yolu çözücü

Market_RP/                 Resource Pack (görseller, dil)
  manifest.json
  pack_icon.png
  textures/
    item_texture.json        Texture atlası (kontrol kitabı, sandık ikonları)
    items/*.png               Elle çizilmiş ikonlar (kitap, sandık, ender sandık, soru işareti)
  texts/
    en_US.lang, tr_TR.lang    Custom item'ın dil dosyaları
    languages.json

paketle.sh                 Klasörleri .mcaddon'a paketler
arac/arbitraj.mjs          Fiyat açığı denetimi (node arac/arbitraj.mjs)
katalog_guncelle.py        Vanilla eşya listesini Mojang metadata'sından tazeler
ikon_guncelle.py           İkon haritasını resmî resource pack verisinden üretir
```

## Nasıl okunur / düzenlenir

- **Eşya listesine bir şey eklemek** için `esyalar.js` içindeki listelere
  id yazman yeterli. Oyunda yoksa kendiliğinden elenir, zarar vermez.
- **Fiyatları değiştirmek** için `fiyat.js` içindeki `TABAN` nesnesini
  düzenle. `MAKAS` sabiti alış/satış oranını kontrol eder; hiçbir üretim
  çarpanı `MAKAS`'tan büyük olmamalı, yoksa sonsuz para açığı oluşur.
- **Bir eşyayı markette istemiyorsan** `fiyat.js` içindeki `YASAK_TAM`
  kümesine id'sini ekle.
- **Genel ayarlar** (para birimi simgesi, başlangıç parası, komisyon,
  ilan süresi, arsa fiyatı vb.) `main.js` dosyasının en başındaki `CFG`
  nesnesinde.
- **Türkçe arama sözlüğü** `esyalar.js` içindeki `ARAMA_SOZLUK`. Bir
  kelimenin birden fazla karşılığı olabilir: `koyun: ["mutton", "sheep"]`.

## Komutlar

Sohbete yazılır: `!menu !market !ara !sat !takas !alim !teklif !teklifler
!para !arsa !hazir !ilanlarim !rehber !bakiye !id !kitap` ve v2.0 ile
gelen `!yenile` (eşya listesini yeniden kurar), `!liste` (listenin durumunu
ve hangi kaynaktan kaç eşya geldiğini yazar).

Bir şey ters giderse Content Log'daki `[Market]` satırları listenin hangi
kaynaktan kaç eşya topladığını yazıyor.

## Paketleme

```bash
bash paketle.sh          # -> Market_v2.6.mcaddon
```

Sürüm numarası hem `manifest.json` dosyalarında hem de `main.js` içindeki
`CFG.surum` alanında tutuluyor — ikisini birlikte güncellemek gerekiyor,
yoksa Minecraft "kopya paket" uyarısı verir.
