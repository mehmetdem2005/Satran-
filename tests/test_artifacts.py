"""artifacts: kod bloğu çıkarma, dosya yazma ve paketleme."""

import io
import json
import tarfile
import zipfile

import pytest

from forge.artifacts import (
    EXPORT_FORMATS,
    ArtifactStore,
    detect_requested_format,
    extract_files,
)


class TestExtractFiles:
    def test_path_bilgi_satiri(self):
        files = extract_files("```python path=src/app.py\nprint(1)\n```")
        assert files == [{"path": "src/app.py", "language": "python", "content": "print(1)\n"}]

    @pytest.mark.parametrize(
        "info",
        [
            'python title="src/app.py"',
            "python file=src/app.py",
            "python filename='src/app.py'",
            "python src=src/app.py",
            "python:src/app.py",
            "python src/app.py",
        ],
    )
    def test_yol_bilgisinin_farkli_yazimlari(self, info):
        files = extract_files(f"```{info}\nkod\n```")
        assert files[0]["path"] == "src/app.py"

    def test_onceki_satirdan_dosya_adi(self):
        files = extract_files("**README.md**\n\n```markdown\n# Başlık\n```")
        assert files[0]["path"] == "README.md"
        assert files[0]["language"] == "markdown"

    def test_yolsuz_blok_dosya_olmaz(self):
        """Kabuk komutu veya örnek çıktı projeye dosya olarak yazılmamalı."""
        assert extract_files("```bash\npip install flask\n```") == []

    def test_dil_adi_yol_sanilmaz(self):
        assert extract_files("```dockerfile\nFROM python\n```") == []

    def test_yol_kacisi_reddedilir(self):
        assert extract_files("```python path=../../etc/passwd\nzarar\n```") == []
        assert extract_files("```python path=/etc/passwd\nzarar\n```") == []

    def test_ayni_dosyanin_son_surumu_kazanir(self):
        text = (
            "```python path=a.py\neski\n```\n"
            "```python path=a.py\nyeni\n```"
        )
        files = extract_files(text)
        assert len(files) == 1
        assert files[0]["content"] == "yeni\n"

    def test_tilde_citi(self):
        files = extract_files("~~~python path=a.py\nkod\n~~~")
        assert files[0]["path"] == "a.py"

    def test_ic_ice_uc_tirnak_dort_citle_korunur(self):
        text = "````markdown path=oku.md\n```python\niç blok\n```\n````"
        files = extract_files(text)
        assert files[0]["path"] == "oku.md"
        assert "```python" in files[0]["content"]

    def test_bos_blok_atlanir(self):
        assert extract_files("```python path=a.py\n\n```") == []

    def test_dil_uzantidan_cikarilir(self):
        files = extract_files("```path=stil.css\nbody{}\n```")
        assert files[0]["language"] == "css"


class TestDetectFormat:
    @pytest.mark.parametrize(
        "text,expected",
        [
            ("bunu zip olarak ver", "zip"),
            ("tar.gz istiyorum", "targz"),
            ("tek dosya halinde ver", "single"),
            ("markdown olarak ver", "markdown"),
            ("json olarak ver", "json"),
            ("bir sayaç uygulaması yap", None),
            ("", None),
        ],
    )
    def test_bicim_tanima(self, text, expected):
        assert detect_requested_format(text) == expected


