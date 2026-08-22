import logging
import os
import tempfile
import threading
import time
import zipfile

import requests
from meshtastic import admin_pb2
from meshtastic.ota import ESP32WiFiOTA, OTAError

from backend.database import SessionLocal
from backend.models import Node
from backend import mesh

logger = logging.getLogger(__name__)

FIRMWARE_REPO = "meshtastic/firmware"
GITHUB_API = "https://api.github.com"

MIN_FIRMWARE_BYTES = 100_000
MAX_FIRMWARE_BYTES = 4_000_000

# The "unified OTA" mechanism (a plain-TCP push to port 3232, handled by
# meshtastic.ota.ESP32WiFiOTA) only exists from this version onward -- older
# firmware only understands the legacy reboot_ota_seconds admin field, which
# never hands off WiFi credentials to the OTA-mode loader, so it can never
# actually complete a WiFi push regardless of what's flashed to the OTA
# partition. Below this, there's no reliable WiFi OTA path at all.
MIN_UNIFIED_OTA_VERSION = (2, 7, 18)

# phase stays at whatever step was last touched even after done=True, so the
# UI can tell which step a failure happened at (or that every step finished).
_status_lock = threading.Lock()
_status = {"phase": "idle", "detail": "", "target_version": None, "percent": None, "done": False, "error": None}


def get_status():
    with _status_lock:
        return dict(_status)


def _set_phase(phase, detail="", target_version=None, percent=None):
    with _status_lock:
        _status["phase"] = phase
        _status["detail"] = detail
        if target_version is not None:
            _status["target_version"] = target_version
        _status["percent"] = percent
        _status["done"] = False
        _status["error"] = None
    logger.info("OTA phase: %s (%s)", phase, detail)


def _set_percent(percent):
    with _status_lock:
        _status["percent"] = percent


def _set_done(detail="", error=None):
    with _status_lock:
        _status["done"] = True
        _status["detail"] = detail
        _status["error"] = error
    logger.info("OTA done: error=%s (%s)", error, detail)


def _version_tuple(version: str):
    """'2.7.19.bb3d6d5' -> (2, 7, 19); ignores the trailing git-hash part."""
    parts = version.split(".")[:3]
    return tuple(int(p) for p in parts)


def _candidate_board_slugs(hw_model: str):
    lower = hw_model.lower()
    return {lower, lower.replace("_", "-"), lower.replace("-", "_")}


def _resolve_board_and_platform(hw_model, manifest):
    """Map a protobuf HardwareModel name to a release board slug + platform.

    The manifest's board naming doesn't follow one consistent rule (some use
    dashes, some underscores, many discontinued/prototype models have no
    current build at all) so this only succeeds when exactly one candidate
    slug is present -- anything ambiguous or unmatched refuses rather than
    guessing which firmware to push.
    """
    boards = {t["board"]: t["platform"] for t in manifest["targets"]}
    candidates = _candidate_board_slugs(hw_model) & boards.keys()
    if len(candidates) != 1:
        raise RuntimeError(
            f"Can't confidently map hardware model '{hw_model}' to a firmware "
            f"build ({len(candidates)} candidate matches) -- update manually."
        )
    board = next(iter(candidates))
    return board, boards[board]


def _wait_for_version(target_version, timeout=90, interval=3):
    """Polls the DB (populated by mesh.py's own reconnect + firmware read)
    for the device coming back reporting target_version. Used when the OTA
    push's TCP connection dropped only after every byte had already been
    sent -- the device can legitimately reboot into the new firmware before
    it gets a chance to send a final ack back over a socket that's about to
    close anyway, so that kind of drop isn't proof of failure by itself.
    """
    deadline = time.time() + timeout
    my_id = mesh.get_my_node_id()
    if not my_id:
        return False
    while time.time() < deadline:
        with SessionLocal() as db:
            node = db.get(Node, my_id)
            if node and node.firmware_version == target_version:
                return True
        time.sleep(interval)
    return False


def _get_own_node():
    my_id = mesh.get_my_node_id()
    if not my_id:
        return None, None
    with SessionLocal() as db:
        node = db.get(Node, my_id)
        return node, my_id


def _latest_release():
    resp = requests.get(f"{GITHUB_API}/repos/{FIRMWARE_REPO}/releases/latest", timeout=15)
    resp.raise_for_status()
    return resp.json()


def _find_asset(assets, name):
    asset = next((a for a in assets if a["name"] == name), None)
    if asset is None:
        raise RuntimeError(f"Release is missing expected asset {name}")
    return asset


def _download(url, dest_path, on_progress=None):
    with requests.get(url, stream=True, timeout=30) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        downloaded = 0
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if on_progress and total:
                    on_progress(int(downloaded * 100 / total))


