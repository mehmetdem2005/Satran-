"""Düşünme düzeyleri — uydurma değil, motorun kendi kaynağından.

Burada iki ayrı küme var ve karıştırılmaları eski bir hataydı:

* **Hermes'in iç merdiveni** (``none … ultra``). Hermes bunları kabul eder ama
  hiçbir sağlayıcı wire'ı hepsini tanımaz; Hermes bunları sağlayıcıya
  göndermeden önce *kırpar*.
* **Sağlayıcının gerçek kümesi.** Telde asıl giden budur.

Arayüzde Hermes'in iç merdivenini göstermek, DeepSeek kullanan birine
tanımadığı düzeyleri seçtirmek demekti: "ultra" seçilir, telde "max" gider,
kullanıcı bambaşka bir şey seçtiğini sanır.

Aşağıdaki sağlayıcı kümeleri Hermes'in **kendi kaynak kodundan** alındı:
``agent/reasoning_effort.py`` (DEEPSEEK_V4_EFFORTS, GLM52_EFFORTS, …) ve
``plugins/model-providers/deepseek/__init__.py``. Kırpma kuralı da oradan:
desteklenen bir düzey aynen gider, desteklenmeyen ise **en yakın zayıf**
düzeye iner (asla kendiliğinden pahalıya çıkmaz); daha zayıfı yoksa en zayıf
desteklenen düzey kullanılır.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# "default" = hiçbir şey gönderme, sağlayıcının kendi varsayılanı geçerli olsun.
DEFAULT = "default"
# "none" = düşünmeyi kapat (DeepSeek'te extra_body.thinking = disabled).
NONE = "none"

#: Hermes'in iç merdiveni (hermes_constants.VALID_REASONING_EFFORTS + none).
#: Sağlayıcısı bilinmeyen bir Hermes'e bağlıyken bunu gösteriyoruz.
HERMES_EFFORTS: List[str] = [
    DEFAULT, NONE, "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
]

#: Sağlayıcıların telde gerçekten kabul ettiği kümeler.
#: Kaynak: vendor/hermes-agent/agent/reasoning_effort.py
#:
#: DeepSeek listesi ayrıca **telde ölçüldü**: gömülü Hermes'e her düzey tek tek
#: gönderilip sahte bir DeepSeek ucunda gelen gövde kaydedildi.
#:
#:   seçilen   ->  telde reasoning_effort   thinking
#:   ultra     ->  (hiç gitmiyor!)          enabled
#:   xhigh     ->  max                      enabled
#:   minimal   ->  low                      enabled
#:   max       ->  max                      enabled
#:   high      ->  high                     enabled
#:   medium    ->  medium                   enabled
#:   low       ->  low                      enabled
#:   none      ->  (gitmiyor)               disabled
#:   varsayılan->  (gitmiyor)               enabled
#:
#: Bu yüzden listede yalnızca aynen giden düzeyler var. ``ultra`` en kötüsü:
#: kullanıcı "en güçlü"yü seçtiğini sanıyor, telde hiçbir şey gitmiyor ve
#: DeepSeek kendi varsayılanını uyguluyor. ``minimal``/``xhigh`` doğru
#: eşleniyor ama zaten ``low``/``max``ın kopyası.
PROVIDER_EFFORTS: Dict[str, List[str]] = {
    # DEEPSEEK_V4_EFFORTS = ("low", "medium", "high", "max")
    # Düşünme kapatma ayrı bir bayrakla (thinking: disabled) yapılıyor.
    "deepseek": [DEFAULT, NONE, "low", "medium", "high", "max"],
    # GLM52_EFFORTS = ("high", "max") — en düşük düşünme düzeyi zaten "high".
    "zai": [DEFAULT, NONE, "high", "max"],
    # SOLAR_EFFORTS = ("low", "medium", "high")
    "upstage": [DEFAULT, NONE, "low", "medium", "high"],
    # OLLAMA_CLOUD_EFFORTS
    "ollama": [DEFAULT, NONE, "low", "medium", "high", "max"],
    # META_AI_EFFORTS — "none" kabul etmiyor.
    "meta": [DEFAULT, "minimal", "low", "medium", "high", "xhigh"],
}

PROVIDER_LABELS: Dict[str, str] = {
    "deepseek": "DeepSeek",
    "zai": "Z.AI / GLM",
    "upstage": "Upstage Solar",
    "ollama": "Ollama Cloud",
    "meta": "Meta Model API",
}

EFFORT_LABELS: Dict[str, str] = {
    DEFAULT: "Varsayılan",
    NONE: "Kapalı (düşünme yok)",
    "minimal": "Minimal",
    "low": "Düşük",
    "medium": "Orta",
    "high": "Yüksek",
    "xhigh": "Çok yüksek",
    "max": "Maksimum",
    "ultra": "Ultra",
}

#: Sağlayıcının kendi varsayılanı — "Varsayılan" seçiliyken ne olduğunu
#: kullanıcıya söyleyebilmek için. DeepSeek belgeleri: düşünme açık, "high".
PROVIDER_DEFAULT_NOTE: Dict[str, str] = {
    "deepseek": "DeepSeek'in kendi varsayılanı: düşünme açık, düzey yüksek.",
}


def efforts_for(provider: Optional[str]) -> List[str]:
    """Sağlayıcının telde kabul ettiği düzeyler; bilinmiyorsa Hermes merdiveni."""
    key = (provider or "").strip().lower()
    return list(PROVIDER_EFFORTS.get(key, HERMES_EFFORTS))


def is_valid_effort(effort: str, provider: Optional[str] = None) -> bool:
    """Değer kaydedilebilir mi?

    Hem sağlayıcının kümesini hem Hermes merdivenini kabul ediyoruz: kullanıcı
    sağlayıcı değiştirdiğinde kayıtlı ayarı yeniden girmek zorunda kalmasın —
    Hermes zaten kırpıyor.
    """
    value = (effort or "").strip().lower()
    if not value:
        return False
    return value in HERMES_EFFORTS or value in efforts_for(provider)


def _options(efforts: List[str]) -> List[Dict[str, str]]:
    return [{"id": effort, "label": EFFORT_LABELS.get(effort, effort)} for effort in efforts]


def public_catalog(provider: Optional[str] = None) -> Dict[str, Any]:
    """Arayüzün düşünme düzeyi listesini kurduğu veri."""
    key = (provider or "").strip().lower()
    known = key in PROVIDER_EFFORTS
    efforts = efforts_for(key)

    options = _options(efforts)
    if options and options[0]["id"] == DEFAULT and known:
        note = PROVIDER_DEFAULT_NOTE.get(key)
        if note:
            options[0]["label"] = f"Varsayılan ({PROVIDER_LABELS[key]} ayarı)"

    return {
        "provider": key,
        "provider_label": PROVIDER_LABELS.get(key, ""),
        "provider_known": known,
        "efforts": options,
        "default_note": PROVIDER_DEFAULT_NOTE.get(key, ""),
        # Geriye dönük ad: arayüzün eski sürümü bunu okuyordu.
        "hermes_efforts": options,
    }
