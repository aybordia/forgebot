# BACKEND_SPEC.md — Forgebot Backend Specification

> **Claude Code norm:** After every set of changes, always `git add -A && git commit -m "<message>" && git push` to https://github.com/aybordia/forgebot before stopping.

---

## Global Rules for Claude Code

- All Python files live in `forgebot/backend/`
- All functions must have full type hints
- Logging via `import logging; logger = logging.getLogger(__name__)` — no print() statements
- Every route returns a Pydantic response model — never a raw dict
- Static files (STL, compiled meshes) go in `forgebot/backend/static/`
- Temp files go in `/tmp/` — never in the project directory
- If an operation takes >2 seconds, it must be async and run in a `ThreadPoolExecutor` via `asyncio.get_event_loop().run_in_executor()`

---

## File: `main.py`

The FastAPI application entry point. Mounts all routes, static files, and WebSocket. Must import and include routers from every other module.

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Forgebot API", version="1.0.0")

# CORS — allow all origins (hackathon, no auth needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Routers
from plan_mode import router as plan_router
from pipeline_a import router as pipeline_a_router
from pipeline_b import router as pipeline_b_router
from sim import router as sim_router, ws_router
from adi_agent import router as adi_router
from backboard import router as backboard_router

app.include_router(plan_router, prefix="/api/plan")
app.include_router(pipeline_a_router, prefix="/api/scan")
app.include_router(pipeline_b_router, prefix="/api")
app.include_router(sim_router, prefix="/api/sim")
app.include_router(ws_router)      # WebSocket has no prefix — handles /ws/sim
app.include_router(adi_router, prefix="/api/export")
app.include_router(backboard_router, prefix="/api/export")

@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
```

---

## File: `plan_mode.py`

Handles Omi webhook, voice conversation, and robot spec extraction via Mistral 7B (Ollama).

### Module-level state
```python
# Key: session_id (str), Value: list of {"role": "user"|"assistant", "content": str}
conversation_history: dict[str, list[dict]] = {}

# Key: session_id, Value: robot spec dict or None
robot_specs: dict[str, dict | None] = {}
```

### Pydantic Models
```python
from pydantic import BaseModel
from typing import Optional

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"

class OmiWebhookRequest(BaseModel):
    transcript: str
    session_id: str = "omi-default"

class RobotSpec(BaseModel):
    task: str
    payload_kg: float
    mounted: bool
    reach_cm: float
    dof: int                    # 3, 4, 5, or 6
    gripper_type: str           # "parallel" or "adaptive"
    notes: str = ""

class ChatResponse(BaseModel):
    reply: str
    is_complete: bool
    robot_spec: Optional[RobotSpec] = None
```

### System prompt (exact string — do not modify)
```python
SYSTEM_PROMPT = """You are a robot design assistant. Ask the user clarifying questions ONE AT A TIME to understand what robot they need. When you have enough information, output a JSON robot spec. Keep ALL responses under 2 sentences — they will be spoken aloud. Be conversational and friendly.

When you have enough information, output ONLY this JSON (no other text) and nothing else:
{"task": "...", "payload_kg": X.X, "mounted": true/false, "reach_cm": X, "dof": X, "gripper_type": "parallel" or "adaptive", "notes": "..."}

Ask about these topics in order, one at a time:
1. What task should the robot perform?
2. How heavy are the objects it needs to handle? (respond with number in kg)
3. Does it stay fixed to a surface or move around?
4. How far does it need to reach? (respond in cm)
5. Any size or space constraints?

After question 5 you have enough information. Output the JSON spec."""
```

### Functions

```python
def get_ollama_response(session_id: str, user_message: str) -> str:
    """
    Appends user_message to conversation_history[session_id].
    Sends full history to Ollama /api/chat endpoint (Mistral 7B).
    Appends assistant reply to history.
    Returns reply string.

    Parameters:
        session_id: str — identifies the conversation
        user_message: str — latest user input

    Returns:
        str — Mistral's reply

    Raises:
        HTTPException(503) if Ollama is not reachable
    """
    import requests

    if session_id not in conversation_history:
        conversation_history[session_id] = []
        robot_specs[session_id] = None

    conversation_history[session_id].append({"role": "user", "content": user_message})

    payload = {
        "model": "mistral",
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}]
                     + conversation_history[session_id],
        "stream": False
    }

    response = requests.post("http://localhost:11434/api/chat", json=payload, timeout=30)
    # response.json() = {"message": {"role": "assistant", "content": "..."}, ...}
    reply = response.json()["message"]["content"]
    conversation_history[session_id].append({"role": "assistant", "content": reply})
    return reply


