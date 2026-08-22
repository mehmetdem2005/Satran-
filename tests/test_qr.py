"""QR ureteci (scripts/qr.py).

Neden altin (golden) degerler: bu dosya telefonun Hermes'e baglanmasini
sagliyor; bozuk bir QR "bagli degil" hatasi olarak degil, sessizce okunmayan
bir kare olarak ortaya cikar. Asagidaki karsimlar, uretilen matrisin
``qrcode`` referans kutuphanesiyle bit-bit ayni oldugu ve OpenCV'nin gercek
QR cozucusunun metni geri okuyabildigi dogrulandiktan sonra kaydedildi
(92 yuk x 8 maske = 736 matris, ayrica 58 yuk uctan uca cozuldu).
"""

import hashlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import qr  # noqa: E402


def matris_ozeti(text: str):
    matrix = qr.make_matrix(text)
    digest = hashlib.sha256(
        "\n".join("".join(map(str, row)) for row in matrix).encode()
    ).hexdigest()
    return len(matrix), digest


ALTIN = [
    ("a", 21, "e8ab680854e4019c4ac89bd0e19dfe1f7e967f3cafd048091b3e3ec474b6f431"),
    ("https://example.com", 25,
     "74d9360c7e51b43c69bef31f279072356f072b3f482fcbe6e62084c8d5797624"),
    ("hermesforge://connect?url=http%3A%2F%2F192.168.1.20%3A8642&key=hf-abc123", 37,
     "d2c7013bc89e72217b7004ffe35f6de5081c440932b2aa33625fde25c42f5601"),
    ("Türkçe: şğüöçı", 25,
     "84e410f893956c0ae7f6409c02bb205050be9cfbde3bdbe9385344eff5e1df6c"),
    ("x" * 120, 45,
     "b91b7e904d3e58a975798fdfb7444272ea2003b536350a6486d8dd7edd238cfe"),
]


class TestAltinDegerler:
    @pytest.mark.parametrize("text,size,digest", ALTIN)
    def test_matris_degismedi(self, text, size, digest):
        assert matris_ozeti(text) == (size, digest)


class TestYapi:
    def test_bulucu_desenler_dogru_yerde(self):
        matrix = qr.make_matrix("test")
        size = len(matrix)
        for row, col in ((0, 0), (0, size - 7), (size - 7, 0)):
            # Dis halka koyu, ic 3x3 koyu, aradaki halka acik.
            assert matrix[row][col] == 1
            assert matrix[row + 1][col + 1] == 0
            assert matrix[row + 3][col + 3] == 1

    def test_zamanlama_serisi_dogru(self):
        matrix = qr.make_matrix("test")
        for i in range(8, len(matrix) - 8):
            assert matrix[6][i] == (1 if i % 2 == 0 else 0)
            assert matrix[i][6] == (1 if i % 2 == 0 else 0)

    def test_her_zaman_koyu_modul(self):
        matrix = qr.make_matrix("test")
        assert matrix[len(matrix) - 8][8] == 1

    def test_boyut_veriyle_buyur(self):
        assert len(qr.make_matrix("a")) == 21              # surum 1
        assert len(qr.make_matrix("x" * 213)) == 57        # surum 10


class TestSinirlar:
    def test_cok_uzun_veri_acikca_reddedilir(self):
        with pytest.raises(qr.QREncodeError):
            qr.make_matrix("x" * 400)

    def test_utf8_bayt_sayisina_gore_secilir(self):
        """Turkce karakterler 2 bayt; surum ona gore secilmeli."""
        assert len(qr.make_matrix("ş" * 100)) == len(qr.make_matrix("x" * 200))


class TestCizim:
    def test_kenar_boslugu_eklenir(self):
        text = qr.to_text("test", border=4)
        lines = text.splitlines()
        matrix_size = len(qr.make_matrix("test"))
        assert len(lines) == matrix_size + 8
        # Ilk dort satir tamamen acik olmali (sessiz bolge).
        assert all(set(line) == {" "} for line in lines[:4])

    def test_her_modul_iki_karakter(self):
        """Terminal karakteri kare degil; tek karakterlik kod ezilir."""
        lines = qr.to_text("test", border=1).splitlines()
        assert len(lines[0]) == (len(qr.make_matrix("test")) + 2) * 2
