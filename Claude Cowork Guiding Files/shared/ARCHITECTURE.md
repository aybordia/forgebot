# ARCHITECTURE.md — Forgebot System Architecture

> **Claude Code norm:** After every set of changes, always `git add -A && git commit -m "<message>" && git push` to https://github.com/aybordia/forgebot before stopping.

---

## 1. System Overview (Text Diagram)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          JUDGE / USER LAPTOP                            │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Next.js Frontend (port 3000)                   │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │  │
│  │  │ Plan Mode│  │ Capture  │  │  Sim     │  │    Export      │  │  │
│  │  │  /plan   │  │ /capture │  │  /sim    │  │   /export      │  │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬────────┘  │  │
│  │       │              │              │                 │           │  │
│  │       └──────────────┴──────────────┴─────────────────┘           │  │
│  │                              │                                    │  │
│  │                    fetch / WebSocket                               │  │
│  └──────────────────────────────┼───────────────────────────────────┘  │
│                                 │                                       │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │            FastAPI Backend (port 8000) — ASUS GPU Machine        │  │
│  │                                                                   │  │
│  │  plan_mode.py   pipeline_a.py   pipeline_b.py   sim.py           │  │
│  │  cad_generator.py   adi_agent.py   backboard_memory.py           │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │  │
│  │  │ Backboard   │  │  MuJoCo MJX │  │  MediaPipe (GPU backend) │ │  │
│  │  │ memory + LLM│  │  (JAX/CUDA) │  │  33 landmarks @ 30fps    │ │  │
│  │  └─────────────┘  └─────────────┘  └──────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                 │                                       │
│              Cloudflare Tunnel (cloudflared)                            │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │  Public HTTPS URL
                          ┌───────▼────────┐
                          │  USER PHONE    │
                          │  (browser)     │
                          │  /mobile       │
                          │  scan + record │
                          └────────────────┘
