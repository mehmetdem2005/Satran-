# Market & Ekonomi — Kaynak Kod (v4.6)

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

## "Arenada takılı kalmışsın" hatası (v4.1'de düzeldi)

Oyuncular kendi evlerinde otururken **5 saniyede bir** dışarı ışınlanıyor ve
"[Düello] Arenada takılı kalmışsın, dışarı gönderildin." mesajı alıyorlardı.

İki hata üst üste binmişti:

1. **Kontrol yanlış yerde çalışıyordu.** `girisKontrol` sadece dünyaya
   girişte çalışması gerekirken, `oyuncuyuHazirla` üzerinden **5 saniyelik
   döngüde** de çağrılıyordu.
2. **"Arenada mı" kontrolü sadece kayda bakıyordu.** `arenadaMi` yalnızca
   kayıtlı arena merkezine olan mesafeye bakıyordu: **54 blok** yatay,
   40 blok dikey. Stadyum kaldırılmış olsa bile kayıt duruyorsa o noktanın
   54 blok çevresindeki herkes "arenada" sayılıyordu. Evi arenanın eski
   yerine yakın olan oyuncu (28 blok) sürekli evinden atılıyordu.

Düzeltme:

- Eski sürümlerden kalma "arenada sıkışma" kurtarması artık **yalnızca
  dünyaya girişte, oturumda bir kez** çalışıyor.
- `arenadaMi` artık stadyumun **gerçekten ayakta** olduğunu da doğruluyor:
  görünmez duvar halkasından ve dış duvar taşından örnek alıyor. Arena
  kaldırılmışsa kimse "takılmış" sayılmıyor.
- Yarıçap dış duvardan (54) görünmez duvarın içine (35) çekildi — "sıkışmak"
  zaten orada olur.
- `!cik` ve menüdeki "Düellodan Çık" **gevşek** kaldı: oyuncu bunu kendi
  yazıyor, orada yanlış pozitif zararsız.

Ayrıca yarım kalan düello yedeği artık **ışınlanma başarılı olursa**
siliniyor. Eskiden önce siliniyor sonra ışınlanıyordu; ışınlanma
başarısız olursa oyuncu hem yerinde kalıyor hem de geri dönüş kaydını
kaybediyordu.

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

## Bakır golemi hızlandırıcı (v3.9)

Vanilla bakır golemi bakır sandıktan **tek yığın** alıp en yakın sandığa
bırakır, sonra bekler. Büyük bir depoda bu çok yavaş kalıyor.

`golem.js` golemi akıllı çalıştırıyor: golemin çevresindeki bakır
sandıklardan **bir turda 10 yığını** aynı anda uygun sandıklara dağıtıyor.
Vanilla mantığın aynısı korunuyor, sadece hızlanıyor:

| | Vanilla | v3.9 |
|---|---|---|
| Tur başına yığın | 1 | **10** |
| Tur arası | ~7 sn bekleme | 1 sn |
| Hedef kap | sandık, kapanlı sandık | + **varil** |
| Yerleştirme | aynı eşya varsa oraya, yoksa boşa | aynı |

Kaynak, Mojang'ın kendi listesindeki 8 bakır sandık çeşidi (normal,
paslanmış, mumlu…). Ayarlar `golem.js` içindeki `GOLEM_CFG`:
`partiBoyutu` (10), `yaricap` (8 blok), `tikAraligi` (20 tik = 1 sn),
`arsaGuvenligi`.

**`!golem`** (ya da `/mk:golem`) yakındaki golemleri, kaç bakır sandık ve
kaç hedef sandık gördüklerini ve toplam taşınan yığını yazar.

Güvenlik kuralları (hepsi test edildi):

- **Arsa sınırı**: kaynak ve hedef aynı arsada olmalı. Arsanın içindeki
  bakır sandıktan dışarıdaki sandığa eşya taşınmaz (`arsaGuvenligi`).
- Dolu sandık atlanır, boşu bulunur.
- Heykele dönüşmekte olan golem çalışmaz.
- Golem yoksa hiçbir şey yapılmaz — modül tamamen golem varlığına bağlı.

### Mojang'ın entity dosyası neden değiştirilmedi

Golemin kendi yürüme AI'ını değiştirmek `entities/copper_golem.json`
dosyasını ezmeyi gerektirir. Bunu **varsayılan olarak yapmıyoruz**: Mojang
o dosyayı güncelleyince bizim kopyamız eskide kalır, ve bakır golemin
olmadığı eski sürümlerde içerik hatası verir.

İsteyen için hazır dosya: **`arac/copper_golem_hizli.json`**. Mojang'ın
güncel dosyasının birebir kopyası, sadece şu değerler değiştirilmiş:

| Ayar | Vanilla | Hızlı |
|---|---|---|
| `max_stack_size` | 16 | 64 |
| `search_distance` | [32, 8] | [48, 12] |
| `max_visited_containers` | 10 | 24 |
| `initial_cooldown` / `idle_cooldown` | 3 / 7 | 1 / 2 |
| `minecraft:movement` | 0.2 | 0.3 |
| hedef kaplar | sandık, kapanlı | + varil |

