"""RAG (FTS5 + bm25) ve kalıcı bellek."""

import pytest

from hermes.memory import CATEGORIES, HermesMemory
from hermes.rag import chunk_text, sanitize_fts_query


class TestChunking:
    def test_kisa_metin_tek_parca(self):
        assert chunk_text("kısa metin") == ["kısa metin"]

    def test_bos_metin(self):
        assert chunk_text("") == []
        assert chunk_text("   ") == []

    def test_uzun_metin_bolunur(self):
        chunks = chunk_text("satır\n" * 500, chunk_size=200, overlap=20)
        assert len(chunks) > 1
        assert all(len(c) <= 260 for c in chunks)

    def test_cok_uzun_tek_satir_sert_bolunur(self):
        """Küçültülmüş JS gibi tek satırlık dosyalar sonsuz döngüye girmemeli."""
        chunks = chunk_text("x" * 5000, chunk_size=900)
        assert len(chunks) >= 5
        assert all(len(c) <= 900 for c in chunks)

    def test_ortusme_baglami_korur(self):
        text = "\n".join(f"satir{i}" for i in range(200))
        chunks = chunk_text(text, chunk_size=300, overlap=60)
        assert len(chunks) > 2


class TestSanitizer:
    def test_ozel_karakterler_temizlenir(self):
        query = sanitize_fts_query('flask (app) "test" AND/OR *:^')
        assert "(" not in query and '"test"' in query or "flask" in query

    def test_stopword_elenir(self):
        assert "\"ve\"" not in sanitize_fts_query("flask ve django")

    def test_bos_sorgu(self):
        assert sanitize_fts_query("") == ""
        assert sanitize_fts_query("ve ile bu") == ""

    def test_terimler_or_ile_baglanir(self):
        assert " OR " in sanitize_fts_query("flask sqlite veritabani")

    def test_asiri_uzun_sorgu_sinirlanir(self):
        result = sanitize_fts_query("kelime " * 200)
        assert result.count(" OR ") < 24


class TestRag:
    def test_belge_ekleme_ve_arama(self, rag):
        rag.add_document("notlar.md", "HermesForge SQLite FTS5 kullanir ve bm25 ile siralar.")
        results = rag.search("SQLite FTS5")
        assert results
        assert results[0]["source"] == "notlar.md"

    def test_alakasiz_sorgu_bos_doner(self, rag):
        rag.add_document("a.md", "kediler ve kopekler hakkinda")
        assert rag.search("kuantum kromodinamigi") == []

    def test_koleksiyon_izolasyonu(self, rag):
        rag.add_document("a.md", "elma armut", collection="uploads")
        rag.add_document("b.md", "elma armut", collection="project:x")
        assert len(rag.search("elma", collection="uploads")) == 1
        assert len(rag.search("elma", collection="project:x")) == 1

    def test_temizleme_koleksiyona_ozel(self, rag):
        rag.add_document("a.md", "elma", collection="uploads")
        rag.add_document("b.md", "elma", collection="project:x")
        rag.clear(collection="uploads")
        assert rag.search("elma", collection="uploads") == []
        assert rag.search("elma", collection="project:x")

    def test_baglam_butcesine_uyar(self, rag):
        rag.add_document("buyuk.md", "veritabani sorgusu " * 2000)
        context = rag.build_context("veritabani", char_budget=500)
        assert len(context) <= 700

    def test_calisma_alanina_yansitilir(self, rag, tmp_path):
        rag.add_document("notlar.md", "Hermes ajani bu dosyayi grep ile bulabilmeli.")
        yazilanlar = list((tmp_path / "ws").rglob("*.txt"))
        assert yazilanlar, "belge Hermes çalışma alanına yazılmadı"

    def test_istatistikler(self, rag):
        rag.add_document("a.md", "içerik " * 200)
        stats = rag.stats()
        assert stats["documents"] == 1
        assert stats["chunks"] >= 1

    def test_kaynak_listesi(self, rag):
        rag.add_document("a.md", "içerik", collection="uploads")
        rag.add_document("b.md", "içerik", collection="uploads")
        assert {s["source"] for s in rag.sources(collection="uploads")} == {"a.md", "b.md"}