```

---

## 2. Port Map

| Service | Port | Notes |
|---|---|---|
| Next.js frontend | 3000 | `npm run dev` |
| FastAPI backend | 8000 | `uvicorn main:app --reload --host 0.0.0.0 --port 8000` |
| Ollama (Mistral 7B) | 11434 | Optional local fallback if Backboard is unavailable |
| Cloudflare Tunnel | auto | exposes port 8000 publicly |
| Backboard API | HTTPS | persistent memory + LLM wrapper for Plan Mode and corrections |

---

## 3. All FastAPI Endpoints

### 3.1 Plan Mode

#### `POST /api/plan/chat`
Sends a user message through Backboard. Backboard wraps the LLM call and automatically persists useful memory for the supplied `user_id`. Do not maintain long-term memory in a raw module-level conversation list; local state is only a short-lived fallback/cache.

**Request body:**
```json
{
  "message": "I need a robot that picks up boxes",
  "session_id": "abc123",
  "user_id": "user_abc123"
}
```

**Response body:**
```json
{
  "reply": "How heavy are the boxes it needs to lift?",
  "is_complete": false,
  "robot_spec": null
}
```
When `is_complete` is `true`, `robot_spec` contains the full JSON spec (see Plan Mode spec format in section 6). `reply` is always under 2 sentences (enforced by system prompt).

#### `GET /api/plan/context/{user_id}`
Queries Backboard for remembered user history before Plan Mode starts.

**Response body:**
```json
{
  "has_history": true,
  "summary": "Last time you designed a 4-DOF warehouse arm with 110cm reach and a preference for wider grippers."
}
```

If Backboard is unavailable, returns `{"has_history": false, "summary": ""}` and logs the fallback.

#### `POST /api/omi-webhook`
Receives a transcript from the physical Omi device (or any webhook caller). Delegates to the same plan_mode logic as `/api/plan/chat`.

**Request body:**
```json
{
  "transcript": "I need a robot that picks boxes off a shelf",
  "session_id": "omi-default",
  "user_id": "user_abc123"
}
```

**Response body:** Same as `/api/plan/chat`.

#### `GET /api/plan/spec/{session_id}`
Returns the current robot spec for a session. Returns `null` if spec not yet complete.

**Response body:**
```json
{
  "spec": {
    "task": "pick and place",
    "payload_kg": 2.5,
    "mounted": true,
    "reach_cm": 110,
    "dof": 4,
    "gripper_type": "parallel",
    "notes": "low shelf to table height transfer"
  }
}
```

#### `DELETE /api/plan/reset/{session_id}`
Clears conversation history for the session. Returns `{"status": "reset"}`.

---

### 3.2 Pipeline A — Environment Scan

#### `POST /api/scan/upload`
Accepts `.obj` file from phone. Saves to `/tmp/environment.obj`. Triggers mesh cleaning via trimesh. Loads into MuJoCo as static collision mesh.

**Request:** `multipart/form-data` with field `file` (the .obj file).

**Response body:**
```json
{
  "status": "loaded",
  "mesh_bounds": {
    "min": [-2.5, -0.1, -3.0],
    "max": [2.5, 3.2, 3.0]
  },
  "vertex_count": 84231,
  "cleaned_vertex_count": 12480
}
```

#### `GET /api/scan/status`
Returns whether the environment mesh is loaded and ready.

**Response body:**
```json
{
  "loaded": true,
  "bounds": {"min": [...], "max": [...]},
  "vertex_count": 12480
}
```

---

### 3.3 Pipeline B — Motion Capture + CAD

#### `POST /api/motion/upload`
Accepts video file from phone (mp4, mov). Saves to `/tmp/motion_video.mp4`. Triggers MediaPipe pose extraction. Returns extracted motion parameters.

**Request:** `multipart/form-data` with field `file` (the video file).

**Response body:**
```json
{
  "status": "processed",
  "frames_analyzed": 142,
  "motion_params": {
    "max_reach_cm": 98.0,
    "avg_joint_angles_deg": [45.2, 112.0, 78.5, 22.1],
    "grip_aperture_cm": 8.5,
    "motion_speed": "slow",
    "endpoint_height_cm": 72.0,
    "reps_detected": 3
  }
}
```

#### `POST /api/cad/generate`
Merges robot spec (from Plan Mode) with motion params (from Pipeline B) and generates STL via OpenSCAD.

**Request body:**
```json
{
  "robot_spec": { "task": "...", "payload_kg": 2.5, ... },
  "motion_params": { "max_reach_cm": 98.0, ... }
}
```

**Response body:**
```json
{
  "status": "generated",
  "stl_url": "/static/robot_current.stl",
  "params_used": {
    "arm_length_m": 0.98,
    "gripper_width_m": 0.085,
    "dof": 4,
    "joint_ranges_deg": [[-90, 90], [-120, 60], [-150, 150], [-180, 180]],
    "link_radius_m": 0.025,
    "base_radius_m": 0.075
  }
}
```

#### `GET /api/cad/stl`
Returns the current compiled STL file as binary response with `Content-Type: model/stl`.

---

### 3.4 Sim Control

#### `POST /api/sim/load`
Loads the current environment mesh + robot STL into MuJoCo. Starts the MJX parallel sim. Must be called after both Pipeline A and Pipeline B complete.

**Request body:** `{}` (no params needed — uses files already on disk)

**Response body:**
```json
{
  "status": "running",
  "sim_fps": 60,
  "parallel_variants": 512,
  "best_variant_score": 0.847
}
```

#### `POST /api/sim/correct`
Receives a voice/text correction string. Parses parameter changes, regenerates STL, reloads sim, and logs the correction plus before/after params to Backboard memory for the supplied `user_id`.

**Request body:**
```json
{
  "correction": "extend the reach and widen the grip",
  "user_id": "user_abc123"
}
```

**Response body:**
```json
{
  "status": "updated",
  "param_changes": {
    "arm_length_m": 1.15,
    "gripper_width_m": 0.11
  },
  "new_stl_url": "/static/robot_current.stl"
}
```

#### `POST /api/sim/stop`
Stops the running simulation. Returns `{"status": "stopped"}`.

#### `GET /api/sim/status`
Returns current sim state.

**Response body:**
```json
{
  "running": true,
  "fps": 58,
  "step": 14203,
  "best_score": 0.851
}
```

---

### 3.5 Export

#### `GET /api/export/bom`
Triggers ADI catalog agent. Returns Bill of Materials with Analog Devices part numbers.

**Response body:**
```json
{
  "bom": [
    {
      "category": "IMU",
      "part_number": "ADIS16470",
      "description": "10-DOF inertial sensor with accelerometer, gyroscope, magnetometer",
      "justification": "Required for joint angle feedback and dynamic balance correction",
      "quantity": 4,
      "datasheet_url": "https://www.analog.com/en/products/adis16470.html"
    },
    {
      "category": "Motor Driver",
      "part_number": "TMC2209",
      "description": "Stepper motor driver with StealthChop",
      "justification": "Silent, precise servo control for 4-DOF joint actuation",
      "quantity": 4,
      "datasheet_url": "..."
    }
  ]
}
```

#### `GET /api/export/rationale`
Returns deterministic design rationale for the current robot CAD. This is not the Backboard integration anymore; Backboard is persistent memory across Plan Mode, specs, corrections, and design iterations.

**Response body:**
```json
{
  "explanations": [
    {
      "component": "Arm Length",
      "value": "0.98m",
      "reason": "Derived from motion capture: peak wrist extension was 98cm from shoulder origin across 3 reps"
    },
    {
      "component": "Gripper Width",
      "value": "85mm",
      "reason": "Box grip aperture measured from video: average 8.5cm gap between thumb and index at grip"
    }
  ]
}
```

#### `GET /api/export/stl`
Returns final STL file download. Same as `/api/cad/stl` but sets `Content-Disposition: attachment`.

### 3.6 Session + Backboard Memory

#### `GET /api/session`
Creates or returns a backend session token that the frontend stores and sends with every request.

**Response body:**
```json
{
  "session_id": "session_1712345678",
  "user_id": "user_1712345678"
}
```

The frontend does not call Backboard directly. It only passes `session_id` and `user_id` to backend endpoints. All Backboard calls happen in backend modules.

---

### 3.7 Static Files

**`GET /static/{filename}`**
FastAPI `StaticFiles` mount at `/static` pointing to `./static/` directory. Serves STL files, URDF, etc.

---

## 4. WebSocket Protocol

### Endpoint: `ws://localhost:8000/ws/sim`

