"""ForgePipeline: ajan orkestrasyonu, dosya kaydı ve hata yolları."""

import pytest

from forge.artifacts import ArtifactStore
from forge.pipeline import ForgePipeline
from hermes.memory import HermesMemory
from hermes.rag import HermesRag

KOD_YANITI = """Dosyaları yazdım.

```python path=app.py
print("merhaba")
```
"""


class SahteIstemci:
    """HermesClient yerine geçen, akışı senaryoya göre üreten sahte."""

    def __init__(self, *, reachable=True, yanit=KOD_YANITI, patlat=None, oturum_hatasi=False):
        self._reachable = reachable
        self._yanit = yanit
        self._patlat = patlat
        self._oturum_hatasi = oturum_hatasi
        self.oturumlar = []
        self.tur_sayisi = 0

    def health(self):
        return {"reachable": self._reachable}

    def complete(self, messages, **kwargs):
        return '{"mode":"build","title":"Sahte başlık","reason":"test"}'

    def create_session(self, title=None, **kwargs):
        if self._oturum_hatasi:
            raise RuntimeError("oturum açılamadı")
        sid = f"sess_{len(self.oturumlar)}"
        self.oturumlar.append(sid)
        return sid

    def stream_session_turn(self, session_id, message, **kwargs):
        self.tur_sayisi += 1
        if self._patlat == "hemen":
            raise RuntimeError("hermes çöktü")
        yield {"type": "delta", "text": self._yanit[:20]}
        if self._patlat == "ortada":
            raise RuntimeError("akış yarıda kesildi")
        yield {"type": "delta", "text": self._yanit[20:]}

    def stream_chat_completion(self, messages, **kwargs):
        self.tur_sayisi += 1
        yield {"type": "delta", "text": self._yanit}


@pytest.fixture()
def hat_kur(tmp_path, tmp_config):
    def kur(istemci=None):
        return ForgePipeline(
            config=tmp_config,
            client=istemci or SahteIstemci(),
            memory=HermesMemory(tmp_path / "mem.sqlite3"),
            rag=HermesRag(tmp_path / "rag.sqlite3", workspace_dir=tmp_path / "ws"),
            store=ArtifactStore(tmp_path / "projects"),
        )

    return kur


def olaylar(pipeline, **kwargs):
    kwargs.setdefault("message", "Bana bir uygulama yap")
    return list(pipeline.run(**kwargs))


class TestMutluYol:
    def test_tam_hat_calisir(self, hat_kur):
        pipeline = hat_kur()
        events = olaylar(pipeline)
        tipler = [e["type"] for e in events]

        assert tipler[-1] == "done"
        assert events[-1]["ok"] is True
        assert tipler.count("agent_start") == 5, "build modunda beş ajan çalışmalı"
        assert "artifacts" in tipler

    def test_baslik_calisan_ajani_gosterir(self, hat_kur):
        """Arayüz başlığı bu olaydan besleniyor."""
        events = olaylar(hat_kur())
        baslangiclar = [e["agent"] for e in events if e["type"] == "agent_start"]
        assert [a["id"] for a in baslangiclar] == [
            "analyst", "architect", "builder", "reviewer", "packager"
        ]
        assert all(a["name"] and a["emoji"] for a in baslangiclar)

    def test_dosyalar_diske_yazilir(self, hat_kur, tmp_path):
        events = olaylar(hat_kur())
        artifact = next(e for e in events if e["type"] == "artifacts")
        assert "app.py" in [f["path"] for f in artifact["files"]]

        yazilan = tmp_path / "projects" / artifact["project_id"] / "app.py"
        assert yazilan.read_text(encoding="utf-8").strip() == 'print("merhaba")'

    def test_dosya_uretmeyen_ajanlar_dosya_yazmaz(self, hat_kur):
        events = olaylar(hat_kur())
        bitisler = {e["agent_id"]: e["files"] for e in events if e["type"] == "agent_end"}
        assert bitisler["analyst"] == []
        assert bitisler["architect"] == []
        assert bitisler["builder"]

    def test_uretilen_kod_rage_indekslenir(self, hat_kur):
        """Sonraki turda 'şunu düzelt' isteği ilgili kodu geri getirebilmeli."""
        pipeline = hat_kur()
        events = olaylar(pipeline)
        pid = next(e for e in events if e["type"] == "artifacts")["project_id"]
        assert pipeline.rag.search("merhaba", collection=f"project:{pid}")

    def test_bellek_turdan_ogrenir(self, hat_kur):
        pipeline = hat_kur()
        olaylar(pipeline, message="Benim adım Mehmet, bana bir uygulama yap")
        assert pipeline.memory.stats()["total"] >= 1


