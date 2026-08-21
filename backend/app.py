"""HermesForge Flask uygulaması.

Arayüz tek bir SSE ucundan beslenir: ``POST /api/chat/stream``. Hangi ajanın
çalıştığı, hangi dosyaların üretildiği ve projenin nasıl indirileceği hep o
akıştan gelir. Ajan seçimi sunucuda otomatik yapılır; istemci ajan seçmez.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from flask import Flask, Response, jsonify, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

import config as config_module  # noqa: E402
import utils  # noqa: E402
from forge import ArtifactStore, ForgePipeline, public_roster  # noqa: E402
from forge.artifacts import EXPORT_FORMATS  # noqa: E402
from hermes import HermesClient, HermesRuntime  # noqa: E402
from hermes.memory import CATEGORIES, HermesMemory  # noqa: E402
from hermes.rag import HermesRag  # noqa: E402
from providers import DirectProvider  # noqa: E402
from providers import presets  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("hermesforge")

MAX_UPLOAD_BYTES = 32 * 1024 * 1024
DEFAULT_SCOPE = "default"

# Düşünme düzeyleri ve model listeleri sağlayıcının kendi belgelerinden
# geliyor (providers/presets.py). Uydurma bir liste göstermiyoruz.


def _validate_settings(updates: Dict[str, Any]) -> Optional[str]:
    """Ayar değerlerini doğrular; sorun varsa Türkçe hata mesajı döndürür.

    Düşünme düzeyi listesi Hermes'in kendi ``_REASONING_EFFORTS`` kümesinden
    alınmıştır; listede olmayan bir değer Hermes tarafından sessizce yok
    sayılırdı ve kullanıcı ayarın çalıştığını sanırdı.
    """
    effort = updates.get("reasoning_effort")
    if effort is not None:
        preset_id = str(updates.get("fallback_preset") or presets.DEFAULT_PRESET)
        if not presets.is_valid_effort(str(effort), preset_id):
            gecerli = ", ".join(presets.efforts_for(preset_id))
            return f"Geçersiz düşünme düzeyi. Bu sağlayıcıda geçerli olanlar: {gecerli}"

    preset_id = updates.get("fallback_preset")
    if preset_id is not None and str(preset_id) not in presets.PRESETS:
        return f"Bilinmeyen sağlayıcı. Seçenekler: {', '.join(presets.PRESETS)}"

    for key, low, high in (
        ("max_tokens", 1, 1_000_000),
        ("max_parallel_agents", 1, 6),
    ):
        if key in updates:
            try:
                value = int(updates[key])
            except (TypeError, ValueError):
                return f"{key} bir tam sayı olmalı."
            if not low <= value <= high:
                return f"{key} {low}-{high} aralığında olmalı."
            updates[key] = value

    for key, low, high in (("temperature", 0.0, 2.0), ("top_p", 0.0, 1.0)):
        if key in updates:
            try:
                value = float(updates[key])
            except (TypeError, ValueError):
                return f"{key} bir sayı olmalı."
            if not low <= value <= high:
                return f"{key} {low}-{high} aralığında olmalı."
            updates[key] = value

    return None


def create_app() -> Flask:
    cfg = config_module.load_config()

    # Android'de (APK) arayüz dosyaları uygulamanın özel dizinine açılıyor;
    # masaüstünde depo içindeki frontend/ klasöründe duruyorlar.
    templates = os.environ.get("HERMESFORGE_TEMPLATES", "").strip()
    static = os.environ.get("HERMESFORGE_STATIC", "").strip()

    app = Flask(
        __name__,
        template_folder=templates or str(PROJECT_ROOT / "frontend" / "templates"),
        static_folder=static or str(PROJECT_ROOT / "frontend" / "static"),
        static_url_path="/static",
    )
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
    app.config["JSON_AS_ASCII"] = False

    client = HermesClient(cfg)
    runtime = HermesRuntime(cfg)
    memory = HermesMemory(cfg.memory_db_path, client=client)
    rag = HermesRag(cfg.rag_db_path, workspace_dir=cfg.uploads_path)
    store = ArtifactStore(cfg.projects_path)
    fallback = DirectProvider(cfg)
    pipeline = ForgePipeline(
        config=cfg, client=client, memory=memory, rag=rag, store=store, fallback=fallback
    )

    app.extensions["hermesforge"] = {
        "config": cfg,
        "client": client,
        "runtime": runtime,
        "memory": memory,
        "rag": rag,
        "store": store,
        "fallback": fallback,
        "pipeline": pipeline,
    }

    # Hermes kapalıysa ve otomatik başlatma açıksa bir kez dene.
    if cfg.hermes_autostart and not client.health().get("reachable"):
        result = runtime.start_gateway()
        if result.get("started"):
            logger.info("Hermes gateway otomatik başlatıldı (pid=%s)", result.get("pid"))
        else:
            logger.info("Hermes otomatik başlatılamadı: %s", result.get("error") or result.get("reason"))

    _register_routes(app)
    return app


def _services() -> Dict[str, Any]:
    from flask import current_app

    return current_app.extensions["hermesforge"]


def _scope() -> str:
    raw = (request.args.get("scope") or "").strip()
    if not raw and request.is_json:
        raw = str((request.get_json(silent=True) or {}).get("scope") or "").strip()
    return raw[:64] or DEFAULT_SCOPE


def _register_routes(app: Flask) -> None:
    # ------------------------------------------------------------------
    # Sayfa
    # ------------------------------------------------------------------
    @app.route("/")
    def index():
        from flask import render_template

        return render_template("index.html")

    @app.route("/healthz")
    def healthz():
        return jsonify({"status": "ok"})

    # ------------------------------------------------------------------
    # Durum ve Hermes yönetimi
    # ------------------------------------------------------------------
    @app.route("/api/status")
    def status():
        services = _services()
        cfg = services["config"]
        client = services["client"]
        runtime = services["runtime"]

        health = client.health()
        install = runtime.discover().to_dict()
        capabilities: Dict[str, Any] = {}
        models = []
        if health.get("reachable"):
            try:
                capabilities = client.capabilities(refresh=True)
                models = client.models()
            except Exception as exc:
                capabilities = {"error": str(exc)}

        return jsonify(
            {
                "hermes": {
                    "health": health,
                    "install": install,
                    "capabilities": capabilities,
                    "models": models,
                    "base_url": cfg.hermes_base_url,
                    "managed_pid": runtime.managed_pid(),
                },
                "fallback": {
                    "available": services["fallback"].available,
                    "preset": cfg.fallback_preset,
                    "model": cfg.fallback_model,
                    "base_url": cfg.fallback_base_url,
                },
                "memory": services["memory"].stats(scope=DEFAULT_SCOPE),
                "rag": services["rag"].stats(),
                "agents": public_roster(),
                "formats": list(EXPORT_FORMATS),
                "catalog": presets.public_catalog(),
                "platform": cfg.platform,
                "max_parallel_agents": cfg.max_parallel_agents,
            }
        )

    @app.route("/api/hermes/start", methods=["POST"])
    def hermes_start():
        services = _services()
        result = services["runtime"].start_gateway(force=bool((request.get_json(silent=True) or {}).get("force")))
        return jsonify(result), (200 if result.get("started") or result.get("reason") == "already_running" else 400)

    @app.route("/api/hermes/stop", methods=["POST"])
    def hermes_stop():
        return jsonify({"stopped": _services()["runtime"].stop_gateway()})

    @app.route("/api/hermes/log")
    def hermes_log():
        lines = max(1, min(int(request.args.get("lines", 60)), 500))
        return jsonify({"log": _services()["runtime"].tail_log(lines)})

    # ------------------------------------------------------------------
    # Sohbet akışı
    # ------------------------------------------------------------------
    @app.route("/api/chat/stream", methods=["POST"])
    def chat_stream():
        services = _services()
        payload = request.get_json(silent=True) or {}
        message = str(payload.get("message") or "").strip()
        if not message:
            return jsonify({"error": "Mesaj boş olamaz."}), 400

        history = payload.get("history") or []
        project_id = (payload.get("project_id") or "").strip() or None
        hermes_session_id = (payload.get("session_id") or "").strip() or None
        scope = str(payload.get("scope") or DEFAULT_SCOPE)[:64]

        pipeline = services["pipeline"]

        def generate():
            try:
                for event in pipeline.run(
                    message=message,
                    history=history,
                    project_id=project_id,
                    scope=scope,
                    hermes_session_id=hermes_session_id,
                ):
                    yield utils.sse(event)
            except Exception as exc:  # akış içi çöküş kullanıcıya iletilir
                logger.exception("Hat çalışırken hata")
                yield utils.sse({"type": "error", "text": f"Beklenmeyen hata: {exc}"})
                yield utils.sse({"type": "done", "ok": False})

        return Response(
            generate(),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    # ------------------------------------------------------------------
    # Dosya yükleme → RAG
    # ------------------------------------------------------------------
    @app.route("/api/upload", methods=["POST"])
    def upload():
        services = _services()
        if "file" not in request.files:
            return jsonify({"error": "Dosya bulunamadı."}), 400
        uploaded = request.files["file"]
        if not uploaded.filename:
            return jsonify({"error": "Dosya adı boş."}), 400

        raw = uploaded.read()
        if not raw:
            return jsonify({"error": "Dosya boş."}), 400

        try:
            documents = utils.extract_upload(uploaded.filename, raw)
        except Exception as exc:
            return jsonify({"error": f"Dosya okunamadı: {exc}"}), 400

        documents = [doc for doc in documents if (doc.get("content") or "").strip()]
        if not documents:
            return jsonify({"error": "Dosyadan metin çıkarılamadı."}), 400

        chunks = services["rag"].add_documents(documents, collection="uploads")
        return jsonify(
            {
                "filename": uploaded.filename,
                "documents": len(documents),
                "chunks": chunks,
                "names": [doc["name"] for doc in documents[:50]],
            }
        )

    @app.route("/api/rag/sources")
    def rag_sources():
        return jsonify({"sources": _services()["rag"].sources(collection="uploads")})

    @app.route("/api/rag/search")
    def rag_search():
        query = request.args.get("q", "")
        top_k = max(1, min(int(request.args.get("k", 6)), 30))
        return jsonify({"results": _services()["rag"].search(query, top_k=top_k, collection="uploads")})

    @app.route("/api/rag", methods=["DELETE"])
    def rag_clear():
        _services()["rag"].clear(collection="uploads")
        return jsonify({"cleared": True})

    # ------------------------------------------------------------------
    # Bellek
    # ------------------------------------------------------------------
    @app.route("/api/memory")
    def memory_list():
        services = _services()
        scope = _scope()
        return jsonify(
            {
                "memories": services["memory"].all(scope=scope),
                "stats": services["memory"].stats(scope=scope),
                "categories": list(CATEGORIES),
                "scope_key": services["memory"].scope_key(user=scope),
            }
        )

    @app.route("/api/memory", methods=["POST"])
    def memory_add():
        payload = request.get_json(silent=True) or {}
        text = str(payload.get("text") or "").strip()
        if not text:
            return jsonify({"error": "Anı metni boş olamaz."}), 400
        added = _services()["memory"].remember(
            text,
            category=str(payload.get("category") or "olgu"),
            importance=float(payload.get("importance") or 0.7),
            scope=_scope(),
        )
        return jsonify({"added": added})

    @app.route("/api/memory/<int:memory_id>", methods=["DELETE"])
    def memory_forget(memory_id: int):
        return jsonify({"deleted": _services()["memory"].forget(memory_id, scope=_scope())})

    @app.route("/api/memory", methods=["DELETE"])
    def memory_clear():
        _services()["memory"].clear(scope=_scope())
        return jsonify({"cleared": True})

    # ------------------------------------------------------------------
    # Projeler ve teslim
    # ------------------------------------------------------------------
    @app.route("/api/projects")
    def projects_list():
        return jsonify({"projects": _services()["store"].list_projects()})

    @app.route("/api/projects/<project_id>/files")
    def project_files(project_id: str):
        try:
            files = _services()["store"].list_files(project_id)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"project_id": project_id, "files": files})

    @app.route("/api/projects/<project_id>/file")
    def project_file(project_id: str):
        path = request.args.get("path", "")
        try:
            content = _services()["store"].read_file(project_id, path)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        if content is None:
            return jsonify({"error": "Dosya bulunamadı."}), 404
        return jsonify({"path": path, "content": content})

    @app.route("/api/projects/<project_id>/export")
    def project_export(project_id: str):
        fmt = (request.args.get("format") or "zip").lower()
        try:
            buffer, filename, mime = _services()["store"].export(project_id, fmt)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return send_file(buffer, mimetype=mime, as_attachment=True, download_name=filename)

    @app.route("/api/projects/<project_id>", methods=["DELETE"])
    def project_delete(project_id: str):
        try:
            deleted = _services()["store"].delete_project(project_id)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"deleted": deleted})

    # ------------------------------------------------------------------
    # Sohbet dışa aktarma
    # ------------------------------------------------------------------
    @app.route("/api/export/conversation", methods=["POST"])
    def export_conversation():
        payload = request.get_json(silent=True) or {}
        messages = payload.get("messages") or []
        if not messages:
            return jsonify({"error": "Dışa aktarılacak mesaj yok."}), 400

        import io
        import zipfile

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("konusma.json", json.dumps(messages, ensure_ascii=False, indent=2))
            lines = []
            for item in messages:
                role = item.get("role")
                who = "Kullanıcı" if role == "user" else (item.get("agentName") or "Asistan")
                lines.append(f"### {who}\n{item.get('content', '')}\n")
            archive.writestr("konusma.md", "\n".join(lines))
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"hermesforge-konusma-{utils.timestamp_slug()}.zip",
        )

    # ------------------------------------------------------------------
    # Ayarlar
    # ------------------------------------------------------------------
    @app.route("/api/settings")
    def settings_get():
        return jsonify(_services()["config"].to_public_dict())

    @app.route("/api/settings", methods=["POST"])
    def settings_post():
        services = _services()
        payload = request.get_json(silent=True) or {}
        allowed = {
            "hermes_base_url", "hermes_api_key", "hermes_model", "hermes_provider",
            "hermes_autostart", "hermes_repo_dir", "fallback_enabled", "fallback_base_url",
            "fallback_model", "fallback_api_key", "fallback_preset", "rag_top_k", "memory_top_k",
            "reasoning_effort", "max_tokens", "temperature", "top_p", "max_parallel_agents",
        }
        updates = {key: value for key, value in payload.items() if key in allowed}
        if not updates:
            return jsonify({"error": "Güncellenecek geçerli alan yok."}), 400

        invalid = _validate_settings(updates)
        if invalid:
            return jsonify({"error": invalid}), 400

        cfg = config_module.save_config(services["config"], updates)
        services["client"]._capabilities = None  # yetenek önbelleğini tazele

        # Hermes token sınırını istek başına kabul etmiyor; kendi .env'ine
        # yazıp kullanıcıya gateway'i yeniden başlatması gerektiğini söylüyoruz.
        restart_required = False
        if "max_tokens" in updates:
            restart_required = services["runtime"].write_env_var(
                "HERMES_MAX_TOKENS", str(cfg.max_tokens)
            )

        return jsonify(
            {
                "saved": True,
                "settings": cfg.to_public_dict(),
                "hermes_restart_required": restart_required,
            }
        )

    # ------------------------------------------------------------------
    # Hatalar
    # ------------------------------------------------------------------
    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_exc):
        return jsonify({"error": f"Dosya çok büyük (en fazla {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)."}), 413

    @app.errorhandler(404)
    def not_found(_exc):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Uç bulunamadı."}), 404
        return jsonify({"error": "Sayfa bulunamadı."}), 404

    @app.errorhandler(500)
    def server_error(exc):
        logger.exception("Sunucu hatası")
        return jsonify({"error": f"Sunucu hatası: {exc}"}), 500


app = None


def main() -> None:
    global app
    app = create_app()
    cfg = app.extensions["hermesforge"]["config"]
    logger.info("HermesForge http://%s:%s adresinde", cfg.host, cfg.port)
    app.run(host=cfg.host, port=cfg.port, debug=cfg.debug, threaded=True)


if __name__ == "__main__":
    main()
