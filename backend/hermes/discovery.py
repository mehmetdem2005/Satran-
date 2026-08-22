"""Ev ağındaki Hermes sunucusunu kendiliğinden bulur.

Neden var: kullanıcının yapması gereken iş listesi ne kadar kısaysa uygulama
o kadar "hazır" demektir. Adres elle yazılırsa iki sorun çıkıyor:

* Bilgisayarın IP'si değişiyor (DHCP kirası, yeniden başlatma) ve uygulama
  bir sabah "bağlanamadı" diyor; kullanıcı neyin bozulduğunu bilmiyor.
* Yeni kurulumda 192.168.x.x adresini bulmak kullanıcının işi olmamalı.

Tarama, cihazın kendi /24 ağında yalnızca Hermes'in portuna TCP bağlantısı
dener, sonra açık bulduklarına ``GET /health`` atıp gerçekten Hermes olup
olmadığına bakar. Kimlik doğrulaması gerekmez (``/health`` açıktır), yani
anahtar olmadan da "sunucu şurada" diyebiliyoruz.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

DEFAULT_PORT = 8642
# Ev ağı /24'te 254 adres var; 64 iş parçacığıyla tarama saniyeler sürüyor.
_MAX_WORKERS = 64
_CONNECT_TIMEOUT = 0.35
_HEALTH_TIMEOUT = 1.5


def local_ipv4() -> Optional[str]:
    """Bu cihazın ev ağındaki adresi.

    UDP soketini "bağlamak" paket göndermez; çekirdeğe hangi arayüzün
    kullanılacağını sorup adresini okumanın taşınabilir yolu budur.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 9))  # TEST-NET-1: yönlendirilmez
        return sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()


def candidate_hosts(ip: str) -> List[str]:
    """Taranacak adresler: cihazın /24 ağı, kendi adresi hariç."""
    try:
        network = ipaddress.ip_network(f"{ip}/24", strict=False)
    except ValueError:
        return []
    return [str(host) for host in network.hosts() if str(host) != ip]


def _port_open(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(_CONNECT_TIMEOUT)
    try:
        return sock.connect_ex((host, port)) == 0
    except OSError:
        return False
    finally:
        sock.close()


def looks_like_hermes(base_url: str, *, timeout: float = _HEALTH_TIMEOUT) -> Optional[Dict[str, str]]:
    """``/health`` Hermes'in imzasını taşıyor mu?

    Aynı portta başka bir servis olabilir; "port açık" yetmez. Hermes 0.20.4
    ``{"status": "ok", "platform": "hermes-agent", "version": "..."}`` döner.
    """
    try:
        response = requests.get(f"{base_url}/health", timeout=timeout)
    except requests.exceptions.RequestException:
        return None
    if response.status_code >= 400:
        return None
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    if body.get("platform") != "hermes-agent":
        return None
    return {
        "base_url": base_url,
        "version": str(body.get("version") or ""),
        "status": str(body.get("status") or "ok"),
    }


def discover(
    port: int = DEFAULT_PORT,
    *,
    extra_urls: Optional[List[str]] = None,
    limit: int = 4,
) -> List[Dict[str, str]]:
    """Ev ağında Hermes arar; bulunanları döndürür.

    ``extra_urls`` önce denenir — kayıtlı adres hâlâ çalışıyorsa 254 adres
    taramanın anlamı yok.
    """
    found: List[Dict[str, str]] = []
    seen = set()

    for url in (extra_urls or []):
        url = url.rstrip("/")
        if not url or url in seen:
            continue
        seen.add(url)
        hit = looks_like_hermes(url)
        if hit:
            found.append(hit)
            return found  # kayıtlı adres çalışıyor: tarama gereksiz

    ip = local_ipv4()
    if not ip:
        return found

    # Aynı cihazda çalışıyor olabilir (masaüstü, Termux).
    for host in ("127.0.0.1",):
        url = f"http://{host}:{port}"
        if url not in seen:
            seen.add(url)
            hit = looks_like_hermes(url)
            if hit:
                found.append(hit)

    hosts = candidate_hosts(ip)
    if not hosts:
        return found

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        open_hosts = [
            host
            for host, is_open in zip(hosts, pool.map(lambda h: _port_open(h, port), hosts))
            if is_open
        ]

    logger.info("Hermes taraması: %s adreste port %s açık", len(open_hosts), port)

    with ThreadPoolExecutor(max_workers=min(_MAX_WORKERS, max(1, len(open_hosts)))) as pool:
        for hit in pool.map(lambda h: looks_like_hermes(f"http://{h}:{port}"), open_hosts):
            if hit and hit["base_url"] not in seen:
                seen.add(hit["base_url"])
                found.append(hit)
                if len(found) >= limit:
                    break

    return found