Kullanmak için: `Market_BP/entities/` klasörü aç, dosyayı içine
`copper_golem.json` adıyla kopyala, paketi yeniden üret. Oyun sürümün
bakır golemi içermiyorsa ekleme, içerik hatası verir.

## Eşya listesi denetimi (v3.9)

`Mojang'ın resmi listesiyle karşılaştırıldı: **eksik eşya yok.**

| | Adet | Ne |
|---|---|---|
| Mojang'ın kaydı | 1938 | items + blocks metadata |
| Bizim katalog | 1902 | |
| Markette | 1753 | |
| Kasten dışarıda | 149 | 89 doğurma yumurtası, 29 teknik blok, 22 oyun bozan, 9 kafa |

Katalogda olmayan 328 kayıt da eksik değil, listelenemeyecek şeyler:
162 Education Edition kimya eşyası, 115 blok iç durumu
(`*_double_slab`, `*_standing_sign`, `flowing_water`, `lit_furnace`…),
29 yerleşik bitki hali (`carrots`, `candle_cake`…), 4 teknik
(`air`, `fire`, `portal`).

**216 eşyanın ikonu yok** (menüde soru işareti çıkar): kavak (`poplar_*`)
ağaç seti, `shelf_mushroom`, `straw_bed`, `iron_chain`, crimson/warped
kayıklar. Sebep bizde değil: Mojang bu eşyaların **id'lerini** yayınlamış
ama **dokularını** henüz yayınlamamış. Bu eşyalar zaten senin oyun
sürümünde yoksa listeye hiç girmiyorlar; girerlerse mor-siyah bozuk kare
değil, güvenli soru işareti görünür. Mojang dokuları yayınlayınca
`python3 ikon_guncelle.py` çalıştırmak yeterli.

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

## Fiyat mantığı elden geçti (v4.3)

Eski fiyatlarda gerçekten kâr edilebilen açıklar vardı ve katma değer çok
düşüktü. İkisi de düzeldi — tahminle değil, **Mojang'ın kendi tarif
dosyalarıyla** karşılaştırarak.

### Mojang'ın 529 gerçek tarifine karşı denetim

`bedrock-samples`ten oyunun **gerçek** tarif dosyaları çekildi ve fiyat
motoru hepsine karşı denetlendi. Elle yazılmış 158 tariflik tablomuzun
Mojang'dan farklı olduğu yerler açık üretiyordu:

| Açık | Neden | Kâr |
|---|---|---|
| **beacon** | Bedrock'ta nether yıldızının id'si `netherstar`; motor bunu tanımıyor, 5 değerinde sayıyordu. 192'lik girdiyle 2.955'e satılan beacon craftlanıyordu. | **+2.763** |
| **lodestone** | Bizde tarif netherit külçe ile yazılmıştı; Bedrock'ta **demir külçe**. 59'luk girdiyle 1.480'e satılıyordu. | **+1.421** |
| **turtle_helmet** | `turtle_shell_piece` (scute'un Bedrock id'si) tanınmıyordu. | +132 |
| **saddle** | Bizde 5 deri + 2 demir; gerçekte 3 deri + 1 demir. | +23 |
| **amethyst_block** | Sabit 90 değeri, 4 şardın alış bedelinden (88) yüksekti. | +2 |

Ayrıca `map` (9 kâğıt, pusula yok) ve `lead` (5 ip) tarifleri düzeltildi.

**Kök sebep**: Bedrock'un eski/kısa id'leri (`netherstar`, `reeds`,
`melon`, `emptymap`, `carrotonastick`, `turtle_shell_piece`,
`nether_brick`, `normal_stone`...) motorda tanımlı değildi; tanınmayan her
eşya sessizce **5** değerine düşüyordu. Hepsi `ESKI_AD` tablosuna eklendi.

Bir de 170 eşya (`*_wool_slab`, `nether_brick_stairs`, `deepslate_tile_*`,
`end_bricks`...) yapı son eki çözülürken kökünü bulamayıp keyfi bir sabite
düşüyordu. Artık kök gerçek bir eşyaysa ondan hesaplanıyor (`bilinenEsya`).

### Kalıcı denetim

`arac/vanilla_tarifler.json` — Mojang'ın 529 tarifinin sıkıştırılmış hali,
pakete dahil. `arac/arbitraj.mjs` artık kendi tablosunu **ve** bunu
denetliyor:

```
158 tarif denetleniyor...
Mojang'in 529 gercek tarifi denetleniyor...
889 kontrol, 0 acik.
```

### Katma değer artırıldı

`URETIM` **1.15 → 1.7**: her craft adımı artık %70 değer katıyor (eskiden
%15, işlemek neredeyse anlamsızdı). Aile çarpanları da hizalandı — 1:1
dönüşümler (`_bricks`, `_tiles`, `polished_`, `chiseled_`, `cut_`,
`smooth_`, `mossy_`, `cracked_`) 1.2/1.3 yerine **1.7**.

| Zincir | Önce | Sonra |
|---|---|---|
| taş → taş tuğlası | 1 → 1 | 1 → **2** |
| kum → kumtaşı → kesilmiş | 1 → 5 → 5 | 1 → **4** → **5** |
| buğday → ekmek → pasta | 2 → 7 → 240 | 2 → **10** → **350** |
| elmas → kılıç → göğüslük | 90 → 209 → 594 | 90 → 209 → **830** |

`URETIM` `MAKAS`ın (2.2) altında kalmak zorunda: girdiyi MAKAS katına alıp
çıktıyı URETIM katına sattığın için eşitlenirse para basardı. 1.7 güvenli
tarafta ve 889 kontrolün hepsi temiz.

## Değerli eşyalar sistem marketinde yok (v4.3)

Elytra, beacon ve benzeri değerli eşyalar artık Hazır Market'te **ne
alınır ne satılır**:

elytra · beacon · conduit · nether yıldızı · totem · trident · mace ·
heavy core · büyülü altın elma · deniz kalbi · ejderha nefesi · end
kristali · kurtarma pusulası · echo shard · wither gülü · shulker kabuğu
ve kutuları · **bütün netherit** (külçe, blok, cevher, takım) · netherit
şablonu

Sebep: bunlar oyunun ödül zinciri. Sınırsız stoklu market bunları satarsa
End Şehri'ni bulmanın, Wither'ı yenmenin anlamı kalmaz; satın alırsa da
tek seferde ekonomiyi bozacak para akar.

**Oyuncular arasında serbest**: kendi aralarında `!sat` ile ilan verip
istedikleri fiyata alıp satabilirler. Yasak yalnız sınırsız stoklu sistem
marketi için.

Liste `fiyat.js` içindeki `PIYASA_DISI` kümesinde; `piyasadaMi(id)` karar
veriyor, `marketteVar` onu kullanıyor (hem listeyi hem toplu satışı
kapsıyor).

## Fiyat seviyesi: eski seviyeye dönüldü (v4.2)

v4.0'da her şey 30 katına çıkarılmıştı, fazla geldi. v4.2'de eski (v3.9)
seviyeye dönüldü — **katma değer mantığı korunarak**.

```js
export const OLCEK = 1;      // v4.0'da 30'du
```

Ölçek tek sabit olduğu için geri dönüş tek satır oldu; bütün oranlar
korunduğu için ekonomi dengesi hiç bozulmadı.

### Korunan katman: işlenmiş eşya zammı

`ISLENMIS_ZAM = 1.8` duruyor. Ham madde makası 2.2 iken craftlanan eşyanınki
2.2 × 1.8 ≈ 4 kat: demir külçe 12 sat / 27 al, elmas kılıç 209 sat / 828 al.

### Yeni katman: önemli eşyalar 3 kat pahalı

`ONEMLI_ZAM = 3`, sadece **alış** fiyatına biner (satış değişmez, o yüzden
arbitraj açığı yaratmaz — girdiyi pahalılaştırmak dengeyi hep sıkılaştırır).

| Eşya | Satarsan | Alırsan |
|---|---|---|
| Netherit bloğu | 11.511 | **136.751** |
| Beacon | 2.955 | 35.106 |
| Nether yıldızı | 2.500 | 29.701 |
| Netherit kazma | 4.142 | 49.207 |
| Büyülü altın elma | 1.496 | 17.773 |
| Totem | 400 | 4.753 |

Listede netherit takımı, beacon, nether yıldızı, totem, trident, mace,
conduit, büyülü altın elma, shulker kabuğu/kutusu, echo shard, kurtarma
pusulası var. **Elytra bilerek listede yok** — 1.500 sat / 5.941 al olarak
kaldı.

Liste `fiyat.js` içindeki `ONEMLI` kümesinde; bir şey eklemek/çıkarmak için
orası yeterli.

### Para göçü (v3 → v4)

v4.0'ı görmüş dünyalarda para 30 kat şişmişti; açılışta aynı oranda geri
küçültülür (bakiyeler, ilan fiyatları, bekleyen ödemeler, fiyat geçmişi,
arsa satış/kira fiyatları).

v4.0'ı hiç görmemiş dünya önce v3 göçünü (×30), hemen ardından v4 göçünü
(÷30) çalıştırır — sonuç değişmez. İki yol da test ediliyor
(`olcek_test.mjs`).

## Ametist aletler (v4.2)

Beş yeni özel eşya: **Ametist Kazma, Kürek, Balta, Kılıç, Mızrak**.

Netherit'ten güçlüler (hasar 6–15, kazma hızı 14, dayanıklılık 3000) ama
**ömürlüler**: eline geçtiği andan itibaren **4 saat** sonra eriyip yok
olurlar. Kalıcı olsalardı netherit'i tamamen anlamsız kılarlardı; süreli
olunca "en güçlü alet" yerine "doğru anda kullanılan pahalı kaynak"
oluyorlar.

**Değerleri tam büyülü netherit'ten yüksek:**

| | Satarsan | Alırsan |
|---|---|---|
| Tam büyülü netherit kazma/balta | ~12.426 | — |
| Ametist Kürek | 13.500 | 53.461 |
| Ametist Kazma / Balta | 14.000 | 55.441 |
| Ametist Kılıç | 15.000 | 59.400 |
| Ametist Mızrak | 16.000 | 63.360 |

**Tarif**: ametist bloğu + netherit külçe (craft masası). Her tarifte
**2 netherit külçe** var — bu tesadüf değil: girdilerin alış bedeli
(~17.240) aletin satış değerinden yüksek kalsın diye. Yoksa "girdiyi al,
craftla, sat" açığı olurdu. Arbitraj denetçisi bu beş tarifi de kontrol
ediyor (**359 kontrol, 0 açık**).

**Süre nasıl tutuluyor**: aletin lore satırında. Dinamik özellik değil,
çünkü lore hem kalıcı hem de oyuncuya kalan süreyi gösteriyor:

```
Ametist alet - süreli
Kalan ömür: 3 sa 42 dk
Süre dolunca eriyip yok olur.
```

Envanterden çıkıp sandığa girse bile süre işler (gerçek zaman). Son
30 / 10 / 5 / 1 dakikada uyarı gelir, süre dolunca alet yok olur ve oyuncu
haber alır.

**`!ametis`** (ya da `/mk:ametis`) elindeki aletin kalan ömrünü ve
envanterindeki ametist alet sayısını yazar.

Ayarlar `ametis.js` içindeki `AMETIS_CFG`: `omurSaat` (4), `uyariDakika`,
`tikAraligi`.

## Fiyatlandırma (v2.4'te elden geçti)## Fiyatlandırma (v2.4'te elden geçti)

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
    piyasa.js                Arz-talep: alım satım fiyatları oynatır (v4.4)
    yon.js                   Yön Anahtarı: blok yönü çevirme (v4.6)
    adlar.js                 Mojang lang'inden doğrulanmış eşya adı haritası (v4.6)
    ametis.js                Süreli ametist aletler + Ametist Atölyesi
    golem.js                 Bakır golem hızlandırıcı (tek turda 10 yığın)
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
arac/arbitraj.mjs          Fiyat açığı denetimi, iki senaryoda (node arac/arbitraj.mjs)
arac/vanilla_tarifler.json Mojang'ın 529 gerçek tarifi (denetimin kaynağı)
katalog_guncelle.py        Vanilla eşya listesini Mojang metadata'sından tazeler
ad_guncelle.py             Eşya adlarını Mojang'ın en_US.lang dosyasından üretir
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
!para !arsa !pazar !uye !golem !ametis !atolye !piyasa !hazir !ilanlarim !rehber !bakiye !id !kitap` ve v2.0
ile gelen `!yenile` (eşya listesini yeniden kurar), `!liste` (listenin
durumunu ve hangi kaynaktan kaç eşya geldiğini yazar). v3.2 ile `!pazar`
satılık/kiralık arsaları açar, `!ev` kendi arsana ışınlar. v3.3 ile
`!arenasil` (yönetici) yanlış yere kurulmuş stadyumu tek tıkla kaldırır,
`!temizle` görünmez engelleri siler. v4.4 ile `!piyasa` arz-talebe göre en
çok oynayan fiyatları listeler.

