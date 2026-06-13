from dotenv import load_dotenv
load_dotenv()

import logging
import os
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Forgebot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
static_dir = os.getenv("STATIC_DIR", "./static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


class SessionResponse(BaseModel):
    session_id: str
    user_id: str


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/session", response_model=SessionResponse)
async def get_session() -> SessionResponse:
    token = str(int(time.time() * 1000))
    return SessionResponse(session_id=f"session_{token}", user_id=f"user_{token}")


# ── Plan Mode router ────────────────────────────────────────────────────────

from plan_mode import router as plan_router
app.include_router(plan_router, prefix="/api/plan")

# Omi webhook also needs to be at /api/omi-webhook (root API path)
from plan_mode import omi_webhook
app.post("/api/omi-webhook")(omi_webhook)


# ── Sim router ──────────────────────────────────────────────────────────────

from sim import sim_router, ws_router
app.include_router(sim_router, prefix="/api/sim")
app.include_router(ws_router)


# ── Export routers ──────────────────────────────────────────────────────────

from adi_agent import router as adi_router
from design_rationale import router as rationale_router

app.include_router(adi_router, prefix="/api/export")
app.include_router(rationale_router, prefix="/api/export")


@app.get("/api/export/stl")
async def export_stl():
    stl_path = os.path.join(static_dir, "robot_current.stl")
    if os.path.exists(stl_path):
        return FileResponse(stl_path, media_type="model/stl", filename="robot_current.stl")
    return {"error": "No STL generated yet"}


# ── Stub routers for endpoints Tanush doesn't own yet ────────────────────────

@app.get("/api/scan/status")
async def scan_status_stub() -> dict:
    return {"loaded": False, "bounds": None, "vertex_count": None}

@app.get("/api/motion/status")
async def motion_status_stub() -> dict:
    return {"processed": False, "motion_params": None}


@app.get("/mobile")
async def mobile_page():
    mobile_path = os.path.join(static_dir, "mobile.html")
    if os.path.exists(mobile_path):
        return FileResponse(mobile_path)
    return {"error": "Mobile page not yet implemented"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