def try_extract_spec(reply: str) -> dict | None:
    """
    Attempts to parse a JSON robot spec from the reply string.
    Returns parsed dict if valid, None otherwise.
    Looks for a {...} block anywhere in the reply.

    Parameters:
        reply: str — Mistral's response text

    Returns:
        dict | None
    """
    import re, json
    match = re.search(r'\{[^{}]+\}', reply, re.DOTALL)
    if not match:
        return None
    try:
        spec = json.loads(match.group())
        # Validate required keys
        required = {"task", "payload_kg", "mounted", "reach_cm", "dof", "gripper_type"}
        if not required.issubset(spec.keys()):
            return None
        return spec
    except json.JSONDecodeError:
        return None
```

### Routes

```python
from fastapi import APIRouter, HTTPException
router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def plan_chat(req: ChatRequest) -> ChatResponse:
    """
    Main conversation endpoint. Call for every user message.
    Returns reply + whether spec is complete + spec if complete.
    """

@router.post("/omi-webhook", response_model=ChatResponse)
async def omi_webhook(req: OmiWebhookRequest) -> ChatResponse:
    """
    Exactly the same logic as /chat but accepts Omi device format.
    Maps req.transcript → ChatRequest.message.
    """

@router.get("/spec/{session_id}")
async def get_spec(session_id: str) -> dict:
    """Returns {"spec": robot_spec_dict_or_null}"""

@router.delete("/reset/{session_id}")
async def reset_session(session_id: str) -> dict:
    """Clears history and spec. Returns {"status": "reset"}"""
```

---

## File: `pipeline_a.py`

Environment scan mesh upload, cleaning, and MuJoCo loading.

### Module-level state
```python
import trimesh
import numpy as np

# Shared across modules — sim.py also reads this
environment_mesh: trimesh.Trimesh | None = None
environment_bounds: dict | None = None  # {"min": [x,y,z], "max": [x,y,z]}
```

### Pydantic Models
```python
class ScanUploadResponse(BaseModel):
    status: str
    mesh_bounds: dict          # {"min": [x,y,z], "max": [x,y,z]}
    vertex_count: int
    cleaned_vertex_count: int
```

### Functions

```python
def clean_mesh(filepath: str) -> trimesh.Trimesh:
    """
    Loads .obj file from filepath using trimesh.
    Applies: process=True (merges vertices, fixes winding), 
             remove_duplicate_faces=True,
             fill_holes=True.
    Verifies mesh is watertight. If not, logs warning but continues.
    Applies uniform scale: if mesh largest dimension > 20m or < 0.5m,
      scale to fit in 10m×10m×5m box (divide all vertices by max_dim * 0.1).
    Returns cleaned trimesh.Trimesh object.

    Parameters:
        filepath: str — absolute path to .obj file

    Returns:
        trimesh.Trimesh

    Raises:
        ValueError if file is empty or unparseable
    """

def mesh_to_mujoco_xml(mesh: trimesh.Trimesh, output_stl_path: str) -> str:
    """
    Exports trimesh to STL at output_stl_path.
    Returns a MuJoCo XML snippet (string) for loading this mesh as a static body:

    <body name="environment" pos="0 0 0">
      <geom type="mesh" mesh="environment" mass="0" contype="1" conaffinity="1"/>
    </body>

    The caller is responsible for including this in the full model XML.

    Parameters:
        mesh: trimesh.Trimesh — cleaned environment mesh
        output_stl_path: str — path to save the STL

    Returns:
        str — MuJoCo XML body snippet
    """

def get_bounds_dict(mesh: trimesh.Trimesh) -> dict:
    """
    Returns {"min": [x,y,z], "max": [x,y,z]} from mesh.bounds.
    All values rounded to 3 decimal places.
    """
```

### Routes

```python
from fastapi import APIRouter, UploadFile, File, HTTPException
import shutil, os

router = APIRouter()