Aynı işleri eğik çizgili komutlarla da yapabilirsin:
`/mk:arsa`, `/mk:pazar`, `/mk:uye`, `/mk:golem`, `/mk:ev`, `/mk:dovus`, `/mk:arenasil`,
`/mk:menu`, `/mk:market` ...

Bir şey ters giderse Content Log'daki `[Market]` satırları listenin hangi
kaynaktan kaç eşya topladığını yazıyor.

## Canlı piyasa, alım sınırı ve "son aldıklarım" (v4.4)

Üç şey değişti.

### 1. Son aldığın eşyalar kategorinin en üstünde

Bir eşyayı Hazır Market'ten aldığında o eşya **kendi kategorisinin en
üstüne** çıkıyor, yanında `§e*` işaretiyle. Sıralama yeniden alınana kadar
korunuyor, en son alınan en üstte. Oyuncu başına son **12** alım
tutuluyor (`CFG.sonAlinanSayisi`). Kayıt oyuncu adına bağlı, dünya
kaydına yazılmıyor — oturum boyunca yaşıyor.

Alfabetik listede 400 blok arasında aynı eşyayı tekrar tekrar aramak
gerekmiyor artık: 50 taş tuğlası aldıysan bir sonraki sefer "Yapı
Blokları"nı açtığında ilk sırada duruyor.

