"""Hermes tarzı RAG: SQLite FTS5 + bm25.

Eski saf-Python TF-IDF motorunun yerini alır. Hermes Agent kendi oturum
aramasını (``hermes_state_search.py``) SQLite'ın FTS5 sanal tablosu ve bm25
sıralaması üzerine kurar; buradaki motor da aynı zemini kullanır:

* FTS5 sanal tablosu + ``bm25()`` sıralaması
* Hermes'in sorgu temizleyicisiyle aynı mantık: FTS5 dilbilgisinin
  reddettiği karakterleri ayıkla, tireli/noktalı terimleri tırnakla
* Yüklenen her dosya ayrıca Hermes çalışma alanına yazılır; böylece ajan
  kendi ``read_file`` / ``grep`` araçlarıyla aynı içeriğe erişebilir

FTS5 bulunmayan (çok nadir) bir SQLite derlemesinde motor otomatik olarak
``LIKE`` tabanlı basit bir aramaya düşer, uygulama çalışmaya devam eder.
"""

from __future__ import annotations

import logging
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

# FTS5 sorgu dilbilgisinin tırnak dışında reddettiği karakterler.
_FTS5_SPECIAL_CHARS = '+{}():"^@/#&|~[]<>,;!?$=\\\'*-'
_FTS5_SPECIAL_RE = re.compile(f"[{re.escape(_FTS5_SPECIAL_CHARS)}]")
_MAX_QUERY_CHARS = 400

# Türkçe + İngilizce yüksek frekanslı sözcükler: sorguda tek başlarına
# kalırlarsa bm25 sıralamasını bozarlar.
_STOPWORDS = {
    "ve", "ile", "bir", "bu", "şu", "için", "ama", "veya", "de", "da", "ki",
    "mi", "mı", "mu", "mü", "olarak", "gibi", "daha", "çok", "en", "her",
    "the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "for", "on",
}

_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at REAL NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);

CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    collection TEXT NOT NULL,
    source TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_collection ON chunks(collection);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
"""

_CREATE_FTS_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    body,
    source,
    content='chunks',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, body, source) VALUES (new.id, new.body, new.source);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, body, source) VALUES ('delete', old.id, old.body, old.source);
END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, body, source) VALUES ('delete', old.id, old.body, old.source);
    INSERT INTO chunks_fts(rowid, body, source) VALUES (new.id, new.body, new.source);
END;
"""


def sanitize_fts_query(query: str) -> str:
    """Kullanıcı metnini güvenli bir FTS5 MATCH sorgusuna çevirir.

    Hermes'in ``_sanitize_fts5_query`` yaklaşımını izler: özel karakterleri
    boşlukla değiştir, kalan terimleri tırnakla ve aralarına OR koy. OR
    kullanmamızın nedeni, FTS5'in örtük AND'inin uzun doğal dil sorgularında
    neredeyse her zaman sıfır sonuç üretmesi.
    """
    query = (query or "")[:_MAX_QUERY_CHARS]
    cleaned = _FTS5_SPECIAL_RE.sub(" ", query)
    terms: List[str] = []
    for token in cleaned.split():
        token = token.strip().strip(".").lower()
        if len(token) < 2 or token in _STOPWORDS:
            continue
        # Tırnak içine alınca FTS5 tokenizasyonu terimi olduğu gibi arar.
        terms.append('"' + token.replace('"', "") + '"')
        if len(terms) >= 24:
            break
    return " OR ".join(terms)