class TestMemory:
    def test_kalici_bilgi_suzulur(self, memory):
        stored = memory.sync(
            "Benim adım Mehmet. Termux kullanıyorum. Bundan sonra hep Türkçe yaz."
        )
        kategoriler = {item["category"] for item in stored}
        assert "kimlik" in kategoriler
        assert "karar" in kategoriler

    def test_siradan_cumle_saklanmaz(self, memory):
        assert memory.sync("bugün hava güzel görünüyor bence") == []

    def test_ayni_ani_iki_kez_eklenmez(self, memory):
        assert memory.remember("Benim adım Mehmet ve Termux kullanıyorum", category="kimlik") is True
        assert memory.remember("Benim adım Mehmet ve Termux kullanıyorum", category="kimlik") is False
        assert memory.stats()["total"] == 1

    def test_cok_kisa_ani_reddedilir(self, memory):
        assert memory.remember("kısa") is False

    def test_gecersiz_kategori_olguya_duser(self, memory):
        memory.remember("Bu bir test anısıdır efendim", category="uydurma")
        assert memory.all()[0]["category"] == "olgu"

    def test_hatirlama(self, memory):
        memory.remember("Kullanıcı Termux üzerinde çalışıyor", category="olgu", importance=0.9)
        memory.remember("Kullanıcı koyu tema tercih ediyor", category="tercih", importance=0.8)
        sonuc = memory.recall("Termux")
        assert any("Termux" in item["body"] for item in sonuc)

    def test_eslesme_yoksa_en_onemliye_duser(self, memory):
        memory.remember("Kullanıcı Termux üzerinde çalışıyor", importance=0.95)
        sonuc = memory.recall("tamamen alakasiz kuantum sorgusu")
        assert sonuc, "bellek boş dönmemeli, en önemliye düşmeli"

    def test_kapsam_izolasyonu(self, memory):
        memory.remember("A kullanıcısının gizli bilgisi", scope="a")
        memory.remember("B kullanıcısının gizli bilgisi", scope="b")
        assert len(memory.all(scope="a")) == 1
        assert "A kullanıcısının" in memory.all(scope="a")[0]["body"]

    def test_unutma(self, memory):
        memory.remember("Silinecek bir anı burada", scope="x")
        mid = memory.all(scope="x")[0]["id"]
        assert memory.forget(mid, scope="x") is True
        assert memory.all(scope="x") == []

    def test_yanlis_kapsamdan_silinemez(self, memory):
        memory.remember("Başka kapsamın anısı burada", scope="a")
        mid = memory.all(scope="a")[0]["id"]
        assert memory.forget(mid, scope="b") is False

    def test_prefetch_blogu(self, memory):
        memory.remember("Kullanıcı Termux üzerinde çalışıyor", category="olgu")
        blok = memory.prefetch("Termux")
        assert blok.startswith("- (olgu)")

    def test_bos_bellek_bos_blok(self, memory):
        assert memory.prefetch("herhangi bir şey") == ""

    def test_kapsam_anahtari_hermes_kurallarina_uyar(self):
        key = HermesMemory.scope_key(user="mehmet", project="notlar")
        assert len(key) <= 256
        assert not any(ch in key for ch in "\r\n\x00")
        assert key == "agent:main:hermesforge:notlar:mehmet"

    def test_kapsam_anahtari_kontrol_karakteri_temizler(self):
        assert "\n" not in HermesMemory.scope_key(user="kotu\nkullanici")

    def test_kategoriler_tanimli(self):
        assert set(CATEGORIES) == {"kimlik", "tercih", "proje", "karar", "olgu"}
