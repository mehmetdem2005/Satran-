"""Hermes tarzı bellek katmanı.

Eski ``memory.py`` (JSON listesi + sözcük kesişimi) yerine Hermes Agent'ın
bellek sağlayıcı sözleşmesini izleyen bir yönetici:

* ``build_system_prompt()`` — ajana belleğin nasıl kullanılacağını anlatır
* ``prefetch(query)``       — tur öncesi ilgili anıları getirir
* ``sync(user, assistant)`` — tur sonrası kalıcı bilgileri süzer
* ``scope_key(...)``        — ``X-Hermes-Session-Key`` başlığı için kararlı
  bir kapsam üretir; Hermes'in kendi uzun vadeli bellek sağlayıcıları
  (Honcho, mem0, …) bu anahtarla aynı kullanıcıyı oturumlar arası tanır

Yerel depo SQLite + FTS5'tir: Hermes API sunucusu kapalıyken bile bellek
çalışır, açıkken Hermes'in kendi belleğiyle aynı kapsam altında birleşir.
"""

from __future__ import annotations

import hashlib
import logging
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .rag import sanitize_fts_query

logger = logging.getLogger(__name__)

# Anı kategorileri — Hermes'in curated-memory yaklaşımıyla aynı ayrım.
CATEGORIES = ("kimlik", "tercih", "proje", "karar", "olgu")

_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL DEFAULT 'default',
    category TEXT NOT NULL DEFAULT 'olgu',
    body TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    importance REAL NOT NULL DEFAULT 0.5,
    hits INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    UNIQUE(scope, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
"""

_CREATE_FTS_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    body,
    content='memories',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, body) VALUES ('delete', old.id, old.body);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, body) VALUES ('delete', old.id, old.body);
    INSERT INTO memories_fts(rowid, body) VALUES (new.id, new.body);
END;
"""

# Kalıcı olmaya değer cümleleri yakalayan örüntüler. Ağırlık, anının
# önem puanına dönüşür.
_EXTRACTION_RULES: List[tuple[str, str, float]] = [
    (r"\b(benim ad[ıi]m|ismim|ben\s+\w+'?[ıi]m)\b", "kimlik", 0.95),
    (r"\b(my name is|i am called)\b", "kimlik", 0.95),
    (r"\b(tercih ederim|sever(im|iyorum)|istemiyorum|hoşlanmıyorum|kullanmak istiyorum)\b", "tercih", 0.8),
    (r"\b(i prefer|i like|i don'?t like|i want to use)\b", "tercih", 0.8),
    (r"\b(projem|projemiz|uygulamam|repom|proje ad[ıi])\b", "proje", 0.85),
    (r"\b(my project|our app|the repo)\b", "proje", 0.85),
    (r"\b(bundan sonra|her zaman|asla|kesinlikle|kural olarak|unutma)\b", "karar", 0.9),
    (r"\b(from now on|always|never|remember that)\b", "karar", 0.9),
    (r"\b(kullan[ıi]yorum|çal[ıi]ş[ıi]yorum|termux|android|windows|linux|mac)\b", "olgu", 0.6),
]

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?\n])\s+")
_MIN_LEN, _MAX_LEN = 12, 320


def _fingerprint(text: str) -> str:
    normalized = re.sub(r"\W+", " ", (text or "").lower()).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]


