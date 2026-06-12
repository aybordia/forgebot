# AYAN_2_BACKEND.md — Backend Phase 2: Pipeline A, Pipeline B, Plan Mode, CAD Generator

> **Read ARCHITECTURE.md before starting any work in this file.**
> **Prerequisites: TANUSH_1_BACKEND.md (Tanush's backend phase 1) must be fully complete. FastAPI skeleton is running.**
> **Hackathon context: working demo over perfect code. Move fast.**
> **After every major step: `git add -A && git commit -m "<message>" && git push origin backend`**

---

## What You Are Building in This File

Replace every stub route from TANUSH_1_BACKEND with real implementations:

1. **`pipeline_a.py`** — `.obj` upload → trimesh mesh cleaning → MuJoCo mesh loading
2. **`pipeline_b.py`** — video upload → MediaPipe GPU pose extraction → motion parameters JSON
3. **`plan_mode.py`** — Ollama Mistral conversation loop → robot spec JSON output
4. **`cad_generator.py`** — robot spec + motion params → OpenSCAD .scad → .stl via CLI
5. **Update `main.py`** — wire in real implementations, replace stubs with real router imports

All outputs should be logged to console so you can verify them without the frontend being ready.

---

## Step 1: `backend/plan_mode.py` — Ollama Conversation Loop

This is the most important module for the demo. Build it first.

### Module-level state (at the top of the file)

```python
import logging, json, re, requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

# In-memory conversation storage — no DB needed
# Key: session_id, Value: list of {"role": "user"|"assistant", "content": str}
conversation_history: dict[str, list[dict]] = {}

# Key: session_id, Value: robot spec dict or None
robot_specs: dict[str, dict | None] = {}

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
```

### System prompt — copy verbatim, do not paraphrase

```python
SYSTEM_PROMPT = """You are a robot design assistant. Ask the user clarifying questions ONE AT A TIME to understand what robot they need. When you have enough information, output a JSON robot spec. Keep ALL responses under 2 sentences — they will be spoken aloud. Be conversational and friendly.

When you have enough information, output ONLY this JSON on its own line with no other text before or after it:
{"task": "...", "payload_kg": X.X, "mounted": true, "reach_cm": X, "dof": X, "gripper_type": "parallel", "notes": "..."}

Ask about these topics in order, one at a time:
1. What task should the robot perform?
2. How heavy are the objects it needs to handle? (get a number in kg)
3. Does it stay fixed to a surface, or move around?
4. How far does it need to reach? (get a number in cm)
5. Any size or space constraints?

After you have answers to all 5 questions, output the JSON spec immediately."""
```

### `get_ollama_response(session_id, user_message)` function

Behavior:
1. If `session_id` not in `conversation_history`: initialize to empty list, set `robot_specs[session_id] = None`
2. Append `{"role": "user", "content": user_message}` to history
3. Build request payload:
   ```python
   payload = {
       "model": "mistral",
       "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + conversation_history[session_id],
       "stream": False
   }
   ```
4. POST to `OLLAMA_CHAT_URL` with `timeout=30`
5. Extract: `reply = response.json()["message"]["content"]`
6. Append `{"role": "assistant", "content": reply}` to history
7. Return `reply`
8. If requests throws `ConnectionError`: raise `HTTPException(503, "Ollama not running — run: ollama serve")`

### `try_extract_spec(reply)` function

Behavior:
1. Use `re.search(r'\{[^{}]+\}', reply, re.DOTALL)` to find a JSON block
2. Try `json.loads(match.group())`
3. Check required keys: `{"task", "payload_kg", "mounted", "reach_cm", "dof", "gripper_type"}`
4. If all present: return the parsed dict
5. Otherwise: return `None`
6. Never raise — return `None` on any parse error

### Pydantic models for this module

```python
class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"

class OmiWebhookRequest(BaseModel):
    transcript: str
    session_id: str = "omi-default"

class ChatResponse(BaseModel):
    reply: str
    is_complete: bool
    robot_spec: Optional[dict] = None
```

### Routes

```python
router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def plan_chat(req: ChatRequest) -> ChatResponse:
    reply = get_ollama_response(req.session_id, req.message)
    spec = try_extract_spec(reply)
    if spec:
        robot_specs[req.session_id] = spec
        logger.info(f"Robot spec extracted for session {req.session_id}: {spec}")
    return ChatResponse(reply=reply, is_complete=spec is not None, robot_spec=spec)

@router.post("/omi-webhook", response_model=ChatResponse)
async def omi_webhook(req: OmiWebhookRequest) -> ChatResponse:
    # Identical logic, just maps transcript field
    reply = get_ollama_response(req.session_id, req.transcript)
    spec = try_extract_spec(reply)
    if spec:
        robot_specs[req.session_id] = spec
    return ChatResponse(reply=reply, is_complete=spec is not None, robot_spec=spec)

@router.get("/spec/{session_id}")
async def get_spec(session_id: str) -> dict:
    return {"spec": robot_specs.get(session_id)}

@router.delete("/reset/{session_id}")
async def reset_session(session_id: str) -> dict:
    conversation_history.pop(session_id, None)
    robot_specs.pop(session_id, None)
    return {"status": "reset"}
```

### Test plan_mode independently (no frontend needed)

```bash
# Test basic conversation
curl -X POST http://localhost:8000/api/plan/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I need a robot that picks up boxes", "session_id": "test1"}'
# Expected: {"reply": "How heavy are the boxes?", "is_complete": false, ...}

# Test Omi webhook
curl -X POST http://localhost:8000/api/omi-webhook \
  -H "Content-Type: application/json" \
  -d '{"transcript": "I need a robot arm for assembly", "session_id": "omi1"}'
```

---

## Step 2: `backend/pipeline_a.py` — Environment Scan → MuJoCo Mesh

### Module-level state

```python
import trimesh, numpy as np, logging, shutil, os
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Shared state — sim.py imports these
environment_mesh: trimesh.Trimesh | None = None
environment_bounds: dict | None = None   # {"min": [x,y,z], "max": [x,y,z]}
environment_stl_path: str = "/tmp/environment_clean.stl"
```

### `clean_mesh(filepath: str) -> trimesh.Trimesh` function

Steps (in order):
1. `mesh = trimesh.load(filepath, process=True, force="mesh")`
2. If `mesh` is empty or has 0 vertices: raise `ValueError("Empty or invalid mesh")`
3. Apply `trimesh.repair.fill_holes(mesh)`
4. Apply `trimesh.repair.fix_winding(mesh)`
5. Scale check: compute `max_dim = max(mesh.extents)`. If `max_dim > 20.0`: scale to fit in 10m box: `mesh.apply_scale(10.0 / max_dim)`. If `max_dim < 0.5`: scale up: `mesh.apply_scale(2.0 / max_dim)`.
6. Log: `logger.info(f"Mesh cleaned: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces, bounds: {mesh.bounds}")`
7. Return mesh

### `get_bounds_dict(mesh: trimesh.Trimesh) -> dict` function

```python
bounds = mesh.bounds  # shape (2,3) — [[min_x,min_y,min_z],[max_x,max_y,max_z]]
return {
    "min": [round(float(v), 3) for v in bounds[0]],
    "max": [round(float(v), 3) for v in bounds[1]]
}
```

### Routes

```python
router = APIRouter()

@router.post("/upload")
async def upload_scan(file: UploadFile = File(...)) -> dict:
    # Validate file extension
    if not file.filename.endswith(".obj"):
        raise HTTPException(400, "Only .obj files accepted")
    
    # Save to /tmp
    tmp_path = "/tmp/environment.obj"
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    logger.info(f"Environment file saved: {file.filename} → {tmp_path}")
    
    # Clean mesh (blocking — run in executor)
    import asyncio
    loop = asyncio.get_event_loop()
    mesh = await loop.run_in_executor(None, clean_mesh, tmp_path)
    
    # Export cleaned STL for MuJoCo
    mesh.export(environment_stl_path)
    logger.info(f"Cleaned mesh exported to {environment_stl_path}")
    
    # Update module state
    global environment_mesh, environment_bounds
    environment_mesh = mesh
    environment_bounds = get_bounds_dict(mesh)
    
    orig_count = len(trimesh.load(tmp_path, process=False).vertices)
    return {
        "status": "loaded",
        "mesh_bounds": environment_bounds,
        "vertex_count": orig_count,
        "cleaned_vertex_count": len(mesh.vertices)
    }

@router.get("/status")
async def scan_status() -> dict:
    return {
        "loaded": environment_mesh is not None,
        "bounds": environment_bounds,
        "vertex_count": len(environment_mesh.vertices) if environment_mesh else None
    }
```

### Test pipeline_a independently

```bash
# Download any .obj file, e.g. a simple cube
curl -o /tmp/test_cube.obj https://people.sc.fsu.edu/~jburkardt/data/obj/cube.obj

curl -X POST http://localhost:8000/api/scan/upload \
  -F "file=@/tmp/test_cube.obj"
# Expected: {"status":"loaded","mesh_bounds":{...},"vertex_count":...}

curl http://localhost:8000/api/scan/status
# Expected: {"loaded":true,"bounds":{...},"vertex_count":...}
```

---

## Step 3: `backend/pipeline_b.py` — Video → MediaPipe → Motion Parameters

### Module-level state

```python
import cv2, mediapipe as mp, numpy as np, logging, shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from scipy.signal import find_peaks

logger = logging.getLogger(__name__)
mp_pose = mp.solutions.pose

# Shared state — cad_generator imports this
last_motion_params: dict = {}

# Default params used when pose detection fails
DEFAULT_MOTION_PARAMS = {
    "max_reach_cm": 80.0,
    "avg_joint_angles_deg": [45.0, 90.0, 60.0, 20.0],
    "grip_aperture_cm": 7.0,
    "motion_speed": "medium",
    "endpoint_height_cm": 75.0,
    "reps_detected": 0
}

LANDMARK = {
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
    "left_index": 19, "right_index": 20,
}
```

### `process_video(video_path: str) -> tuple[dict, int]` function

Returns `(motion_params_dict, frames_analyzed_count)`.

Steps:
1. `cap = cv2.VideoCapture(video_path)`
2. Open MediaPipe Pose:
   ```python
   pose = mp_pose.Pose(
       static_image_mode=False, model_complexity=2,
       smooth_landmarks=True, min_detection_confidence=0.7,
       min_tracking_confidence=0.5
   )
   ```
3. Loop through every frame: `ret, frame = cap.read()`. Break when `ret` is False.
4. For each frame: `results = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))`
5. If `results.pose_landmarks`: extract landmark positions and store in lists. Track:
   - `shoulder_positions`: list of `(lm[11].x, lm[11].y)` for left shoulder
   - `wrist_positions`: list of `(lm[15].x, lm[15].y)` for left wrist
   - `elbow_positions`: list of `(lm[13].x, lm[13].y)`
   - `index_left`: list of `(lm[19].x, lm[19].y)`
   - `index_right`: list of `(lm[20].x, lm[20].y)`
6. `cap.release(); pose.close()`
7. If fewer than 10 frames collected: log warning, return `(DEFAULT_MOTION_PARAMS, 0)`

**Computing parameters from collected data:**

```
shoulder_width_normalized = 0.25  # approximate normalized distance shoulder-to-shoulder

SCALE_FACTOR = 45.0 / shoulder_width_normalized  # converts normalized to cm

max_reach_cm:
  For each frame i:
    dx = wrist_positions[i][0] - shoulder_positions[i][0]
    dy = wrist_positions[i][1] - shoulder_positions[i][1]
    dist = sqrt(dx² + dy²)
  max_reach_cm = max(dist) * SCALE_FACTOR

avg_joint_angles_deg:
  For each frame, compute 4 angles:
    shoulder_flex: angle at shoulder between spine-vertical and upper-arm vector
      = arccos( (shoulder→elbow) · (0,-1) ) * 180/pi   [0,-1 = downward vertical]
    elbow_flex: angle at elbow
      = arccos( (elbow→shoulder) · (elbow→wrist) / (|elbow→shoulder| * |elbow→wrist|) ) * 180/pi
    wrist_flex: approximate as constant 60.0 (not enough landmarks for precise measurement)
    shoulder_abduct: abs(shoulder_positions[i][0] - 0.5) * 180  (lateral deviation)
  avg_joint_angles_deg = [mean(shoulder_flex), mean(elbow_flex), 60.0, mean(shoulder_abduct)]
  Clamp each value to [0, 180]

grip_aperture_cm:
  For each frame:
    gap = sqrt((index_left[i][0]-index_right[i][0])² + (index_left[i][1]-index_right[i][1])²)
  grip_aperture_cm = min(gap) * SCALE_FACTOR

motion_speed:
  Frame-to-frame wrist displacement:
  displacements = [dist(wrist[i], wrist[i-1]) for i in 1..n]
  mean_disp = mean(displacements)
  "slow" if mean_disp < 0.01
  "medium" if mean_disp < 0.03
  "fast" if >= 0.03

endpoint_height_cm:
  Find frames where wrist velocity ≈ 0 (displacement < 0.005)
  endpoint_height_cm = mean(wrist_positions[i][1] for those frames) * SCALE_FACTOR
  If no low-velocity frames: use mean of all wrist y positions

reps_detected:
  reach_signal = [dist(wrist[i], shoulder[i]) for each frame]
  peaks, _ = find_peaks(reach_signal, prominence=0.05)
  reps_detected = len(peaks)
```

Log the final params dict before returning.

### Routes

```python
router = APIRouter()

@router.post("/motion/upload")
async def upload_motion(file: UploadFile = File(...)) -> dict:
    if not any(file.filename.endswith(ext) for ext in [".mp4", ".mov", ".avi"]):
        raise HTTPException(400, "Only .mp4, .mov, .avi files accepted")
    
    tmp_path = "/tmp/motion_video.mp4"
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    logger.info(f"Motion video saved: {file.filename} → {tmp_path}")
    
    import asyncio
    loop = asyncio.get_event_loop()
    params, frames = await loop.run_in_executor(None, process_video, tmp_path)
    
    global last_motion_params
    last_motion_params = params
    logger.info(f"Motion params extracted: {params}")
    
    return {"status": "processed", "frames_analyzed": frames, "motion_params": params}
```

### Add `GET /api/motion/status` (so frontend can poll whether motion was processed)

```python
@router.get("/motion/status")
async def motion_status() -> dict:
    return {"processed": bool(last_motion_params)}
```

### Test pipeline_b independently

```bash
# Record a short video of yourself moving your arm, or use any MP4
curl -X POST http://localhost:8000/api/motion/upload \
  -F "file=@/path/to/test_video.mp4"
# Expected: {"status":"processed","frames_analyzed":N,"motion_params":{...}}
# Check terminal for logged motion params dict
```

---

## Step 4: `backend/cad_generator.py` — OpenSCAD Parametric CAD Generation

### Module-level state

```python
import os, json, subprocess, logging, datetime
import trimesh
from typing import Optional

logger = logging.getLogger(__name__)

# Shared state — sim.py and backboard.py import these
last_params_used: dict = {}
last_motion_params: dict = {}

OPENSCAD_BIN = os.environ.get("OPENSCAD_BIN", "openscad")
ROBOT_TEMPLATES_DIR = os.environ.get("ROBOT_TEMPLATES_DIR", "../robot_templates")
STATIC_DIR = os.environ.get("STATIC_DIR", "./static")
STL_OUTPUT_PATH = os.path.join(STATIC_DIR, "robot_current.stl")
SCAD_TMP_PATH = "/tmp/robot.scad"
```

### `derive_openscad_params(robot_spec: dict, motion_params: dict) -> dict` function

Apply all derivation rules from OPENSCAD_SPEC.md in order:

```
arm_length_m:
  base = motion_params.get("max_reach_cm", 80.0) / 100.0
  spec_reach = robot_spec.get("reach_cm", 0) / 100.0
  arm_length_m = max(base, spec_reach)
  arm_length_m = max(0.3, min(1.5, arm_length_m))

gripper_width_m:
  gripper_width_m = motion_params.get("grip_aperture_cm", 7.0) / 100.0
  gripper_width_m = max(0.04, min(0.15, gripper_width_m))

payload_factor:
  payload_factor = robot_spec.get("payload_kg", 1.0) / 5.0
  payload_factor = max(0.5, min(3.0, payload_factor))

link_radius_m:
  link_radius_m = 0.02 * payload_factor
  link_radius_m = max(0.015, min(0.06, link_radius_m))

base_radius_m:
  base_radius_m = link_radius_m * 3.0
  base_radius_m = max(0.05, min(0.15, base_radius_m))

dof:
  dof = max(3, min(6, int(robot_spec.get("dof", 4))))

joint_ranges_deg:
  angles = motion_params.get("avg_joint_angles_deg", [45, 90, 60, 20])
  # Ensure we always have 4 values
  while len(angles) < 4: angles.append(45.0)
  joint_ranges_deg = [
      [max(-180, -angles[i] * 1.1), min(180, angles[i] * 1.1)]
      for i in range(4)
  ]

gripper_type:
  gripper_type = robot_spec.get("gripper_type", "parallel")

mounted:
  mounted = robot_spec.get("mounted", True)

Return dict with all of the above keys.
```

### `generate_scad_file(params: dict, output_path: str) -> str` function

Write this template to `output_path` using Python f-string:

```python
SCAD_TEMPLATE = """// AUTO-GENERATED BY FORGEBOT — DO NOT EDIT MANUALLY
// Generated: {timestamp}
arm_length    = {arm_length_m};
gripper_width = {gripper_width_m};
link_radius   = {link_radius_m};
base_radius   = {base_radius_m};
dof           = {dof};
mounted       = {mounted_str};
gripper_type  = "{gripper_type}";
joint_range_0 = [{jr0_min}, {jr0_max}];
joint_range_1 = [{jr1_min}, {jr1_max}];
joint_range_2 = [{jr2_min}, {jr2_max}];
joint_range_3 = [{jr3_min}, {jr3_max}];
include <{templates_dir}/arm_4dof.scad>;
"""
```

After writing, return `output_path`.

### `compile_scad_to_stl(scad_path: str, stl_path: str) -> bool` function

```python
result = subprocess.run(
    [OPENSCAD_BIN, "-o", stl_path, scad_path],
    capture_output=True, text=True, timeout=60
)
if result.returncode != 0:
    logger.error(f"OpenSCAD failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}")
    return False
logger.info(f"OpenSCAD compiled STL to {stl_path}")
return True
```

### `simplify_stl(stl_path: str, max_faces: int = 50000) -> None` function

```python
mesh = trimesh.load(stl_path)
if len(mesh.faces) > max_faces:
    simplified = trimesh.simplify.quadric_decimation(mesh, max_faces)
    simplified.export(stl_path)
    logger.info(f"Mesh simplified: {len(mesh.faces)} → {len(simplified.faces)} faces")
```

### `merge_params_and_generate(robot_spec: dict, motion_params: dict) -> dict` function

```python
global last_params_used, last_motion_params
params = derive_openscad_params(robot_spec, motion_params)
last_params_used = params
last_motion_params = motion_params
generate_scad_file(params, SCAD_TMP_PATH)
success = compile_scad_to_stl(SCAD_TMP_PATH, STL_OUTPUT_PATH)
if not success:
    raise RuntimeError("OpenSCAD compilation failed — check logs")
simplify_stl(STL_OUTPUT_PATH)
return {"params_used": params, "stl_url": "/static/robot_current.stl"}
```

### Create the OpenSCAD template files now

Paste the full content from `OPENSCAD_SPEC.md` into:
- `robot_templates/arm_4dof.scad`
- `robot_templates/grippers/parallel.scad`
- `robot_templates/grippers/adaptive.scad`

Test compilation standalone:
```bash
openscad -o /tmp/test_robot.stl robot_templates/arm_4dof.scad
# Should produce a .stl file with no errors
```

---

## Step 5: Wire Everything Into `main.py`

Replace the inline stub routes with real router imports. At the top of `main.py`, replace all the inline route definitions with:

```python
from plan_mode import router as plan_router
from pipeline_a import router as pipeline_a_router
from pipeline_b import router as pipeline_b_router

app.include_router(plan_router, prefix="/api/plan")
app.include_router(pipeline_a_router, prefix="/api/scan")
app.include_router(pipeline_b_router, prefix="/api")
```

Keep the remaining stub routes (sim, export) as inline stubs for now — those get replaced in TANUSH_3_BACKEND.

Add a `POST /api/cad/generate` route inline (since `cad_generator.py` isn't a router — it's a utility module):

```python
from cad_generator import merge_params_and_generate
from plan_mode import robot_specs
from pipeline_b import last_motion_params

@app.post("/api/cad/generate")
async def generate_cad(req: dict) -> dict:
    import asyncio
    robot_spec = req.get("robot_spec", robot_specs.get("default", {}))
    motion_params = req.get("motion_params", last_motion_params or {
        "max_reach_cm": 80, "avg_joint_angles_deg": [45,90,60,20],
        "grip_aperture_cm": 7, "motion_speed": "medium",
        "endpoint_height_cm": 75, "reps_detected": 0
    })
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, merge_params_and_generate, robot_spec, motion_params)
    return {"status": "generated", **result}
```

---

## Step 6: Full Pipeline Test (No Frontend Needed)

Run through the complete pipeline using curl:

```bash
# 1. Start a plan mode conversation
curl -X POST http://localhost:8000/api/plan/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I need a robot arm for picking boxes", "session_id": "hacktest"}'

# 2. Upload a test .obj mesh
curl -X POST http://localhost:8000/api/scan/upload -F "file=@/tmp/test_cube.obj"

# 3. Upload a test video (use any short mp4)
curl -X POST http://localhost:8000/api/motion/upload -F "file=@/tmp/test.mp4"

# 4. Generate CAD with a hardcoded spec
curl -X POST http://localhost:8000/api/cad/generate \
  -H "Content-Type: application/json" \
  -d '{"robot_spec": {"task":"pick and place","payload_kg":2.5,"mounted":true,"reach_cm":110,"dof":4,"gripper_type":"parallel","notes":""}, "motion_params": {}}'
# Expected: {"status":"generated","stl_url":"/static/robot_current.stl","params_used":{...}}

# 5. Verify STL exists
ls -lh backend/static/robot_current.stl
# Expected: a real file, not the placeholder cube
```

Commit everything:
```bash
git add -A && git commit -m "feat(backend): Pipeline A, B, plan_mode, cad_generator fully implemented" && git push origin backend
```

---

## ✅ Success Criteria — AYAN_2_BACKEND is Done When:

- [ ] `POST /api/plan/chat` with a real message returns a Mistral response (not a stub)
- [ ] `POST /api/omi-webhook` with a transcript returns a Mistral response
- [ ] After 5 messages, `is_complete: true` and a real robot spec JSON appears in the response
- [ ] `POST /api/scan/upload` with a .obj file returns real mesh bounds
- [ ] `POST /api/motion/upload` with a video returns real motion params (or defaults if no pose detected)
- [ ] `POST /api/cad/generate` produces a real STL file at `backend/static/robot_current.stl`
- [ ] Terminal logs show each step completing (no silent failures)
- [ ] All changes committed and pushed to `backend` branch

**When all boxes are checked, move to AYAN_3_FRONTEND.md — you switch back to the frontend, while Tanush picks up backend phase 3 in TANUSH_3_BACKEND.md.**