### 2. 640 sınırı kalktı

Eskiden tek seferde en fazla 640 adet alınabiliyordu. Yeni sınır
`CFG.maxAlim = 100.000` — pratikte sınır senin paran ve envanterin.

Miktar ekranı buna göre değişiyor:

- **2304 adete kadar** (36 yığın) eskisi gibi **kaydıraç** çıkıyor.
- Üstünde kaydıraç kullanılamaz (tek tek sürüklemek gerekirdi), o yüzden
  **sayı yazma alanı** açılıyor: "Adet (en fazla 100.000)".

Envanterine sığmayan kısım için **parası geri veriliyor**. Önemli bir
düzeltme de burada: eskiden sığmayan eşya yere dökülüyordu **ve** ayrıca
para iade ediliyordu — yani dolu envanterle alışveriş yapan oyuncu hem
eşyayı hem parayı alıyordu (bedava kâr). Artık sığmayan hiç verilmiyor,
sadece iade ediliyor:

```
[Market] Sadece 2240 adet sığdı, $13.800 iade edildi.
```

### 3. Piyasa arz-talebe göre oynuyor

`scripts/piyasa.js` her eşya için bir **net akış** tutuyor: oyuncular o
eşyadan ne kadar aldı, ne kadar sattı.

| Oyuncular ne yaptı | Ne olur |
|---|---|
| Çok **aldı** → talep | Market onu **daha pahalıya** satar (en fazla ×1.60) |
| Çok **sattı** → arz | Market ona **daha az** öder (en az ×0.75) |

