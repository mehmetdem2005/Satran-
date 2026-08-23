"""Flask uçları ve hattın uçtan uca davranışı (sahte motorla)."""

import io
import json
import zipfile

import pytest


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
        assert "hermes_sunucu.sh" in hata["text"] or "Hermes" in hata["text"]
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

    def test_hermes_adresi_kaydedilir(self, client):
        assert client.post(
            "/api/settings", json={"hermes_base_url": "http://192.168.1.20:8642/"}
        ).get_json()["saved"]
        assert client.get("/api/settings").get_json()["hermes_base_url"] == (
            "http://192.168.1.20:8642"
        )

    @pytest.mark.parametrize("value", ["", "192.168.1.20:8642", "ftp://x"])
    def test_gecersiz_hermes_adresi_reddedilir(self, client, value):
        assert client.post("/api/settings", json={"hermes_base_url": value}).status_code == 400

    def test_anahtar_duz_metin_donmez(self, client):
        """Sır cihazda kalır; /api/settings yalnızca var/yok bildirir."""
        client.post("/api/settings", json={"hermes_api_key": "gizli-anahtar"})
        assert client.get("/api/settings").get_json()["hermes_api_key"] is True

    def test_ekip_ayarlari_dogrulanir(self, client, monkeypatch):
        """Katman derinliği ve paralel ajan sayısı Hermes'e yazılıyor."""
        from hermes import embedded

        monkeypatch.setattr(embedded, "available", lambda: True)
        yazilan = {}
        monkeypatch.setattr(embedded, "set_delegation",
                            lambda depth, concurrent, **kw: yazilan.update(
                                depth=depth, concurrent=concurrent))
        monkeypatch.setattr(embedded, "current_delegation",
                            lambda *a, **k: {"max_spawn_depth": 5, "max_concurrent_children": 7})

        assert client.post("/api/hermes/team", json={"depth": 5, "concurrent": 7}).status_code == 200
        assert yazilan == {"depth": 5, "concurrent": 7}
        assert client.post("/api/hermes/team", json={"depth": 99}).status_code == 400
        assert client.post("/api/hermes/team", json={"concurrent": 0}).status_code == 400

    def test_status_saglayiciya_gore_katalog(self, client, monkeypatch):
        """Liste, sağlayıcının telde kabul ettiği düzeylerden olmalı.

        Hermes'in iç merdivenini göstermek, DeepSeek kullanan birine tanımadığı
        düzeyleri seçtirmek demekti (ölçüldü: "ultra" seçilince telde hiçbir
        şey gitmiyor, DeepSeek kendi varsayılanını uyguluyor).
        """
        from hermes import embedded

        monkeypatch.setattr(
            embedded, "current_model",
            lambda *args, **kwargs: {"provider": "deepseek", "model": "deepseek-v4-pro"},
        )
        catalog = client.get("/api/status").get_json()["catalog"]

        assert [e["id"] for e in catalog["efforts"]] == [
            "default", "none", "low", "medium", "high", "max",
        ]
        assert catalog["provider_known"] is True
        for etkisiz in ("ultra", "xhigh", "minimal"):
            assert etkisiz not in [e["id"] for e in catalog["efforts"]]

    def test_saglayici_bilinmiyorsa_tam_merdiven(self, client, monkeypatch):
        """Uzak bir Hermes'in sağlayıcısını bilemeyiz; hepsini gösterip uyarırız."""
        from hermes import embedded

        monkeypatch.setattr(
            embedded, "current_model", lambda *args, **kwargs: {"provider": "", "model": ""}
        )
        catalog = client.get("/api/status").get_json()["catalog"]
        assert "ultra" in [e["id"] for e in catalog["efforts"]]
        assert catalog["provider_known"] is False

    def test_status_temel_alanlar(self, client):
        data = client.get("/api/status").get_json()
        assert "presets" not in data["catalog"], "artık doğrudan sağlayıcı yok"
        assert "fallback" not in data, "Hermes'siz çalışan bir yol kalmadı"
        assert data["platform"] in ("desktop", "android")


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


