from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class Node(Base):
    __tablename__ = "nodes"

    node_id: Mapped[str] = mapped_column(String, primary_key=True)
    short_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    long_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_heard: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    snr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hops_away: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hardware_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    voltage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    firmware_version: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    def to_dict(self):
        return {
            "node_id": self.node_id,
            "short_name": self.short_name,
            "long_name": self.long_name,
            "last_heard": self.last_heard.isoformat() if self.last_heard else None,
            "lat": self.lat,
            "lon": self.lon,
            "battery_level": self.battery_level,
            "snr": self.snr,
            "hops_away": self.hops_away,
            "hardware_model": self.hardware_model,
            "voltage": self.voltage,
            "firmware_version": self.firmware_version,
        }


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_node_id: Mapped[str] = mapped_column(String, ForeignKey("nodes.node_id"))
    to_node_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    channel: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(String)
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    direction: Mapped[str] = mapped_column(String)  # "in" or "out"
    reply_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "channel": self.channel,
            "text": self.text,
            "timestamp": self.timestamp.isoformat(),
            "direction": self.direction,
            "reply_id": self.reply_id,
        }


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    node_id: Mapped[str] = mapped_column(String, ForeignKey("nodes.node_id"))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime)