class TestArtifactStore:
    def test_yazma_ve_listeleme(self, store):
        pid = store.new_project_id("Not Alma")
        written = store.write_files(pid, [
            {"path": "src/app.py", "content": "print(1)\n", "language": "python"},
            {"path": "README.md", "content": "# Başlık\n", "language": "markdown"},
        ])
        assert {item["path"] for item in written} == {"src/app.py", "README.md"}
        assert store.read_file(pid, "src/app.py") == "print(1)\n"

    def test_proje_disina_yazilamaz(self, store, tmp_path):
        pid = store.new_project_id("test")
        written = store.write_files(pid, [
            {"path": "../../kacak.py", "content": "zarar"},
            {"path": "/mutlak.py", "content": "zarar"},
            {"path": "iyi.py", "content": "tamam"},
        ])
        assert [item["path"] for item in written] == ["iyi.py"]
        assert not (tmp_path / "kacak.py").exists()

    def test_read_file_kacisi_reddeder(self, store):
        pid = store.new_project_id("test")
        store.write_files(pid, [{"path": "a.py", "content": "x"}])
        assert store.read_file(pid, "../../../etc/passwd") is None
        assert store.read_file(pid, "yok.py") is None

    def test_gecersiz_proje_kimligi(self, store):
        with pytest.raises(ValueError):
            store.project_dir("../../kacak")

    def test_manifest_gizli_kalir(self, store):
        pid = store.new_project_id("test")
        store.write_files(pid, [{"path": "a.py", "content": "x"}])
        assert [item["path"] for item in store.list_files(pid)] == ["a.py"]

    def test_projeler_tarihe_gore_siralanir(self, store):
        """Ada göre sıralamak kullanıcıyı en son projesinden koparır."""
        import os
        import time

        eski = store.new_project_id("zzz-eski")
        store.write_files(eski, [{"path": "a.py", "content": "x"}])
        time.sleep(0.02)
        yeni = store.new_project_id("aaa-yeni")
        store.write_files(yeni, [{"path": "b.py", "content": "y"}])
        os.utime(store.project_dir(yeni), (time.time() + 10, time.time() + 10))

        assert store.list_projects()[0]["project_id"] == yeni

    def test_silme(self, store):
        pid = store.new_project_id("test")
        store.write_files(pid, [{"path": "a.py", "content": "x"}])
        assert store.delete_project(pid) is True
        assert store.list_files(pid) == []


class TestExport:
    @pytest.fixture()
    def dolu_proje(self, store):
        pid = store.new_project_id("dışa-aktarım")
        store.write_files(pid, [
            {"path": "app.py", "content": "print('merhaba dünya')\n", "language": "python"},
            {"path": "alt/veri.json", "content": '{"a": 1}\n', "language": "json"},
        ])
        return pid

    @pytest.mark.parametrize("fmt", EXPORT_FORMATS)
    def test_her_bicim_govde_uretir(self, store, dolu_proje, fmt):
        buffer, filename, mime = store.export(dolu_proje, fmt)
        assert buffer.getvalue()
        assert filename.startswith(dolu_proje)
        assert mime

    def test_zip_acilabilir(self, store, dolu_proje):
        buffer, _, _ = store.export(dolu_proje, "zip")
        with zipfile.ZipFile(buffer) as archive:
            names = archive.namelist()
            assert f"{dolu_proje}/app.py" in names
            assert f"{dolu_proje}/alt/veri.json" in names

    def test_targz_acilabilir(self, store, dolu_proje):
        buffer, _, _ = store.export(dolu_proje, "targz")
        with tarfile.open(fileobj=buffer, mode="r:gz") as archive:
            assert f"{dolu_proje}/app.py" in archive.getnames()

    def test_json_icerigi_tasir(self, store, dolu_proje):
        buffer, _, _ = store.export(dolu_proje, "json")
        payload = json.loads(buffer.getvalue().decode("utf-8"))
        contents = {item["path"]: item["content"] for item in payload["files"]}
        assert "merhaba dünya" in contents["app.py"]

    def test_tek_dosya_kendini_acar(self, store, dolu_proje, tmp_path):
        import subprocess
        import sys

        buffer, filename, _ = store.export(dolu_proje, "single")
        script = tmp_path / filename
        script.write_bytes(buffer.getvalue())
        hedef = tmp_path / "cikti"
        subprocess.run([sys.executable, str(script), str(hedef)], check=True, capture_output=True)
        assert (hedef / "app.py").read_text(encoding="utf-8") == "print('merhaba dünya')\n"
        assert (hedef / "alt" / "veri.json").exists()

    def test_markdown_yol_basligi_tasir(self, store, dolu_proje):
        buffer, _, _ = store.export(dolu_proje, "markdown")
        text = buffer.getvalue().decode("utf-8")
        assert "path=app.py" in text
        assert "merhaba dünya" in text

    def test_bos_proje_hata_verir(self, store):
        pid = store.new_project_id("bos")
        with pytest.raises(ValueError):
            store.export(pid, "zip")

    def test_bilinmeyen_bicim_zipe_duser(self, store, dolu_proje):
        _, filename, _ = store.export(dolu_proje, "uydurma")
        assert filename.endswith(".zip")
