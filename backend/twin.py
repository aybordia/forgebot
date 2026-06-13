"""
Photo-driven digital-twin spec generation.

Endpoint: POST /api/twin/analyze
    multipart upload: file=<image>
    returns: TwinSpec JSON used by frontend to rebuild the 3D scene.

Analysis is pure-local OpenCV (no external API). It extracts:
  - dominant palette via k-means → arm/fence colors
  - mean brightness + warmth → scene exposure/tone
  - edge density per horizontal band → arm count & depth perspective
  - aspect-ratio hint for camera framing
"""
from __future__ import annotations

import io
import logging
import time
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_image(data: bytes) -> np.ndarray:
    """Decode arbitrary upload (JPEG/PNG/WEBP/HEIC if PIL supports it) → BGR ndarray."""
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not decode image: {e}")
    arr = np.array(img)  # RGB
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    r, g, b = (max(0, min(255, int(v))) for v in rgb)
    return f"#{r:02x}{g:02x}{b:02x}"


def _is_industrial_color(rgb: tuple[float, float, float]) -> bool:
    """Filter out grays/blacks/whites — we want vibrant machine paint."""
    r, g, b = rgb
    mx, mn = max(r, g, b), min(r, g, b)
    if mx < 60:  # too dark
        return False
    if mn > 200:  # too bright (probably wall)
        return False
    if mx - mn < 25:  # not saturated enough
        return False
    return True


def _dominant_palette(img: np.ndarray, k: int = 6) -> list[tuple[int, int, int]]:
    """K-means dominant colors. Returns RGB tuples, most-frequent first."""
    small = cv2.resize(img, (160, 90), interpolation=cv2.INTER_AREA)
    pixels = small.reshape(-1, 3).astype(np.float32)  # BGR

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(
        pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS
    )

    counts = np.bincount(labels.flatten(), minlength=k)
    order = np.argsort(-counts)

    palette_rgb: list[tuple[int, int, int]] = []
    for idx in order:
        b, g, r = centers[idx]
        palette_rgb.append((int(r), int(g), int(b)))
    return palette_rgb


def _pick_machine_colors(palette: list[tuple[int, int, int]]) -> list[str]:
    """Pick up to 3 vibrant 'machine paint' colors from palette, hex format."""
    chosen: list[tuple[int, int, int]] = []
    for c in palette:
        if _is_industrial_color(c):
            chosen.append(c)
        if len(chosen) >= 3:
            break

    if not chosen:
        # Fallback: lift saturation on the most-frequent non-neutral color
        for c in palette:
            r, g, b = c
            if max(r, g, b) - min(r, g, b) > 10:
                chosen.append(c)
                break
        if not chosen:
            chosen = [(220, 110, 30)]  # safety orange

    return [_rgb_to_hex(c) for c in chosen]


def _pick_fence_color(palette: list[tuple[int, int, int]]) -> str:
    """Look for yellow/green safety colors. Fall back to industrial yellow."""
    best = None
    best_score = -1.0
    for r, g, b in palette:
        # Yellow/green-ish = high R+G, low B
        if r > 140 and g > 110 and b < 140:
            score = (r + g) - 2 * b
            if score > best_score:
                best_score = score
                best = (r, g, b)
    if best is None:
        return "#f2b705"
    return _rgb_to_hex(best)


def _scene_lighting(img: np.ndarray) -> dict[str, float]:
    """Mean brightness + warmth (red vs blue mean)."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    v_mean = float(hsv[:, :, 2].mean()) / 255.0  # 0..1
    b_mean = float(img[:, :, 0].mean())
    r_mean = float(img[:, :, 2].mean())
    warmth = (r_mean - b_mean) / 255.0  # -1..1
    return {
        "brightness": round(v_mean, 3),
        "warmth": round(warmth, 3),
        "exposure": round(0.9 + v_mean * 0.9, 3),  # 0.9..1.8 ranged for Three.js
    }


def _depth_density(img: np.ndarray) -> dict[str, float]:
    """Edge density on a horizontal band near the horizon → 'depth perspective'."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    h, w = edges.shape
    # Mid horizontal band, where machine line typically sits
    band = edges[int(h * 0.35) : int(h * 0.7), :]
    density = float(band.sum()) / float(band.size * 255)  # 0..1
    # Per-column density to detect verticals (machine bodies)
    col_density = (band.sum(axis=0) / 255).astype(np.float32)
    # Smooth and find peaks
    if col_density.size > 0:
        kernel = np.ones(max(3, w // 30), np.float32) / max(3, w // 30)
        smooth = np.convolve(col_density, kernel, mode="same")
        peaks = 0
        thresh = smooth.mean() + smooth.std() * 0.6
        prev_above = False
        for v in smooth:
            above = v > thresh
            if above and not prev_above:
                peaks += 1
            prev_above = above
        arm_count = int(max(3, min(7, peaks)))
    else:
        arm_count = 5
    return {"edge_density": round(density, 3), "arm_count": arm_count}


# ── TwinSpec ──────────────────────────────────────────────────────────────────

@dataclass
class TwinSpec:
    machine_colors: list[str]
    fence_color: str
    floor_color: str
    background_color: str
    exposure: float
    warmth: float
    arm_count: int
    has_conveyor: bool
    edge_density: float
    source_dims: tuple[int, int]

    def to_dict(self) -> dict[str, Any]:
        return {
            "machine_colors": self.machine_colors,
            "fence_color": self.fence_color,
            "floor_color": self.floor_color,
            "background_color": self.background_color,
            "exposure": self.exposure,
            "warmth": self.warmth,
            "arm_count": self.arm_count,
            "has_conveyor": self.has_conveyor,
            "edge_density": self.edge_density,
            "source_width": self.source_dims[0],
            "source_height": self.source_dims[1],
        }


def analyze_image(data: bytes) -> TwinSpec:
    img = _load_image(data)
    h, w = img.shape[:2]
    palette = _dominant_palette(img, k=6)
    machine = _pick_machine_colors(palette)
    fence = _pick_fence_color(palette)
    lighting = _scene_lighting(img)
    depth = _depth_density(img)

    # Floor and background = darkest two palette entries
    dark_sorted = sorted(palette, key=lambda c: sum(c))
    floor = _rgb_to_hex(dark_sorted[1] if len(dark_sorted) > 1 else dark_sorted[0])
    bg = _rgb_to_hex(dark_sorted[0])

    return TwinSpec(
        machine_colors=machine,
        fence_color=fence,
        floor_color=floor,
        background_color=bg,
        exposure=lighting["exposure"],
        warmth=lighting["warmth"],
        arm_count=depth["arm_count"],
        has_conveyor=depth["edge_density"] > 0.05,
        edge_density=depth["edge_density"],
        source_dims=(w, h),
    )


# ── Route ────────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze(file: UploadFile = File(...)) -> dict:
    t0 = time.monotonic()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (>25 MB)")

    spec = analyze_image(data)
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    logger.info(f"Twin analysis done in {elapsed_ms}ms: {spec.to_dict()}")
    return {"spec": spec.to_dict(), "analysis_ms": elapsed_ms}
