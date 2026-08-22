#!/usr/bin/env python3
"""Bagimliliksiz QR kod uretici (byte modu, ECC seviyesi M, surum 1-10).

Neden kendi uretecimiz var: telefonun Hermes'e tek dokunusla baglanmasi
terminalde bir QR kod gormesine bagli. Kullaniciyi once ``pip install qrcode``
yapmaya zorlamak "beni ugrastirma" isteginin tam tersi olurdu; internete kapali
bir makinede ise hic calismazdi. Bu dosya yalnizca standart kutuphaneyi
kullanir.

Dogrulama: ``tests/test_qr.py`` uretilen matrisi ``qrcode`` paketinin ciktisiyla
karsilastirir (kurulu degilse test atlanir).

Standart: ISO/IEC 18004. Yalnizca ihtiyacimiz olan altkume uygulanmistir.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

# --------------------------------------------------------------------------
# GF(256) — Reed-Solomon icin
# --------------------------------------------------------------------------
_EXP = [0] * 512
_LOG = [0] * 256


def _init_tables() -> None:
    value = 1
    for i in range(255):
        _EXP[i] = value
        _LOG[value] = i
        value <<= 1
        if value & 0x100:
            value ^= 0x11D
    for i in range(255, 512):
        _EXP[i] = _EXP[i - 255]


_init_tables()


def _mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return _EXP[_LOG[a] + _LOG[b]]


def _generator_poly(degree: int) -> List[int]:
    poly = [1]
    for i in range(degree):
        poly = _poly_mul(poly, [1, _EXP[i]])
    return poly


def _poly_mul(a: Sequence[int], b: Sequence[int]) -> List[int]:
    result = [0] * (len(a) + len(b) - 1)
    for i, av in enumerate(a):
        for j, bv in enumerate(b):
            result[i + j] ^= _mul(av, bv)
    return result


def _ec_codewords(data: Sequence[int], count: int) -> List[int]:
    generator = _generator_poly(count)
    remainder = list(data) + [0] * count
    for i in range(len(data)):
        factor = remainder[i]
        if factor == 0:
            continue
        for j, gv in enumerate(generator):
            remainder[i + j] ^= _mul(gv, factor)
    return remainder[len(data):]


# --------------------------------------------------------------------------
# Surum tablolari (yalnizca ECC seviyesi M)
# --------------------------------------------------------------------------
# surum -> (toplam kod sozcugu, blok basina ECC, [(blok sayisi, veri sozcugu)])
_VERSIONS = {
    1:  (26,  10, [(1, 16)]),
    2:  (44,  16, [(1, 28)]),
    3:  (70,  26, [(1, 44)]),
    4:  (100, 18, [(2, 32)]),
    5:  (134, 24, [(2, 43)]),
    6:  (172, 16, [(4, 27)]),
    7:  (196, 18, [(4, 31)]),
    8:  (242, 22, [(2, 38), (2, 39)]),
    9:  (292, 22, [(3, 36), (2, 37)]),
    10: (346, 26, [(4, 43), (1, 44)]),
}

_ALIGNMENT = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}

_ECC_LEVEL_BITS = 0b00  # seviye M


class QREncodeError(ValueError):
    """Veri desteklenen surumlere sigmiyor."""


def _data_capacity(version: int) -> int:
    return sum(count * words for count, words in _VERSIONS[version][2])


def _char_count_bits(version: int) -> int:
    return 8 if version <= 9 else 16


def _pick_version(length: int) -> int:
    for version in sorted(_VERSIONS):
        header = 4 + _char_count_bits(version)
        if header + length * 8 <= _data_capacity(version) * 8:
            return version
    raise QREncodeError(
        f"{length} bayt QR surum 10'a (ECC M) sigmiyor; en fazla "
        f"{_data_capacity(10) - 3} bayt."
    )


def _encode_data(payload: bytes, version: int) -> List[int]:
    bits: List[int] = []

    def push(value: int, width: int) -> None:
        for i in range(width - 1, -1, -1):
            bits.append((value >> i) & 1)

    push(0b0100, 4)                                  # byte modu
    push(len(payload), _char_count_bits(version))
    for byte in payload:
        push(byte, 8)

    capacity_bits = _data_capacity(version) * 8
    push(0, min(4, capacity_bits - len(bits)))       # sonlandirici
    while len(bits) % 8:
        bits.append(0)

    codewords = [int("".join(str(b) for b in bits[i:i + 8]), 2) for i in range(0, len(bits), 8)]
    # Dolgu her zaman EC-11-EC-11 sirasini izler (ISO/IEC 18004 8.4.9).
    pad = (0xEC, 0x11)
    index = 0
    while len(codewords) < _data_capacity(version):
        codewords.append(pad[index % 2])
        index += 1
    return codewords


def _interleave(codewords: Sequence[int], version: int) -> List[int]:
    _, ec_per_block, groups = _VERSIONS[version]

    blocks: List[List[int]] = []
    offset = 0
    for count, words in groups:
        for _ in range(count):
            blocks.append(list(codewords[offset:offset + words]))
            offset += words

    ec_blocks = [_ec_codewords(block, ec_per_block) for block in blocks]

    result: List[int] = []
    for i in range(max(len(b) for b in blocks)):
        for block in blocks:
            if i < len(block):
                result.append(block[i])
    for i in range(ec_per_block):
        for block in ec_blocks:
            result.append(block[i])
    return result


# --------------------------------------------------------------------------
# Matris
# --------------------------------------------------------------------------
def _new_matrix(size: int) -> Tuple[List[List[int]], List[List[bool]]]:
    return ([[0] * size for _ in range(size)], [[False] * size for _ in range(size)])


def _place_finder(matrix, reserved, row: int, col: int) -> None:
    for dr in range(-1, 8):
        for dc in range(-1, 8):
            r, c = row + dr, col + dc
            if not (0 <= r < len(matrix) and 0 <= c < len(matrix)):
                continue
            in_ring = (
                (0 <= dr <= 6 and dc in (0, 6)) or
                (0 <= dc <= 6 and dr in (0, 6)) or
                (2 <= dr <= 4 and 2 <= dc <= 4)
            )
            matrix[r][c] = 1 if in_ring else 0
            reserved[r][c] = True


def _place_alignment(matrix, reserved, version: int) -> None:
    centers = _ALIGNMENT[version]
    size = len(matrix)
    for row in centers:
        for col in centers:
            # Bulucu desenlerin altinda kalanlar cizilmez.
            if (row < 8 and col < 8) or (row < 8 and col > size - 9) or (row > size - 9 and col < 8):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    matrix[row + dr][col + dc] = 1 if max(abs(dr), abs(dc)) != 1 else 0
                    reserved[row + dr][col + dc] = True


def _place_timing(matrix, reserved) -> None:
    size = len(matrix)
    for i in range(8, size - 8):
        bit = 1 if i % 2 == 0 else 0
        matrix[6][i] = bit
        reserved[6][i] = True
        matrix[i][6] = bit
        reserved[i][6] = True


def _reserve_format(matrix, reserved, version: int) -> None:
    size = len(matrix)
    for i in range(9):
        if not reserved[8][i]:
            reserved[8][i] = True
        if not reserved[i][8]:
            reserved[i][8] = True
    for i in range(8):
        reserved[8][size - 1 - i] = True
        reserved[size - 1 - i][8] = True
    # Her zaman koyu olan modul
    matrix[size - 8][8] = 1
    reserved[size - 8][8] = True

    if version >= 7:
        for i in range(6):
            for j in range(3):
                reserved[size - 11 + j][i] = True
                reserved[i][size - 11 + j] = True


def _format_bits(mask: int) -> int:
    """15 bitlik bicim bilgisi: 5 bit veri + BCH(15,5) + maske XOR."""
    value = (_ECC_LEVEL_BITS << 3) | mask
    remainder = value
    for _ in range(10):
        remainder = (remainder << 1) ^ ((remainder >> 9) * 0b10100110111)
    return ((value << 10) | remainder) ^ 0b101010000010010


def _version_bits(version: int) -> int:
    """18 bitlik surum bilgisi (yalnizca surum >= 7)."""
    remainder = version
    for _ in range(12):
        remainder = (remainder << 1) ^ ((remainder >> 11) * 0b1111100100101)
    return (version << 12) | remainder


def _place_format(matrix, mask: int) -> None:
    """Bicim bitlerini iki kopya hâlinde yerlestirir (ISO/IEC 18004 8.9)."""
    bits = _format_bits(mask)
    size = len(matrix)
    for i in range(15):
        bit = (bits >> i) & 1
        # Birinci kopya: sol ust kosede dikey serit + yatay serit
        if i < 6:
            matrix[i][8] = bit
        elif i == 6:
            matrix[7][8] = bit
        elif i == 7:
            matrix[8][8] = bit
        elif i == 8:
            matrix[8][7] = bit
        else:
            matrix[8][14 - i] = bit
        # Ikinci kopya: sag ust ve sol alt
        if i < 8:
            matrix[8][size - 1 - i] = bit
        else:
            matrix[size - 15 + i][8] = bit


def _place_version(matrix, version: int) -> None:
    if version < 7:
        return
    bits = _version_bits(version)
    size = len(matrix)
    for i in range(18):
        bit = (bits >> i) & 1
        row, col = i // 3, i % 3
        matrix[size - 11 + col][row] = bit
        matrix[row][size - 11 + col] = bit


def _place_data(matrix, reserved, codewords: Sequence[int]) -> None:
    size = len(matrix)
    bits = [(word >> i) & 1 for word in codewords for i in range(7, -1, -1)]
    index = 0
    upward = True
    col = size - 1
    while col > 0:
        if col == 6:            # dikey zamanlama sutunu atlanir
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for row in rows:
            for dc in (0, 1):
                c = col - dc
                if reserved[row][c]:
                    continue
                matrix[row][c] = bits[index] if index < len(bits) else 0
                index += 1
        upward = not upward
        col -= 2


def _mask_condition(mask: int, row: int, col: int) -> bool:
    if mask == 0:
        return (row + col) % 2 == 0
    if mask == 1:
        return row % 2 == 0
    if mask == 2:
        return col % 3 == 0
    if mask == 3:
        return (row + col) % 3 == 0
    if mask == 4:
        return (row // 2 + col // 3) % 2 == 0
    if mask == 5:
        return (row * col) % 2 + (row * col) % 3 == 0
    if mask == 6:
        return ((row * col) % 2 + (row * col) % 3) % 2 == 0
    return ((row + col) % 2 + (row * col) % 3) % 2 == 0


def _penalty(matrix) -> int:
    size = len(matrix)
    score = 0

    # Kural 1: ayni renkte 5+ ardisik modul
    for line in list(matrix) + [list(col) for col in zip(*matrix)]:
        run, previous = 1, line[0]
        for value in line[1:]:
            if value == previous:
                run += 1
            else:
                if run >= 5:
                    score += 3 + (run - 5)
                run, previous = 1, value
        if run >= 5:
            score += 3 + (run - 5)

    # Kural 2: 2x2 ayni renk bloklari
    for row in range(size - 1):
        for col in range(size - 1):
            block = (matrix[row][col], matrix[row][col + 1],
                     matrix[row + 1][col], matrix[row + 1][col + 1])
            if len(set(block)) == 1:
                score += 3

    # Kural 3: bulucu desene benzeyen ornekler
    patterns = ([1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1])
    for line in list(matrix) + [list(col) for col in zip(*matrix)]:
        for i in range(size - 10):
            window = line[i:i + 11]
            if window in patterns:
                score += 40

    # Kural 4: koyu modul orani %50'den ne kadar saparsa o kadar ceza
    dark = sum(sum(row) for row in matrix)
    total = size * size
    k = (abs(dark * 20 - total * 10) + total - 1) // total - 1
    score += k * 10
    return score


def make_matrix(text: str) -> List[List[int]]:
    """Metni QR matrisine cevirir (1 = koyu). Kenar boslugu eklenmez."""
    payload = text.encode("utf-8")
    version = _pick_version(len(payload))
    codewords = _interleave(_encode_data(payload, version), version)
    size = version * 4 + 17

    best = None
    for mask in range(8):
        matrix, reserved = _new_matrix(size)
        _place_finder(matrix, reserved, 0, 0)
        _place_finder(matrix, reserved, 0, size - 7)
        _place_finder(matrix, reserved, size - 7, 0)
        _place_alignment(matrix, reserved, version)
        _place_timing(matrix, reserved)
        _reserve_format(matrix, reserved, version)
        _place_data(matrix, reserved, codewords)

        for row in range(size):
            for col in range(size):
                if not reserved[row][col] and _mask_condition(mask, row, col):
                    matrix[row][col] ^= 1

        _place_format(matrix, mask)
        _place_version(matrix, version)

        score = _penalty(matrix)
        if best is None or score < best[0]:
            best = (score, matrix)

    return best[1]


def to_text(text: str, *, border: int = 2, invert: bool = False) -> str:
    """Terminalde okutulabilecek bir QR cizer.

    Iki bosluk/iki blok kullaniyoruz: terminal karakterleri kare degil, tek
    karakter genisliginde cizilen kod ezilir ve okunmaz.
    """
    matrix = make_matrix(text)
    dark, light = ("  ", "██") if invert else ("██", "  ")
    size = len(matrix)
    lines = []
    for _ in range(border):
        lines.append(light * (size + border * 2))
    for row in matrix:
        line = light * border + "".join(dark if cell else light for cell in row) + light * border
        lines.append(line)
    for _ in range(border):
        lines.append(light * (size + border * 2))
    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("kullanim: qr.py <metin>", file=sys.stderr)
        raise SystemExit(2)
    print(to_text(sys.argv[1]))
