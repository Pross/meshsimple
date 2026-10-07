import logging
import threading
import time

import requests

from backend.database import SessionLocal
from backend.models import Setting

logger = logging.getLogger(__name__)

RELEASES_API = "https://api.github.com/repos/meshtastic/firmware/releases?per_page=30"
REFRESH_INTERVAL = 6 * 60 * 60  # releases land at most a few times a month

# beta: the newest release GitHub marks as a full (non-prerelease) release.
# alpha: the newest usable release of any kind, so it is always >= beta.
CHANNELS = ("beta", "alpha")
DEFAULT_CHANNEL = "beta"
_CHANNEL_SETTING = "firmware_channel"

_EMPTY = {"version": None, "notes": None, "url": None, "published_at": None}
_latest = {channel: dict(_EMPTY) for channel in CHANNELS}
_channel_lock = threading.Lock()


def _usable(release):
    """Drafts, revoked builds and releases without a firmware manifest can't be flashed."""
    if release.get("draft") or "revoked" in (release.get("name") or "").lower():
        return False
    version = release.get("tag_name", "").lstrip("v")
    return any(a.get("name") == f"firmware-{version}.json" for a in release.get("assets", []))


def select_release(releases, channel):
    """Pick the release for a channel from a newest-first GitHub release list."""
    for release in releases:
        if not _usable(release):
            continue
        if channel == "alpha" or not release.get("prerelease"):
            return release
    return None


def fetch_release(channel):
    """Raw GitHub release for a channel, fetched fresh (used when flashing)."""
    resp = requests.get(RELEASES_API, timeout=15)
    resp.raise_for_status()
    release = select_release(resp.json(), channel)
    if release is None:
        raise RuntimeError(f"No usable firmware release found for the {channel} channel")
    return release


def get_channel():
    with SessionLocal() as db:
        setting = db.get(Setting, _CHANNEL_SETTING)
        return setting.value if setting and setting.value in CHANNELS else DEFAULT_CHANNEL


def set_channel(channel):
    if channel not in CHANNELS:
        raise ValueError(f"Unknown channel {channel!r}")
    with _channel_lock, SessionLocal() as db:
        setting = db.get(Setting, _CHANNEL_SETTING)
        if setting is None:
            db.add(Setting(key=_CHANNEL_SETTING, value=channel))
        else:
            setting.value = channel
        db.commit()


def get_latest_version(channel=None):
    return _latest[channel or get_channel()]["version"]


def get_latest(channel=None):
    return dict(_latest[channel or get_channel()])


def get_summary():
    """Selected channel's release plus every channel's version, for the UI."""
    channel = get_channel()
    return {
        **get_latest(channel),
        "channel": channel,
        "channels": {c: _latest[c]["version"] for c in CHANNELS},
    }


def _fetch_latest():
    global _latest
    try:
        resp = requests.get(RELEASES_API, timeout=10)
        resp.raise_for_status()
        releases = resp.json()
        latest = {}
        for channel in CHANNELS:
            release = select_release(releases, channel)
            if release is None:
                latest[channel] = dict(_EMPTY)
                continue
            latest[channel] = {
                "version": release["tag_name"].lstrip("v"),
                "notes": release.get("body"),
                "url": release.get("html_url"),
                "published_at": release.get("published_at"),
            }
        _latest = latest
        logger.info(
            "Latest meshtastic firmware: %s",
            {c: latest[c]["version"] for c in CHANNELS},
        )
    except Exception:
        logger.debug("Could not fetch latest firmware versions")


def _refresh_loop():
    while True:
        _fetch_latest()
        time.sleep(REFRESH_INTERVAL)


def start():
    threading.Thread(target=_refresh_loop, daemon=True).start()