class TestYonlendirme:
    def test_paketleme_modeli_hic_cagirmaz(self, hat_kur, tmp_path):
        istemci = SahteIstemci()
        pipeline = hat_kur(istemci)
        store = pipeline.store
        pid = store.new_project_id("hazir")
        store.write_files(pid, [{"path": "a.py", "content": "x\n"}])

        events = olaylar(pipeline, message="bunu zip olarak ver", project_id=pid)
        assert istemci.tur_sayisi == 0, "paketleme için model çalıştırılmamalı"

        artifact = next(e for e in events if e["type"] == "artifacts")
        assert artifact["suggested_format"] == "zip"

    def test_soru_tek_ajanla_yanitlanir(self, hat_kur):
        events = olaylar(hat_kur(), message="Flask nedir?")
        baslangiclar = [e["agent"]["id"] for e in events if e["type"] == "agent_start"]
        assert baslangiclar == ["advisor"]


class TestHataYollari:
    def test_bos_mesaj(self, hat_kur):
        events = olaylar(hat_kur(), message="   ")
        assert events[0]["type"] == "error"

    def test_motor_yoksa_aciklayici_hata(self, hat_kur):
        pipeline = hat_kur(SahteIstemci(reachable=False))
        events = olaylar(pipeline)
        hata = next(e for e in events if e["type"] == "error")
        assert "hermes_sunucu.sh" in hata["text"]
        assert events[-1]["ok"] is False

    def test_androidde_kabuk_komutu_onerilmez(self, hat_kur, tmp_config):
        """APK'da kabuk yok; çalıştırılamayacak bir komut önermek yanlış yönlendirme."""
        tmp_config.platform = "android"
        pipeline = hat_kur(SahteIstemci(reachable=False))
        hata = next(e for e in olaylar(pipeline) if e["type"] == "error")
        assert "QR" in hata["text"]
        assert "Ayarlar" in hata["text"]

    def test_hermes_coktugunde_yedek_yok(self, hat_kur):
        """Hermes'siz çalışan bir yol kalmadı; hata açıkça söylenmeli."""
        pipeline = hat_kur(SahteIstemci(patlat="hemen"))
        events = olaylar(pipeline)
        hata = next(e for e in events if e["type"] == "error")
        assert "Hermes hatası" in hata["text"]

    def test_akis_ortada_kesilirse_metin_ikilenmez(self, hat_kur):
        """Yarıda kesilen tur baştan yazdırılmaz, hata olarak bildirilir."""
        pipeline = hat_kur(SahteIstemci(patlat="ortada"))
        events = olaylar(pipeline)

        deltalar = [e for e in events if e["type"] == "delta"]
        assert len(deltalar) == 1, "kesilen tur tekrar yazdırılmamalı"
        assert any(e["type"] == "error" for e in events)

    def test_bos_yanit_sessizce_gecmez(self, hat_kur):
        pipeline = hat_kur(SahteIstemci(yanit=""))
        events = olaylar(pipeline)
        hata = next(e for e in events if e["type"] == "error")
        assert "boş yanıt" in hata["text"]
        assert events[-1]["ok"] is False

    def test_oturum_acilamazsa_durumsuz_devam_eder(self, hat_kur):
        pipeline = hat_kur(SahteIstemci(oturum_hatasi=True))
        events = olaylar(pipeline)
        assert not any(e["type"] == "session" for e in events)
        assert any(e["type"] == "delta" for e in events)
        assert events[-1]["ok"] is True

    def test_bozuk_proje_kimligi_yeni_projeye_duser(self, hat_kur):
        events = olaylar(hat_kur(), project_id="../../kacak")
        assert any(e["type"] == "project" for e in events)
        assert events[-1]["ok"] is True


# ======================================================================
# Paralel hat: pano, dalgalar, fan-out ve model seçenekleri
# ======================================================================

ARCHITECT_REPLY = """Tasarım hazır.

```dosya-plani
app.py — giriş noktası
db.py — veri katmanı
ui.py — arayüz
README.md — kurulum
```
"""