@router.post("/upload", response_model=ScanUploadResponse)
async def upload_scan(file: UploadFile = File(...)) -> ScanUploadResponse:
    """
    Saves uploaded file to /tmp/environment.obj (always overwrite).
    Calls clean_mesh() in executor (blocking).
    Sets module-level environment_mesh and environment_bounds.
    Exports cleaned mesh to /tmp/environment_clean.stl.
    Returns bounds and vertex counts.
    Accepted content types: .obj only. Reject others with 400.
    """

@router.get("/status")
async def scan_status() -> dict:
    """Returns {"loaded": bool, "bounds": dict|null, "vertex_count": int|null}"""
```

---

## File: `pipeline_b.py`

Video upload, MediaPipe GPU pose extraction, motion parameter computation.

### MediaPipe GPU Configuration (exact setup)
```python
import mediapipe as mp
import cv2
import numpy as np

# Initialize MediaPipe Pose with GPU backend
mp_pose = mp.solutions.pose

def get_pose_estimator():
    """
    Returns a MediaPipe Pose instance configured for GPU.
    Use as context manager: `with get_pose_estimator() as pose: ...`
    
    Config:
        static_image_mode=False      (video mode, temporal smoothing)
        model_complexity=2           (most accurate model)
        smooth_landmarks=True
        min_detection_confidence=0.7
        min_tracking_confidence=0.5
    """
    return mp_pose.Pose(
        static_image_mode=False,
        model_complexity=2,
        smooth_landmarks=True,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.5
    )
```

### Landmark Index Reference
```python
# MediaPipe landmark indices used in Forgebot
LANDMARK_INDICES = {
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_index": 19,   # fingertip proxy for gripper
    "right_index": 20,
}
```

### Functions

```python
def process_video(video_path: str) -> dict:
    """
    Opens video at video_path with cv2.VideoCapture.
    Processes every frame with MediaPipe Pose (GPU backend).
    Collects landmark positions for all frames where pose is detected.
    
    Computes:
        max_reach_cm: float
            Max Euclidean distance from shoulder to wrist across all frames.
            Convert from normalized [0,1] space using approximate body scale:
            assume shoulder-to-shoulder = 45cm, use that as scale reference.
        
        avg_joint_angles_deg: list[float]
            4 values: [shoulder_flex, elbow_flex, wrist_flex, shoulder_abduct]
            Each is the mean of that joint angle across all detected frames.
            Compute angle via: angle = arccos(dot(v1,v2) / (|v1|*|v2|)) * 180/pi
            where v1, v2 are vectors from joint to adjacent joints.
        
        grip_aperture_cm: float
            Distance between left_index and right_index landmarks at the 
            moment of closest approach (minimum across all frames).
            Converted to cm using same shoulder-width scale reference.
        
        motion_speed: str
            "slow" if mean frame-to-frame wrist displacement < 0.01 (normalized)
            "medium" if < 0.03
            "fast" if >= 0.03
        
        endpoint_height_cm: float
            Mean wrist height (y coordinate, inverted — MediaPipe y=0 is top)
            at frames where wrist velocity is near zero (endpoint positions).
            Converted to cm using same scale.
        
        reps_detected: int
            Count of times wrist completes a full extension-retraction cycle.
            Simple heuristic: count peaks in wrist-to-shoulder distance signal.
            Use scipy.signal.find_peaks with prominence=0.05.
    
    Returns motion_params dict with above keys.
    If fewer than 10 frames detected pose, returns DEFAULT_MOTION_PARAMS.
    
    Parameters:
        video_path: str — path to .mp4 or .mov file
    
    Returns:
        dict with keys: max_reach_cm, avg_joint_angles_deg, grip_aperture_cm,
                        motion_speed, endpoint_height_cm, reps_detected
    """

# Used when MediaPipe fails or detects nothing
DEFAULT_MOTION_PARAMS = {
    "max_reach_cm": 80.0,
    "avg_joint_angles_deg": [45.0, 90.0, 60.0, 20.0],
    "grip_aperture_cm": 7.0,
    "motion_speed": "medium",
    "endpoint_height_cm": 75.0,
    "reps_detected": 0
}
```

### Pydantic Models
```python
class MotionParams(BaseModel):
    max_reach_cm: float
    avg_joint_angles_deg: list[float]   # always length 4
    grip_aperture_cm: float
    motion_speed: str                   # "slow" | "medium" | "fast"
    endpoint_height_cm: float
    reps_detected: int

