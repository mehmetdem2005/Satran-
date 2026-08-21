"""router: otomatik ajan seçimi ve modelin ezemeyeceği kilitler."""

import pytest

from forge.router import MODES, fallback_title, heuristic_mode, route


class TestHeuristic:
    @pytest.mark.parametrize(
        "message,has_project,expected",
        [
            ("Bana bir not alma uygulaması yap", False, "build"),
            ("bir pomodoro sayacı oluştur", False, "build"),
            ("make me a todo app", False, "build"),
            ("Flask nedir?", False, "answer"),
            ("selam", False, "answer"),
            ("merhaba", False, "answer"),
            ("giriş ekranına buton ekle", True, "patch"),
            ("bu hata neden çıkıyor düzelt", True, "patch"),
            ("bunu zip olarak ver", True, "package"),
            ("projeyi indir", True, "package"),
        ],
    )
    def test_mod_tahmini(self, message, has_project, expected):
        assert heuristic_mode(message, has_project) == expected

    def test_proje_yokken_paketleme_olmaz(self):
        assert heuristic_mode("bunu zip olarak ver", False) != "package"

    def test_bos_mesaj(self):
        assert heuristic_mode("", False) == "answer"

    def test_uzun_ayrintili_istek_yapim_sayilir(self):
        uzun = "kullanıcı girişi olan, veritabanına kayıt tutan, " * 5
        assert heuristic_mode(uzun, False) == "build"


class TestDeterministicLocks:
    """Model bu iki durumu ezememelidir."""

    def _hep_build(self, messages):
        return '{"mode":"build","title":"Model başlığı","reason":"model böyle dedi"}'

    def test_paketleme_modelce_ezilemez(self):
        """Model burada yanılırsa hazır projeyi baştan üretir."""
        result = route("bunu zip olarak ver", has_project=True, completer=self._hep_build)
        assert result["mode"] == "package"
        assert result["source"] == "deterministic"
        assert result["agents"] == ["packager"]

    def test_kisa_soru_modelce_ezilemez(self):
        result = route("Flask nedir?", has_project=False, completer=self._hep_build)
        assert result["mode"] == "answer"
        assert result["source"] == "deterministic"

    def test_uzun_soru_modele_birakilir(self):
        uzun = "Flask ile Django arasındaki farkları ve hangisini seçmem gerektiğini detaylıca anlatır mısın?"
        result = route(uzun, has_project=False, completer=self._hep_build)
        assert result["source"] == "model"

    def test_model_patchi_builde_yukseltemez(self):
        """Yükseltme kullanıcının hazır projesini baştan ürettirir."""
        result = route("buton ekle", has_project=True, completer=self._hep_build)
        assert result["mode"] == "patch"

    def test_model_buildi_patche_indirebilir(self):
        """Ters yön zararsız, serbest."""
        def patch_der(messages):
            return '{"mode":"patch","title":"x","reason":"y"}'

        result = route("yeni bir uygulama yap", has_project=True, completer=patch_der)
        assert result["mode"] == "patch"


class TestModelDecision:
    def test_gecerli_model_karari_uygulanir(self):
        def model(messages):
            return 'Tabii: {"mode":"build","title":"Sayaç uygulaması","reason":"yeni istek"}'

        result = route("bir şeyler yapalım bakalım nasıl olur diye", has_project=False, completer=model)
        assert result["mode"] == "build"
        assert result["title"] == "Sayaç uygulaması"
        assert result["source"] == "model"

    @pytest.mark.parametrize("cevap", ["json değil", "", "{bozuk", '{"mode":"uydurma"}'])
    def test_bozuk_model_cevabi_sezgisele_duser(self, cevap):
        result = route("Bana bir uygulama yap ve içine şunları koy", has_project=False,
                       completer=lambda m: cevap)
        assert result["mode"] in MODES

    def test_model_patlarsa_akis_durmaz(self):
        def patlayan(messages):
            raise RuntimeError("model öldü")

        result = route("Bana bir uygulama yap", has_project=False, completer=patlayan)
        assert result["mode"] == "build"
        assert result["source"] == "heuristic"

    def test_proje_yokken_model_patch_derse_builde_cevrilir(self):
        result = route("şunu değiştirelim biraz da bakalım", has_project=False,
                       completer=lambda m: '{"mode":"patch","title":"x","reason":"y"}')
        assert result["mode"] == "build"

    def test_proje_yokken_model_package_derse_answera_cevrilir(self):
        result = route("şunu paketleyelim biraz da bakalım", has_project=False,
                       completer=lambda m: '{"mode":"package","title":"x","reason":"y"}')
        assert result["mode"] == "answer"


class TestTitle:
    def test_baslik_ilk_kelimelerden_uretilir(self):
        assert fallback_title("Bana bir not alma uygulaması yap lütfen") == "Bana bir not alma uygulaması yap"

    def test_bos_mesaj_varsayilan_baslik(self):
        assert fallback_title("") == "Yeni sohbet"

    def test_uzun_baslik_kisaltilir(self):
        assert len(fallback_title("kelime " * 20)) <= 49


class TestAgentLists:
    @pytest.mark.parametrize("mode,agents", MODES.items())
    def test_her_mod_gecerli_ajanlar_dondurur(self, mode, agents):
        from forge.agents import AGENTS

        assert agents
        assert all(agent_id in AGENTS for agent_id in agents)

    def test_build_tam_hat(self):
        assert MODES["build"] == ["analyst", "architect", "builder", "reviewer", "packager"]
