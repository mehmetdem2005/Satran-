"""Ajanları otomatik seçen yönlendirici.

Kullanıcı menüden ajan seçmez. Yönlendirici isteğe bakar ve hattı kurar:

* ``build``  — sıfırdan uygulama: Çözümleyici → Mimar → Kodlayıcı → Denetçi → Paketleyici
* ``patch``  — var olan projeye dokunma: Kodlayıcı → Denetçi
* ``answer`` — soru/sohbet: yalnız Danışman
* ``package``— hazır projeyi paketleme: yalnız Paketleyici

Önce modele küçük bir JSON sınıflandırma çağrısı yapılır; model yoksa ya da
bozuk yanıt verirse anahtar kelime tabanlı sezgisel yol devreye girer.
Sezgisel yol tek başına da doğru çalışır — yönlendirme hiçbir zaman
tüm akışı bloke etmez.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from .agents import AGENTS

logger = logging.getLogger(__name__)

MODES: Dict[str, List[str]] = {
    "build": ["analyst", "architect", "builder", "reviewer", "packager"],
    "patch": ["builder", "reviewer"],
    "package": ["packager"],
    "answer": ["advisor"],
}

_BUILD_HINTS = (
    r"\buygulama\b", r"\bapp\b", r"\bproje\b", r"\bprogram\b", r"\bsite\b",
    r"\bweb sitesi\b", r"\boyun\b", r"\bbot\b", r"\bar[aa]ç\b", r"\bscript\b",
    r"\byap\b", r"\byaz\b", r"\bkur\b", r"\boluştur\b", r"\bgeliştir\b",
    r"\bbuild\b", r"\bcreate\b", r"\bmake me\b",
)
_PATCH_HINTS = (
    r"\bdüzelt\b", r"\bhata\b", r"\bçalışmıyor\b", r"\bekle\b", r"\bdeğiştir\b",
    r"\bgüncelle\b", r"\bkaldır\b", r"\bsil\b", r"\brefactor\b", r"\bfix\b",
    r"\bbug\b", r"\bekran\b.*\bekle\b", r"\bbuton\b",
)
_PACKAGE_HINTS = (
    r"\bzip\b", r"\btar\b", r"\bindir\b", r"\bpaketle\b", r"\barşiv\b",
    r"\bexport\b", r"\bdownload\b", r"\bteslim\b",
)
_ANSWER_HINTS = (
    r"\bnedir\b", r"\bnasıl\b", r"\bneden\b", r"\bne demek\b", r"\baçıkla\b",
    r"\banlat\b", r"\bfark[ıi]\b", r"\bönerir misin\b", r"\bwhat is\b", r"\bwhy\b",
    r"\bexplain\b", r"^\s*(selam|merhaba|naber|hey|hi|hello)\b",
)

_ROUTER_SYSTEM = """Sen bir yönlendiricisin. Kullanıcının mesajını okuyup hangi iş
hattının çalışacağına karar ver. SADECE JSON döndür, açıklama yazma.

Şema:
{"mode": "build|patch|package|answer", "title": "en fazla 6 kelimelik Türkçe başlık", "reason": "tek cümle"}

