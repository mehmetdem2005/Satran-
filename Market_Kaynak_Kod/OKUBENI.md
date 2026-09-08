# Market & Ekonomi — Kaynak Kod (v3.8)

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

## Düello sahası: arsan ya da durduğun yer (v3.5)

**Düello için artık stadyum kurulmuyor.** Kimsenin arazisi bozulmuyor.

Meydan okuyan, istek gönderirken sahayı da seçiyor:

| Seçenek | Nerede dövüşülür |
|---|---|
| **Burası** | Meydan okuyanın o an durduğu nokta |
| **Arsa: <ad>** | Kendi arsalarından biri (kiraladıkların da listede) |
| **Stadyum** | Daha önce yönetici bir stadyum kurduysa o da seçilebilir |

İkiniz de **aynı noktaya** ışınlanırsınız — aranızda 2 blok, karşılıklı
bakarak (`DOVUS_CFG.ayniNoktaAralik`). Eskiden 61 bloklu sahanın iki ucuna
atılıyordunuz; artık düello başlar başlamaz karşı karşıyasınız.

**Saha sınırı**

- Arsa seçildiyse sınır **arsanın kendi sınırları** (2 blok pay ile).
- Nokta seçildiyse merkez etrafında **40 blok** yarıçap
  (`DOVUS_CFG.arenaYaricap`).
- Dışarı çıkan geri konur; üst üste konamıyorsa (zemin yok) düello iptal
  edilir ve ikisi de eski yerine döner.

**Zemin doğrulaması**

Işınlanmadan önce iki başlangıç noktasının da altında blok olduğu
doğrulanır ve her oyuncunun Y'si **ayrı** hesaplanır — biri yamaçta kalırsa
ortak bir Y ikisinden birini havada bırakıyordu. Zemin bulunamazsa düello
hiç başlamaz ("Sahanın zemini bulunamadı"), kimse ışınlanmaz.

**Arsa koruması düelloyu engellemez**: arsa koruması blokları ve hayvanları
korur, oyunculara karışmaz — kiracı, üye ya da yabancı, arsada PvP serbest.

Düello bitince ikiniz de düello öncesi konumunuza dönersiniz. Takılırsan
`!cik` ya da Düello menüsü > **Düellodan Çık**.

Stadyum kurma/kaldırma düğmeleri yönetici menüsünde duruyor; stadyum kurmak
artık zorunlu değil, sadece isteyene.

## Düello / PvP (v2.9'da baştan yazıldı)

**Mod eşya vermez, envanterine dokunmaz.** Herkes kendi zırhı, silahı ve
yiyeceğiyle dövüşür. Akış: `!dovus` → Meydan Oku → oyuncu ve (isteğe
bağlı) bahis seç → karşı taraf kabul eder → ikisi de stadyuma ışınlanır →
5 saniye geri sayım (bu sırada canınız dolar) → dövüş → kazanan ödülü
alır → **ikisi de eski yerine döner.**

Canı **3 kalbin altına** düşen kaybeder; ölüm beklenmez, dolayısıyla
kendi eşyan yere düşmez. Yine de biri ölürse `entityDie` dövüşü bitirir
ve herkes eski yerine döner (düşen eşya kendi eşyası olduğu için
silinmez).

### v2.9'da düzelen iki hata

1. **Eşyalar geri gelmiyordu.** Eski sürümde envanter boşaltılıp kit
   veriliyordu; envanteri temizleyen satır (`setItem`) try/catch dışındaydı.
   Hata fırlatınca `dovusBitir` yarıda kesiliyordu: ikinci oyuncu ne
   eşyasını geri alıyor ne de ışınlanıyordu. Artık **envantere hiç
   dokunulmuyor**, yani bu hata sınıfı tamamen yok.
2. **Dövüş bitince arenadan çıkılmıyordu.** Aynı kesintinin sonucuydu.
   Şimdi her oyuncunun eve dönüşü kendi `try/catch`'inde; ışınlama her
   hâlükârda deneniyor; bir saniye sonra "hâlâ arenada mı" diye
   doğrulanıp gerekirse tekrar gönderiliyor. Yedeği olmayan oyuncu için
   sırayla kendi yatak noktası → dünya doğma noktası deneniyor.
   Takılan biri için **`!cik`** komutu ve menüde "Stadyumdan Çık" düğmesi
   var; oyuna girişte arenada takılı bulunan oyuncu da otomatik çıkarılıyor.