Fiyat kayması listede görünüyor: satırın yanında `§c+18%` (talepli) ya da
`§a-9%` (bol). `!piyasa` komutu en çok oynayan eşyaları tek ekranda
gösteriyor.

Her şey zamanla normale dönüyor: 5 dakikada bir net akış **%3 eriyor**
(`sonum: 0.97`). Bir günlük çılgınlık kalıcı fiyat bozmuyor. Akış dünya
kaydına yazılıyor, sunucu kapanınca kaybolmuyor.

**Çarpanlar keyfi seçilmedi.** Ekonominin güvenlik payı
`MAKAS (2.2) / URETIM (1.7) = 1.29` kat. En düşük alış çarpanı ile en
yüksek satış çarpanı arasındaki oran bunun altında kalmalı:

```
satış en az  0.90 × 2.2 = 1.98   >   alış en fazla  1.10 × 1.7 = 1.87
```

`arac/arbitraj.mjs` artık **iki senaryoda birden** çalışıyor: normal
piyasa ve "en kötü durum" (her girdi en ucuz, her çıktı en pahalı). İkisi
de **894 kontrol, 0 açık**.

### Bu denetimin yakaladığı iki gerçek hata

En kötü durum senaryosu, normal fiyatlarda görünmeyen iki hatayı ortaya
çıkardı:

1. **`creaking_heart`** elle 90 yazılmıştı, girdisi 98'di — %8 pay.
   Piyasa uçlarında bu pay eriyor ve craft para basmaya başlıyordu. Artık
   gerçek tarifinden hesaplanıyor (2 pale_oak_log + 1 resin_block).
2. **`resin_brick` ile `resin_bricks` aynı sanılıyordu.** Biri fırından
   çıkan **eşya**, öbürü ondan yapılan **blok**. Takma ad ikisini
   birleştirince eşya 4 katına fiyatlanıyordu: reçine yumrusunu 22'ye alıp
   eritip 26'ya satmak kâr ediyordu. Ayrıca türevleri de bozuyordu —
   `resin_brick_slab` 68'lik bloğun değil 10'luk eşyanın yarısından
   hesaplanıyordu (31 yerine 5).

İkincisi bütün tuğla ailesini ilgilendiriyor: Bedrock'ta türevler **tekil**
yazılır (`nether_brick_stairs`) ama anaları **çoğuldur**
(`nether_bricks`). Artık kök `brick` ile bitiyorsa önce çoğulu deneniyor.

| eşya | önce | sonra |
|---|---|---|
| resin_brick | 24 | 10 |
| resin_bricks | 24 | 68 |
| resin_block | 20 | 92 |
| resin_brick_slab | 5 | 31 |
| creaking_heart | 90 | 170 |


## Tecrübe şişesi neden görünmüyordu (v4.4.1)

Markette **vardı** — ama iki sebepten kimse bulamıyordu:

1. **Yanlış kategorideydi.** `experience_bottle`, kitaplarla birlikte
   elle "Alet, Zırh & Silah" listesine yazılmıştı. O kategoride **153
   eşya** var ve alfabetik sırada `e...` ikinci sayfaya düşüyor. Kimse
   tecrübe şişesini kılıçların arasında aramaz.
2. **Türkçe araması çalışmıyordu.** `tecrübe` yazınca **0 sonuç**
   dönüyordu; sözlükte karşılığı yoktu. Sadece `şişe` yazan bulabiliyordu.

Düzeltme:

- Tecrübe şişesi artık **"Mob & Değerli"** kategorisinde — iksirlerle
  aynı yerde ve o kategori **tek sayfa** (38 eşya), açar açmaz görünüyor.
- Sözlüğe `tecrübe`, `tecrube`, `xp`, `deneyim`, `buyusisesi` eklendi.

Diğer şişelere dokunulmadı; iksir, cam şişe, bal şişesi ve uğursuz şişe
zaten aynı kategoride duruyorlardı.

### Fiyatı neden 298?

Tecrübe şişesi parayı **doğrudan büyü seviyesine** çeviren tek eşya. Eski
fiyatıyla (100) 30. seviyeye çıkmak ~200 şişe × 100 = **20.000** olurdu;
o zaman büyü masası için XP toplamanın anlamı kalmazdı. `ONEMLI` listesine
alındı (netherit, beacon, totem ile aynı raf), `ONEMLI_ZAM ×3` ile alış
fiyatı **298** oldu — 30. seviye ~59.400. Satış fiyatı 25'te kaldı, yani
rahipten aldığın şişeleri hâlâ paraya çevirebiliyorsun.

