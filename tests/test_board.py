"""BuildBoard, bağımlılık grafiği ve dosya planı.

Buradaki testlerin çekirdeği tek bir regresyonu kilitler: ajanlar birbirinin
ham çıktısını ve sohbet geçmişini tekrar tekrar almamalı. Eski hatta her ajan
tüm konuşmayı ve kendinden önceki bütün ajanların çıktısını alıyordu; modelin
gözünden bu, her turda konuşmanın yeniden açılmasıydı.
"""

import pytest

from forge.agents import AGENTS, dependencies, plan_waves, supports_fanout
from forge.board import (
    BuildBoard,
    FilePlanEntry,
    parse_file_plan,
    split_file_plan,
)


@pytest.fixture()
def dolu_pano():
    board = BuildBoard(goal="Pomodoro sayacı yap", mode="build", project_id="p1")
    board.record("analyst", "GEREKSINIM_METNI: geri sayım ve bildirim")
    board.record("architect", "TASARIM_METNI: Python + argparse")
    board.record("reviewer", "BULGU_METNI: app.py:12 eksik import")
    board.set_files([{"path": "app.py", "bytes": 100}])
    board.set_file_plan([FilePlanEntry("app.py", "giriş"), FilePlanEntry("db.py", "veri")])
    return board


class TestRoleIsolation:
    """Her rol yalnızca kendi dilimlerini görmeli."""

    def test_mimar_gereksinimi_gorur_bulgulari_gormez(self, dolu_pano):
        text = dolu_pano.render_for("architect")
        assert "GEREKSINIM_METNI" in text
        assert "BULGU_METNI" not in text
        assert "TASARIM_METNI" not in text, "Mimar kendi çıktısını geri okumamalı"

    def test_kodlayici_tasarimi_gorur_bulgulari_gormez(self, dolu_pano):
        text = dolu_pano.render_for("builder")
        assert "TASARIM_METNI" in text
        assert "GEREKSINIM_METNI" in text
        assert "BULGU_METNI" not in text

    def test_paketleyici_gereksinimi_gormez(self, dolu_pano):
        """Paketleyici'nin işi teslim; ham gereksinim metnine ihtiyacı yok."""
        text = dolu_pano.render_for("packager")
        assert "GEREKSINIM_METNI" not in text
        assert "TASARIM_METNI" in text
        assert "BULGU_METNI" in text

    def test_denetci_dosya_listesini_gorur(self, dolu_pano):
        assert "app.py" in dolu_pano.render_for("reviewer")

    def test_hedef_tek_satir_olarak_gecer(self, dolu_pano):
        """Kullanıcının isteği her role gider ama konuşma olarak değil."""
        for role in ("architect", "builder", "reviewer", "packager"):
            text = dolu_pano.render_for(role)
            assert "Pomodoro sayacı yap" in text
            assert "### Önceki konuşma ###" not in text
            assert "### Önceki ajanların çıktıları ###" not in text


class TestFanoutSlices:
    def test_atanan_dosyalar_ayrilir(self, dolu_pano):
        text = dolu_pano.render_for("builder", assigned_paths=["app.py"])
        assert "SANA DÜŞEN DOSYALAR" in text
        assert "`app.py`" in text
        assert "Başkasının yazdığı dosyalar" in text
        assert "`db.py`" in text

    def test_atama_yoksa_tum_plan_gelir(self, dolu_pano):
        text = dolu_pano.render_for("builder")
        assert "Dosya planı" in text
        assert "SANA DÜŞEN DOSYALAR" not in text


class TestBoardWrites:
    def test_bos_cikti_panoyu_bozmaz(self):
        board = BuildBoard(goal="x")
        board.record("analyst", "ilk")
        board.record("analyst", "   ")
        assert board.spec == "ilk"

    def test_bilinmeyen_rol_yok_sayilir(self):
        board = BuildBoard(goal="x")
        board.record("uydurma", "metin")
        assert board.snapshot()["spec_chars"] == 0

    def test_uzun_metin_kisaltilir(self):
        board = BuildBoard(goal="x")
        board.record("architect", "y" * 50_000)
        assert len(board.render_for("builder")) < 20_000

    def test_patch_modu_uyarisi(self):
        board = BuildBoard(goal="x", mode="patch")
        board.set_files([{"path": "a.py", "bytes": 10}])
        assert "DEĞİŞİKLİK isteği" in board.render_for("builder")


