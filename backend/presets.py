"""Hermes'in kabul ettiği model seçenekleri — uydurma değil, kaynak koddan.

HermesForge yalnızca Hermes Agent ile çalışır. Modeli, sağlayıcıyı ve API
anahtarını Hermes'in kendisi yönetir (``~/.hermes/config.yaml``); buradan
istek başına gönderebildiğimiz tek şey düşünme düzeyidir.

Düzey listesi Hermes'in kendi ``gateway/platforms/api_server.py`` dosyasındaki
``_REASONING_EFFORTS`` kümesinden alınmıştır. Listede olmayan bir değeri Hermes
sessizce yok sayar; o yüzden kaydetmeden önce burada doğruluyoruz.
"""

from __future__ import annotations

from typing import Any, Dict, List

# "default" = hiçbir şey gönderme, Hermes'in kendi ayarı geçerli olsun.
DEFAULT = "default"
# "none" = düşünmeyi tamamen kapat.
NONE = "none"

HERMES_EFFORTS: List[str] = [
    DEFAULT, NONE, "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
]

EFFORT_LABELS: Dict[str, str] = {
    DEFAULT: "Varsayılan (Hermes ayarı)",
    NONE: "Kapalı (düşünme yok)",
    "minimal": "Minimal",
    "low": "Düşük",
    "medium": "Orta",
    "high": "Yüksek",
    "xhigh": "Çok yüksek",
    "max": "Maksimum",
    "ultra": "Ultra",
}


def is_valid_effort(effort: str) -> bool:
    return (effort or "").strip().lower() in HERMES_EFFORTS


def public_catalog() -> Dict[str, Any]:
    """Arayüzün düşünme düzeyi listesini kurduğu veri."""
    return {
        "hermes_efforts": [
            {"id": effort, "label": EFFORT_LABELS.get(effort, effort)}
            for effort in HERMES_EFFORTS
        ],
    }
