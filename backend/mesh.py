import asyncio
import logging
import os
import time
from datetime import datetime, timezone, timedelta

from pubsub import pub

from sqlalchemy import select
from backend.database import SessionLocal
from backend.models import Message, Node, Position

logger = logging.getLogger(__name__)

MESHTASTIC_HOST = os.environ.get("MESHTASTIC_HOST", "")
MESHTASTIC_PORT = int(os.environ.get("MESHTASTIC_PORT", "4403"))

_interface = None
_my_node_id = ""  # populated after first successful connect
_loop = None  # asyncio.AbstractEventLoop
_broadcast_fn = None  # set by main.py after startup


def set_broadcast(fn):
    global _broadcast_fn
    _broadcast_fn = fn


def _node_id_str(num: int) -> str:
    return f"!{num:08x}"


def _upsert_node(db, node_id: str, **kwargs) -> Node:
    node = db.get(Node, node_id)
    if node is None:
        node = Node(node_id=node_id)
        db.add(node)
    for key, value in kwargs.items():
        if value is not None:
            setattr(node, key, value)
    db.commit()
    db.refresh(node)
    return node


def _schedule_broadcast(data: dict):
    if _broadcast_fn and _loop:
        asyncio.run_coroutine_threadsafe(_broadcast_fn(data), _loop)


def on_receive(packet, interface):
    try:
        decoded = packet.get("decoded", {})
        portnum = decoded.get("portnum", "")
        from_id = packet.get("fromId") or _node_id_str(packet.get("from", 0))
        snr = packet.get("rxSnr")
        hops_away = packet.get("hopLimit")

        with SessionLocal() as db:
            if portnum == "TEXT_MESSAGE_APP":
                text = decoded.get("text", "")
                # Dedup: skip if same node sent identical text within 30s
                cutoff = datetime.now(timezone.utc) - timedelta(seconds=30)
                duplicate = db.scalar(
                    select(Message).where(
                        Message.from_node_id == from_id,
                        Message.text == text,
                        Message.timestamp >= cutoff,
                    )
                )
                if duplicate:
                    return
                reply_id = decoded.get("replyId") or decoded.get("reply_id") or None
                node = _upsert_node(
                    db, from_id, last_heard=datetime.now(timezone.utc), snr=snr
                )
                msg = Message(
                    from_node_id=from_id,
                    to_node_id=None,
                    channel=packet.get("channel", 0),
                    text=text,
                    timestamp=datetime.now(timezone.utc),
                    direction="in",
                    reply_id=reply_id,
                )
                db.add(msg)
                db.commit()
                db.refresh(msg)
                _schedule_broadcast({"type": "message", "data": msg.to_dict()})
                _schedule_broadcast({"type": "node_update", "data": node.to_dict()})

            elif portnum == "POSITION_APP":
                pos = decoded.get("position", {})
                lat = pos.get("latitudeI", 0) / 1e7 if pos.get("latitudeI") else None
                lon = pos.get("longitudeI", 0) / 1e7 if pos.get("longitudeI") else None
                if lat and lon:
                    node = _upsert_node(
                        db,
                        from_id,
                        lat=lat,
                        lon=lon,
                        last_heard=datetime.now(timezone.utc),
                        snr=snr,
                        hops_away=hops_away,
                    )
                    position = Position(
                        node_id=from_id,
                        lat=lat,
                        lon=lon,
                        timestamp=datetime.now(timezone.utc),
                    )
                    db.add(position)
                    db.commit()
                    _schedule_broadcast({"type": "node_update", "data": node.to_dict()})

            elif portnum == "NODEINFO_APP":
                info = decoded.get("user", {})
                node = _upsert_node(
                    db,
                    from_id,
                    short_name=info.get("shortName"),
                    long_name=info.get("longName"),
                    hardware_model=info.get("hwModel"),
                    last_heard=datetime.now(timezone.utc),
                    snr=snr,
                    hops_away=hops_away,
                )
                _schedule_broadcast({"type": "node_update", "data": node.to_dict()})

            elif portnum == "TELEMETRY_APP":
                telemetry = decoded.get("telemetry", {})
                device = telemetry.get("deviceMetrics", {})
                battery = device.get("batteryLevel")
                voltage = device.get("voltage")
                if battery is not None or voltage is not None:
                    node = _upsert_node(
                        db,
                        from_id,
                        battery_level=battery,
                        voltage=voltage,
                        last_heard=datetime.now(timezone.utc),
                    )
                    _schedule_broadcast({"type": "node_update", "data": node.to_dict()})

    except Exception:
        logger.exception("Error processing packet")


