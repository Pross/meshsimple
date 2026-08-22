from fastapi import APIRouter, HTTPException

from backend import ota
from backend import firmware

router = APIRouter()


@router.get("/api/firmware/latest")
def latest_firmware():
    return firmware.get_latest()


@router.post("/api/ota/start")
def start_ota():
    if not ota.start_update():
        raise HTTPException(status_code=409, detail="An update is already in progress")
    return ota.get_status()


@router.get("/api/ota/status")
def ota_status():
    return ota.get_status()