class TestHermesEnvOkuma:
    """Hermes'in kendi .env dosyasından adres türetme."""

    def _load(self, tmp_path, monkeypatch, satirlar):
        import config as config_module

        home = tmp_path / "hermes-home"
        home.mkdir(parents=True, exist_ok=True)
        (home / ".env").write_text("\n".join(satirlar), encoding="utf-8")
        monkeypatch.delenv("HERMESFORGE_HERMES_URL", raising=False)
        return config_module.load_config()

    def test_dinleme_adresi_baglanti_adresi_degildir(self, tmp_path, monkeypatch):
        """0.0.0.0 'tüm arayüzlerde dinle' demek; oraya bağlanılmaz.

        scripts/hermes_sunucu.sh gateway'i ev ağına açmak için bu değeri
        yazıyor. Olduğu gibi kullansaydık Linux'ta tesadüfen çalışır,
        macOS ve Windows'ta 'bağlanamadı' hatası verirdi.
        """
        cfg = self._load(tmp_path, monkeypatch, [
            "API_SERVER_HOST=0.0.0.0", "API_SERVER_PORT=8642",
        ])
        assert cfg.hermes_base_url == "http://127.0.0.1:8642"

    def test_gercek_adres_korunur(self, tmp_path, monkeypatch):
        cfg = self._load(tmp_path, monkeypatch, [
            "API_SERVER_HOST=192.168.1.20", "API_SERVER_PORT=9000",
        ])
        assert cfg.hermes_base_url == "http://192.168.1.20:9000"

    def test_anahtar_env_dosyasindan_okunur(self, tmp_path, monkeypatch):
        """Kullanıcı aynı sırrı iki yere yazmak zorunda kalmasın."""
        cfg = self._load(tmp_path, monkeypatch, ["API_SERVER_KEY=hf-gizli"])
        assert cfg.hermes_api_key == "hf-gizli"
        assert cfg.to_public_dict()["hermes_api_key"] is True


class TestHermesConnection:
    """Yanlış adres/anahtar ilk sohbet denemesinde değil, hemen anlaşılmalı."""

    def test_ulasilamayan_sunucu(self, client):
        response = client.post("/api/hermes/test", json={"base_url": "http://127.0.0.1:9"})
        assert response.status_code == 400
        error = response.get_json()["error"]
        assert "ulaşılamadı" in error
        assert "Wi-Fi" in error, "kullanıcıya ne yapacağını söylemeli"

    def test_bos_adres_reddedilir(self, client):
        client.post("/api/settings", json={"hermes_base_url": "http://127.0.0.1:9"})
        response = client.post("/api/hermes/test", json={"base_url": "   "})
        # Boş gönderilirse kayıtlı adres denenir; o da kapalı.
        assert response.status_code == 400

    def test_gecerli_baglanti_kabul_edilir(self, client, sahte_hermes):
        response = client.post(
            "/api/hermes/test", json={"base_url": sahte_hermes, "api_key": "sk-dogru"}
        )
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["ok"] is True
        assert "hermes-agent" in payload["models"]

    def test_reddedilen_anahtar_anlasilir_hata(self, client, sahte_hermes):
        response = client.post(
            "/api/hermes/test", json={"base_url": sahte_hermes, "api_key": "sk-yanlis"}
        )
        assert response.status_code == 400
        error = response.get_json()["error"]
        assert "reddedildi" in error
        assert "API_SERVER_KEY" in error, "anahtarın nerede olduğunu söylemeli"

    def test_hermes_olmayan_adres_ayirt_edilir(self, client, http_sunucu):
        """Yanlış porta bağlanan kullanıcı 'burası Hermes değil' cevabını almalı."""
        response = client.post("/api/hermes/test", json={"base_url": http_sunucu})
        assert response.status_code == 400
        assert "Hermes" in response.get_json()["error"]

    def test_kayitli_anahtar_yeniden_yazilmak_zorunda_degil(self, client, sahte_hermes):
        client.post("/api/settings", json={"hermes_api_key": "sk-dogru"})
        response = client.post("/api/hermes/test", json={"base_url": sahte_hermes})
        assert response.status_code == 200