### Eski arenadan kalan görünmez duvarlar (v3.0)

v2.3–v2.6 arasındaki sürümlerde arena kurulumu yarım kalabiliyordu:
zemin `/fill` komutu chunk yüklü olmadığı için başarısız oluyor ama
`barrier` (görünmez engel) duvarları yerleşiyordu. Sonuç: haritada
"geçilemeyen görünmez duvar".

**Temizlemek için:** o noktaya git ve

- Düello menüsü → **Görünmez Engelleri Temizle** (yarıçap seçtiriyor:
  32/48/64/96 blok), ya da
- yönetici komutu **`!temizle`** (48 blok yarıçap).

Sadece `barrier` blokları silinir; taş, cam gibi görünen bloklara
dokunulmaz (onları elle kırabilirsin). Komut `/fill ... air replace
barrier` kullanır ve fill'in 32768 blok sınırını aşmayacak katmanlara
bölünür.

Yeni stadyum kurulurken de çevrede **25 blok daha geniş** bir alanda eski
görünmez engeller otomatik siliniyor.

**Bayat `tickingarea` düzeltmesi:** arena bölgesi `mk_arena` adlı bir
tickingarea ile yüklü tutuluyor. Aynı isimde eski bir alan varsa `add`
komutu başarısız oluyor ve yeni arena bölgesi hiç yüklenmiyordu; artık
önce `remove`, sonra `add` çalışıyor.

### Stadyumu kaldırma — tek tık (v3.4)

Stadyum yanlış yere kurulduysa (birinin evinin dibine, tarlanın üstüne)
yönetici **Düello menüsü → Stadyumu Kaldır (tek tık)** ya da **`!arenasil`**
(`/mk:arenasil`) der. Form yok, onay ekranı yok, komut yazmak yok: basar
basmaz en yakın stadyumu bulup siler.

**Arenayı nasıl buluyor**

1. Kayıtlı arena yakındaysa (≤ 119 blok) onun **tam merkezi** kullanılır.
2. Kayıt yoksa ya da uzaktaysa merkez **bloklardan bulunur**: oyuncudan
   dört yöne taranıp her yöndeki **en uzak** stadyum bloğu (dış duvar)
   aranır. Duvar merkeze göre simetrik olduğundan iki uzaklıktan merkez
   çıkar. Tek yön görülüyorsa (oyuncu arenanın dışında) merkez yine
   hesaplanır, çünkü yarıçap sabittir.
3. O da bulamazsa etraf kaba bir ızgarayla taranıp bir stadyum bloğu
   bulunur, merkez araması oradan tekrarlanır.

Böylece oyuncu sahanın ortasında, kenarında, tribünün üstünde, dış duvarın
üstünde ya da arenanın hemen dışında dursun — hepsinde doğru merkez bulunur
(test: `tektik2.mjs`, beş konumun beşinde de arena tamamen temizlendi).

**Ne siliniyor**

Yalnızca stadyumun yapıldığı bloklar: taş tuğla duvar/tribün, kuvars oturma
sırası, deniz feneri, beyaz+kırmızı beton pist, görünmez ışık ve görünmez
duvarlar. Ahşap ev, tarla, yol, çim **yerinde kalır**.

Uyarı: blok türüne bakılır. Arenanın içinde **taş tuğladan** yapın varsa o
da silinir.

Ayrıca:

- Görünmez duvarlar (barrier) daha geniş bir kutuda (yarıçap 74, y-20 ile
  y+50 arası) silinir — "geçemiyorum" sorununu yapan onlar.
- `tickingarea mk_arena` kaldırılır.
- Kaldırılan arena **kayıtlı olansa** kayıt silinir; bir sonraki düelloda
  stadyum varsayılan uzak noktaya (30000, 120, 30000) kurulur. Kayıtsız bir
  arena kaldırıldıysa kayda dokunulmaz.
