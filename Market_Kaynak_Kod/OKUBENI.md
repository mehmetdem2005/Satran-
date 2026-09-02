# Market & Ekonomi — Kaynak Kod (v2.0)

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

1. **Pakete gömülü vanilla katalog** (`scripts/esyalar.js`) eklendi. Aday
   eşya id'leri aile şablonlarından üretiliyor (ahşap, renk, taş, bakır,
   alet/zırh, doğurma yumurtaları, plaklar, çanak kırıntıları, zırh süsleme
   şablonları, mercan, froglight...). Her aday `new ItemStack` ile
   deneniyor; oyunda gerçekten olmayan id sessizce eleniyor. Yani fazla
   üretmek zararsız, az üretmek eksik markete yol açar.
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

## Klasör yapısı

```
Market_BP/                 Behavior Pack (mantık, script, tarifler)
  manifest.json             Pack kimliği, sürüm, script/RP bağımlılığı
  pack_icon.png              Pack kapak görseli
  items/
    kontrol_kitabi.json      Custom "Market Kontrol Kitabı" item tanımı
  recipes/
    kontrol_kitabi.json      Crafting Table tarifi (1 Kitap + 1 Gold Ingot)
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
bash paketle.sh          # -> Market_v2.0.mcaddon
```

Sürüm numarası hem `manifest.json` dosyalarında hem de `main.js` içindeki
`CFG.surum` alanında tutuluyor — ikisini birlikte güncellemek gerekiyor,
yoksa Minecraft "kopya paket" uyarısı verir.