class TestWaves:
    def test_denetci_ve_paketleyici_ayni_dalgada(self):
        """Asıl paralellik kazancı burada: ikisi de yalnız Kodlayıcı'ya bağlı."""
        waves = plan_waves(["analyst", "architect", "builder", "reviewer", "packager"])
        assert waves == [["analyst"], ["architect"], ["builder"], ["reviewer", "packager"]]

    def test_patch_modu(self):
        assert plan_waves(["builder", "reviewer"]) == [["builder"], ["reviewer"]]

    def test_tek_ajan(self):
        assert plan_waves(["advisor"]) == [["advisor"]]

    def test_secime_dahil_olmayan_bagimlilik_kilitlemez(self):
        """patch modunda Kodlayıcı, Mimar olmadan da çalışabilmeli."""
        assert plan_waves(["builder"]) == [["builder"]]

    def test_bilinmeyen_rol_elenir(self):
        assert plan_waves(["analyst", "uydurma"]) == [["analyst"]]

    def test_bos_liste(self):
        assert plan_waves([]) == []

    def test_her_rol_tam_bir_kez_calisir(self):
        roles = ["analyst", "architect", "builder", "reviewer", "packager"]
        flat = [agent for wave in plan_waves(roles) for agent in wave]
        assert sorted(flat) == sorted(roles)

    def test_bagimliliklar_dalga_sirasina_uyar(self):
        waves = plan_waves(["analyst", "architect", "builder", "reviewer", "packager"])
        position = {agent: index for index, wave in enumerate(waves) for agent in wave}
        for agent, index in position.items():
            for dep in dependencies(agent):
                assert position[dep] < index, f"{agent} bağımlılığından önce çalışıyor"

    def test_yalnizca_kodlayici_bolunebilir(self):
        assert supports_fanout("builder")
        for role in ("analyst", "architect", "reviewer", "packager", "advisor"):
            assert not supports_fanout(role)


class TestFilePlanParsing:
    def test_blok_ayristirilir(self):
        text = "Tasarım:\n\n```dosya-plani\nsrc/app.py — giriş\nsrc/db.py -- veri\n```"
        entries = parse_file_plan(text)
        assert [e.path for e in entries] == ["src/app.py", "src/db.py"]
        assert entries[0].responsibility == "giriş"

    def test_blok_yoksa_satirlardan_toplanir(self):
        """Model biçime uymazsa tüm paylaştırma çökmemeli."""
        entries = parse_file_plan("- src/a.py — giriş\n- src/b.py — çekirdek")
        assert [e.path for e in entries] == ["src/a.py", "src/b.py"]

    def test_hicbir_sey_yoksa_bos(self):
        assert parse_file_plan("burada dosya yok") == []
        assert parse_file_plan("") == []

    def test_yol_kacisi_reddedilir(self):
        assert parse_file_plan("```dosya-plani\n../../etc/passwd — zarar\n```") == []

    def test_tekrar_eden_yol_bir_kez(self):
        entries = parse_file_plan("```dosya-plani\na.py — bir\na.py — iki\n```")
        assert len(entries) == 1

    def test_asiri_uzun_plan_sinirlanir(self):
        satirlar = "\n".join(f"dosya{i}.py — iş" for i in range(200))
        assert len(parse_file_plan(f"```dosya-plani\n{satirlar}\n```")) <= 40


class TestFilePlanSplit:
    def test_esit_bolunur(self):
        entries = [FilePlanEntry(f"f{i}.py") for i in range(4)]
        groups = split_file_plan(entries, 2)
        assert [len(g) for g in groups] == [2, 2]

    def test_artan_dosya_ilk_gruplara(self):
        entries = [FilePlanEntry(f"f{i}.py") for i in range(5)]
        assert [len(g) for g in split_file_plan(entries, 2)] == [3, 2]

    def test_gruplar_ayrik_ve_eksiksiz(self):
        """Fan-out Kodlayıcılar aynı dosyaya yazmamalı."""
        entries = [FilePlanEntry(f"f{i}.py") for i in range(7)]
        groups = split_file_plan(entries, 3)
        paths = [e.path for g in groups for e in g]
        assert len(paths) == len(set(paths)) == 7

    def test_gruptan_fazla_bolum_istenirse(self):
        entries = [FilePlanEntry("a.py")]
        assert len(split_file_plan(entries, 5)) == 1

    def test_bos_plan(self):
        assert split_file_plan([], 3) == []

    def test_bitisik_dosyalar_ayni_grupta(self):
        """Mimar bağlı dosyaları ardışık yazar; sıra korunmalı."""
        entries = [FilePlanEntry(x) for x in ("a.py", "b.py", "c.py", "d.py")]
        groups = split_file_plan(entries, 2)
        assert [e.path for e in groups[0]] == ["a.py", "b.py"]