class MotionUploadResponse(BaseModel):
    status: str
    frames_analyzed: int
    motion_params: MotionParams

class CADGenerateRequest(BaseModel):
    robot_spec: dict        # RobotSpec fields
    motion_params: dict     # MotionParams fields

class CADGenerateResponse(BaseModel):
    status: str
    stl_url: str
    params_used: dict
```

### Routes

```python
router = APIRouter()

@router.post("/motion/upload", response_model=MotionUploadResponse)
async def upload_motion(file: UploadFile = File(...)) -> MotionUploadResponse:
    """
    Saves file to /tmp/motion_video.mp4 (always overwrite, rename if .mov).
    Calls process_video() in executor (heavy, GPU-bound).
    Returns frame count and motion_params.
    Accepted: .mp4, .mov. Reject others with 400.
    """

@router.post("/cad/generate", response_model=CADGenerateResponse)
async def generate_cad(req: CADGenerateRequest) -> CADGenerateResponse:
    """
    Imports cad_generator.merge_params_and_generate().
    Passes robot_spec + motion_params.
    Returns URL to the generated STL at /static/robot_current.stl.
    """

@router.get("/cad/stl")
async def get_stl():
    """
    Returns /static/robot_current.stl as FileResponse.
    Content-Type: model/stl
    If file doesn't exist, returns 404.
    """
```

---

## File: `cad_generator.py`

Merges robot spec + motion params into OpenSCAD parameters. Generates .scad file. Compiles to STL.

### Parameter Derivation Logic (exact formulas)

```python
def derive_openscad_params(robot_spec: dict, motion_params: dict) -> dict:
    """
    Merges robot_spec and motion_params into OpenSCAD variable dict.
    
    Derivation rules (apply in this order):
    
    arm_length_m:
        base = motion_params["max_reach_cm"] / 100.0
        clamp to [0.3, 1.5]
        if robot_spec["reach_cm"] is provided and > 0:
            arm_length_m = max(base, robot_spec["reach_cm"] / 100.0)
    
    gripper_width_m:
        base = motion_params["grip_aperture_cm"] / 100.0
        clamp to [0.04, 0.15]
    
    payload_factor:
        = robot_spec["payload_kg"] / 5.0   (normalize to 5kg baseline)
        clamp to [0.5, 3.0]
    
    link_radius_m:
        = 0.02 * payload_factor   (heavier load → thicker links)
        clamp to [0.015, 0.06]
    
    base_radius_m:
        = link_radius_m * 3.0
        clamp to [0.05, 0.15]
    
    dof:
        = int(robot_spec["dof"])
        clamp to [3, 6]
    
    joint_ranges_deg:
        List of [min, max] for each joint. Length = dof.
        Derived from avg_joint_angles_deg:
            joint_ranges_deg[i] = [
                -avg_joint_angles_deg[i % 4] * 1.1,   (add 10% buffer)
                 avg_joint_angles_deg[i % 4] * 1.1
            ]
        All values clamped to [-180, 180].
    
    gripper_type:
        = robot_spec["gripper_type"]   # "parallel" or "adaptive"
    
    mounted:
        = robot_spec["mounted"]   # bool — adds base plate if True
    
    Returns dict with all above keys.
    """
```

### OpenSCAD File Generation

```python
def generate_scad_file(params: dict, output_path: str) -> str:
    """
    Writes a .scad file to output_path that includes arm_4dof.scad template
    with all parameters defined above it as OpenSCAD variables.
    
    Generated file structure:
    
        // Auto-generated by Forgebot
        arm_length = {arm_length_m};
        gripper_width = {gripper_width_m};
        link_radius = {link_radius_m};
        base_radius = {base_radius_m};
        dof = {dof};
        mounted = {str(mounted).lower()};
        gripper_type = "{gripper_type}";
        joint_range_0 = [{joint_ranges_deg[0][0]}, {joint_ranges_deg[0][1]}];
        joint_range_1 = [{joint_ranges_deg[1][0]}, {joint_ranges_deg[1][1]}];
        joint_range_2 = [{joint_ranges_deg[2][0]}, {joint_ranges_deg[2][1]}];
        joint_range_3 = [{joint_ranges_deg[3][0]}, {joint_ranges_deg[3][1]}];
        
        include <{ROBOT_TEMPLATES_DIR}/arm_4dof.scad>;
    
    Parameters:
        params: dict — output of derive_openscad_params()
        output_path: str — where to write the .scad file (e.g. /tmp/robot.scad)
    
    Returns:
        str — path to written .scad file
    """

