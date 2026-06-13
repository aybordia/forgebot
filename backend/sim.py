import asyncio
import io
import json
import logging
import math
import os
import struct
import time
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

import backboard_memory
import plan_mode

logger = logging.getLogger(__name__)

sim_router = APIRouter()
ws_router = APIRouter()

# ── Module state ────────────────────────────────────────────────────────────

sim_running: bool = False
sim_step: int = 0
current_fps: float = 0.0
best_score: float = 0.0
gpu_available: bool = False

ws_clients: set[WebSocket] = set()
latest_frame: bytes = b""
_sim_task: Optional[asyncio.Task] = None

# Current CAD params (updated by corrections)
params_used: dict = {
    "arm_length_m": 0.98,
    "gripper_width_m": 0.075,
    "link_radius_m": 0.015,
    "dof": 4,
    "gripper_type": "parallel",
}


class CorrectionRequest(BaseModel):
    correction: str
    user_id: str = "default-user"


# ── Frame generation (Layer 1: always-working stub) ─────────────────────────

def _generate_stub_frame(step: int, width: int = 640, height: int = 480) -> bytes:
    """Generate a minimal valid JPEG frame with animated content."""
    try:
        import numpy as np
        frame = np.zeros((height, width, 3), dtype=np.uint8)

        # Dark gradient background
        for y in range(height):
            v = int(20 + 15 * (y / height))
            frame[y, :] = [v, v, v + 5]

        # Animated ground plane grid
        grid_y = height * 3 // 4
        frame[grid_y - 1 : grid_y + 1, :] = [60, 60, 70]
        for x in range(0, width, 40):
            offset = (step * 2) % 40
            xp = (x + offset) % width
            frame[grid_y - 20 : grid_y, max(0, xp) : min(width, xp + 1)] = [40, 40, 50]

        # Animated robot arm (simple lines)
        cx = width // 2
        base_y = grid_y - 5
        angle = math.sin(step * 0.05) * 0.4
        arm_len = 120
        ex = int(cx + arm_len * math.sin(angle))
        ey = int(base_y - arm_len * math.cos(angle))

        # Draw arm line
        steps_line = max(abs(ex - cx), abs(ey - base_y), 1)
        for i in range(steps_line):
            px = int(cx + (ex - cx) * i / steps_line)
            py = int(base_y + (ey - base_y) * i / steps_line)
            if 0 <= px < width - 2 and 0 <= py < height - 2:
                frame[py : py + 3, px : px + 3] = [50, 150, 230]

        # Joint dot
        frame[max(0, ey - 3) : min(height, ey + 4), max(0, ex - 3) : min(width, ex + 4)] = [80, 200, 255]

        # Base
        frame[max(0, base_y - 5) : min(height, base_y + 6), max(0, cx - 15) : min(width, cx + 16)] = [100, 100, 120]

        # Encode to JPEG
        import cv2
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        return buf.tobytes()
    except ImportError:
        return _generate_minimal_jpeg()


def _generate_minimal_jpeg() -> bytes:
    """Fallback: 1x1 gray JPEG when numpy/cv2 unavailable."""
    return (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
        b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
        b"\x1f\x1e\x1d\x1a\x1c\x1c $.\' ',#\x1c\x1c(7),01444\x1f\'9=82<.342"
        b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00"
        b"\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00"
        b"\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b"
        b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00T\xdb\x9e\x97\xf0\xff\xd9"
    )


# ── Sim loop ────────────────────────────────────────────────────────────────

async def _sim_loop():
    global sim_running, sim_step, current_fps, best_score, latest_frame

    sim_running = True
    sim_step = 0
    best_score = 0.0
    target_dt = 1 / 30  # 30 fps target

    logger.info("Sim loop started")

    while sim_running:
        t0 = time.monotonic()
        sim_step += 1

        # Generate frame
        latest_frame = _generate_stub_frame(sim_step)

        # Simulated score that improves over time
        best_score = min(0.95, 0.3 + 0.005 * sim_step + 0.02 * math.sin(sim_step * 0.1))

        # Broadcast to WebSocket clients
        dead: list[WebSocket] = []
        status_json = json.dumps({
            "fps": round(current_fps, 1),
            "step": sim_step,
            "score": round(best_score, 3),
            "gpu_util_pct": 45.0 if gpu_available else 0.0,
        })

        for ws in list(ws_clients):
            try:
                await ws.send_text(status_json)
                await ws.send_bytes(latest_frame)
            except Exception:
                dead.append(ws)

        for ws in dead:
            ws_clients.discard(ws)

        elapsed = time.monotonic() - t0
        current_fps = 1.0 / max(elapsed, 0.001)
        sleep_time = max(0, target_dt - elapsed)
        await asyncio.sleep(sleep_time)

    logger.info("Sim loop stopped")