def _seed_nodes_from_interface(interface):
    """Seed node table from the device's local node database on first connect."""
    try:
        nodes = interface.nodes
        if not nodes:
            return
        with SessionLocal() as db:
            for node_num, info in nodes.items():
                node_id = _node_id_str(node_num) if isinstance(node_num, int) else node_num
                user = info.get("user", {})
                pos = info.get("position", {})
                lat = pos.get("latitudeI", 0) / 1e7 if pos.get("latitudeI") else None
                lon = pos.get("longitudeI", 0) / 1e7 if pos.get("longitudeI") else None
                last_heard_ts = info.get("lastHeard")
                last_heard = (
                    datetime.fromtimestamp(last_heard_ts, tz=timezone.utc)
                    if last_heard_ts
                    else None
                )
                _upsert_node(
                    db,
                    node_id,
                    short_name=user.get("shortName"),
                    long_name=user.get("longName"),
                    hardware_model=user.get("hwModel"),
                    lat=lat,
                    lon=lon,
                    last_heard=last_heard,
                    snr=info.get("snr"),
                    hops_away=info.get("hopsAway"),
                )
        logger.info("Seeded %d nodes from device", len(nodes))
    except Exception:
        logger.exception("Failed to seed nodes from interface")


def get_my_node_id() -> str:
    return _my_node_id


def _read_my_node_id(interface) -> str:
    try:
        my_num = interface.myInfo.my_node_num
        return _node_id_str(my_num)
    except Exception:
        return ""


def _read_own_firmware(interface):
    """Read firmware version from own node via admin request."""
    if not _my_node_id:
        return
    try:
        meta = interface.localNode.getMetadata()
        firmware = getattr(meta, "firmware_version", None)
        if firmware:
            with SessionLocal() as db:
                _upsert_node(db, _my_node_id, firmware_version=firmware)
            logger.info("Firmware version: %s", firmware)
    except Exception:
        logger.debug("Could not read firmware version")


def connect_loop():
    global _interface, _my_node_id
    import meshtastic.tcp_interface

    pub.subscribe(on_receive, "meshtastic.receive")

    while True:
        try:
            logger.info("Connecting to %s:%s", MESHTASTIC_HOST, MESHTASTIC_PORT)
            _interface = meshtastic.tcp_interface.TCPInterface(
                hostname=MESHTASTIC_HOST, portNumber=MESHTASTIC_PORT
            )
            logger.info("Connected to Meshtastic device")
            _my_node_id = _read_my_node_id(_interface)
            if _my_node_id:
                logger.info("My node ID: %s", _my_node_id)
            _seed_nodes_from_interface(_interface)
            _read_own_firmware(_interface)
            # Keep thread alive — meshtastic uses pubsub callbacks
            # Disconnects surface naturally as exceptions on the interface
            while True:
                time.sleep(60)
        except Exception:
            logger.exception("Meshtastic connection failed, retrying in 5s")
            try:
                if _interface:
                    _interface.close()
            except Exception:
                pass
            _interface = None
            time.sleep(5)


def get_interface():
    return _interface


def send_message(text: str):
    if _interface is None:
        raise RuntimeError("Not connected to Meshtastic device")
    _interface.sendText(text, channelIndex=0)


def set_event_loop(loop):
    global _loop
    _loop = loop