def compile_scad_to_stl(scad_path: str, stl_path: str) -> bool:
    """
    Runs OpenSCAD CLI to compile scad_path to stl_path.
    
    Command:
        openscad -o {stl_path} {scad_path}
    
    Timeout: 60 seconds.
    Returns True on success (returncode == 0).
    Returns False and logs stderr on failure.
    
    If OpenSCAD binary not found at OPENSCAD_BIN, raises RuntimeError.
    
    Parameters:
        scad_path: str
        stl_path: str — destination, usually backend/static/robot_current.stl
    
    Returns:
        bool
    """

def simplify_stl(stl_path: str, max_faces: int = 50000) -> None:
    """
    Uses trimesh to load STL and simplify if face count > max_faces.
    Applies trimesh.simplify.quadric_decimation(mesh, max_faces).
    Overwrites the file at stl_path.
    This keeps MuJoCo sim loading fast.
    
    Parameters:
        stl_path: str
        max_faces: int — default 50,000
    """

def merge_params_and_generate(robot_spec: dict, motion_params: dict) -> dict:
    """
    Top-level function called by pipeline_b.py route.
    
    Steps:
    1. derive_openscad_params(robot_spec, motion_params) → params
    2. generate_scad_file(params, "/tmp/robot.scad")
    3. compile_scad_to_stl("/tmp/robot.scad", "static/robot_current.stl")
    4. simplify_stl("static/robot_current.stl")
    5. Return {"params_used": params, "stl_url": "/static/robot_current.stl"}
    
    If compile fails, raises HTTPException(500) with OpenSCAD stderr.
    """
```

---

## File: `sim.py`

MuJoCo MJX sim management, parallel runs, WebSocket frame streaming.

### Module-level state
```python
import asyncio
import mujoco
import mujoco.mjx as mjx
import jax
import jax.numpy as jnp
import numpy as np
import cv2
from typing import Optional
import threading

# Sim state
sim_running: bool = False
current_model: Optional[mujoco.MjModel] = None
current_data: Optional[mujoco.MjData] = None
sim_step: int = 0
current_fps: float = 0.0
best_score: float = 0.0
gpu_available: bool = False

# WebSocket clients
ws_clients: set = set()

# Frame buffer (latest JPEG bytes)
latest_frame: bytes = b""
```

### MuJoCo XML Generation

```python
def build_model_xml(env_stl_path: str | None, robot_stl_path: str | None) -> str:
    """
    Returns a complete MuJoCo XML model string.
    
    Structure:
    
    <mujoco model="forgebot">
      <option gravity="0 0 -9.81" timestep="0.002"/>
      <asset>
        <!-- If env_stl_path is not None: -->
        <mesh name="environment" file="{env_stl_path}" scale="1 1 1"/>
        <!-- If robot_stl_path is not None: -->
        <mesh name="robot" file="{robot_stl_path}" scale="1 1 1"/>
      </asset>
      <worldbody>
        <light diffuse=".5 .5 .5" pos="0 0 3" dir="0 0 -1"/>
        <geom type="plane" size="5 5 0.1" rgba=".9 .9 .9 1"/>
        <!-- If env_stl_path is not None: -->
        <body name="environment" pos="0 0 0">
          <geom type="mesh" mesh="environment" mass="0" contype="1" conaffinity="1" rgba=".7 .7 .7 1"/>
        </body>
        <!-- If robot_stl_path is not None: -->
        <body name="robot" pos="0 0 0.5">
          <freejoint/>
          <geom type="mesh" mesh="robot" mass="5.0" contype="1" conaffinity="1" rgba=".2 .6 .9 1"/>
        </body>
      </worldbody>
    </mujoco>
    
    Writes XML to /tmp/forgebot_model.xml and returns the path.
    """