**Connection lifecycle:**
1. Frontend connects on SimViewer mount
2. Backend immediately starts streaming frames
3. On disconnect, backend pauses frame encoding (but sim keeps running)
4. Frontend auto-reconnects after 2 seconds on any drop

**Message types (server → client):**

All messages are binary or JSON text. Binary = JPEG frame. JSON text = status/control messages.

#### Frame message (binary)
Raw JPEG bytes. Frontend reads as `Blob` → `URL.createObjectURL` → draws to canvas. Expected size: ~15–40KB per frame at 640×480 JPEG quality 75.

Frontend frame rate: 30fps. Backend encodes and sends at 30fps.

#### Status message (JSON text)
```json
{
  "type": "status",
  "fps": 29.8,
  "step": 14203,
  "score": 0.851,
  "gpu_util_pct": 87
}
```
Sent every 1 second alongside frames.

#### Error message (JSON text)
```json
{
  "type": "error",
  "message": "MuJoCo model reload failed: invalid mesh vertices"
}
```

**Message types (client → server):**

#### Ping (keep-alive)
```json
{"type": "ping"}
```
Server responds with `{"type": "pong"}`.

---

## 5. Data Flow

```
Plan Mode (Omi / Web Speech)
        │
        ▼
Backboard memory + LLM → robot_spec JSON
        │
        ├──────────────────────────────────────────┐
        ▼                                          ▼
Pipeline A                                  Pipeline B
Phone LiDAR → .obj upload                  Phone video → .mp4 upload
trimesh clean                              MediaPipe GPU @ 30fps
MuJoCo static mesh                         motion_params JSON
        │                                          │
        │                                          ▼
        │                                  merge(robot_spec + motion_params)
        │                                          │
        │                                          ▼
        │                                  OpenSCAD parametric template
        │                                  → .scad → compile → .stl
        │                                          │
        └──────────────────┬───────────────────────┘
                           ▼
                   MuJoCo MJX sim
                   512 parallel variants on ASUS GPU
                   best variant selected
                           │
                           ▼
                   WebSocket stream → Three.js (frontend)
                           │
                   User speaks correction
                           │
                           ▼
                   Web Speech API → text
                   POST /api/sim/correct
                   backend parses → param delta
                   Backboard logs correction memory
                   OpenSCAD regenerates STL
                   MuJoCo reloads
                   (loop back to WebSocket stream)
                           │
                   User satisfied
                           ▼
                   GET /api/export/bom → ADI parts
                   GET /api/export/rationale → explanations
                   GET /api/export/stl → file download
```

