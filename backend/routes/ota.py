from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import ota
from backend import firmware

router = APIRouter()


class ChannelBody(BaseModel):
    channel: str


class StartBody(BaseModel):
    allow_downgrade: bool = False


@router.get("/api/firmware/latest")
def latest_firmware():
    return firmware.get_summary()


@router.put("/api/firmware/channel")
def set_firmware_channel(body: ChannelBody):
    try:
        firmware.set_channel(body.channel)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Channel must be one of {', '.join(firmware.CHANNELS)}")
    return firmware.get_summary()


@router.post("/api/ota/start")
def start_ota(body: StartBody | None = None):
    if not ota.start_update(allow_downgrade=bool(body and body.allow_downgrade)):
        raise HTTPException(status_code=409, detail="An update is already in progress")
    return ota.get_status()


@router.get("/api/ota/status")
def ota_status():
    return ota.get_status()
