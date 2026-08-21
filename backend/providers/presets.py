"""Sağlayıcı ön ayarları — uydurma değil, sağlayıcının kendi belgelerinden.

Buradaki model adları ve düşünme düzeyleri DeepSeek'in resmi API belgelerinden
(api-docs.deepseek.com) alınmıştır. Önceden arayüzde Hermes'in kendi iç
düzey kümesi (minimal/medium/xhigh/ultra) DeepSeek kullanıcısına
gösteriliyordu; DeepSeek bunların çoğunu tanımıyor.

DeepSeek'in gerçek sözleşmesi:

* Modeller: ``deepseek-v4-flash``, ``deepseek-v4-pro``,
  ``deepseek-v4-flash-vision-exp`` (1M bağlam, 384K çıktı)
* Düşünme açma/kapama: ``{"thinking": {"type": "enabled"|"disabled"}}``
* Düşünme düzeyi: ``reasoning_effort`` = ``low`` | ``high`` | ``max``
  (``medium`` ve ``xhigh`` uyumluluk girdisi olarak ``high``a eşlenir)
* Düşünme açıkken ``temperature``, ``top_p``, ``presence_penalty`` ve
  ``frequency_penalty`` yok sayılır — hata vermez ama etkisi olmaz
* Varsayılan: düşünme açık, düzey ``high``
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# "default" = hiçbir şey gönderme, sağlayıcının kendi varsayılanı geçerli olsun.
DEFAULT = "default"
# "none" = düşünmeyi kapat.
NONE = "none"

# Hermes'in kabul ettiği küme (gateway/platforms/api_server.py::_REASONING_EFFORTS).
HERMES_EFFORTS: List[str] = [
    DEFAULT, NONE, "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
]

# DeepSeek'in belgelenmiş kümesi. Hermes'inkinden dar — arayüzde DeepSeek
# seçiliyken kullanıcıya bu gösterilir.
DEEPSEEK_EFFORTS: List[str] = [DEFAULT, NONE, "low", "high", "max"]

# Genel OpenAI-uyumlu uçlar için güvenli ortak alt küme.
GENERIC_EFFORTS: List[str] = [DEFAULT, NONE, "low", "medium", "high"]

# Türkçe etiketler (arayüz bunları kullanır).
EFFORT_LABELS: Dict[str, str] = {
    DEFAULT: "Varsayılan (sağlayıcı ayarı)",
    NONE: "Kapalı (düşünme yok)",
    "minimal": "Minimal",
    "low": "Düşük",
    "medium": "Orta",
    "high": "Yüksek",
    "xhigh": "Çok yüksek",
    "max": "Maksimum",
    "ultra": "Ultra",
}

# Hermes'in geniş kümesinden bir değer DeepSeek'e giderken en yakın gerçek
# karşılığına indirilir. DeepSeek "medium"/"xhigh"i zaten "high"a eşliyor;
# kalanları da belgelenmiş üç düzeye biz eşliyoruz.
_DEEPSEEK_EFFORT_MAP: Dict[str, str] = {
    "minimal": "low",
    "medium": "high",
    "xhigh": "high",
    "ultra": "max",
}


PRESETS: Dict[str, Dict[str, Any]] = {
    "deepseek": {
        "id": "deepseek",
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "models": [
            {"id": "deepseek-v4-flash", "label": "V4 Flash — hızlı, genel amaçlı"},
            {"id": "deepseek-v4-pro", "label": "V4 Pro — derin akıl yürütme"},
            {"id": "deepseek-v4-flash-vision-exp", "label": "V4 Flash Vision (deneysel) — görsel girdi"},
        ],
        "efforts": DEEPSEEK_EFFORTS,
        "max_output_tokens": 384000,
        "thinking_style": "deepseek",   # thinking:{type} + reasoning_effort
        "key_hint": "sk-…  (platform.deepseek.com)",
    },
    "custom": {
        "id": "custom",
        "label": "Özel / OpenAI uyumlu",
        "base_url": "",
        "models": [],                   # kullanıcı kendi model adını yazar
        "efforts": GENERIC_EFFORTS,
        "max_output_tokens": 0,         # sınır bilinmiyor
        "thinking_style": "generic",    # yalnızca reasoning_effort
        "key_hint": "sağlayıcının anahtarı",
    },
}

DEFAULT_PRESET = "deepseek"


def get_preset(preset_id: str) -> Dict[str, Any]:
    return PRESETS.get(preset_id or "", PRESETS[DEFAULT_PRESET])


def model_ids(preset_id: str) -> List[str]:
    return [model["id"] for model in get_preset(preset_id).get("models", [])]


def efforts_for(preset_id: str) -> List[str]:
    return list(get_preset(preset_id).get("efforts", GENERIC_EFFORTS))


def is_valid_effort(effort: str, preset_id: Optional[str] = None) -> bool:
    """Düzey, ilgili sağlayıcı (ya da Hermes) için geçerli mi?

    Ayar tek bir alanda saklanıyor ama iki motor farklı küme kabul ediyor;
    ikisinden birinde geçerliyse kabul ediyoruz — kullanıcı motoru
    değiştirdiğinde ayarı yeniden girmek zorunda kalmasın.
    """
    effort = (effort or "").strip().lower()
    if not effort:
        return False
    return effort in HERMES_EFFORTS or effort in efforts_for(preset_id or DEFAULT_PRESET)


def normalize_for_provider(effort: str, preset_id: str) -> Optional[str]:
    """Saklanan düzeyi sağlayıcının gerçekten tanıdığı bir değere indirger.

    ``None`` döndürmek "bu alanı hiç gönderme" demektir (varsayılan).
    """
    effort = (effort or "").strip().lower()
    if not effort or effort == DEFAULT:
        return None

    allowed = efforts_for(preset_id)
    if effort in allowed:
        return effort
    if preset_id == "deepseek":
        return _DEEPSEEK_EFFORT_MAP.get(effort)
    # Genel uçlar: bilinmeyen bir düzeyi göndermektense hiç göndermemek daha
    # güvenli — katı sunucular bilinmeyen değerde 400 dönüyor.
    return effort if effort in GENERIC_EFFORTS else None


def public_catalog() -> Dict[str, Any]:
    """Arayüzün model ve düzey listelerini kurduğu veri."""
    return {
        "presets": [
            {
                "id": preset["id"],
                "label": preset["label"],
                "base_url": preset["base_url"],
                "models": preset["models"],
                "efforts": [
                    {"id": effort, "label": EFFORT_LABELS.get(effort, effort)}
                    for effort in preset["efforts"]
                ],
                "max_output_tokens": preset["max_output_tokens"],
                "key_hint": preset["key_hint"],
            }
            for preset in PRESETS.values()
        ],
        "hermes_efforts": [
            {"id": effort, "label": EFFORT_LABELS.get(effort, effort)}
            for effort in HERMES_EFFORTS
        ],
        "default_preset": DEFAULT_PRESET,
    }
