"""utils: yol güvenliği, arşiv çıkarma, metin yardımcıları."""

import io
import json
import tarfile
import zipfile

import pytest

import hf_utils as utils


class TestSafeRelpath:
    @pytest.mark.parametrize(
        "raw",
        [
            "../etc/passwd",
            "../../secret",
            "/etc/passwd",
            "C:/Windows/system32",
            "a/../b",
            "",
            "   ",
            "~/gizli",
            "..",
            "a/" * 20 + "b.py",  # aşırı derin
        ],
    )
    def test_reddedilen_yollar(self, raw):
        assert utils.safe_relpath(raw) is None

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("src/app.py", "src/app.py"),
            ("./app.py", "app.py"),
            ("./a/./b.py", "a/b.py"),
            ("README.md", "README.md"),
            ("src\\win\\path.py", "src/win/path.py"),
            ("  src/app.py  ", "src/app.py"),
        ],
    )
    def test_kabul_edilen_yollar(self, raw, expected):
        assert utils.safe_relpath(raw) == expected

    def test_null_bayt_reddedilir(self):
        assert utils.safe_relpath("src/a\x00b.py") is None


class TestExtractUpload:
    def test_duz_metin(self):
        docs = utils.extract_upload("notlar.txt", "merhaba dünya".encode("utf-8"))
        assert docs == [{"name": "notlar.txt", "content": "merhaba dünya"}]

    def test_bozuk_kodlama_cokmez(self):
        docs = utils.extract_upload("veri.txt", b"\xff\xfe ge\xe7ersiz")
        assert len(docs) == 1
        assert isinstance(docs[0]["content"], str)

    def test_zip_her_uyeyi_ayri_belge_yapar(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("a.py", "print(1)")
            archive.writestr("b.md", "# baslik")
            archive.writestr("resim.bin", b"\x00\x01\x02\x03")
            archive.writestr("__pycache__/c.pyc", b"\x00")
        docs = utils.extract_upload("proje.zip", buffer.getvalue())

        names = {doc["name"] for doc in docs}
        assert names == {"proje.zip:a.py", "proje.zip:b.md"}

    def test_tar_gz_acilir(self):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
            data = b"veri"
            info = tarfile.TarInfo("x.txt")
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
        docs = utils.extract_upload("p.tar.gz", buffer.getvalue())
        assert docs[0]["name"] == "p.tar.gz:x.txt"


class TestMisc:
    def test_slugify_turkce_karakterleri_temizler(self):
        assert utils.slugify("Not Alma Uygulaması!") == "not-alma-uygulamas"

    def test_slugify_bos_girdi_yedege_duser(self):
        assert utils.slugify("!!!", "yedek") == "yedek"

    def test_sse_json_uretir(self):
        line = utils.sse({"type": "delta", "text": "ç"})
        assert line.startswith("data: ")
        assert line.endswith("\n\n")
        assert json.loads(line[6:].strip())["text"] == "ç"

    def test_trim_uzun_metni_kisaltir(self):
        result = utils.trim("x" * 100, 10)
        assert result.startswith("x" * 10)
        assert "kısaltıldı" in result

    def test_trim_kisa_metne_dokunmaz(self):
        assert utils.trim("kısa", 100) == "kısa"

    def test_last_user_message_sondan_arar(self):
        messages = [
            {"role": "user", "content": "ilk"},
            {"role": "assistant", "content": "cevap"},
            {"role": "user", "content": "son"},
        ]
        assert utils.last_user_message(messages) == "son"

    def test_iter_conversation_bozuk_kayitlari_eler(self):
        messages = [
            {"role": "user", "content": "iyi"},
            {"role": "tool", "content": "atla"},
            {"role": "user", "content": None},
            {"role": "user", "content": "   "},
        ]
        assert utils.iter_conversation(messages) == [("user", "iyi")]
