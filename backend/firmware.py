import logging
import threading
import time

import requests

logger = logging.getLogger(__name__)

LATEST_RELEASE_API = "https://api.github.com/repos/meshtastic/firmware/releases/latest"
REFRESH_INTERVAL = 6 * 60 * 60  # releases land at most a few times a month

_latest = {"version": None, "notes": None, "url": None, "published_at": None}


def get_latest_version():
    return _latest["version"]


def get_latest():
    return dict(_latest)


def _fetch_latest():
    global _latest
    try:
        resp = requests.get(LATEST_RELEASE_API, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        version = data.get("tag_name", "").lstrip("v")
        if version:
            _latest = {
                "version": version,
                "notes": data.get("body"),
                "url": data.get("html_url"),
                "published_at": data.get("published_at"),
            }
            logger.info("Latest meshtastic firmware: %s", version)
    except Exception:
        logger.debug("Could not fetch latest firmware version")


def _refresh_loop():
    while True:
        _fetch_latest()
        time.sleep(REFRESH_INTERVAL)


def start():
    threading.Thread(target=_refresh_loop, daemon=True).start()