## Eğil + aletle sağ tık: blok yönünü çevir (v4.5)

**Herhangi bir aletle** (kazma, kürek, balta, çapa, kılıç — taş, tahta,
demir, elmas, netherit, ametist, malzeme farketmez) **eğilip** yönü olan
bir bloğa **sağ tıklayınca** blok **bir adım** döner.

Gözlemci, huni, fırın, piston, varil, merdiven, kütük, meşale, kaldıraç,
ray, tekrarlayıcı, karşılaştırıcı, zil, crafter... **listesi elle
yazılmıyor.** Kod bloğun kendi durum (state) tablosuna bakıyor: içinde bir
yön durumu varsa çevriliyor. Oyuna yeni bir yönlü blok gelse bile kod
değişmeden çalışır.

```
§d↻ §fGözlemci §7→ §fdoğu
```

### Nasıl çalışıyor

`scripts/yon.js` bir **eksen listesi** tutuyor — öncelik sırasıyla:

| durum | örnek blok | değerler |
|---|---|---|
| `minecraft:cardinal_direction` | fırın, stonecutter | kuzey → doğu → güney → batı |
| `minecraft:facing_direction` | varil, yeni bloklar | 4 yön + yukarı + aşağı |
| `facing_direction` (sayı) | gözlemci, huni, piston | 2→5→3→4→1→0 |
| `weirdo_direction` | merdiven | doğu → batı → güney → kuzey |
| `pillar_axis` | kütük | dikey → doğu-batı → kuzey-güney |
| `orientation` | crafter, jigsaw | 12 konum |
| `torch_facing_direction`, `lever_direction`, `attachment`, `rail_direction`, `ground_sign_direction`, `direction`, `coral_direction`, `multi_face_direction_bits` | meşale, kaldıraç, zil, ray... | kendi tabloları |

Blokta birden fazlası varsa **ilki** ana eksen. Ana eksen bir tam tur
atınca **ikincil eksen** bir adım ilerliyor (kilometre sayacı mantığı) —
merdivenin 4 yönü bitince ters/düz değişiyor, yani 8 konumun hepsine tek
tuşla ulaşılıyor.

### Dikkat edilen köşeler

- **Huni yukarı bakamaz.** `facing_direction` tablosunda 1 (yukarı) değeri
  var ama huni onu kullanmıyor; denenirse bozuk huni oluşuyor. Huni için o
  değer atlanıyor.
- **Kapı iki bloktur.** Sadece bir yarısını döndürmek bozuk görünüm
  bırakır; alt ve üst yarı birlikte dönüyor.
- **Dışarıda tutulanlar:** yatak, çift sandık, kafa/kurukafa, çift bitki,
  piston kolu, tabela ve sancak. Bunların ikinci parçası **yan** blokta
  durduğu için döndürmek yerini de taşımayı gerektirirdi.
- **Aletin normal işi durduruluyor.** Baltayla kabuk soyma, kürekle patika
  açma, çapayla toprak sürme — eğilipken bunlar iptal ediliyor, yoksa
  blok hem dönüp hem soyulurdu.
- **Arsa koruması sorulıyor.** Başkasının arsasında blok döndüremezsin;
  `arsa.js` içindeki aynı izin kontrolünden geçiyor.
- **180 ms bekleme.** Sağ tuşu basılı tutunca blok deli gibi dönmesin diye.

Yönü olmayan bir bloğa (taş, toprak) eğilip tıklarsan olaya hiç
karışılmıyor — normal davranış korunuyor.

## Ametist: sadece balta ve kılıç, ama istediğin büyüyle (v4.5)

### Kazma, kürek ve mızrak kaldırıldı

Beş ayrı süreli alet hem craft'ı karmaşıklaştırıyordu hem de her birinin
ayrı ömür sayacı envanteri gürültüye boğuyordu. **Ametist Balta** ve
**Ametist Kılıç** kaldı; ikisi de 4 saatlik ömrünü koruyor.

### Ametist Atölyesi (`!atolye`)

Düz alet yerine **istediğin büyüyle** alet dövdürüyorsun. Büyü **aletin
üstüne yazılıyor**:

```
Ametist Kılıç
§7Ametist alet - §dsüreli
§5Keskinlik V
§7Kalan ömür: 4 sa 0 dk
§8Süre dolunca eriyip yok olur.
```

Üç ekran: **alet seç → büyü seç → seviye seç ve onayla.** Her adımda fiyat
yazıyor.

| Ametist Kılıç | en fazla | seviye başı |
|---|---|---|
| Keskinlik | V | 9.000 |
| Kutsama | V | 6.000 |
| Böcek Belası | V | 6.000 |
| Alev Dokunuşu | II | 14.000 |
| Yağma | III | 20.000 |
| Geri İtme | II | 5.000 |
| Dayanıklılık | III | 8.000 |
| Onarım | I | 40.000 |

| Ametist Balta | en fazla | seviye başı |
|---|---|---|
| Keskinlik | V | 9.000 |
| Verimlilik | V | 9.000 |
| Şans | III | 22.000 |
| İpeksi Dokunuş | I | 30.000 |
| Dayanıklılık | III | 8.000 |
| Onarım | I | 40.000 |

