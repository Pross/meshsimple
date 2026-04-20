from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.database import get_db
from backend.models import Message, MessageReaction
from backend import mesh

router = APIRouter()


class ReactionRequest(BaseModel):
    emoji: str


@router.post("/api/messages/{message_id}/reactions")
def toggle_reaction(message_id: int, body: ReactionRequest, db: Session = Depends(get_db)):
    if not body.emoji.strip():
        raise HTTPException(status_code=400, detail="Emoji required")

    if db.get(Message, message_id) is None:
        raise HTTPException(status_code=404, detail="Message not found")

    node_id = mesh.get_my_node_id() or "local"

    existing = db.scalar(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.node_id == node_id,
            MessageReaction.emoji == body.emoji,
        )
    )

    if existing:
        db.delete(existing)
    else:
        db.add(MessageReaction(
            message_id=message_id,
            node_id=node_id,
            emoji=body.emoji,
            timestamp=datetime.now(timezone.utc),
        ))

    db.commit()

    reactions = db.scalars(
        select(MessageReaction).where(MessageReaction.message_id == message_id)
    ).all()
    return [r.to_dict() for r in reactions]
