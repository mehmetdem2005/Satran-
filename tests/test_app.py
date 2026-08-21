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

    def test_status_dusunme_duzeylerini_bildirir(self, client):
        data = client.get("/api/status").get_json()
        assert "xhigh" in data["reasoning_efforts"]
        assert data["max_parallel_agents"] >= 1