def chunk_text(text: str, chunk_size: int = 900, overlap: int = 120) -> List[str]:
    """Metni satır sınırlarına saygı duyan, örtüşmeli parçalara böler.

    Kod dosyalarında satır bütünlüğü önemlidir; bu yüzden cümle yerine satır
    tabanlı bölüyoruz ve parçalar arasında ``overlap`` karakterlik bir kuyruk
    bırakıyoruz, böylece sınıra denk gelen bir tanım ikiye bölünmüş olmuyor.
    """
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for line in text.splitlines(keepends=True):
        # Tek satır bile sığmıyorsa (küçültülmüş JS gibi) sert böl.
        while len(line) > chunk_size:
            if current:
                chunks.append("".join(current))
                current, current_len = [], 0
            chunks.append(line[:chunk_size])
            line = line[chunk_size:]

        if current_len + len(line) > chunk_size and current:
            chunk = "".join(current)
            chunks.append(chunk)
            tail = chunk[-overlap:] if overlap > 0 else ""
            current = [tail] if tail else []
            current_len = len(tail)
        current.append(line)
        current_len += len(line)

    if current:
        remainder = "".join(current).strip()
        if remainder:
            chunks.append(remainder)
    return [chunk for chunk in chunks if chunk.strip()]


class HermesRag:
    """Hermes çalışma alanına yazan, FTS5 ile arayan RAG motoru."""

    def __init__(self, db_path: Path, workspace_dir: Optional[Path] = None) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.workspace_dir = Path(workspace_dir) if workspace_dir else None
        self._lock = threading.Lock()
        self._fts_available = True
        self._init_db()

    # ------------------------------------------------------------------
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(_CREATE_SQL)
            try:
                conn.executescript(_CREATE_FTS_SQL)
            except sqlite3.OperationalError as exc:
                self._fts_available = False
                logger.warning("FTS5 kullanılamıyor, LIKE aramasına düşülüyor: %s", exc)

    @property
    def fts_available(self) -> bool:
        return self._fts_available

    # ------------------------------------------------------------------
    # Yazma
    # ------------------------------------------------------------------
    def add_document(self, source: str, content: str, collection: str = "default") -> int:
        """Bir belgeyi indeksler ve üretilen parça sayısını döndürür."""
        chunks = chunk_text(content)
        if not chunks:
            return 0

        with self._lock, self._connect() as conn:
            cursor = conn.execute(
                "INSERT INTO documents (collection, source) VALUES (?, ?)",
                (collection, source),
            )
            document_id = cursor.lastrowid
            conn.executemany(
                "INSERT INTO chunks (document_id, collection, source, ordinal, body) VALUES (?,?,?,?,?)",
                [(document_id, collection, source, i, chunk) for i, chunk in enumerate(chunks)],
            )

        self._mirror_to_workspace(source, content, collection)
        return len(chunks)

    def add_documents(self, documents: Iterable[Dict[str, str]], collection: str = "default") -> int:
        total = 0
        for document in documents:
            total += self.add_document(
                document.get("name") or "belge",
                document.get("content") or "",
                collection=collection,
            )
        return total

    def _mirror_to_workspace(self, source: str, content: str, collection: str) -> None:
        """Belgeyi Hermes çalışma alanına da yazar.

        Hermes ajanı dosya araçlarıyla çalıştığı için, yüklenen içerik diskte
        durduğunda ajan kendi grep/read araçlarıyla parçalar arası bağlam
        kurabilir — bu, salt gömme tabanlı geri getirmenin yakalayamadığı
        şeyleri yakalar.
        """
        if not self.workspace_dir:
            return
        safe_name = re.sub(r"[^\w.\-]+", "_", source).strip("_")[:120] or "belge"
        target_dir = self.workspace_dir / re.sub(r"[^\w.\-]+", "_", collection)[:60]
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            (target_dir / f"{safe_name}.txt").write_text(content, encoding="utf-8")
        except OSError as exc:
            logger.debug("Çalışma alanına yazılamadı (%s): %s", source, exc)

    # ------------------------------------------------------------------
    # Okuma
    # ------------------------------------------------------------------
    def search(self, query: str, top_k: int = 6, collection: Optional[str] = None) -> List[Dict[str, Any]]:
        """Sorguya en alakalı parçaları bm25 sırasıyla döndürür."""
        if not (query or "").strip():
            return []
        if self._fts_available:
            results = self._search_fts(query, top_k, collection)
            if results:
                return results
        return self._search_like(query, top_k, collection)

    def _search_fts(self, query: str, top_k: int, collection: Optional[str]) -> List[Dict[str, Any]]:
        match = sanitize_fts_query(query)
        if not match:
            return []
        sql = (
            "SELECT c.source AS source, c.body AS body, c.ordinal AS ordinal, "
            "bm25(chunks_fts, 1.0, 0.5) AS rank "
            "FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid "
            "WHERE chunks_fts MATCH ?"
        )
        params: List[Any] = [match]
        if collection:
            sql += " AND c.collection = ?"
            params.append(collection)
        sql += " ORDER BY rank LIMIT ?"
        params.append(int(top_k))

        try:
            with self._lock, self._connect() as conn:
                rows = conn.execute(sql, params).fetchall()
        except sqlite3.OperationalError as exc:
            logger.debug("FTS sorgusu başarısız (%s): %s", match, exc)
            return []

        # bm25 küçükken daha iyidir; dışarıya 0..1 arası bir skor veriyoruz.
        return [
            {
                "source": row["source"],
                "text": row["body"],
                "ordinal": row["ordinal"],
                "score": round(1.0 / (1.0 + max(0.0, -float(row["rank"]))), 4),
            }
            for row in rows
        ]

    def _search_like(self, query: str, top_k: int, collection: Optional[str]) -> List[Dict[str, Any]]:
        """FTS5 yoksa ya da hiç eşleşme yoksa: terim bazlı LIKE taraması."""
        terms = [
            token.lower()
            for token in re.split(r"\W+", query or "")
            if len(token) > 2 and token.lower() not in _STOPWORDS
        ][:8]
        if not terms:
            return []

        sql = "SELECT source, body, ordinal FROM chunks"
        params: List[Any] = []
        if collection:
            sql += " WHERE collection = ?"
            params.append(collection)
        sql += " LIMIT 4000"

        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()

        scored: List[Dict[str, Any]] = []
        for row in rows:
            body_lower = row["body"].lower()
            hits = sum(1 for term in terms if term in body_lower)
            if hits:
                scored.append(
                    {
                        "source": row["source"],
                        "text": row["body"],
                        "ordinal": row["ordinal"],
                        "score": round(hits / len(terms), 4),
                    }
                )
        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:top_k]

    def build_context(self, query: str, top_k: int = 6, collection: Optional[str] = None,
                      char_budget: int = 8000) -> str:
        """Arama sonuçlarını sisteme verilebilir bir bağlam bloğuna çevirir."""
        results = self.search(query, top_k=top_k, collection=collection)
        if not results:
            return ""
        parts: List[str] = []
        used = 0
        for result in results:
            block = f"[kaynak: {result['source']} #{result['ordinal']}]\n{result['text']}"
            if used + len(block) > char_budget:
                break
            parts.append(block)
            used += len(block)
        return "\n\n".join(parts)

    # ------------------------------------------------------------------
    # Bakım
    # ------------------------------------------------------------------
    def sources(self, collection: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = "SELECT source, COUNT(*) AS chunks FROM chunks"
        params: List[Any] = []
        if collection:
            sql += " WHERE collection = ?"
            params.append(collection)
        sql += " GROUP BY source ORDER BY source"
        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [{"source": row["source"], "chunks": row["chunks"]} for row in rows]

    def clear(self, collection: Optional[str] = None) -> None:
        with self._lock, self._connect() as conn:
            if collection:
                conn.execute("DELETE FROM chunks WHERE collection = ?", (collection,))
                conn.execute("DELETE FROM documents WHERE collection = ?", (collection,))
            else:
                conn.execute("DELETE FROM chunks")
                conn.execute("DELETE FROM documents")

    def stats(self) -> Dict[str, Any]:
        with self._lock, self._connect() as conn:
            documents = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        return {"documents": documents, "chunks": chunks, "fts5": self._fts_available}