```

### MJX Parallel Sim

```python
def init_mjx_sim(model_xml_path: str) -> bool:
    """
    Loads MuJoCo model from XML.
    Attempts to initialize MJX on GPU.
    If GPU not available, falls back to CPU (sets gpu_available=False).
    
    GPU path:
        mx = mjx.put_model(model)
        Creates batch of 512 MjData states with slight param perturbations:
            Each variant perturbs qpos by np.random.normal(0, 0.01, size=qpos.shape)
        Stores mx and batched_dx in module state.
        JIT-compiles step_batch function.
    
    CPU fallback path:
        Uses standard mujoco.MjData, single simulation.
        Sets gpu_available = False.
        Logs warning: "GPU unavailable — running CPU MuJoCo (no parallel variants)"
    
    Returns True on success, False on failure.
    """

@jax.jit
def step_batch_gpu(mx, dx_batch):
    """
    JAX JIT-compiled function.
    Runs one physics step for all 512 variants simultaneously.
    
    Parameters:
        mx: MJX model (on GPU)
        dx_batch: batched MjData (512 copies on GPU)
    
    Returns:
        Updated dx_batch
    
    Implementation:
        return jax.vmap(mjx.step, in_axes=(None, 0))(mx, dx_batch)
    """

def score_variant(dx) -> float:
    """
    Scores a single sim variant.
    Score = distance robot base has moved from origin (we want it stable/grounded).
    score = -jnp.linalg.norm(dx.qpos[:3])  (negative: closer to 0 = better)
    Returns float.
    """

def select_best_variant(dx_batch) -> int:
    """
    Applies score_variant to all 512 variants.
    Returns index of variant with highest score.
    Uses jax.vmap(score_variant)(dx_batch).argmax().
    """

def render_frame(model: mujoco.MjModel, data: mujoco.MjData) -> bytes:
    """
    Renders a single MuJoCo frame using offscreen renderer.
    Resolution: 640x480
    Camera: name="fixed", azimuth=45, elevation=-20, distance=3.0
    
    Steps:
    1. renderer = mujoco.Renderer(model, height=480, width=640)
    2. renderer.update_scene(data, camera="fixed")
    3. pixels = renderer.render()   # returns RGB numpy array
    4. frame_bgr = cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR)
    5. _, jpeg = cv2.imencode('.jpg', frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 75])
    6. return jpeg.tobytes()
    
    Returns:
        bytes — JPEG-encoded frame
    """
```

### Sim Loop

```python
async def sim_loop():
    """
    Main async sim loop. Runs while sim_running == True.
    
    Each iteration:
    1. If gpu_available: run step_batch_gpu, select best variant, get data from best
    2. If not gpu_available: run mujoco.mj_step(model, data)
    3. Call render_frame(model, data) → jpeg bytes
    4. Store in latest_frame
    5. Broadcast to all ws_clients (send_bytes)
    6. Every 30 steps: compute fps (time.time() delta), broadcast status JSON
    7. await asyncio.sleep(1/60) to target 60Hz sim, 30Hz render
    
    Note: render every other step (render_every = 2) for performance.
    """
```

### WebSocket Handler

```python
from fastapi import WebSocket, WebSocketDisconnect

ws_router = APIRouter()

@ws_router.websocket("/ws/sim")
async def websocket_sim(websocket: WebSocket):
    """
    Accepts WebSocket connection.
    Adds to ws_clients set.
    Enters receive loop:
        - On text message: parse JSON, handle "ping" → send "pong"
        - On disconnect: remove from ws_clients, break
    Runs concurrently with sim_loop (sim_loop is a background task started by /api/sim/load).
    """
```

### Routes

```python
router = APIRouter()

@router.post("/load")
async def load_sim() -> dict:
    """
    Builds model XML from existing /tmp/environment_clean.stl and static/robot_current.stl.
    (Uses whichever files exist — if env mesh missing, loads robot in empty world)
    Calls init_mjx_sim().
    Starts sim_loop() as asyncio background task.
    Sets sim_running = True.
    Returns {"status": "running", "sim_fps": 60, "parallel_variants": 512 if gpu else 1, "best_variant_score": 0.0}
    """

@router.post("/correct")
async def correct_sim(req: dict) -> dict:
    """
    req = {"correction": "extend the reach and widen the grip"}
    
    Calls parse_correction_with_ollama(req["correction"]) → param_changes dict
    Loads current params from module state (stored after last cad/generate call)
    Applies param_changes (overwrite matching keys)
    Re-runs cad_generator.merge_params_and_generate() with updated params
    Re-runs init_mjx_sim() with new STL
    Returns {"status": "updated", "param_changes": param_changes, "new_stl_url": "/static/robot_current.stl"}
    """

