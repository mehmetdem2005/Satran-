"""Dalga yürütücüsü: gerçek paralellik, akış ayrımı, hata yolları."""

import threading
import time

import pytest

from forge.board import FilePlanEntry
from forge.scheduler import AgentNode, build_nodes, run_wave


def topla(nodes, runner, **kwargs):
    events, results = [], []
    for item in run_wave(nodes, runner, **kwargs):
        if isinstance(item, dict) and "__results__" in item:
            results = item["__results__"]
        else:
            events.append(item)
    return events, results


def iki_dugum():
    return [
        AgentNode("reviewer", "reviewer", "Denetçi"),
        AgentNode("packager", "packager", "Paketleyici"),
    ]


class TestParallelism:
    def test_dugumler_gercekten_es_zamanli_calisir(self):
        """Doğrusal olsaydı süre iki katı olurdu."""
        bariyer = threading.Barrier(2, timeout=5)

        def runner(node):
            bariyer.wait()  # ikisi de aynı anda burada olmazsa zaman aşımı
            yield {"type": "delta", "text": node.key}

        events, results = topla(iki_dugum(), runner, max_parallel=2)
        assert len(results) == 2
        assert all(not r.failed for r in results)

    def test_metinler_dugumlere_gore_ayrilir(self):
        """Paralel akışta metinler birbirine karışmamalı."""

        def runner(node):
            for index in range(3):
                yield {"type": "delta", "text": f"{node.key}{index}"}

        _, results = topla(iki_dugum(), runner, max_parallel=2)
        by_key = {r.node.key: r.text for r in results}
        assert by_key["reviewer"] == "reviewer0reviewer1reviewer2"
        assert by_key["packager"] == "packager0packager1packager2"

    def test_her_olay_dugum_kimligi_tasir(self):
        """Ön yüz doğru balona yazabilmek için buna dayanıyor."""

        def runner(node):
            yield {"type": "delta", "text": "x"}

        events, _ = topla(iki_dugum(), runner)
        assert all(e["agent_id"] and e["node"] for e in events)
        assert {e["node"] for e in events} == {"reviewer", "packager"}

    def test_max_parallel_sinirina_uyar(self):
        """Telefonda eşzamanlılık sınırı gerçekten uygulanmalı."""
        anlik = 0
        zirve = 0
        kilit = threading.Lock()

        def runner(node):
            nonlocal anlik, zirve
            with kilit:
                anlik += 1
                zirve = max(zirve, anlik)
            time.sleep(0.05)
            with kilit:
                anlik -= 1
            yield {"type": "delta", "text": node.key}

        nodes = [AgentNode("builder", f"builder#{i}", f"Kodlayıcı {i}") for i in range(4)]
        topla(nodes, runner, max_parallel=2)
        assert zirve <= 2


class TestFailures:
    def test_isci_coktugunde_hata_olayi_uretilir(self):
        """Çöken bir ajan sessizce kaybolmamalı."""

        def runner(node):
            if node.key == "reviewer":
                raise RuntimeError("patladı")
            yield {"type": "delta", "text": "iyi"}

        events, results = topla(iki_dugum(), runner)
        hatalar = [e for e in events if e["type"] == "error"]
        assert hatalar and "patladı" in hatalar[0]["text"]

        by_key = {r.node.key: r for r in results}
        assert by_key["reviewer"].failed
        assert not by_key["packager"].failed, "bir düğümün hatası diğerini düşürmemeli"

    def test_error_olayi_sonucu_isaretler(self):
        def runner(node):
            yield {"type": "error", "text": "motor yok"}

        _, results = topla([AgentNode("advisor", "advisor", "Danışman")], runner)
        assert results[0].failed
        assert results[0].error == "motor yok"

    def test_iptal_bayragi_akisi_durdurur(self):
        cancel = threading.Event()

        def runner(node):
            for index in range(100):
                if index == 2:
                    cancel.set()
                yield {"type": "delta", "text": str(index)}

        events, _ = topla(iki_dugum(), runner, cancel=cancel)
        assert len(events) < 200, "iptal sonrası akış sürmemeli"

    def test_bos_dugum_listesi(self):
        events, results = topla([], lambda node: iter(()))
        assert events == [] and results == []


class TestNodeBuilding:
    def test_tek_dugum_varsayilan(self):
        nodes = build_nodes("reviewer", "Denetçi")
        assert len(nodes) == 1
        assert nodes[0].key == "reviewer"
        assert not nodes[0].is_fanout

    def test_fanout_dugumleri_etiketlenir(self):
        groups = [[FilePlanEntry("a.py")], [FilePlanEntry("b.py")]]
        nodes = build_nodes("builder", "Kodlayıcı", file_groups=groups)
        assert [n.key for n in nodes] == ["builder#1", "builder#2"]
        assert [n.label for n in nodes] == ["Kodlayıcı 1", "Kodlayıcı 2"]
        assert all(n.is_fanout for n in nodes)

    def test_fanout_yollari_ayrik(self):
        groups = [[FilePlanEntry("a.py"), FilePlanEntry("b.py")], [FilePlanEntry("c.py")]]
        nodes = build_nodes("builder", "Kodlayıcı", file_groups=groups)
        tum = [p for n in nodes for p in n.assigned_paths]
        assert tum == ["a.py", "b.py", "c.py"]
        assert len(tum) == len(set(tum))

    def test_tek_grup_fanout_sayilmaz(self):
        nodes = build_nodes("builder", "Kodlayıcı", file_groups=[[FilePlanEntry("a.py")]])
        assert len(nodes) == 1
        assert not nodes[0].is_fanout
        assert nodes[0].assigned_paths == ["a.py"]
