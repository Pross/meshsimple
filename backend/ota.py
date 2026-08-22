import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
import zipfile

import requests

from backend.database import SessionLocal
from backend.models import Node
from backend import mesh

logger = logging.getLogger(__name__)

FIRMWARE_REPO = "meshtastic/firmware"
GITHUB_API = "https://api.github.com"
ESPOTA_SCRIPT = os.path.join(os.path.dirname(__file__), "ota_assets", "espota.py")

MIN_FIRMWARE_BYTES = 100_000
MAX_FIRMWARE_BYTES = 4_000_000

_status_lock = threading.Lock()
_status = {"state": "idle", "detail": "", "target_version": None}


def get_status():
    with _status_lock:
        return dict(_status)


def _set_status(state, detail="", target_version=None):
    with _status_lock:
        _status["state"] = state
        _status["detail"] = detail
        if target_version is not None:
            _status["target_version"] = target_version
    logger.info("OTA status: %s (%s)", state, detail)


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


def _get_own_hw_model():
    my_id = mesh.get_my_node_id()
    if not my_id:
        return None, None
    with SessionLocal() as db:
        node = db.get(Node, my_id)
        return (node.hardware_model if node else None), my_id


def _latest_release():
    resp = requests.get(f"{GITHUB_API}/repos/{FIRMWARE_REPO}/releases/latest", timeout=15)
    resp.raise_for_status()
    return resp.json()


def _find_asset(assets, name):
    asset = next((a for a in assets if a["name"] == name), None)
    if asset is None:
        raise RuntimeError(f"Release is missing expected asset {name}")
    return asset


def _download(url, dest_path):
    with requests.get(url, stream=True, timeout=30) as resp:
        resp.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)


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
        _set_status("checking", "Checking device and available firmware")
        hw_model, my_id = _get_own_hw_model()
        if not hw_model or not my_id:
            raise RuntimeError("Not connected to a device, or hardware model unknown")

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

            _set_status("downloading", f"Downloading {platform} firmware ({version})", target_version=version)
            _download(zip_asset["browser_download_url"], zip_path)

            _set_status("downloading", "Extracting firmware image", target_version=version)
            _extract_ota_bin(zip_path, board, version, bin_path)
            size = os.path.getsize(bin_path)
            if not (MIN_FIRMWARE_BYTES < size < MAX_FIRMWARE_BYTES):
                raise RuntimeError(f"Extracted firmware size ({size} bytes) looks wrong, aborting")

            # Device is only touched once a validated firmware file is in hand.
            _set_status("rebooting", "Rebooting device into OTA mode", target_version=version)
            interface.localNode.rebootOTA(secs=5)
            time.sleep(10)  # let it reboot and reconnect to wifi in OTA mode

            _set_status("flashing", "Pushing firmware over the network", target_version=version)
            result = subprocess.run(
                [sys.executable, ESPOTA_SCRIPT, "-i", mesh.MESHTASTIC_HOST, "-f", bin_path, "-t", "30"],
                capture_output=True, text=True, timeout=180,
            )
            if result.returncode != 0:
                raise RuntimeError(f"espota failed: {result.stdout}\n{result.stderr}")

        _set_status("success", f"Updated to {version}. Device is rebooting.", target_version=version)
    except Exception as exc:
        logger.exception("OTA update failed")
        _set_status("error", str(exc))


def start_update():
    """Returns False without starting anything if an update is already running."""
    with _status_lock:
        if _status["state"] not in ("idle", "success", "error"):
            return False
        _status["state"] = "starting"
        _status["detail"] = ""
    threading.Thread(target=_run_update, daemon=True).start()
    return True
