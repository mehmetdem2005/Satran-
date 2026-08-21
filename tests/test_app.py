"""Flask uçları ve hattın uçtan uca davranışı (sahte motorla)."""

import io
import json
import zipfile

import pytest


@pytest.fixture()
def client():
    from app import create_app

    application = create_app()
    application.config["TESTING"] = True
    with application.test_client() as test_client:
        test_client.application = application
        yield test_client


def sse_events(response):
    events = []
    for frame in response.get_data(as_text=True).split("\n\n"):
        frame = frame.strip()
        if frame.startswith("data:"):
            events.append(json.loads(frame[5:]))
    return events


class TestBasicRoutes:
    def test_index_yuklenir(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert b"HermesForge" in response.data

    def test_healthz(self, client):
        assert client.get("/healthz").get_json() == {"status": "ok"}

    def test_status_hermes_kapaliyken_de_doner(self, client):
        data = client.get("/api/status").get_json()
        assert data["hermes"]["health"]["reachable"] is False
        assert data["agents"]
        assert "zip" in data["formats"]

    def test_bilinmeyen_api_ucu_json_404(self, client):
        response = client.get("/api/yok-boyle-bir-sey")
        assert response.status_code == 404
        assert response.get_json()["error"]


class TestChatStream:
    def test_bos_mesaj_reddedilir(self, client):
        response = client.post("/api/chat/stream", json={"message": "   "})
        assert response.status_code == 400

    def test_motor_yokken_anlasilir_hata(self, client):
        """Sessizce boş yanıt vermek yerine ne yapılacağını söylemeli."""
        response = client.post("/api/chat/stream", json={"message": "bir uygulama yap"})
        events = sse_events(response)
        types = [e["type"] for e in events]

        assert "engine" in types
        hata = next(e for e in events if e["type"] == "error")
        assert "install_hermes.sh" in hata["text"] or "yedek sağlayıcı" in hata["text"]
        assert events[-1] == {"type": "done", "ok": False}

    def test_bozuk_proje_kimligi_cokertmez(self, client):
        response = client.post(
            "/api/chat/stream", json={"message": "bir uygulama yap", "project_id": "../../kacak"}
        )
        assert response.status_code == 200
        assert sse_events(response)


class TestUpload:
    def test_metin_dosyasi_indekslenir(self, client):
        data = {"file": (io.BytesIO("Hermes FTS5 kullanir".encode("utf-8")), "notlar.txt")}
        response = client.post("/api/upload", data=data, content_type="multipart/form-data")
        payload = response.get_json()
        assert payload["chunks"] >= 1

        sonuc = client.get("/api/rag/search?q=FTS5").get_json()
        assert sonuc["results"]

    def test_zip_uyeleri_ayri_belge_olur(self, client):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("a.py", "import flask")
            archive.writestr("b.md", "# başlık")
        buffer.seek(0)

        response = client.post(
            "/api/upload",
            data={"file": (buffer, "proje.zip")},
            content_type="multipart/form-data",
        )
        assert response.get_json()["documents"] == 2

    def test_dosyasiz_istek(self, client):
        assert client.post("/api/upload", data={}).status_code == 400

    def test_bos_dosya(self, client):
        response = client.post(
            "/api/upload",
            data={"file": (io.BytesIO(b""), "bos.txt")},
            content_type="multipart/form-data",
        )
        assert response.status_code == 400

    def test_kaynak_temizleme(self, client):
        client.post(
            "/api/upload",
            data={"file": (io.BytesIO(b"veri"), "a.txt")},
            content_type="multipart/form-data",
        )
        assert client.delete("/api/rag").get_json()["cleared"] is True
        assert client.get("/api/rag/sources").get_json()["sources"] == []


class TestMemoryRoutes:
    def test_ekle_listele_sil(self, client):
        assert client.post("/api/memory", json={"text": "Kullanıcı Termux kullanıyor"}).get_json()["added"]

        data = client.get("/api/memory").get_json()
        assert data["stats"]["total"] == 1
        assert data["scope_key"].startswith("agent:main:hermesforge:")

        mid = data["memories"][0]["id"]
        assert client.delete(f"/api/memory/{mid}").get_json()["deleted"] is True

    def test_bos_ani_reddedilir(self, client):
        assert client.post("/api/memory", json={"text": "  "}).status_code == 400

    def test_toplu_temizleme(self, client):
        client.post("/api/memory", json={"text": "Silinecek bir anı burada"})
        client.delete("/api/memory")
        assert client.get("/api/memory").get_json()["stats"]["total"] == 0


class TestProjectRoutes:
    def _proje_olustur(self, client):
        store = client.application.extensions["hermesforge"]["store"]
        pid = store.new_project_id("test")
        store.write_files(pid, [{"path": "app.py", "content": "print('merhaba')\n"}])
        return pid

    def test_listeleme_ve_okuma(self, client):
        pid = self._proje_olustur(client)
        assert client.get("/api/projects").get_json()["projects"][0]["project_id"] == pid
        assert client.get(f"/api/projects/{pid}/files").get_json()["files"][0]["path"] == "app.py"
        assert "merhaba" in client.get(f"/api/projects/{pid}/file?path=app.py").get_json()["content"]

    @pytest.mark.parametrize("fmt", ["zip", "targz", "markdown", "json", "single"])
    def test_her_bicimde_indirme(self, client, fmt):
        pid = self._proje_olustur(client)
        response = client.get(f"/api/projects/{pid}/export?format={fmt}")
        assert response.status_code == 200
        assert response.data

    def test_gecersiz_proje_kimligi_400(self, client):
        for path in ("/api/projects/..%2F..%2Fkacak/files", "/api/projects/kotu!id/files"):
            response = client.get(path)
            assert response.status_code in (400, 404)

    def test_yol_kacisi_dosya_okumada_reddedilir(self, client):
        pid = self._proje_olustur(client)
        response = client.get(f"/api/projects/{pid}/file?path=../../../etc/passwd")
        assert response.status_code == 404

    def test_bos_proje_indirilemez(self, client):
        store = client.application.extensions["hermesforge"]["store"]
        pid = store.new_project_id("bos")
        store.project_dir(pid)
        assert client.get(f"/api/projects/{pid}/export?format=zip").status_code == 400

    def test_silme(self, client):
        pid = self._proje_olustur(client)
        assert client.delete(f"/api/projects/{pid}").get_json()["deleted"] is True


class TestSettings:
    def test_sirlar_sizmaz(self, client):
        client.post("/api/settings", json={"hermes_api_key": "gizli-anahtar"})
        data = client.get("/api/settings").get_json()
        assert data["hermes_api_key"] is True, "anahtar düz metin dönmemeli"
        assert "gizli-anahtar" not in json.dumps(data)

    def test_kaydetme_kalici(self, client):
        client.post("/api/settings", json={"hermes_model": "özel-model"})
        assert client.get("/api/settings").get_json()["hermes_model"] == "özel-model"

    def test_bilinmeyen_alan_reddedilir(self, client):
        assert client.post("/api/settings", json={"gizli_alan": "x"}).status_code == 400

    def test_bos_sir_mevcut_degeri_silmez(self, client):
        client.post("/api/settings", json={"hermes_api_key": "ilk-anahtar"})
        client.post("/api/settings", json={"hermes_api_key": "", "hermes_model": "m"})
        assert client.get("/api/settings").get_json()["hermes_api_key"] is True


class TestConversationExport:
    def test_zip_uretilir(self, client):
        response = client.post(
            "/api/export/conversation",
            json={"messages": [
                {"role": "user", "content": "soru"},
                {"role": "assistant", "content": "cevap", "agentName": "Kodlayıcı"},
            ]},
        )
        assert response.status_code == 200
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            assert set(archive.namelist()) == {"konusma.json", "konusma.md"}
            assert "Kodlayıcı" in archive.read("konusma.md").decode("utf-8")

    def test_bos_konusma_reddedilir(self, client):
        assert client.post("/api/export/conversation", json={"messages": []}).status_code == 400


class TestModelSettings:
    """Kaldırılıp geri getirilen model ayarları."""

    def test_dusunme_duzeyi_kaydedilir(self, client):
        assert client.post("/api/settings", json={"reasoning_effort": "xhigh"}).get_json()["saved"]
        assert client.get("/api/settings").get_json()["reasoning_effort"] == "xhigh"

    def test_gecersiz_dusunme_duzeyi_reddedilir(self, client):
        """Hermes bilinmeyen değeri sessizce yok sayardı; kullanıcı ayarın
        çalıştığını sanırdı."""
        response = client.post("/api/settings", json={"reasoning_effort": "uydurma"})
        assert response.status_code == 400
        assert "Geçersiz düşünme düzeyi" in response.get_json()["error"]

    def test_hermesin_kabul_ettigi_tum_duzeyler_gecerli(self, client):
        for effort in ("default", "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"):
            assert client.post("/api/settings", json={"reasoning_effort": effort}).status_code == 200

    def test_max_token_kaydedilir_ve_env_yazilir(self, client, tmp_path):
        from hermes.runtime import HermesRuntime

        response = client.post("/api/settings", json={"max_tokens": 65536})
        payload = response.get_json()
        assert payload["saved"] is True
        assert payload["hermes_restart_required"] is True, (
            "Hermes max_tokens'ı istek başına kabul etmiyor; .env'e yazılmalı"
        )
        assert "HERMES_MAX_TOKENS=65536" in HermesRuntime.env_path().read_text(encoding="utf-8")

    @pytest.mark.parametrize("value", [0, -5, 2_000_000, "abc"])
    def test_gecersiz_max_token(self, client, value):
        assert client.post("/api/settings", json={"max_tokens": value}).status_code == 400

    def test_temperature_ve_top_p(self, client):
        assert client.post("/api/settings", json={"temperature": 0.3, "top_p": 0.8}).status_code == 200
        data = client.get("/api/settings").get_json()
        assert data["temperature"] == 0.3
        assert data["top_p"] == 0.8

    @pytest.mark.parametrize("payload", [{"temperature": 5}, {"top_p": 2}, {"temperature": "x"}])
    def test_araligi_asan_degerler(self, client, payload):
        assert client.post("/api/settings", json=payload).status_code == 400

    def test_paralel_ajan_siniri(self, client):
        assert client.post("/api/settings", json={"max_parallel_agents": 3}).status_code == 200
        assert client.post("/api/settings", json={"max_parallel_agents": 99}).status_code == 400

    def test_status_gercek_katalogu_bildirir(self, client):
        """Model ve düzey listeleri sağlayıcının belgelerinden gelmeli."""
        data = client.get("/api/status").get_json()
        catalog = data["catalog"]

        deepseek = next(p for p in catalog["presets"] if p["id"] == "deepseek")
        model_ids = [m["id"] for m in deepseek["models"]]
        assert model_ids == [
            "deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp"
        ]

        efforts = [e["id"] for e in deepseek["efforts"]]
        assert efforts == ["default", "none", "low", "high", "max"]
        # Hermes'e özgü düzeyler DeepSeek listesinde GÖRÜNMEMELİ
        assert "ultra" not in efforts and "minimal" not in efforts and "xhigh" not in efforts

        hermes_efforts = [e["id"] for e in catalog["hermes_efforts"]]
        assert "ultra" in hermes_efforts and "xhigh" in hermes_efforts

        assert deepseek["max_output_tokens"] == 384000
        assert data["platform"] in ("desktop", "android")
        assert data["max_parallel_agents"] >= 1


class TestEmbeddedPaths:
    """APK'da arayüz dosyaları uygulamanın özel dizininden servis ediliyor."""

    def test_sablon_ve_statik_yolu_gecersiz_kilinabilir(self, tmp_path, monkeypatch):
        templates = tmp_path / "tpl"
        static = tmp_path / "st"
        templates.mkdir()
        (static / "css").mkdir(parents=True)
        (templates / "index.html").write_text("<h1>gömülü</h1>", encoding="utf-8")
        (static / "css" / "app.css").write_text("body{}", encoding="utf-8")

        monkeypatch.setenv("HERMESFORGE_TEMPLATES", str(templates))
        monkeypatch.setenv("HERMESFORGE_STATIC", str(static))

        from app import create_app

        application = create_app()
        with application.test_client() as client:
            assert b"g\xc3\xb6m\xc3\xbcl\xc3\xbc" in client.get("/").data
            assert client.get("/static/css/app.css").status_code == 200

    def test_gecersiz_kilma_yoksa_depo_klasoru_kullanilir(self, monkeypatch):
        monkeypatch.delenv("HERMESFORGE_TEMPLATES", raising=False)
        monkeypatch.delenv("HERMESFORGE_STATIC", raising=False)

        from app import create_app

        with create_app().test_client() as client:
            assert b"HermesForge" in client.get("/").data


class TestServeModule:
    """serve.py hem masaüstünde hem APK içinde aynı yol."""

    def test_bos_port_secilir_ve_sunucu_kalkar(self):
        import serve

        port, thread = serve.start_server("127.0.0.1", 0)
        try:
            assert port > 0
            assert serve.wait_until_ready("127.0.0.1", port, timeout=20)
            assert thread.daemon, "sunucu daemon olmalı, süreç kapanışını engellememeli"
        finally:
            pass

    def test_find_free_port_farkli_portlar_verir(self):
        import serve

        assert serve.find_free_port() != 0

    def test_hazir_olmayan_port_zaman_asimina_ugrar(self):
        import serve

        assert serve.wait_until_ready("127.0.0.1", 9, timeout=0.5) is False


class TestAndroidEntrypoint:
    """APK içindeki Python girişi (android/app/src/main/python/android_main.py)."""

    @pytest.fixture()
    def android_main(self):
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        path = root / "android" / "app" / "src" / "main" / "python"
        if str(path) not in sys.path:
            sys.path.insert(0, str(path))
        import android_main as module

        return module

    def _frontend_zip(self, tmp_path):
        import zipfile

        target = tmp_path / "frontend.zip"
        with zipfile.ZipFile(target, "w") as archive:
            archive.writestr("templates/index.html", "<h1>merhaba</h1>")
            archive.writestr("static/css/app.css", "body{}")
        return target

    def test_arayuz_acilir(self, android_main, tmp_path):
        target = android_main._install_frontend(tmp_path, str(self._frontend_zip(tmp_path)))
        assert (target / "templates" / "index.html").exists()
        assert (target / "static" / "css" / "app.css").exists()

    def test_damga_gereksiz_acmayi_onler(self, android_main, tmp_path):
        zip_path = str(self._frontend_zip(tmp_path))
        target = android_main._install_frontend(tmp_path, zip_path)
        marker = target / "templates" / "index.html"
        before = marker.stat().st_mtime_ns

        android_main._install_frontend(tmp_path, zip_path)
        assert marker.stat().st_mtime_ns == before

    def test_zip_slip_engellenir(self, android_main, tmp_path):
        """Arşivdeki yollar hedef klasörün dışına çıkamamalı."""
        import zipfile

        evil = tmp_path / "evil.zip"
        with zipfile.ZipFile(evil, "w") as archive:
            archive.writestr("../../kacak.txt", "zarar")
            archive.writestr("templates/index.html", "iyi")

        target = android_main._install_frontend(tmp_path, str(evil))
        assert (target / "templates" / "index.html").exists()
        assert not (tmp_path.parent / "kacak.txt").exists()

    def test_start_sunucuyu_ayaga_kaldirir(self, android_main, tmp_path, monkeypatch):
        import urllib.request

        monkeypatch.delenv("HERMESFORGE_HOME", raising=False)
        monkeypatch.delenv("HERMESFORGE_TEMPLATES", raising=False)
        monkeypatch.delenv("HERMESFORGE_STATIC", raising=False)

        port = android_main.start(str(tmp_path / "files"), str(self._frontend_zip(tmp_path)))
        assert port > 0, android_main.last_error()
        assert android_main.port() == port

        with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz", timeout=10) as response:
            assert response.status == 200

    def test_bozuk_zip_hata_dondurur(self, android_main, tmp_path):
        """Çökmek yerine 0 ve okunabilir bir hata dönmeli."""
        bad = tmp_path / "bozuk.zip"
        bad.write_bytes(b"bu bir zip degil")
        assert android_main.start(str(tmp_path / "f2"), str(bad)) == 0
        assert android_main.last_error()


class TestProviderPresets:
    """Sağlayıcı ön ayarları — değerler sağlayıcının belgelerinden."""

    def test_deepseek_varsayilan_model_gercek(self, client):
        """Eskiden 'deepseek-chat' yazıyordu; belgelerdeki aile v4."""
        assert client.get("/api/settings").get_json()["fallback_model"] == "deepseek-v4-flash"

    def test_model_secilebilir(self, client):
        assert client.post(
            "/api/settings", json={"fallback_model": "deepseek-v4-pro"}
        ).get_json()["saved"]
        assert client.get("/api/settings").get_json()["fallback_model"] == "deepseek-v4-pro"

    def test_deepseekte_hermes_duzeyi_reddedilmez_ama_eslenir(self, client):
        """Kullanıcı motorlar arası geçerken ayarı yeniden girmek zorunda kalmasın."""
        assert client.post(
            "/api/settings", json={"reasoning_effort": "ultra", "fallback_preset": "deepseek"}
        ).status_code == 200

    def test_gecersiz_duzey_reddedilir(self, client):
        response = client.post("/api/settings", json={"reasoning_effort": "uydurma-duzey"})
        assert response.status_code == 400
        assert "geçerli olanlar" in response.get_json()["error"]

    def test_bilinmeyen_saglayici_reddedilir(self, client):
        assert client.post("/api/settings", json={"fallback_preset": "yokboyle"}).status_code == 400

    def test_ozel_saglayici_secilebilir(self, client):
        assert client.post("/api/settings", json={
            "fallback_preset": "custom",
            "fallback_base_url": "http://127.0.0.1:1234/v1",
            "fallback_model": "yerel-model",
        }).status_code == 200


class TestDeepSeekPayload:
    """Yedek sağlayıcıya giden gövde DeepSeek sözleşmesine uymalı."""

    def _payload(self, **overrides):
        import config as config_module
        from providers.direct import DirectProvider

        cfg = config_module.load_config()
        cfg.fallback_api_key = "test"
        for key, value in overrides.items():
            setattr(cfg, key, value)
        return DirectProvider(cfg)._payload([], False, None)

    def test_dusunme_kapatma_deepseek_bicimi(self):
        """DeepSeek: {"thinking": {"type": "disabled"}}"""
        payload = self._payload(reasoning_effort="none")
        assert payload["thinking"] == {"type": "disabled"}
        assert "reasoning_effort" not in payload

    def test_belgelenmis_duzeyler_dogrudan_gider(self):
        for effort in ("low", "high", "max"):
            assert self._payload(reasoning_effort=effort)["reasoning_effort"] == effort

    def test_hermes_duzeyleri_deepseeke_eslenir(self):
        """DeepSeek 'ultra'yı tanımıyor; en yakın gerçek düzeye indiriyoruz."""
        assert self._payload(reasoning_effort="ultra")["reasoning_effort"] == "max"
        assert self._payload(reasoning_effort="xhigh")["reasoning_effort"] == "high"
        assert self._payload(reasoning_effort="minimal")["reasoning_effort"] == "low"

    def test_384k_ustu_kirpiliyor(self):
        """Üst sınırın üstünü istemek isteğin tamamını reddettirir."""
        assert self._payload(max_tokens=999_999)["max_tokens"] == 384_000

    def test_ozel_uçta_kirpma_yok(self):
        payload = self._payload(fallback_preset="custom", max_tokens=999_999)
        assert payload["max_tokens"] == 999_999

    def test_ozel_uçta_thinking_alani_gonderilmez(self):
        """Alanı tanımayan sunucular bilinmeyen gövde alanında 400 dönüyor."""
        payload = self._payload(fallback_preset="custom", reasoning_effort="none")
        assert "thinking" not in payload


class TestProviderValidation:
    """Yanlış anahtar ilk sohbet denemesinde değil, hemen anlaşılmalı."""

    def test_bos_anahtar_reddedilir(self, client):
        response = client.post("/api/provider/test", json={"api_key": ""})
        assert response.status_code == 400
        assert "boş" in response.get_json()["error"]

    def test_ulasilamayan_saglayici(self, client):
        response = client.post("/api/provider/test", json={
            "api_key": "sk-test",
            "base_url": "http://127.0.0.1:9",
            "preset": "custom",
        })
        assert response.status_code == 400
        assert "ulaşılamadı" in response.get_json()["error"]

    def test_gecerli_anahtar_kabul_edilir(self, client, sahte_saglayici):
        response = client.post("/api/provider/test", json={
            "api_key": "sk-dogru",
            "base_url": sahte_saglayici,
            "preset": "custom",
            "model": "sahte-model",
        })
        assert response.status_code == 200
        assert response.get_json()["ok"] is True

    def test_reddedilen_anahtar_anlasilir_hata(self, client, sahte_saglayici):
        response = client.post("/api/provider/test", json={
            "api_key": "sk-yanlis",
            "base_url": sahte_saglayici,
            "preset": "custom",
        })
        assert response.status_code == 400
        error = response.get_json()["error"]
        assert "reddedildi" in error
        assert "kredi" in error, "kullanıcıya ne yapacağını söylemeli"

    def test_model_listede_yoksa_uyarir(self, client, sahte_saglayici):
        """Anahtar geçerli ama model yanlışsa sessizce geçmemeli."""
        response = client.post("/api/provider/test", json={
            "api_key": "sk-dogru",
            "base_url": sahte_saglayici,
            "preset": "custom",
            "model": "olmayan-model",
        })
        payload = response.get_json()
        assert payload["ok"] is True
        assert "listede yok" in payload["warning"]
