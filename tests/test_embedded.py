"""Gömülü Hermes: APK'nın içindeki gateway.

Bu testler Android'i taklit etmiyor; Hermes kaynağı masaüstünde de import
edilebildiği için ayar yazma, anahtar üretme ve uç davranışı burada
doğrulanıyor. Gateway'in gerçekten açılması ayrı bir entegrasyon adımı.
"""

import pytest

from hermes import embedded


class TestAnahtar:
    def test_anahtar_uretilir_ve_korunur(self, tmp_path):
        first = embedded.ensure_key(tmp_path)
        assert first.startswith("hf-")
        # Hermes 16 karakterden kısa anahtarla API sunucusunu hiç açmıyor.
        assert len(first) >= 16
        assert embedded.ensure_key(tmp_path) == first, "her açılışta değişmemeli"

    def test_kisa_anahtar_yenilenir(self, tmp_path):
        (tmp_path / ".env").write_text("API_SERVER_KEY=kisa\n", encoding="utf-8")
        key = embedded.ensure_key(tmp_path)
        assert len(key) >= 16, "gateway kısa anahtarı sessizce yok sayardı"

    def test_env_dosyasi_gizli(self, tmp_path):
        embedded.ensure_key(tmp_path)
        mode = (tmp_path / ".env").stat().st_mode & 0o777
        assert mode == 0o600


class TestAyar:
    def test_configure_gateway_ayarlarini_yazar(self, tmp_path):
        embedded.configure(tmp_path, port=8642)
        env = (tmp_path / ".env").read_text(encoding="utf-8")
        assert "API_SERVER_ENABLED=true" in env
        # Telefondaki gateway dışarı açılmamalı: yalnızca uygulama bağlanır.
        assert "API_SERVER_HOST=127.0.0.1" in env
        assert "API_SERVER_PORT=8642" in env

    def test_mevcut_satirlar_korunur(self, tmp_path):
        (tmp_path / ".env").write_text("DEEPSEEK_API_KEY=sk-eski\n", encoding="utf-8")
        embedded.configure(tmp_path)
        assert "DEEPSEEK_API_KEY=sk-eski" in (tmp_path / ".env").read_text(encoding="utf-8")


class TestModel:
    def test_model_yazilir(self, tmp_path):
        embedded.set_model("sk-test", model="deepseek-v4-flash", hermes_home=tmp_path)
        assert embedded.model_configured(tmp_path)

        import yaml

        data = yaml.safe_load((tmp_path / "config.yaml").read_text(encoding="utf-8"))
        assert data["model"]["default"] == "deepseek-v4-flash"
        # Sağlayıcı kimliği Hermes'in kendi ProviderConfig kaydından.
        assert data["model"]["provider"] == "deepseek"
        assert "DEEPSEEK_API_KEY=sk-test" in (tmp_path / ".env").read_text(encoding="utf-8")

    def test_bos_ev_ayarsiz_sayilir(self, tmp_path):
        assert embedded.model_configured(tmp_path) is False

    def test_bozuk_yaml_cokmez(self, tmp_path):
        (tmp_path / "config.yaml").write_text("{{ bozuk", encoding="utf-8")
        assert embedded.model_configured(tmp_path) is False

    def test_baska_ayarlar_ezilmez(self, tmp_path):
        (tmp_path / "config.yaml").write_text(
            "terminal:\n  backend: local\n", encoding="utf-8"
        )
        embedded.set_model("sk-test", hermes_home=tmp_path)

        import yaml

        data = yaml.safe_load((tmp_path / "config.yaml").read_text(encoding="utf-8"))
        assert data["terminal"]["backend"] == "local", "kullanıcının ayarı korunmalı"
        assert data["model"]["provider"] == "deepseek"


class TestUc:
    def test_gomulu_yoksa_model_ucu_reddeder(self, client, monkeypatch):
        monkeypatch.setattr(embedded, "available", lambda: False)
        response = client.post("/api/hermes/model", json={"api_key": "sk-test"})
        assert response.status_code == 400

    def test_bos_anahtar_reddedilir(self, client, monkeypatch):
        monkeypatch.setattr(embedded, "available", lambda: True)
        assert client.post("/api/hermes/model", json={"api_key": "  "}).status_code == 400

    def test_bosluklu_anahtar_reddedilir(self, client, monkeypatch):
        """Kopyalarken satır sonu kapan bir anahtar sessizce kaydedilmemeli."""
        monkeypatch.setattr(embedded, "available", lambda: True)
        response = client.post("/api/hermes/model", json={"api_key": "sk-abc def"})
        assert response.status_code == 400
        assert "boşluk" in response.get_json()["error"]

    def test_anahtar_kaydedilir(self, client, monkeypatch, tmp_path):
        monkeypatch.setattr(embedded, "available", lambda: True)
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        response = client.post(
            "/api/hermes/model", json={"api_key": "sk-gercek", "model": "deepseek-v4-pro"}
        )
        assert response.get_json()["saved"] is True
        assert embedded.model_configured(tmp_path)

    def test_status_gomulu_durumu_bildirir(self, client):
        data = client.get("/api/status").get_json()
        assert "embedded" in data
        assert set(data["embedded"]) >= {"available", "running", "model_configured"}