---

## 6. Environment Variables

### Frontend: `frontend/.env.local`
```
NEXT_PUBLIC_BACKEND_URL=https://<your-cloudflare-tunnel>.trycloudflare.com
NEXT_PUBLIC_WS_URL=wss://<your-cloudflare-tunnel>.trycloudflare.com
NEXT_PUBLIC_ELEVENLABS_API_KEY=<elevenlabs_key>
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```
> **Note:** `NEXT_PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_WS_URL` change every time Cloudflare Tunnel restarts. Update and redeploy (or use `vercel env pull` if on local dev server).

### Backend: `backend/.env`
```
OLLAMA_HOST=http://localhost:11434
ELEVENLABS_API_KEY=<elevenlabs_key>
STATIC_DIR=./static
ROBOT_TEMPLATES_DIR=../robot_templates
OPENSCAD_BIN=/usr/bin/openscad
BACKBOARD_API_KEY=<backboard_key>
```

---

## 7. Cloudflare Tunnel Setup

```bash
# Install once
brew install cloudflare/cloudflare/cloudflared

# Run tunnel (do this before starting demo)
cloudflared tunnel --url http://localhost:8000
# Outputs: https://random-words-here.trycloudflare.com
# Copy that URL into frontend/.env.local and redeploy
```

The tunnel is unauthenticated (free tier, no account needed). It restarts with a new URL each run — update env vars and push to Vercel each time.

---

## 8. GPU Requirements and MJX Initialization

**Hardware required:** NVIDIA GPU with CUDA 12.x (ASUS GPU provided at hackathon)

**Driver/library versions:**
- CUDA 12.1+
- JAX with CUDA: `pip install "jax[cuda12_pip]" -f https://storage.googleapis.com/jax-releases/jax_cuda_releases.html`
- MuJoCo: `pip install mujoco mujoco-mjx`

**MJX initialization (in `sim.py`):**
```python
import jax
import jax.numpy as jnp
import mujoco
import mujoco.mjx as mjx

# Verify GPU is visible to JAX
assert jax.devices()[0].platform == 'gpu', "No GPU detected — check CUDA install"

# Load model
model = mujoco.MjModel.from_xml_path("model.xml")
mx = mjx.put_model(model)  # moves model to GPU

# Batch of 512 initial states
data = mujoco.MjData(model)
dx = mjx.put_data(model, data)
batched_dx = jax.vmap(lambda _: dx)(jnp.arange(512))

# Step function (JIT compiled, runs entire batch on GPU)
@jax.jit
def step_batch(mx, dx_batch):
    return jax.vmap(mjx.step, in_axes=(None, 0))(mx, dx_batch)
```

