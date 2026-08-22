import logging
import threading
import time

import requests

logger = logging.getLogger(__name__)

LATEST_RELEASE_API = "https://api.github.com/repos/meshtastic/firmware/releases/latest"
REFRESH_INTERVAL = 6 * 60 * 60  # releases land at most a few times a month

_latest_version = None


def get_latest_version():
    return _latest_version


def _fetch_latest():
    global _latest_version
    try:
        resp = requests.get(LATEST_RELEASE_API, timeout=10)
        resp.raise_for_status()
        tag = resp.json().get("tag_name", "")
        version = tag.lstrip("v")
        if version:
            _latest_version = version
            logger.info("Latest meshtastic firmware: %s", version)
    except Exception:
        logger.debug("Could not fetch latest firmware version")


def _refresh_loop():
    while True:
        _fetch_latest()
        time.sleep(REFRESH_INTERVAL)


def start():
    threading.Thread(target=_refresh_loop, daemon=True).start()
