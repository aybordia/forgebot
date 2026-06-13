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


# ── Stub routers for endpoints Tanush doesn't own yet ────────────────────────
# These stubs keep the app runnable before Ayan's slices are merged.

@app.get("/api/scan/status")
async def scan_status_stub() -> dict:
    logger.info("Using foundation stub for /api/scan/status")
    return {"loaded": False, "bounds": None, "vertex_count": None}

@app.get("/api/motion/status")
async def motion_status_stub() -> dict:
    logger.info("Using foundation stub for /api/motion/status")
    return {"processed": False, "motion_params": None}

@app.get("/api/sim/status")
async def sim_status_stub() -> dict:
    logger.info("Using foundation stub for /api/sim/status")
    return {"running": False, "fps": 0, "step": 0, "best_score": 0.0}

@app.post("/api/sim/load")
async def sim_load_stub() -> dict:
    logger.info("Using foundation stub for /api/sim/load")
    return {"status": "not_implemented", "sim_fps": 0, "parallel_variants": 0, "best_variant_score": 0.0}

@app.post("/api/sim/correct")
async def sim_correct_stub() -> dict:
    logger.info("Using foundation stub for /api/sim/correct")
    return {"status": "not_implemented", "param_changes": {}, "new_stl_url": ""}

@app.post("/api/sim/stop")
async def sim_stop_stub() -> dict:
    return {"status": "stopped"}

@app.get("/api/export/bom")
async def bom_stub() -> dict:
    logger.info("Using foundation stub for /api/export/bom")
    return {"bom": [], "error": "No robot spec generated yet"}

@app.get("/api/export/rationale")
async def rationale_stub() -> dict:
    logger.info("Using foundation stub for /api/export/rationale")
    return {"explanations": [], "error": "Run CAD generation first"}

@app.get("/api/export/stl")
async def export_stl_stub():
    stl_path = os.path.join(static_dir, "robot_current.stl")
    if os.path.exists(stl_path):
        return FileResponse(stl_path, media_type="model/stl", filename="robot_current.stl")
    return {"error": "No STL generated yet"}

@app.get("/mobile")
async def mobile_page():
    mobile_path = os.path.join(static_dir, "mobile.html")
    if os.path.exists(mobile_path):
        return FileResponse(mobile_path)
    return {"error": "Mobile page not yet implemented"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