# ── Correction parsing ──────────────────────────────────────────────────────

CORRECTION_RULES: dict[str, dict] = {
    "reach": {"param": "arm_length_m", "delta": 0.15, "keywords": ["reach", "longer", "extend", "further"]},
    "grip": {"param": "gripper_width_m", "delta": 0.03, "keywords": ["grip", "wider", "widen", "gripper", "open"]},
    "thick": {"param": "link_radius_m", "delta": 0.005, "keywords": ["thick", "stronger", "sturdy", "beef"]},
    "thin": {"param": "link_radius_m", "delta": -0.003, "keywords": ["thin", "lighter", "slim"]},
    "short": {"param": "arm_length_m", "delta": -0.1, "keywords": ["short", "shorter", "compact", "reduce"]},
    "narrow": {"param": "gripper_width_m", "delta": -0.02, "keywords": ["narrow", "tighter", "close"]},
}


def parse_correction(correction: str) -> dict[str, float]:
    text = correction.lower()
    changes: dict[str, float] = {}
    for rule in CORRECTION_RULES.values():
        if any(kw in text for kw in rule["keywords"]):
            param = rule["param"]
            current = params_used.get(param, 0.0)
            changes[param] = round(current + rule["delta"], 4)
    if not changes:
        changes = {"arm_length_m": round(params_used["arm_length_m"] + 0.1, 4)}
    return changes


# ── Routes ──────────────────────────────────────────────────────────────────

@sim_router.post("/load")
async def load_sim() -> dict:
    global _sim_task, sim_running

    if sim_running and _sim_task and not _sim_task.done():
        return {
            "status": "already_running",
            "sim_fps": round(current_fps, 1),
            "parallel_variants": 512 if gpu_available else 1,
            "best_variant_score": round(best_score, 3),
        }

    # Ensure placeholder STL exists
    static_dir = os.getenv("STATIC_DIR", "./static")
    stl_path = os.path.join(static_dir, "robot_current.stl")
    if not os.path.exists(stl_path):
        os.makedirs(static_dir, exist_ok=True)
        with open(stl_path, "w") as f:
            f.write("solid placeholder\nendsolid placeholder\n")

    _sim_task = asyncio.create_task(_sim_loop())

    return {
        "status": "running",
        "sim_fps": 30,
        "parallel_variants": 512 if gpu_available else 1,
        "best_variant_score": 0.0,
    }


@sim_router.post("/stop")
async def stop_sim() -> dict:
    global sim_running
    sim_running = False
    return {"status": "stopped"}


@sim_router.get("/status")
async def get_status() -> dict:
    return {
        "running": sim_running,
        "fps": round(current_fps, 1),
        "step": sim_step,
        "best_score": round(best_score, 3),
    }


@sim_router.post("/correct")
async def correct_sim(req: CorrectionRequest) -> dict:
    global params_used

    params_before = dict(params_used)
    changes = parse_correction(req.correction)

    for k, v in changes.items():
        params_used[k] = v

    # Log correction to Backboard memory
    try:
        await backboard_memory.log_correction(
            req.user_id, req.correction, params_before, params_used
        )
    except Exception as e:
        logger.warning(f"Failed to log correction to Backboard: {e}")

    return {
        "status": "updated",
        "param_changes": changes,
        "new_stl_url": "/static/robot_current.stl",
    }


# ── WebSocket ───────────────────────────────────────────────────────────────

@ws_router.websocket("/ws/sim")
async def ws_sim(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    logger.info(f"WebSocket client connected ({len(ws_clients)} total)")

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)
        logger.info(f"WebSocket client disconnected ({len(ws_clients)} total)")
