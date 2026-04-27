#!/usr/bin/env python3
"""Unified backend entrypoint for CAD services.

This file is the single startup entrypoint and delegates to the full backend
implementation in app_skp_api.py, which now includes both:
- SKP conversion APIs
- DWG direct-view APIs (/api/dwg/*)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app_skp_api import DWG_SERVICE, app as app, check_conversion_tools, logger


def _log_startup_capabilities() -> None:
    tools = check_conversion_tools()
    dwg_health = DWG_SERVICE.health()
    logger.info("Unified CAD backend entrypoint: app.py")
    logger.info(f"Available conversion tools: {tools}")
    logger.info(
        "DWG direct service: status=%s mode=%s sessions=%s",
        dwg_health.get("status"),
        dwg_health.get("mode"),
        dwg_health.get("session_count"),
    )


if __name__ == '__main__':
    _log_startup_capabilities()
    port = int(os.environ.get('PORT', '5000'))
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