@router.post("/stop")
async def stop_sim() -> dict:
    """Sets sim_running = False. Returns {"status": "stopped"}"""

@router.get("/status")
async def sim_status() -> dict:
    """Returns {"running": bool, "fps": float, "step": int, "best_score": float}"""
```

### Correction Parsing with Ollama

```python
def parse_correction_with_ollama(correction: str) -> dict:
    """
    Sends correction string to Ollama with a strict JSON-extraction prompt.
    
    Prompt (exact):
    "The user said: '{correction}'
    Extract robot parameter changes as JSON. Only output valid JSON, nothing else.
    Valid keys: arm_length_m (float, 0.3-1.5), gripper_width_m (float, 0.04-0.15),
    dof (int, 3-6), link_radius_m (float, 0.015-0.06).
    Only include keys that were mentioned. Example: {'arm_length_m': 1.2}"
    
    Parses JSON from response.
    Returns dict (may be empty if nothing parseable).
    Never raises — returns {} on any error.
    """
```

---

## File: `adi_agent.py`

Analog Devices BOM generation. Uses hardcoded ADI catalog knowledge + LLM to select appropriate parts.

### ADI Part Catalog (hardcoded — no web scraping needed for hackathon)

```python
ADI_CATALOG = [
    {
        "category": "IMU",
        "part_number": "ADIS16470",
        "description": "10-DOF MEMS inertial sensor with accelerometer, gyroscope, magnetometer",
        "use_case": "joint angle feedback, balance correction, vibration monitoring",
        "quantity_per_robot": "1 per joint",
        "datasheet_url": "https://www.analog.com/en/products/adis16470.html"
    },
    {
        "category": "IMU",
        "part_number": "ADXL345",
        "description": "3-axis digital accelerometer, ±16g",
        "use_case": "end-effector acceleration sensing, collision detection",
        "quantity_per_robot": "1",
        "datasheet_url": "https://www.analog.com/en/products/adxl345.html"
    },
    {
        "category": "Motor Driver",
        "part_number": "TMC2209",
        "description": "Stepper motor driver with StealthChop2, up to 2.8A",
        "use_case": "silent, precise control of stepper motors in each joint",
        "quantity_per_robot": "1 per DOF",
        "datasheet_url": "https://www.analog.com/en/products/tmc2209.html"
    },
    {
        "category": "Power Management",
        "part_number": "LTC3780",
        "description": "High-efficiency synchronous buck-boost DC/DC controller",
        "use_case": "regulated 12V power rail for motor drivers from battery input",
        "quantity_per_robot": "1",
        "datasheet_url": "https://www.analog.com/en/products/ltc3780.html"
    },
    {
        "category": "Signal Processor",
        "part_number": "AD7606C-18",
        "description": "18-bit, 8-channel simultaneous sampling ADC",
        "use_case": "high-speed sampling of force/torque sensors on gripper",
        "quantity_per_robot": "1",
        "datasheet_url": "https://www.analog.com/en/products/ad7606c-18.html"
    },
    {
        "category": "Amplifier",
        "part_number": "AD8221",
        "description": "Rail-to-rail instrumentation amplifier, 0.1μV/°C drift",
        "use_case": "amplify strain gauge signals from load cells in gripper fingers",
        "quantity_per_robot": "2",
        "datasheet_url": "https://www.analog.com/en/products/ad8221.html"
    }
]
```

### Functions

```python
def generate_bom(robot_spec: dict, params_used: dict) -> list[dict]:
    """
    Selects appropriate ADI parts based on robot_spec and params_used.
    
    Selection rules:
    - Always include: ADIS16470 (quantity = dof), LTC3780, AD8221
    - If dof >= 4: include TMC2209 (quantity = dof)
    - If payload_kg >= 2.0: include AD7606C-18
    - If motion_speed == "fast" (from last motion params): include ADXL345
    
    For each selected part, compute:
        quantity: int (use quantity_per_robot rule, substituting actual dof/payload)
        justification: str — 1 sentence specific to this robot's spec
            e.g. for ADIS16470 on a 4-DOF arm: "4 ADIS16470 IMUs provide
            per-joint angle feedback for the {task} task at {payload_kg}kg payload"
    
    Returns list of BOM dicts:
    [
        {
            "category": str,
            "part_number": str,
            "description": str,
            "justification": str,
            "quantity": int,
            "datasheet_url": str
        }
    ]
    """
