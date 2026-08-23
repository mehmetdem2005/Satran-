"""ForgePipeline: turun yürütülmesi, dosya kaydı ve hata yolları.

Ajan kadrosu artık burada tanımlı değil: ekibi Hermes ``delegate_task`` ile
kendisi kuruyor. Bu yüzden testler "beş ajan çalıştı mı" diye değil,
"Hermes'in kurduğu ekip arayüze doğru aktarıldı mı" diye bakıyor.
"""

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

    def __init__(self, *, reachable=True, yanit=KOD_YANITI, patlat=None,
                 oturum_hatasi=False, ekip=None):
        self._reachable = reachable
        self._yanit = yanit
        self._patlat = patlat
        self._oturum_hatasi = oturum_hatasi
        # Hermes'in delegate_task ile işe aldığı ajanlar (araç olayı olarak).
        self._ekip = ekip or []
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
        for cagri in self._ekip:
            yield {"type": "tool_start", "tool": "delegate_task", "args": cagri}
            yield {"type": "tool_end", "tool": "delegate_task", "ok": True,
                   "args": cagri, "preview": "özet"}
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
        assert "delta" in tipler
        assert "artifacts" in tipler

    def test_ekibi_hermes_kuruyor(self, hat_kur):
        """Kadro bizde sabit değil; adları Hermes veriyor."""
        istemci = SahteIstemci(ekip=[
            {"tasks": [
                {"name": "Güvenlik uzmanı", "role": "leaf"},
                {"name": "Veri mimarı", "role": "orchestrator"},
            ]},
        ])
        events = olaylar(hat_kur(istemci))

        ekip = next(e for e in events if e["type"] == "team")
        assert [a["label"] for a in ekip["hired"]] == ["Güvenlik uzmanı", "Veri mimarı"]

        baslangiclar = [e["agent"] for e in events if e["type"] == "agent_start"]
        assert [a["label"] for a in baslangiclar] == ["Güvenlik uzmanı", "Veri mimarı"]

    def test_yonetici_ve_uzman_ayirt_edilir(self, hat_kur):
        """Katmanlı hiyerarşi: kendi altına ajan alabilen rol işaretlenmeli."""
        istemci = SahteIstemci(ekip=[
            {"tasks": [
                {"name": "Ekip lideri", "role": "orchestrator"},
                {"name": "Test yazarı", "role": "leaf"},
            ]},
        ])
        events = olaylar(hat_kur(istemci))
        kartlar = {e["agent"]["label"]: e["agent"] for e in events if e["type"] == "agent_start"}

        assert kartlar["Ekip lideri"]["role"] == "orchestrator"
        assert kartlar["Ekip lideri"]["title"] == "Yönetici"
        assert kartlar["Test yazarı"]["role"] == "leaf"

    def test_ekip_turlar_boyunca_buyur(self, hat_kur):
        """Sonraki delegate_task çağrıları ekibe eklenmeli, sıfırlamamalı."""
        istemci = SahteIstemci(ekip=[
            {"goal": "İlk uzman"},
            {"tasks": [{"name": "İkinci uzman"}, {"name": "Üçüncü uzman"}]},
        ])
        events = [e for e in olaylar(hat_kur(istemci)) if e["type"] == "team"]
        assert [e["size"] for e in events] == [1, 3]

    def test_dosyalar_diske_yazilir(self, hat_kur, tmp_path):
        events = olaylar(hat_kur())
        artifact = next(e for e in events if e["type"] == "artifacts")
        assert "app.py" in [f["path"] for f in artifact["files"]]

        yazilan = tmp_path / "projects" / artifact["project_id"] / "app.py"
        assert yazilan.read_text(encoding="utf-8").strip() == 'print("merhaba")'

    def test_dosyalar_turun_sonunda_yazilir(self, hat_kur):
        """Dosyaları baş yöneticinin yanıtından çıkarıyoruz; alt ajanların
        özetleri kendi beyanları, onlara güvenmiyoruz."""
        events = olaylar(hat_kur(SahteIstemci(ekip=[{"goal": "Kodlayıcı"}])))
        bitisler = [e for e in events if e["type"] == "agent_end"]
        assert all(e["files"] == [] for e in bitisler)
        assert next(e for e in events if e["type"] == "artifacts")["new_files"] == ["app.py"]

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

    def test_soru_da_ayni_yoldan_gecer(self, hat_kur):
        """Artık mod başına ayrı kadro yok; Hermes gerekirse hiç ajan almaz."""
        events = olaylar(hat_kur(), message="Flask nedir?")
        assert not [e for e in events if e["type"] == "agent_start"]
        assert events[-1]["type"] == "done"


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
