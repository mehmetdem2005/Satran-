#!/usr/bin/env python3
"""HermesForge başlatıcı.

Kullanım:
    python3 run.py                 # 127.0.0.1:5000
    HERMESFORGE_PORT=8080 python3 run.py
    HERMESFORGE_HOST=0.0.0.0 python3 run.py   # telefondan LAN erişimi
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.app import main  # noqa: E402

if __name__ == "__main__":
    main()