**Fallback (CPU MuJoCo, no MJX):**
If `jax.devices()[0].platform != 'gpu'`, fall back to sequential CPU MuJoCo. Drop parallel runs (just run 1 sim). Log warning. Do not crash. See `BUILD_ORDER.md` for fallback plan.

---

## 9. Error Handling Strategy

| Pipeline | Failure Mode | Recovery |
|---|---|---|
| Plan Mode / Backboard | Backboard unavailable | Fall back to local Ollama if running, otherwise deterministic demo prompts |
| Plan Mode / Backboard | Memory lookup fails | Start fresh but keep app usable; log warning and keep same response shape |
| Plan Mode / LLM | Malformed JSON spec | Retry with stricter prompt up to 3 times, then return partial spec |
| Pipeline A / mesh | .obj has bad geometry | trimesh `process=True` auto-repairs; if still bad, return error with vertex count |
| Pipeline A / MuJoCo | Model reload crash | Catch exception, return `{"status": "error", "message": "..."}`, keep old model loaded |
| Pipeline B / MediaPipe | No pose detected in video | Return `motion_params` with defaults from robot_spec only |
| Pipeline B / OpenSCAD | Compile fails | Return stderr from OpenSCAD, keep previous STL |
| Sim / MJX | GPU OOM | Reduce batch from 512 to 64, retry |
| Sim / WebSocket | Client drops | Pause encoding, wait for reconnect, resume cleanly |
| ElevenLabs TTS | API failure | Fall back to browser `window.speechSynthesis` (no API call needed) |

---

## 10. Sponsor Integration Map

| Sponsor | Where in architecture |
|---|---|
| **ASUS GPU** | MuJoCo MJX (`sim.py`), MediaPipe GPU backend (`pipeline_b.py`), optional local Mistral fallback (`plan_mode.py`) |
| **Omi** | `/api/omi-webhook` endpoint + Plan Mode voice conversation (`plan_mode.py`) |
| **Analog Devices** | ADI catalog query + BOM generation (`adi_agent.py`) + `/api/export/bom` |
| **Vercel** | Next.js frontend deployed at `https://forgebot.vercel.app` |
| **Backboard** | Persistent memory layer for Plan Mode context, robot specs, correction history, design iterations, and user preferences (`backboard_memory.py`) |

---

## 11. Backboard Persistent Memory Integration

Backboard replaces the old "design literacy panel" concept. It is now the memory backbone for the whole app.

### Backend client

```python
from backboard import AsyncClient

client = AsyncClient(api_key=BACKBOARD_API_KEY)
```

### Plan Mode

Every Plan Mode message goes through Backboard:

```python
async def plan_mode_message(user_message: str, user_id: str) -> str:
    response = await client.send_message(
        message=user_message,
        memory="Auto",
        user_id=user_id,
    )
    return response.content
```

Backboard remembers prior user preferences like warehouse use, heavy payload defaults, preferred reach, gripper preferences, and repeated constraints. On future sessions, Plan Mode should ask fewer questions when memory already provides an answer.

### Session resume

Before Plan Mode starts, query Backboard:

```python
async def get_user_context(user_id: str) -> str:
    response = await client.send_message(
        message="Summarize what this user has built before and their preferences.",
        memory="Auto",
        user_id=user_id,
    )
    return response.content
```

If useful history exists, Plan Mode opens with a welcome-back message such as: "Welcome back. Last time you were designing a 4-DOF warehouse arm with 110cm reach. Want to continue from there or start fresh?"

### Correction loop

Every correction gets logged:

```python
async def log_correction(user_id: str, correction: str, params_before: dict, params_after: dict) -> None:
    await client.send_message(
        message=f"User corrected: '{correction}'. Params changed from {params_before} to {params_after}.",
        memory="Auto",
        user_id=user_id,
    )
```

Future CAD generation should use this memory to bias defaults toward the user's repeated preferences.