Anlamlar:
- build: sıfırdan yeni bir uygulama/program/site isteniyor
- patch: zaten üretilmiş bir projede değişiklik, ekleme veya hata düzeltme isteniyor
- package: mevcut proje zip/tar gibi bir biçimde isteniyor, yeni kod gerekmiyor
- answer: soru, sohbet veya açıklama isteniyor; kod üretmek gerekmiyor"""

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _match_any(patterns, text: str) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def heuristic_mode(message: str, has_project: bool) -> str:
    """Model çağrısı olmadan modu tahmin eder."""
    text = (message or "").lower().strip()
    if not text:
        return "answer"

    # Paketleme isteği, mevcut bir proje varken her şeyin önüne geçer.
    if has_project and _match_any(_PACKAGE_HINTS, text) and not _match_any(_BUILD_HINTS, text):
        return "package"
    if has_project and _match_any(_PATCH_HINTS, text):
        return "patch"
    if _match_any(_BUILD_HINTS, text):
        # "nasıl yapılır" bir soru, "yap" bir emirdir.
        if _match_any(_ANSWER_HINTS, text) and len(text) < 90:
            return "answer"
        return "build"
    if _match_any(_ANSWER_HINTS, text):
        return "answer"
    # Uzun ve ayrıntılı bir istek, büyük olasılıkla bir yapım işidir.
    return "build" if len(text) > 140 else "answer"


def fallback_title(message: str) -> str:
    text = re.sub(r"\s+", " ", (message or "").strip())
    if not text:
        return "Yeni sohbet"
    words = text.split(" ")[:6]
    title = " ".join(words)
    return (title[:48] + "…") if len(title) > 48 else title


def route(
    message: str,
    *,
    has_project: bool = False,
    completer=None,
) -> Dict[str, Any]:
    """Modu, ajan sırasını ve sohbet başlığını belirler."""
    mode = heuristic_mode(message, has_project)
    title = fallback_title(message)
    reason = "Sezgisel yönlendirme"
    source = "heuristic"

    # Paketleme isteği kesin bir sinyaldir: kullanıcı "zip olarak ver" dediyse
    # ve ortada zaten bir proje varsa, modele sormaya gerek yok — model burada
    # yanılırsa hazır projeyi baştan üretmeye kalkar. Deterministik yol kazanır.
    if mode == "package":
        return {
            "mode": mode,
            "agents": [agent_id for agent_id in MODES[mode] if agent_id in AGENTS],
            "title": title,
            "reason": "Paketleme isteği doğrudan tanındı",
            "source": "deterministic",
        }

    # Tek satırlık soru da kesin sinyaldir: "Flask nedir?" hiçbir koşulda beş
    # ajanlık bir yapım hattını hak etmez.
    if mode == "answer" and len(message.strip()) < 60 and message.strip().endswith("?"):
        return {
            "mode": mode,
            "agents": [agent_id for agent_id in MODES[mode] if agent_id in AGENTS],
            "title": title,
            "reason": "Kısa soru — doğrudan yanıt",
            "source": "deterministic",
        }

    if completer is not None and (message or "").strip():
        decision = _ask_model(message, has_project, completer)
        if decision:
            candidate_mode = str(decision.get("mode") or "").strip().lower()
            if candidate_mode in MODES:
                # Proje yokken paketleme/yamalama anlamsızdır.
                if candidate_mode in {"patch", "package"} and not has_project:
                    candidate_mode = "build" if candidate_mode == "patch" else "answer"
                # Sezgisel yol net bir düzenleme isteği gördüyse modelin bunu
                # "build"e yükseltmesine izin verme: yanılırsa hazır projeyi
                # baştan üretir ve kullanıcının işini bozar. Tersi (build→patch)
                # serbest, çünkü zararsız.
                if mode == "patch" and candidate_mode == "build" and has_project:
                    candidate_mode = "patch"
                mode = candidate_mode
                source = "model"
            candidate_title = str(decision.get("title") or "").strip()
            if candidate_title:
                title = candidate_title[:60]
            reason = str(decision.get("reason") or reason)[:200]

    agents = [agent_id for agent_id in MODES[mode] if agent_id in AGENTS]
    return {
        "mode": mode,
        "agents": agents,
        "title": title,
        "reason": reason,
        "source": source,
    }


def _ask_model(message: str, has_project: bool, completer) -> Optional[Dict[str, Any]]:
    context = "Kullanıcının zaten üretilmiş bir projesi var." if has_project else "Henüz üretilmiş bir proje yok."
    messages = [
        {"role": "system", "content": _ROUTER_SYSTEM},
        {"role": "user", "content": f"{context}\n\nMesaj:\n{message[:2000]}"},
    ]
    try:
        raw = completer(messages)
    except Exception as exc:  # yönlendirme hatası akışı durdurmaz
        logger.info("Model yönlendirici kullanılamadı, sezgisel yola düşüldü: %s", exc)
        return None

    match = _JSON_RE.search(raw or "")
    if not match:
        return None
    try:
        decision = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return decision if isinstance(decision, dict) else None
