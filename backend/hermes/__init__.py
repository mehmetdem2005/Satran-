"""Hermes Agent entegrasyon katmanı.

Bu paket, NousResearch/hermes-agent kurulumunu bulur, OpenAI uyumlu API
sunucusuna bağlanır ve uygulamanın bellek/RAG katmanlarını Hermes'in kendi
oturum + arama altyapısına bağlar.
"""

from .client import HermesClient, HermesError, HermesUnavailable  # noqa: F401
from .runtime import HermesRuntime  # noqa: F401