**Fiyat = gövde + (seviye × büyü bedeli).** Gövde fiyatı market motorundan
geliyor, yani arz-talep oynarsa atölye de onunla oynuyor.

| örnek | hesap | toplam |
|---|---|---|
| Kılıç + Keskinlik V | 59.400 + 5×9.000 | **104.400** |
| Balta + Şans III | 55.441 + 3×22.000 | **121.441** |
| Balta + İpeksi Dokunuş | 55.441 + 30.000 | **85.441** |

Kasten ağır: bu aletler 4 saatte eriyor. Ucuz olsaydı ekonomi tek kalemden
akardı. Kâr açığı da yok — markete geri satarken büyü değeri en fazla 3
kat sayılıyor (kılıç 15.000 × 3 = 45.000), yani alış her zaman satıştan
pahalı.

## Arz-talep dengelendi: adet değil DEĞER (v4.5)

v4.4'teki motor **adet** sayıyordu: 2000 buğday ile 2000 elmas piyasayı
aynı kadar oynatıyordu. Bir envanter dolusu buğday (2.304 adet, ~11.500
değerinde) fiyatı **%60** zıplatıyordu — dengesizdi.

Artık her adet **eşyanın taban değeri kadar** ağırlık taşıyor ve `hacim`
eşiği 150.000 (≈ 27 yığın elmas):

| hareket | piyasa etkisi |
|---|---|
| 64 elmas alındı (1 yığın) | alış fiyatı **+2%** |
| 640 elmas alındı (10 yığın) | **+23%** |
| 1728 elmas alındı (27 yığın) | **+60%** (tavan) |
| 2304 buğday alındı (dolu envanter) | **+2%** |
| 640 demir satıldı | **-1%** |
| 12.500 demir satıldı | **-25%** (taban) |

**Sonsuz artmıyor:** 1 milyon elmas alsan bile alış fiyatı ×1.60'ta,
satış fiyatı ×0.75'te duruyor.

**Almayınca yavaş yavaş düşüyor:** her 5 dakikada net akış %3 eriyor.

| geçen süre | kalan baskı |
|---|---|
| 30 dk | %83 |
| 1 saat | %69 |
| 2 saat | %48 |
| 4 saat | %23 |
| 8 saat | %5 |

Güvenlik payı değişmedi: `arac/arbitraj.mjs` hâlâ iki senaryoda birden
(normal piyasa + en kötü durum) çalışıyor — **891 kontrol, 0 açık**.

## Yön Anahtarı: 9 çubukla yapılan çevirme aleti (v4.6)

v4.5'te yön çevirme **her aletle** çalışıyordu. Bunun yan etkisi vardı:
eğilipken baltayla kabuk soymak, kürekle patika açmak, çapayla toprak
sürmek iptal oluyordu. Artık **tek bir özel alet** çeviriyor, başka
hiçbir eşyanın davranışı değişmiyor.

### Tarif

Crafting Table'da **9 çubuk** (3x3'ün tamamı). Tarif defterinde görünür —
çubuk elinde varken tariflerde çıkar.

```
S S S
S S S      S = Çubuk        ->  Yön Anahtarı
S S S
```

### Kullanım

| hareket | sonuç |
|---|---|
| Bloğa **sağ tık** | yön bir adım **ileri** |
| **Eğilip** sağ tık | yön bir adım **geri** |

```
↻ Gözlemci → doğu
```

Gözlemci, huni, fırın, piston, varil, merdiven, kütük, meşale, kaldıraç,
ray, tekrarlayıcı, karşılaştırıcı, zil, crafter... **listesi elle
yazılmıyor**, bloğun kendi durum tablosuna bakılıyor. Oyuna yeni bir yönlü
blok gelse bile kod değişmeden çalışır.

Ana eksen bir tam tur atınca ikincil eksen ilerliyor: merdivenin 4 yönü
bitince ters/düz değişiyor, 8 konumun hepsine tek tuşla ulaşılıyor.

Huni yukarı bakamaz (o değer atlanıyor), kapı iki yarısıyla birlikte
dönüyor, yatak/çift sandık/kafa/tabela/sancak dışarıda (ikinci parçaları
**yan** blokta durduğu için döndürmek yerini de taşımayı gerektirirdi).
Başkasının arsasında çalışmıyor. 180 ms bekleme var.

Anahtar markette satılmıyor ve toplu satışta gitmiyor — kontrol kitabı ve
arsa sopası gibi özel eşya sayılıyor.

## Ametist aletler aşırı güçlendi (v4.6)

| | Ametist Kılıç | Ametist Balta | (karşılaştırma) Netherit |
|---|---|---|---|
| Hasar | **22** | **20** | kılıç 8 / balta 10 |
| Dayanıklılık | **8.000** | **8.000** | 2.031 |
| Kazma hızı | 6 | **30** | 9 |
| Büyülenebilirlik | **30** | **30** | 15 |
| Onarım (ametist parçası başına) | 1.500 | 1.500 | — |