```

### Routes

```python
router = APIRouter()

@router.get("/bom")
async def get_bom() -> dict:
    """
    Reads current robot_spec from plan_mode.robot_specs["default"].
    Reads current params_used from cad_generator module state.
    Calls generate_bom().
    Returns {"bom": [...]}
    If no spec yet, returns {"bom": [], "error": "No robot spec generated yet"}
    """
```

---

## File: `backboard.py`

Design explanation panel — explains every parameter decision in plain English.

### Functions

```python
def generate_explanations(params_used: dict, motion_params: dict, robot_spec: dict) -> list[dict]:
    """
    Returns a list of explanation objects for each design decision.
    Does NOT call Ollama — generates explanations from deterministic rules
    (faster, more reliable for hackathon).
    
    Explanation template for each parameter:
    
    arm_length_m:
        component: "Arm Length"
        value: f"{params_used['arm_length_m'] * 100:.0f}cm"
        reason: f"Motion capture showed peak wrist reach of {motion_params['max_reach_cm']:.0f}cm
                 across {motion_params['reps_detected']} reps. Added 10% safety margin for
                 {robot_spec['task']} task clearance."
    
    gripper_width_m:
        component: "Gripper Width"
        value: f"{params_used['gripper_width_m'] * 100:.0f}mm"
        reason: f"Grip aperture measured from video: {motion_params['grip_aperture_cm']:.1f}cm
                 average spacing at moment of object contact."
    
    link_radius_m:
        component: "Link Thickness"
        value: f"{params_used['link_radius_m'] * 1000:.0f}mm radius"
        reason: f"Scaled to handle {robot_spec['payload_kg']}kg payload with
                 2× safety factor. Baseline 20mm radius at 1kg scales linearly."
    
    dof:
        component: "Degrees of Freedom"
        value: f"{params_used['dof']}-DOF"
        reason: f"Matched to robot_spec request of {robot_spec['dof']} DOF.
                 {params_used['dof']} joints provide sufficient workspace
                 coverage for {robot_spec['task']}."
    
    gripper_type:
        component: "Gripper Type"
        value: params_used["gripper_type"].capitalize()
        reason: "Parallel gripper" if parallel → "Selected for consistent gripping
                  force on regular-shaped objects at {payload_kg}kg."
                 "Adaptive gripper" if adaptive → "Selected for irregular object
                  geometries. Fingers conform to object surface."
    
    Returns list of dicts: [{"component": str, "value": str, "reason": str}, ...]
    """
```

### Routes

```python
router = APIRouter()

@router.get("/backboard")
async def get_backboard() -> dict:
    """
    Reads current params_used, motion_params, robot_spec from module states.
    Calls generate_explanations().
    Returns {"explanations": [...]}
    If params not available: returns {"explanations": [], "error": "Run CAD generation first"}
    """
```

---

## File: `requirements.txt`

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
python-multipart==0.0.9
pydantic==2.7.1
requests==2.31.0
numpy==1.26.4
trimesh==4.3.2
opencv-python==4.9.0.80
mediapipe==0.10.14
scipy==1.13.0
mujoco==3.1.3
mujoco-mjx==3.1.3
jax==0.4.26
jaxlib==0.4.26
ollama==0.2.0
```

**GPU JAX install (run separately after requirements.txt):**
```bash
pip install "jax[cuda12_pip]" -f https://storage.googleapis.com/jax-releases/jax_cuda_releases.html
```

---

## Module State Sharing Pattern

Since we have no database, modules share state through module-level globals.
Import the variable directly, not the module:

```python
# In sim.py, to access environment mesh:
from pipeline_a import environment_mesh, environment_bounds

# In backboard.py, to access CAD params:
from cad_generator import last_params_used, last_motion_params

# In adi_agent.py, to access robot spec:
from plan_mode import robot_specs
```

Each module that exports shared state must define it at module level with type annotation.
`cad_generator.py` must track: `last_params_used: dict = {}` and `last_motion_params: dict = {}`.
Update these at the end of `merge_params_and_generate()`.