class KaydedenIstemci(SahteIstemci):
    """Kendisine gönderilen istemleri ve oturumları kaydeden sahte istemci."""

    def __init__(self, yanitlar=None, **kwargs):
        super().__init__(**kwargs)
        self.prompts = []          # (session_id, prompt, system_message, model_options)
        self.olusturulan_basliklar = []
        self._yanitlar = yanitlar or {}

    def create_session(self, title=None, **kwargs):
        self.olusturulan_basliklar.append(title)
        return super().create_session(title=title, **kwargs)

    def stream_session_turn(self, session_id, message, **kwargs):
        self.prompts.append(
            {
                "session_id": session_id,
                "prompt": message,
                "system": kwargs.get("system_message") or "",
                "model_options": kwargs.get("model_options"),
            }
        )
        # İstem içeriğine göre role özgü yanıt ver (Mimar dosya planı üretsin).
        yanit = self._yanit
        for anahtar, metin in self._yanitlar.items():
            if anahtar in (kwargs.get("system_message") or ""):
                yanit = metin
                break
        self.tur_sayisi += 1
        yield {"type": "delta", "text": yanit}


class TestNoReFeeding:
    """'Ajanlar her turda baştan başlıyor' hatasının regresyon kilidi."""

    def test_gecmis_yalnizca_cozumleyiciye_gider(self, hat_kur):
        istemci = KaydedenIstemci()
        pipeline = hat_kur(istemci)
        gecmis = [
            {"role": "user", "content": "ONCEKI_KULLANICI_MESAJI"},
            {"role": "assistant", "content": "ONCEKI_ASISTAN_CEVABI"},
        ]
        olaylar(pipeline, message="Bana bir uygulama yap", history=gecmis)

        cozumleyici = istemci.prompts[0]["prompt"]
        assert "ONCEKI_KULLANICI_MESAJI" in cozumleyici

        for kayit in istemci.prompts[1:]:
            assert "ONCEKI_KULLANICI_MESAJI" not in kayit["prompt"], (
                "Çözümleyici dışındaki ajanlar sohbet geçmişini almamalı"
            )
            assert "### Önceki konuşma ###" not in kayit["prompt"]

    def test_onceki_ajanlarin_ham_ciktisi_tekrar_beslenmez(self, hat_kur):
        istemci = KaydedenIstemci(yanit="AJAN_HAM_CIKTISI_" + "x" * 500)
        pipeline = hat_kur(istemci)
        olaylar(pipeline)

        # Pano damıtılmış metni taşır; ham çıktı blok başlığıyla dolaşmaz.
        for kayit in istemci.prompts:
            assert "### Önceki ajanların çıktıları ###" not in kayit["prompt"]

    def test_istem_boyutu_ajan_sayisiyla_patlamaz(self, hat_kur):
        """Eskiden son ajan, öncekilerin toplamını taşıdığı için şişiyordu."""
        istemci = KaydedenIstemci(yanit="y" * 3000)
        pipeline = hat_kur(istemci)
        olaylar(pipeline)

        boyutlar = [len(k["prompt"]) for k in istemci.prompts]
        assert max(boyutlar) < 4 * min(boyutlar) + 8000

    def test_her_dugum_kendi_oturumunu_alir(self, hat_kur):
        """Tek oturum paylaşmak hem paralelliği hem bağlamı bozuyordu."""
        istemci = KaydedenIstemci()
        pipeline = hat_kur(istemci)
        olaylar(pipeline)

        oturumlar = {k["session_id"] for k in istemci.prompts}
        assert len(oturumlar) == len(istemci.prompts), "her düğüm ayrı oturumda olmalı"


class TestWavesInPipeline:
    def test_denetci_ve_paketleyici_ayni_dalgada(self, hat_kur):
        events = olaylar(hat_kur())
        dalgalar = [e for e in events if e["type"] == "wave"]
        son = dalgalar[-1]
        assert son["parallel"] is True
        assert {a["id"] for a in son["agents"]} == {"reviewer", "packager"}

    def test_dalga_olayi_ajanlari_bildirir(self, hat_kur):
        events = olaylar(hat_kur())
        ilk = next(e for e in events if e["type"] == "wave")
        assert ilk["index"] == 1
        assert [a["id"] for a in ilk["agents"]] == ["analyst"]
        assert ilk["parallel"] is False