Dengeyi bozmuyor çünkü **4 saat sonra eriyip yok oluyorlar**. Kalıcı
olsalardı netherit'i tamamen anlamsız kılarlardı; süreli olunca "en güçlü
alet" değil "doğru anda kullanılan pahalı kaynak" oluyorlar.

Fiyatları değişmedi (kılıç 15.000 sat / 59.400 al). Sebep: değerleri craft
girdilerinin alış bedelinin **altında** tutulmak zorunda, yoksa "girdiyi
al, craftla, sat" açığı oluşurdu.

## Market isimleri ve soru işaretleri düzeldi (v4.6)

Kullanıcı iki şey bildirdi: çoğu blokta **soru işareti** görseli ve
**okunamayan isimler**. İkisi de gerçekti.

### 1. İsimler: 1350 eşya ham anahtar gösteriyordu

Bedrock'ta eşya id'si ile dil anahtarı **çoğu zaman tutmuyor**:

| eşya id | beklenen anahtar | **gerçek anahtar** |
|---|---|---|
| `acacia_planks` | ~~item.acacia_planks.name~~ | `tile.planks.acacia.name` |
| `white_wool` | ~~item.white_wool.name~~ | `tile.wool.white.name` |
| `acacia_boat` | ~~item.acacia_boat.name~~ | `item.boat.acacia.name` |
| `mutton` | ~~item.mutton.name~~ | `item.muttonRaw.name` |
| `cod` | ~~item.cod.name~~ | `item.fish.name` |
| `note_block` | ~~item.note_block.name~~ | `tile.noteblock.name` |
| `golden_horse_armor` | ~~item...~~ | `item.horsearmorgold.name` |

Anahtar yoksa Minecraft **anahtarın kendisini** basıyor — markette
`item.acacia_planks.name` gibi noktalı, okunamaz satırlar. Markette
gösterilen 1668 eşyanın **1350'si** böyleydi.

Çözüm: `ad_guncelle.py`, Mojang'ın kendi `en_US.lang` dosyasını indirip
her eşya için **doğrulanmış** anahtarı buluyor ve `scripts/adlar.js`
dosyasını üretiyor. Altı strateji sırayla deneniyor:

1. `item.<id>.name` / `tile.<id>.name` doğrudan var mı
2. elle bilinen karşılıklar (kova ailesi, at zırhı, balık...)
3. `aile.varyant` biçimi — `acacia_chest_boat` → `item.chest_boat.acacia.name`
4. **İngilizce adından geri bulma** — "acacia planks" → `tile.planks.acacia.name`
5. camelCase / bitişik anahtar — `note_block` → `tile.noteblock.name`
6. "Raw X" biçimi — `mutton` → `item.muttonRaw.name`

**1678 eşya çözüldü.** Kaynak listesi sadece Mojang metadata'sı değil,
`esyalar.js`'in kendi katalogu da (Node ile çalıştırılıp okunuyor) — çünkü
`note_block`, `oak_button`, `nether_quartz_ore` gibi Bedrock'un kabul
ettiği takma adlar metadata'da geçmiyor.

**Kritik kural: tahmin yok.** Vanilla bir eşya haritada yoksa artık
`localizationKey`'e de güvenmiyoruz — id'den okunaklı düz metin
üretiyoruz ("Black bundle"). Yanlış ya da ham anahtar bir daha ekrana
gelmiyor. Ölçüm: menüde **0 ham anahtar**, 528 çevrilmiş, 25 düz metin.

`mutton`u bir ara "Cooked Mutton"a bağlamıştı — kelime alt-küme eşleşmesi
fazla gevşekti. Sadece "Raw" fazlalığına izin verecek şekilde daraltıldı;
**yanlış ad, okunmayan addan beterdir.**

### 2. Soru işaretleri: hayalet eşyalar

Katalogdaki 1902 id'nin **292'si** Mojang'ın hiçbir sürümünde yok. Bunlar
aile şablonlarından üretilmiş adaylar: `white_bed` (gerçek id `bed`),
`white_banner` (`banner`), `crimson_boat`, `mangrove_sapling`,
`stone_block`... Oyunun kabul ettiği sürümlerde listeye giriyor ve
**soru işareti + okunamaz ad** olarak duruyorlardı.

Yeni kural: **ikonu çözülemeyen eşya menüde gösterilmiyor.** Ama
**satılabilir kalıyor** — envanterinde varsa yine satarsın, oyuncu
marketinde yine ilan verirsin. Market listesi 1673'ten **1492**'ye indi;
inen 181 eşyanın hepsi görseli olmayanlardı.

Ayrıca `ikon_guncelle.py` artık Mojang'ın **blok** metadata'sını da
okuyor (eskiden sadece eşya listesine bakıyordu), böylece yatak, sancak,
kayık ve yeni ağaç aileleri de ikon alıyor. İkon kapsamı: **1607 eşyanın
1606'sı** geçerli dokuya işaret ediyor.

## Paketleme

```bash
bash paketle.sh          # -> Market_v4.6.mcaddon
```

Sürüm numarası hem `manifest.json` dosyalarında hem de `main.js` içindeki
`CFG.surum` alanında tutuluyor — ikisini birlikte güncellemek gerekiyor,
yoksa Minecraft "kopya paket" uyarısı verir.