def _extract_ota_bin(zip_path, board, version, dest_path):
    # The plain (not ".factory.bin") image is the application-only OTA
    # payload; .factory.bin bundles the bootloader/partition table and is
    # only for a full USB reflash.
    member = f"firmware-{board}-{version}.bin"
    with zipfile.ZipFile(zip_path) as z:
        if member not in z.namelist():
            raise RuntimeError(f"Expected firmware file {member} not found in release zip")
        with z.open(member) as src, open(dest_path, "wb") as dst:
            while chunk := src.read(1024 * 1024):
                dst.write(chunk)


def _run_update():
    try:
        _set_phase("checking", "Checking device and available firmware")
        node, my_id = _get_own_node()
        if not node or not my_id:
            raise RuntimeError("Not connected to a device, or hardware model unknown")
        hw_model = node.hardware_model
        if not hw_model:
            raise RuntimeError("Not connected to a device, or hardware model unknown")

        current_version = node.firmware_version
        if not current_version or _version_tuple(current_version) < MIN_UNIFIED_OTA_VERSION:
            min_str = ".".join(str(p) for p in MIN_UNIFIED_OTA_VERSION)
            raise RuntimeError(
                f"Device firmware ({current_version or 'unknown'}) is older than {min_str} -- "
                "WiFi OTA isn't reliable before this version (the OTA-mode loader never "
                "receives WiFi credentials). Update via USB first."
            )

        interface = mesh.get_interface()
        if interface is None:
            raise RuntimeError("Not connected to the device")

        release = _latest_release()
        version = release["tag_name"].lstrip("v")
        assets = release["assets"]

        manifest_asset = _find_asset(assets, f"firmware-{version}.json")
        manifest = requests.get(manifest_asset["browser_download_url"], timeout=15).json()
        board, platform = _resolve_board_and_platform(hw_model, manifest)

        zip_asset = _find_asset(assets, f"firmware-{platform}-{version}.zip")

        with tempfile.TemporaryDirectory() as tmp:
            zip_path = os.path.join(tmp, "firmware.zip")
            bin_path = os.path.join(tmp, "firmware.bin")

            _set_phase("downloading", f"Downloading {platform} firmware ({version})", target_version=version, percent=0)
            _download(zip_asset["browser_download_url"], zip_path, on_progress=_set_percent)

            _set_percent(None)
            _extract_ota_bin(zip_path, board, version, bin_path)
            size = os.path.getsize(bin_path)
            if not (MIN_FIRMWARE_BYTES < size < MAX_FIRMWARE_BYTES):
                raise RuntimeError(f"Extracted firmware size ({size} bytes) looks wrong, aborting")

            # Device is only touched once a validated firmware file is in hand.
            ota = ESP32WiFiOTA(bin_path, mesh.MESHTASTIC_HOST)

            _set_phase("rebooting", "Rebooting device into OTA mode", target_version=version)
            interface.localNode.startOTA(admin_pb2.OTAMode.OTA_WIFI, ota.hash_bytes())
            time.sleep(10)  # let it reboot and reconnect to wifi in OTA mode

            _set_phase("flashing", "Pushing firmware over the network", target_version=version, percent=0)
            sent_all = False

            def on_progress(sent, total):
                nonlocal sent_all
                sent_all = sent >= total
                _set_percent(int(sent * 100 / total))

            try:
                ota.update(progress_callback=on_progress)
            except OTAError:
                # An explicit rejection from the device (e.g. hash mismatch)
                # -- not ambiguous, it really failed, no need to second-guess.
                raise
            except (ConnectionError, OSError) as exc:
                if not sent_all:
                    raise  # dropped mid-transfer -- genuinely didn't complete
                # Every byte was sent before the socket dropped. This is the
                # normal shape of a *successful* update too: the device can
                # reboot into the new firmware before it manages to send a
                # final ack back over a connection that's about to close
                # anyway. Don't trust the exception -- check what the device
                # actually reports once it reconnects.
                logger.info("Connection dropped after full transfer (%s) -- verifying actual result", exc)
                _set_phase("flashing", "Transfer finished, confirming device came back updated", target_version=version)
                if not _wait_for_version(version):
                    raise RuntimeError(
                        f"Firmware push completed but device didn't come back reporting {version}"
                    ) from exc

        _set_done(detail=f"Updated to {version}. Device is rebooting.")
    except Exception as exc:
        logger.exception("OTA update failed")
        _set_done(error=str(exc))


def start_update():
    """Returns False without starting anything if an update is already running."""
    with _status_lock:
        active = _status["phase"] != "idle" and not _status["done"]
        if active:
            return False
        _status.update(phase="checking", detail="", target_version=None, percent=None, done=False, error=None)
    threading.Thread(target=_run_update, daemon=True).start()
    return True