class TestFanout:
    def test_mimar_plani_verince_kodlayici_bolunur(self, hat_kur):
        istemci = KaydedenIstemci(yanitlar={"Mimar": ARCHITECT_REPLY})
        pipeline = hat_kur(istemci)
        events = olaylar(pipeline)

        kodlayici_dugumleri = [
            e["agent"] for e in events
            if e["type"] == "agent_start" and e["agent"]["id"] == "builder"
        ]
        assert len(kodlayici_dugumleri) == 2, "max_parallel_agents=2 → iki Kodlayıcı"
        assert [n["label"] for n in kodlayici_dugumleri] == ["Kodlayıcı 1", "Kodlayıcı 2"]

    def test_bolunmus_kodlayicilar_ayrik_dosyalar_alir(self, hat_kur):
        istemci = KaydedenIstemci(yanitlar={"Mimar": ARCHITECT_REPLY})
        events = olaylar(hat_kur(istemci))

        atamalar = [
            e["agent"]["paths"] for e in events
            if e["type"] == "agent_start" and e["agent"]["id"] == "builder"
        ]
        duz = [p for grup in atamalar for p in grup]
        assert len(duz) == len(set(duz)) == 4

    def test_plan_okunamazsa_tek_kodlayiciya_duser(self, hat_kur):
        """Biçim hatası tüm hattı çökertmemeli, sessizce de geçmemeli."""
        istemci = KaydedenIstemci(yanitlar={"Mimar": "Tasarım var ama plan bloğu yok."})
        events = olaylar(hat_kur(istemci))

        kodlayicilar = [
            e for e in events
            if e["type"] == "agent_start" and e["agent"]["id"] == "builder"
        ]
        assert len(kodlayicilar) == 1
        assert any(
            e["type"] == "status" and "tek ajanla" in e.get("text", "")
            for e in events
        )


class TestModelOptions:
    def test_dusunme_duzeyi_hermese_gonderilir(self, hat_kur, tmp_config):
        tmp_config.reasoning_effort = "xhigh"
        istemci = KaydedenIstemci()
        olaylar(hat_kur(istemci))
        assert all(k["model_options"] == {"reasoning_effort": "xhigh"} for k in istemci.prompts)

    def test_varsayilanda_hicbir_sey_gonderilmez(self, hat_kur, tmp_config):
        """Kullanıcı dokunmadıysa sunucunun kendi ayarı geçerli kalmalı."""
        tmp_config.reasoning_effort = "default"
        istemci = KaydedenIstemci()
        olaylar(hat_kur(istemci))
        assert all(k["model_options"] is None for k in istemci.prompts)

    def test_dusunme_kapatilabilir(self, hat_kur, tmp_config):
        tmp_config.reasoning_effort = "none"
        istemci = KaydedenIstemci()
        olaylar(hat_kur(istemci))
        assert istemci.prompts[0]["model_options"] == {"reasoning_effort": "none"}


class TestEngineWording:
    """Motor notu, kullanıcının bulunduğu ortamda anlamlı olmalı."""

    def test_hermes_yoksa_motor_yok(self, hat_kur, tmp_config):
        """Hermes olmadan çalışan bir yol yok; motor 'none' olmalı."""
        tmp_config.platform = "android"
        pipeline = hat_kur(SahteIstemci(reachable=False))
        engine = next(e for e in olaylar(pipeline) if e["type"] == "engine")

        assert engine["engine"] == "none"
        assert "QR" in engine["note"]

    def test_masaustunde_baslatma_komutu_onerilir(self, hat_kur, tmp_config):
        tmp_config.platform = "desktop"
        pipeline = hat_kur(SahteIstemci(reachable=False))
        engine = next(e for e in olaylar(pipeline) if e["type"] == "engine")
        assert "hermes_sunucu.sh" in engine["note"]

    def test_motor_etiketi_hermes_adresini_tasir(self, hat_kur, tmp_config):
        pipeline = hat_kur(SahteIstemci(reachable=True))
        engine = next(e for e in olaylar(pipeline) if e["type"] == "engine")
        assert engine["label"] == "Hermes Agent"
        assert engine["detail"] == tmp_config.hermes_base_url

    def test_hermes_baglaninca_motor_hermes_olur(self, hat_kur):
        pipeline = hat_kur(SahteIstemci(reachable=True))
        engine = next(e for e in olaylar(pipeline) if e["type"] == "engine")
        assert engine["engine"] == "hermes"
