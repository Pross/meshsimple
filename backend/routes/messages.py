from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, update, func

from backend.database import get_db
from backend.models import Message, Node
from backend import mesh

router = APIRouter()


class SendMessageRequest(BaseModel):
    text: str


@router.get("/api/messages")
def list_messages(db: Session = Depends(get_db)):
    messages = db.scalars(
        select(Message)
        .where(Message.channel == 0)
        .order_by(Message.timestamp.desc())
        .limit(200)
    ).all()
    return [m.to_dict() for m in reversed(messages)]


@router.get("/api/messages/unread-count")
def unread_count(db: Session = Depends(get_db)):
    count = db.scalar(
        select(func.count()).select_from(Message).where(
            Message.direction == "in",
            Message.read_at == None,  # noqa: E711
            Message.channel == 0,
        )
    )
    return {"count": count or 0}


@router.post("/api/messages/mark-read")
def mark_read(db: Session = Depends(get_db)):
    db.execute(
        update(Message)
        .where(Message.direction == "in", Message.read_at == None)  # noqa: E711
        .values(read_at=datetime.now(timezone.utc))
    )
    db.commit()
    return {"ok": True}


@router.post("/api/messages")
async def send_message(body: SendMessageRequest, db: Session = Depends(get_db)):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Message text cannot be empty")

    try:
        mesh.send_message(body.text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    my_node_id = mesh.get_my_node_id() or "local"

    # Ensure own node exists in DB so the FK constraint doesn't fail
    if db.get(Node, my_node_id) is None:
        db.add(Node(node_id=my_node_id, short_name="You"))
        db.commit()

    msg = Message(
        from_node_id=my_node_id,
        to_node_id=None,
        channel=0,
        text=body.text,
        timestamp=datetime.now(timezone.utc),
        direction="out",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    from backend.routes.ws import manager
    await manager.broadcast({"type": "message", "data": msg.to_dict()})

    return msg.to_dict()
