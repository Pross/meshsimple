import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.database import get_db
from backend.models import Node
from backend import mesh

router = APIRouter()

DEFAULT_REACTION_EMOJIS = ['👍', '👎', '❤️', '😂', '😮']


@router.get("/api/config")
def get_config():
    raw = os.environ.get("REACTION_EMOJIS", "")
    emojis = [e.strip() for e in raw.split(",") if e.strip()] if raw else DEFAULT_REACTION_EMOJIS
    return {
        "my_node_id": mesh.get_my_node_id(),
        "reaction_emojis": emojis,
    }


@router.get("/api/nodes")
def list_nodes(db: Session = Depends(get_db)):
    nodes = db.scalars(select(Node)).all()
    return [n.to_dict() for n in nodes]


@router.get("/api/nodes/{node_id}")
def get_node(node_id: str, db: Session = Depends(get_db)):
    node = db.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node.to_dict()