class HermesMemory:
    """Kalıcı, kapsamlanmış ve aranabilir bellek."""

    def __init__(self, db_path: Path, client: Optional[Any] = None) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.client = client
        self._lock = threading.Lock()
        self._fts_available = True
        self._init_db()

    # ------------------------------------------------------------------
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(_CREATE_SQL)
            try:
                conn.executescript(_CREATE_FTS_SQL)
            except sqlite3.OperationalError as exc:
                self._fts_available = False
                logger.warning("Bellek FTS5 kullanılamıyor: %s", exc)

    # ------------------------------------------------------------------
    # Hermes kapsam anahtarı
    # ------------------------------------------------------------------
    @staticmethod
    def scope_key(user: str = "local", surface: str = "hermesforge", project: str = "main") -> str:
        """``X-Hermes-Session-Key`` için kararlı bir kapsam üretir.

        Hermes bu anahtarı ``AIAgent(gateway_session_key=...)`` üzerinden
        bellek sağlayıcısına iletir; transkript kimliği (``/new`` ile dönen)
        değişse bile uzun vadeli bellek aynı kapsamda kalır. 256 karakter ve
        kontrol karakteri yasağı Hermes tarafından uygulanır.
        """
        raw = f"agent:main:{surface}:{project}:{user}"
        cleaned = re.sub(r"[\r\n\x00]", "", raw)
        return cleaned[:256]

    # ------------------------------------------------------------------
    # Yazma
    # ------------------------------------------------------------------
    def remember(
        self,
        text: str,
        *,
        category: str = "olgu",
        importance: float = 0.5,
        scope: str = "default",
    ) -> bool:
        """Bir anıyı kaydeder. Aynı anı zaten varsa önemini tazeler."""
        text = (text or "").strip()
        if len(text) < _MIN_LEN:
            return False
        text = text[:_MAX_LEN]
        if category not in CATEGORIES:
            category = "olgu"
        now = time.time()
        fingerprint = _fingerprint(text)

        with self._lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT id, importance FROM memories WHERE scope = ? AND fingerprint = ?",
                (scope, fingerprint),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE memories SET importance = ?, updated_at = ?, hits = hits + 1 WHERE id = ?",
                    (max(float(existing["importance"]), importance), now, existing["id"]),
                )
                return False
            conn.execute(
                "INSERT INTO memories (scope, category, body, fingerprint, importance, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (scope, category, text, fingerprint, importance, now, now),
            )
        return True

    def sync(self, user_message: str, assistant_message: str = "", scope: str = "default") -> List[Dict[str, Any]]:
        """Turdan kalıcı olmaya değer cümleleri süzer ve kaydeder.

        Hermes'in bellek sağlayıcıları da tur sonunda benzer bir "neyi
        saklamalıyım" kararı verir; burada aynı işi kural tabanlı yapıyoruz ki
        model kotası harcamadan çalışsın.
        """
        stored: List[Dict[str, Any]] = []
        for sentence in _SENTENCE_SPLIT_RE.split(user_message or ""):
            sentence = sentence.strip()
            if not (_MIN_LEN <= len(sentence) <= _MAX_LEN):
                continue
            lowered = sentence.lower()
            for pattern, category, importance in _EXTRACTION_RULES:
                if re.search(pattern, lowered):
                    if self.remember(sentence, category=category, importance=importance, scope=scope):
                        stored.append({"text": sentence, "category": category, "importance": importance})
                    break
        return stored

    # ------------------------------------------------------------------
    # Okuma
    # ------------------------------------------------------------------
    def recall(self, query: str, top_k: int = 6, scope: str = "default") -> List[Dict[str, Any]]:
        """Sorguya en alakalı anıları döndürür; yoksa en önemlilerine düşer."""
        results: List[Dict[str, Any]] = []
        match = sanitize_fts_query(query) if self._fts_available else ""
        if match:
            sql = (
                "SELECT m.id, m.body, m.category, m.importance "
                "FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid "
                "WHERE memories_fts MATCH ? AND m.scope = ? "
                "ORDER BY bm25(memories_fts) LIMIT ?"
            )
            try:
                with self._lock, self._connect() as conn:
                    rows = conn.execute(sql, (match, scope, int(top_k))).fetchall()
                results = [dict(row) for row in rows]
            except sqlite3.OperationalError as exc:
                logger.debug("Bellek FTS sorgusu başarısız: %s", exc)

        if not results:
            results = self.recent(limit=top_k, scope=scope)

        if results:
            self._bump_hits([row["id"] for row in results if row.get("id")])
        return results

    def recent(self, limit: int = 6, scope: str = "default") -> List[Dict[str, Any]]:
        """Önem ve tazelik ağırlıklı en belirgin anılar."""
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, body, category, importance FROM memories WHERE scope = ? "
                "ORDER BY importance DESC, updated_at DESC LIMIT ?",
                (scope, int(limit)),
            ).fetchall()
        return [dict(row) for row in rows]

    def _bump_hits(self, ids: List[int]) -> None:
        if not ids:
            return
        placeholders = ",".join("?" * len(ids))
        with self._lock, self._connect() as conn:
            conn.execute(
                f"UPDATE memories SET hits = hits + 1 WHERE id IN ({placeholders})",
                ids,
            )

    def prefetch(self, query: str, top_k: int = 6, scope: str = "default") -> str:
        """Tur öncesi enjekte edilecek bellek bloğunu üretir."""
        memories = self.recall(query, top_k=top_k, scope=scope)
        if not memories:
            return ""
        lines = [f"- ({row['category']}) {row['body']}" for row in memories]
        return "\n".join(lines)

    @staticmethod
    def build_system_prompt() -> str:
        return (
            "Kalıcı belleğin var. Aşağıdaki 'Hatırlananlar' bloğu, kullanıcının "
            "önceki oturumlarda söylediği kalıcı bilgilerdir. Bunlarla çelişme, "
            "tekrar sorma. Blok boşsa kullanıcıyı ilk kez tanıyorsun."
        )

    # ------------------------------------------------------------------
    # Bakım
    # ------------------------------------------------------------------
    def all(self, scope: str = "default", limit: int = 200) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, body, category, importance, hits, created_at, updated_at "
                "FROM memories WHERE scope = ? ORDER BY updated_at DESC LIMIT ?",
                (scope, int(limit)),
            ).fetchall()
        return [dict(row) for row in rows]

    def forget(self, memory_id: int, scope: str = "default") -> bool:
        with self._lock, self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM memories WHERE id = ? AND scope = ?", (int(memory_id), scope)
            )
            return cursor.rowcount > 0

    def clear(self, scope: Optional[str] = None) -> None:
        with self._lock, self._connect() as conn:
            if scope:
                conn.execute("DELETE FROM memories WHERE scope = ?", (scope,))
            else:
                conn.execute("DELETE FROM memories")

    def stats(self, scope: str = "default") -> Dict[str, Any]:
        with self._lock, self._connect() as conn:
            total = conn.execute(
                "SELECT COUNT(*) FROM memories WHERE scope = ?", (scope,)
            ).fetchone()[0]
            by_category = conn.execute(
                "SELECT category, COUNT(*) AS n FROM memories WHERE scope = ? GROUP BY category",
                (scope,),
            ).fetchall()
        return {
            "total": total,
            "categories": {row["category"]: row["n"] for row in by_category},
            "fts5": self._fts_available,
        }
