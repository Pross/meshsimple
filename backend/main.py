import asyncio
import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.database import Base, engine, run_migrations
from backend.routes import nodes, messages, reactions, ws
from backend import mesh

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)

    # Give mesh.py access to the running event loop for thread-safe broadcasts
    loop = asyncio.get_event_loop()
    mesh.set_event_loop(loop)
    mesh.set_broadcast(ws.manager.broadcast)

    if os.environ.get("MESHTASTIC_HOST"):
        thread = threading.Thread(target=mesh.connect_loop, daemon=True)
        thread.start()
    else:
        logging.warning("MESHTASTIC_HOST not set — running without device connection")

    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nodes.router)
app.include_router(messages.router)
app.include_router(reactions.router)
app.include_router(ws.router)

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
