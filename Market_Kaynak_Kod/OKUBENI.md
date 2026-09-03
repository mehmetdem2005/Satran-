# Market & Ekonomi — Kaynak Kod (v2.1)

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
katalog_guncelle.py        Vanilla eşya listesini Mojang metadata'sından tazeler
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
bash paketle.sh          # -> Market_v2.1.mcaddon
```

Sürüm numarası hem `manifest.json` dosyalarında hem de `main.js` içindeki
`CFG.surum` alanında tutuluyor — ikisini birlikte güncellemek gerekiyor,
yoksa Minecraft "kopya paket" uyarısı verir.