- Merkez kayıttan geldiyse dar bir dikey aralık (zemin-2 … zemin+17),
  bloklardan bulunduysa geniş aralık (y-20 … y+40) taranır.

**Alanı Tamamen Boşalt** ayrı bir düğmedir ve onay ister: seçilen alandaki
her şeyi havaya çevirir (arenanın içindeki yapılar dahil). Sadece gerçekten
boş bir yerde kullan.

Not: Minecraft'ta "geri al" yoktur. Stadyum kurulurken silinen bloklar geri
gelmez; bu araç arenayı kaldırır, altındaki eski araziyi geri getiremez.

Modu güncelleyemeyenler için aynı işi yapan hazır `/fill` komut listesi:
`arac/arena_sil_komutlari.txt`.

### /fill 32768 sınırı (v3.4'te düzeldi)

Arena komutları kutuyu sadece **Y ekseninde** dilimliyordu. Tek bir Y
katmanı bile 32768 bloğu aşıyorsa (yarıçap ~90'dan sonra) her komut sessizce
başarısız oluyordu — "Görünmez Engelleri Temizle → **96 blok**" seçeneği bu
yüzden hiçbir şey yapmıyordu. `dilimler()` artık kesit büyükse Z ekseninde de
bölüyor; dört yarıçapın dördü de çalışıyor (test: `engel_sinir.mjs`).

### Stadyum

Eski arena 41x41 düz bir kutuydu. Yenisi gerçek bir stadyum:

- **61x61 çim saha**, beyaz çizgili kenar ve orta çizgi
- Sahanın çevresinde 4 blok genişliğinde **kırmızı koşu pisti**
- **4 katlı tribün** (taş tuğla basamaklar, üstünde kuvars oturak sırası)
- **Dış duvar** (14 blok) ve tepesinde deniz feneri aydınlatması
- Sahanın çevresi ve üstü **görünmez duvarla** kapalı — sahadan
  çıkamazsın, elytra ile de kaçamazsın
- Saha üzerinde görünmez ışık blokları: gece mob doğmaz
- Toplam ayak izi 99x99

İnşaat ~72 `/fill` komutu; hepsi tek tikte değil, **tik başına 5 komut**
halinde çalışıyor, oyun donmuyor. Eski sürümden kalma arena kaydı
görülürse stadyum otomatik yenileniyor.

Ayarlar `dovus.js` içindeki `DOVUS_CFG`: saha yarıçapı, tribün kat sayısı,
tavan yüksekliği, bitiş canı, süre, ödül.

## Modu güncellemek — veri kaybolmaz (v2.8)

**Kısa cevap: markette birikmiş ilanlar, arsalar, para ve fiyat geçmişi
güncellemede kaybolmaz.** Çünkü bunların hiçbiri paketin içinde
tutulmuyor:

| Ne | Nerede tutuluyor | Güncellemeden etkilenir mi |
|---|---|---|
| İlanlar, fiyat geçmişi, bekleyen teslimat | dünyanın dynamic property'si | Hayır |
| Arsalar, üyeler, köşe seçimleri | dünyanın dynamic property'si | Hayır |
| Para | `money` scoreboard hedefi | Hayır |
| Arena | dünyadaki bloklar + kayıt | Hayır |
| Kontrol kitabı, arsa sopası | oyuncu envanterinde (`mk:` id'leri değişmedi) | Hayır |

Paketin UUID'leri v2.0'dan beri **hiç değişmedi**, yani Minecraft her yeni
sürümü "aynı paketin güncellemesi" sayıyor.

### Nasıl güncellemeli

1. **Önce yedek al** (isteğe bağlı ama tavsiye): oyunda Admin Paneli →
   **Veri ve Yedek** → "Şimdi Yedek Al".
2. Yeni `.mcaddon` dosyasını içe aktar (çift tıkla / Minecraft'a aktar).
3. Dünyaya gir. Oyun paketin yeni sürümünü kendisi kullanır.

**Yapma:** paketi dünyadan kaldırıp yeniden ekleme. Güncellerken sadece
yeni sürümü içe aktarman yeterli. (Dünyanın kendi yedeğini almak her
zaman en sağlam güvence — Minecraft'ın "Dünyayı Kopyala" seçeneği.)

### "Kopya paket saptandı" uyarısı

Bu **hata değil**, Minecraft'ın "bu paket zaten kurulu" demesi. Paketin
UUID'si v1.9'dan beri hiç değişmedi; yeni bir sürüm içe aktardığında oyun
aynı UUID'yi görüp bunu yazıyor.

**Önemli:** UUID'nin sabit kalması senin verini koruyan şeyin ta kendisi.
Uyarıyı susturmak için UUID değiştirilse dünya bunu yepyeni bir paket
sayar; marketteki ilanlar, arsalar ve para bağlantısı kopar.

Ne yapmalı:

- Uyarıyı geçebilirsin; oyun en yüksek sürümü kullanır.
- Liste kalabalıklaştıysa temizle: **Ayarlar → Depolama → Davranış
  Paketleri / Kaynak Paketleri** → eski `Market & Ekonomi ... v2.x`
  girdilerini sil. Paket adları sürüm taşıdığı için hangisinin eski
  olduğu görünür.
- Eski sürümleri depolamadan silmek **dünya verisini silmez** — ilanlar,
  arsalar ve para dünyanın içinde, paketin içinde değil.
- Sonrasında dünyaya girip Admin Paneli → Veri ve Yedek ekranından
  ilan/arsa sayılarının yerinde olduğunu doğrulayabilirsin.

### Bir şey ters giderse

Admin Paneli → **Veri ve Yedek** ekranı şunları gösterir: veri sürümü,
kaç ilan/arsa/geçmiş kaydı olduğu, son yedeğin tarihi. İki düğmesi var:

- **Şimdi Yedek Al** — tüm market ve arsa verisini kopyalar.
- **Yedekten Geri Yükle** — yedeği geri yazar. Geri yüklemeden önce o
  anki hali de "geri alma" kopyası olarak saklar, yani yanlış basarsan
  bile veri durur.

### Veri sürümü ve göç

Veri biçimi değişirse dünya açılışında otomatik göç çalışır: önce yedek
alınır, sonra eski kayıtlar yeni biçime çevrilir, veri sürümü işaretlenir.
Aynı sürümde tekrar açılışta hiçbir şey yapılmaz. Kod `scripts/veri.js`
içinde; yeni bir biçim değişikliği yaparsan `VERI_SURUMU` sayısını artırıp
`GOCLER` nesnesine bir adım eklemen yeterli.

## Hazır Market: her şey var, işlenmiş pahalı (v3.8)

Market artık **1716 eşya** listeliyor — aletler, zırhlar, mekanizmalar,
dekor, yapı blokları, hepsi. Madenler de yeniden **satın alınabiliyor**
(v3.2'de kapatılmıştı, v3.8'de açıldı).

### Kategoriler

| Kategori | Kaç eşya | İçerik |
|---|---|---|
| Alet, Zırh & Silah | 163 | kılıç, kazma, zırh, yay, elytra, kova, kitap, fişek |
| Madenler & Cevher | 60 | cevherler, külçeler, elmas, zümrüt, netherit, blokları |
| Tarım & Yiyecek | 68 | ham ve pişmiş yiyecek, tohum, çorba, pasta |
| Kırmızı Taş & Mekanizma | 71 | piston, huni, ray, vagon, TNT, gözlemci, kapı |
| Yün | 16 | 16 rengin yünü, hepsi aynı fiyat |
| Boya & Renkli Blok | 118 | boyalar, beton, çini, renkli cam |
| Dekor & Eşya | 237 | yatak, sancak, halı, tablo, fener, tabela, plak |
| Yapı Blokları | 398 | merdiven, yarım blok, duvar, çit, kapı, tuğla |
| Ahşap | 111 | kütük, tahta, soyulmuş odun, sal, çubuk, kağıt |
| Bitki & Çiçek | 134 | yaprak, fidan, çiçek, mantar, mercan, yosun |
| Mob & Değerli | 44 | ender incisi, blaze çubuğu, shulker kabuğu, iksir, beacon |
| Taş & Toprak | 296 | doğal bloklar: taş, toprak, kum, obsidyen, buz |

Kategori kuralları `fiyat.js` içindeki `KURAL` listesinde; sıra önemli,
ilk uyan kural kazanır.

### Fiyatlar: ham madde ucuz, işlenmiş pahalı

İşlenmiş (craftlanan) eşyaların **alış** fiyatına `ISLENMIS_ZAM = 1.8`
çarpanı bindiriliyor. Ham madde makası 2.2 iken işlenmiş eşyanınki
2.2 × 1.8 ≈ **4 kat**:

| Eşya | Satarsan | Alırsan |
|---|---|---|
| Demir külçe (ham) | 12 | 27 |
| Meşe kütüğü (ham) | 4 | 9 |
| Elmas kılıç | 209 | 828 |
| Elytra | 1.500 | 5.941 |
| Beacon | 2.955 | 11.702 |

Böylece kazmak/toplamak hâlâ en ucuz yol; hazır alet almak lüks kalıyor.
Zam yalnız **alış** tarafına bindiği için açık yaratmaz — tersine, girdiyi
pahalılaştırdığı için mevcut açıkları da kapatır.

### Yasaklılar: oyunun amacını bozanlar

Bunlar markette **hiç görünmez**, ne alınır ne satılır:

- **Benzersiz ganimetler**: ejderha yumurtası, bütün mob kafaları
  (iskelet, wither iskeleti, zombi, creeper, ejderha, oyuncu, piglin).
  Marketten alınabilse o yapıyı/boss'u yenmenin anlamı kalmazdı.
- **Sınırsız mob kaynakları**: spawner, deneme spawner'ı, kasa, bütün
  doğurma yumurtaları.
- **Survival'da elde edilemeyenler**: bedrock, güçlendirilmiş derin
  arduvaz, tomurcuklanan ametist, şüpheli kum/çakıl, kaplumbağa/koklayıcı
  yumurtası, silverfish blokları.
- **Teknik/yaratıcı bloklar**: komut bloğu (vagonu dahil), bariyer, yapı
  bloğu, jigsaw, portal blokları, ışık bloğu.

Liste `fiyat.js` içindeki `OYUN_BOZAN` kümesinde; bir şey eklemek/çıkarmak
için orası yeterli.

### Sadece ham madde moduna dönmek

`main.js` içindeki `CFG.sadeceHammadde = true` yaparsan v2.7 - v3.7
davranışına döner: sadece doğadan toplanan ~296 eşya listelenir, kendi
ham madde kategorileriyle (`HAM_KURAL`).

Bir kategoriyi "sadece satılık" yapmak istersen (madenlerde v3.2-v3.7
arası olduğu gibi) `fiyat.js` içindeki `ALINAMAZ_KATEGORILER` kümesine
adını ekle; menü yazısı ve alım engeli kendiliğinden çalışır.

### Taş kesici açığı (v3.8'de kapatıldı)

Market tüm eşyalara açılınca ortaya çıktı: **taş 3'e alınıp, taş kesiciyle
2 yarım bloğa çevrilip 4'e satılabiliyordu.** Sebep, yapı çarpanlarındaki
`+1` sabitiydi — ucuz bir blokta türevi anasından pahalı yapıyordu
(taş 1, yarım blok 1 × 0.5 + 1 = 2).

Aynı sınıftan ikinci açık: 1 bakır bloğundan 4 kesilmiş bakır çıkarken
kesilmiş bakır bloktan pahalı fiyatlanıyordu (blok 45, 4 kesilmiş bakır
240).

Düzeltme: `+1` kaldırıldı, çarpanlar taş kesicinin verimine göre yeniden
seçildi (yarım blok 0.45, cam paneli 0.3, halı 0.5), kesilmiş bakır
doğrudan `copper_block × 0.22` oldu.

`arac/arbitraj.mjs` artık bu sınıfı da denetliyor: 45 ana blok × 3 kesim
biçimi + bakır/cam/yün çevrimleri. Toplam **350 kontrol, 0 açık**.

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

## Arsalarına ışınlanma (v3.1)

Herkes **kendi** arsalarına ışınlanabilir; başkasının arsasına ışınlanamaz.

- **Arsa menüsü → Arsalarım**: kendi arsaların adlarıyla listelenir, birine
  basınca oraya ışınlanırsın. Hangi arsanın içinde olduğun "(buradasın)"
  ile işaretlenir.
- **`!ev`**: tek arsan varsa doğrudan oraya ışınlar, birden fazlaysa listeyi
  açar.
- **Işınlanma noktası**: varsayılan olarak arsanın ortası (en üstteki
  bloğun üstü). Arsanın içinde durup Arsalarım → ⚙ Arsaları Yönet →
  *Işınlanma Noktasını Ayarla* dersen o nokta (bakış açınla birlikte)
  kaydedilir — evinin kapısı, madenin girişi, ne istersen.
- Arsaların adını değiştirmek yine aynı yerde: *Adını Değiştir*.

Kurallar:

- Sadece **sahibi** ışınlanabilir. Üyeler varsayılan olarak ışınlanamaz;
  istersen `arsa.js` içinde `ARSA_CFG.uyeIsinlanabilir = true` yap.
- Düello sırasında ışınlanma kapalı (dövüşten kaçılmasın).
- Üst üste ışınlanmayı engellemek için 3 saniyelik bekleme var
  (`ARSA_CFG.isinlanmaBekleme`).
- Işınlanmayı tamamen kapatmak: `ARSA_CFG.isinlanma = false`.

Özel nokta arsa kaydına `tp` alanı olarak yazılır; eski kayıtlarda bu alan
yoktur ve arsanın ortası kullanılır — göç gerekmez.

## Üyeler: arsana birini al, çıkar (v3.7)

Arsa sahibi istediği oyuncuyu üye yapabilir, istediğinde çıkarabilir.
Üyeler o arsada **blok kırar, koyar, sandık açar** — sahibiyle aynı inşa
hakkına sahip olur.

Üye ekleme/çıkarma zaten vardı ama dört menü derindeydi. v3.7 ile tek
ekrana indi:

- **Arsa menüsü → Üyeler** (ya da **`!uye`** / `/mk:uye`)
- İçinde durduğun arsa senin ise doğrudan onun üye ekranı açılır. Değilse
  (ve birden fazla arsan varsa) hangi arsa olduğu sorulur.
- Ekranda üyeler listelenir; **üyeye basınca çıkar**. Alttaki **Üye Ekle**
  düğmesi çevrimiçi oyuncuları açılır listede gösterir, "(elle isim yaz)"
  seçeneğiyle **çevrimdışı** birini de adını yazarak ekleyebilirsin.
- Eklenen/çıkarılan oyuncu çevrimiçiyse kendisine de mesaj gider.

Yönet ekranındaki ayrı "Üye Ekle" ve "Üye Çıkar" düğmeleri tek bir
**Üyeler (n)** düğmesinde birleşti; o da aynı ekranı açıyor.

Kurallar:

- Sadece **arsanın sahibi** üye ekleyip çıkarabilir (kiracı ekleyemez).
- Üyeler varsayılan olarak arsaya **ışınlanamaz**; istersen `arsa.js`
  içinde `ARSA_CFG.uyeIsinlanabilir = true` yap.
- Arsa el değiştirince (satış) üye listesi sıfırlanır.

## Arsa pazarı: satış ve kiralama (v3.2)

Bir oyuncu artık **10 arsaya** kadar kurabilir (`ARSA_CFG.maxArsaOyuncu`,
eskiden 3) ve arsalarını **istediği fiyata** başka oyunculara satabilir ya
da kiraya verebilir.

**Arsa menüsü → Arsa Pazarı** (`!pazar`) başkalarının satılık/kiralık
arsalarını listeler; bir ilana basınca boyutu, sınırları, sahibi ve fiyatı
görünür.

### Satış

- Sahibi: **Arsalarım → Arsaları Yönet → (arsa) → Satışa Koy**, fiyatı
  kendisi yazar (öneri olarak kuruluş bedeli hazır gelir).
- Alıcı pazardan "SATIN AL" der. Para alıcıdan düşer, satıcıya geçer —
  satıcı **çevrimdışıysa** para bekleyen ödemelere yazılır, oyuna girince
  otomatik alır.
- Devirde arsanın sahibi değişir, **üye listesi sıfırlanır**, satış ve kira
  ilanları kalkar. Yeni sahip adını değiştirebilir, ışınlanma noktası
  koyabilir.
- Alıcının arsa hakkı doluysa (10/10) satın alma reddedilir.
- Form açıkken ilan değişirse (başkası kaptı, fiyat değişti, arsa kiraya
  girdi) işlem iptal edilir — para gitmez.

### Kiralama

- Sahibi **Kiraya Ver** der: bedel + kaç gün (en fazla
  `ARSA_CFG.maxKiraGun` = 60).
- Kiracı öder; kira boyunca o arsada **inşa edebilir** ve **oraya
  ışınlanabilir**. Arsa sahibi değişmez, sahibi de haklarını kaybetmez.
- Kiracı **Arsalarım** listesinde arsayı "kiracısısın, 2 gün 3 saat kaldı"
  diye görür. Yönet ekranından **Kirayı Uzat** (süre mevcut sürenin üstüne
  eklenir) ya da **Kiradan Çık** (para iadesi yok) diyebilir.
- Sahibi isterse **Kiracıyı Çıkar** der; kalan sürenin parası oransal
  olarak kiracıya iade edilir (iade sahibinin bakiyesinden düşer).
- Kirası dolan arsa otomatik geri döner: kiracının inşa hakkı ve
  ışınlanması kapanır, iki tarafa da mesaj gider. Kontrol ana döngüde
  dakikada bir çalışır (`Arsa.kiraKontrol`).
- **Kirada olan arsa silinemez ve satışa konulamaz** — önce kiracı
  çıkarılır.

### Veri

Yeni alanlar arsa kaydının içine yazılır, eski kayıtlar olduğu gibi
çalışır (göç gerekmez):

| Alan | Anlamı |
|---|---|
| `sat: {fiyat}` | satılık ilanı |
| `kira: {fiyat, gun}` | kiralık ilanı (kira bitince ilan durur, arsa yeniden kiralanabilir) |
| `kiraci: {ad, basla, bitis, odenen}` | aktif kiracı; `bitis` gerçek zamanlı milisaniye |

Süreler **gerçek zamanlıdır** (oyun içi gün değil): 3 günlük kira,
takvimde 3 gün sürer. Dünya kapalıyken de akar.

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
    veri.js                  Veri sürümü, göç ve yedek/geri yükleme
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
!para !arsa !pazar !uye !hazir !ilanlarim !rehber !bakiye !id !kitap` ve v2.0
ile gelen `!yenile` (eşya listesini yeniden kurar), `!liste` (listenin
durumunu ve hangi kaynaktan kaç eşya geldiğini yazar). v3.2 ile `!pazar`
satılık/kiralık arsaları açar, `!ev` kendi arsana ışınlar. v3.3 ile
`!arenasil` (yönetici) yanlış yere kurulmuş stadyumu tek tıkla kaldırır,
`!temizle` görünmez engelleri siler.

Aynı işleri eğik çizgili komutlarla da yapabilirsin:
`/mk:arsa`, `/mk:pazar`, `/mk:uye`, `/mk:ev`, `/mk:dovus`, `/mk:arenasil`,
`/mk:menu`, `/mk:market` ...

Bir şey ters giderse Content Log'daki `[Market]` satırları listenin hangi
kaynaktan kaç eşya topladığını yazıyor.

## Paketleme

```bash
bash paketle.sh          # -> Market_v3.8.mcaddon
```

Sürüm numarası hem `manifest.json` dosyalarında hem de `main.js` içindeki
`CFG.surum` alanında tutuluyor — ikisini birlikte güncellemek gerekiyor,
yoksa Minecraft "kopya paket" uyarısı verir.
