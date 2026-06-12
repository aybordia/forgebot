# TANUSH_3_BACKEND.md — Backend Phase 3: Sim WebSocket, Correction Loop, ADI BOM, Design Rationale, Export

> **Read ARCHITECTURE.md before starting any work in this file.**
> **Prerequisites: TANUSH_1_BACKEND.md and AYAN_2_BACKEND.md (backend phases 1 and 2) must be fully complete.**
> **Hackathon context: working demo over perfect code. Move fast.**
> **After every major step: `git add -A && git commit -m "<message>" && git push origin backend`**

---

## What You Are Building in This File

1. **`sim.py`** — MuJoCo MJX parallel sim, JPEG frame rendering, WebSocket stream, correction loop
2. **`adi_agent.py`** — ADI BOM generation from robot spec
3. **`design_rationale.py`** — Design rationale
4. **Export endpoint** — returns STL + BOM + design rationale in one response
5. **Final wiring** in `main.py` — replace remaining stubs with real implementations

---

## Step 1: `backend/sim.py` — MuJoCo Sim + WebSocket

### Module-level state

```python
import asyncio, logging, time, threading, io
import numpy as np
import cv2
import mujoco
import mujoco.mjx as mjx
import jax
import jax.numpy as jnp
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Optional, Set

logger = logging.getLogger(__name__)

# Sim state
sim_running: bool = False
gpu_available: bool = False
current_model: Optional[mujoco.MjModel] = None
current_data: Optional[mujoco.MjData] = None
sim_step_count: int = 0
current_fps: float = 0.0
best_score: float = 0.0

# MJX GPU state (only set if gpu_available == True)
mx = None           # mjx model on GPU
batched_dx = None   # batched MjData (512 copies)

# WebSocket clients
ws_clients: Set[WebSocket] = set()

# Latest rendered frame (JPEG bytes)
latest_frame: bytes = b""

# Sim task handle
sim_task: Optional[asyncio.Task] = None
```

### `build_model_xml(env_stl_path: Optional[str], robot_stl_path: Optional[str]) -> str` function

Writes a MuJoCo XML file to `/tmp/forgebot_model.xml` and returns that path.

XML structure:
```xml
<mujoco model="forgebot">
  <option gravity="0 0 -9.81" timestep="0.002"/>
  <visual>
    <global offwidth="640" offheight="480"/>
  </visual>
  <asset>
    <!-- Include env mesh if path provided and file exists -->
    <mesh name="environment" file="{env_stl_path}" scale="1 1 1"/>
    <!-- Include robot mesh if path provided and file exists -->
    <mesh name="robot" file="{robot_stl_path}" scale="0.001 0.001 0.001"/>
  </asset>
  <worldbody>
    <light diffuse=".8 .8 .8" pos="0 0 5" dir="0 0 -1"/>
    <camera name="fixed" pos="2 -2 2" xyaxes="1 0 0 0 1 1"/>
    <geom name="ground" type="plane" size="10 10 0.1" rgba=".85 .85 .85 1"/>
    <!-- env body only if env mesh exists -->
    <body name="environment" pos="0 0 0">
      <geom type="mesh" mesh="environment" mass="0" contype="1" conaffinity="1" rgba=".7 .7 .75 1"/>
    </body>
    <!-- robot body only if robot stl exists -->
    <body name="robot_body" pos="0 0 0.5">
      <freejoint/>
      <geom type="mesh" mesh="robot" mass="5.0" contype="1" conaffinity="1" rgba=".2 .5 .9 1"/>
    </body>
  </worldbody>
</mujoco>
```

Rules:
- Only include `<mesh>` asset and `<body>` tags for files that actually exist on disk
- If neither mesh exists: use a simple sphere as a placeholder robot:
  ```xml
  <body name="robot_body" pos="0 0 1">
    <freejoint/>
    <geom type="sphere" size="0.15" mass="1.0" rgba=".2 .5 .9 1"/>
  </body>
  ```
- Always include the ground plane and camera

### `init_sim(model_xml_path: str) -> bool` function

```python
global gpu_available, current_model, current_data, mx, batched_dx

try:
    current_model = mujoco.MjModel.from_xml_path(model_xml_path)
    current_data = mujoco.MjData(current_model)
    logger.info(f"MuJoCo model loaded: {current_model.nq} DoF")
except Exception as e:
    logger.error(f"MuJoCo model load failed: {e}")
    return False

# Try GPU/MJX path
try:
    devices = jax.devices()
    gpu = next((d for d in devices if d.platform == 'gpu'), None)
    if gpu:
        mx = mjx.put_model(current_model)
        dx_single = mjx.put_data(current_model, current_data)
        
        # Create 512 variants with small qpos perturbations
        def make_variant(seed):
            dx = mjx.put_data(current_model, current_data)
            return dx  # MJX handles batching via vmap
        
        batched_dx = jax.vmap(lambda _: mjx.put_data(current_model, current_data))(jnp.arange(512))
        gpu_available = True
        logger.info("✅ MJX GPU initialized — 512 parallel variants ready")
    else:
        gpu_available = False
        logger.warning("⚠️ No GPU — using CPU single sim")
except Exception as e:
    gpu_available = False
    logger.warning(f"MJX init failed, using CPU: {e}")

return True
```

### `step_batch_gpu(mx, dx_batch)` function — JAX JIT compiled

```python
@jax.jit
def step_batch_gpu(mx, dx_batch):
    return jax.vmap(mjx.step, in_axes=(None, 0))(mx, dx_batch)
```

This must be defined at module level (not inside a function) so JAX can JIT compile it properly.

### `select_best_variant(dx_batch) -> int` function

```python
def score_fn(dx):
    # Score: negative position deviation from origin (stable = better)
    return -jnp.linalg.norm(dx.qpos[:3])

scores = jax.vmap(score_fn)(dx_batch)
return int(jnp.argmax(scores))
```

### `render_frame(model: mujoco.MjModel, data: mujoco.MjData) -> bytes` function

```python
renderer = mujoco.Renderer(model, height=480, width=640)
renderer.update_scene(data, camera="fixed")
pixels = renderer.render()   # RGB numpy array (480, 640, 3)
renderer.close()

bgr = cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR)
_, buf = cv2.imencode('.jpg', bgr, [cv2.IMWRITE_JPEG_QUALITY, 75])
return buf.tobytes()
```

### `broadcast_frame(frame_bytes: bytes)` async function

```python
async def broadcast_frame(frame_bytes: bytes):
    dead = set()
    for ws in ws_clients:
        try:
            await ws.send_bytes(frame_bytes)
        except Exception:
            dead.add(ws)
    ws_clients.difference_update(dead)
```

### `broadcast_status(fps, step, score, gpu_util)` async function

```python
import json as _json

async def broadcast_status(fps, step, score, gpu_util):
    msg = _json.dumps({"type": "status", "fps": fps, "step": step, "score": score, "gpu_util_pct": gpu_util})
    dead = set()
    for ws in ws_clients:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    ws_clients.difference_update(dead)
```

### `sim_loop()` async function

```python
async def sim_loop():
    global sim_running, sim_step_count, current_fps, best_score, batched_dx, latest_frame
    
    fps_counter = 0
    fps_timer = time.time()
    render_every = 2  # render every 2 physics steps
    
    while sim_running:
        loop_start = time.time()
        
        try:
            if gpu_available and mx is not None and batched_dx is not None:
                # GPU: step all 512 variants
                batched_dx = step_batch_gpu(mx, batched_dx)
                best_idx = select_best_variant(batched_dx)
                best_score = float(-jnp.linalg.norm(batched_dx.qpos[best_idx, :3]))
                # Get CPU data for rendering from best variant
                # (mjx.get_data converts GPU data back to CPU MjData)
                best_cpu_data = mjx.get_data(current_model, jax.tree_map(lambda x: x[best_idx], batched_dx))
                render_data = best_cpu_data
            else:
                # CPU: single step
                mujoco.mj_step(current_model, current_data)
                render_data = current_data
            
            sim_step_count += 1
            fps_counter += 1
            
            # Render and broadcast every Nth step
            if sim_step_count % render_every == 0:
                frame = render_frame(current_model, render_data)
                latest_frame = frame
                await broadcast_frame(frame)
            
            # Broadcast status every 60 steps (~1 second at 60Hz)
            if sim_step_count % 60 == 0:
                elapsed = time.time() - fps_timer
                current_fps = fps_counter / elapsed if elapsed > 0 else 0
                fps_counter = 0
                fps_timer = time.time()
                
                # Get GPU utilization via nvidia-smi
                gpu_util = 0
                try:
                    import subprocess
                    result = subprocess.run(
                        ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
                        capture_output=True, text=True, timeout=1
                    )
                    if result.returncode == 0:
                        gpu_util = int(result.stdout.strip())
                except Exception:
                    pass
                
                await broadcast_status(current_fps, sim_step_count, best_score, gpu_util)
        
        except Exception as e:
            logger.error(f"Sim loop error at step {sim_step_count}: {e}")
        
        # Target ~60Hz physics
        elapsed = time.time() - loop_start
        sleep_time = max(0, (1/60) - elapsed)
        await asyncio.sleep(sleep_time)
```

### WebSocket endpoint

```python
ws_router = APIRouter()

@ws_router.websocket("/ws/sim")
async def websocket_sim(websocket: WebSocket):
    await websocket.accept()
    ws_clients.add(websocket)
    logger.info(f"WebSocket client connected. Total: {len(ws_clients)}")
    
    try:
        while True:
            # Receive messages (ping/pong keep-alive)
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        ws_clients.discard(websocket)
        logger.info(f"WebSocket client disconnected. Remaining: {len(ws_clients)}")
    except Exception as e:
        ws_clients.discard(websocket)
        logger.warning(f"WebSocket error: {e}")
```

### Correction parsing with Ollama

```python
def parse_correction(correction: str) -> dict:
    prompt = f"""The user said: "{correction}"
Extract robot parameter changes as JSON. Output ONLY valid JSON, nothing else.
Valid keys: arm_length_m (float 0.3-1.5), gripper_width_m (float 0.04-0.15), dof (int 3-6), link_radius_m (float 0.015-0.06).
Only include keys that were explicitly mentioned. If nothing was mentioned, output {{}}.
Example output: {{"arm_length_m": 1.2, "gripper_width_m": 0.11}}"""

    try:
        response = requests.post(
            "http://localhost:11434/api/chat",
            json={"model": "mistral", "messages": [{"role": "user", "content": prompt}], "stream": False},
            timeout=15
        )
        reply = response.json()["message"]["content"]
        import re
        match = re.search(r'\{[^{}]*\}', reply)
        if match:
            return json.loads(match.group())
    except Exception as e:
        logger.warning(f"Correction parsing failed: {e}")
    return {}
```

### Sim routes

```python
router = APIRouter()

@router.post("/load")
async def load_sim() -> dict:
    global sim_running, sim_task, sim_step_count, best_score
    
    # Stop existing sim if running
    sim_running = False
    if sim_task and not sim_task.done():
        sim_task.cancel()
        try: await sim_task
        except asyncio.CancelledError: pass
    
    # Import mesh paths from other modules
    from pipeline_a import environment_stl_path, environment_mesh
    from cad_generator import STL_OUTPUT_PATH
    
    env_path = environment_stl_path if environment_mesh is not None else None
    robot_path = STL_OUTPUT_PATH if os.path.exists(STL_OUTPUT_PATH) else None
    
    xml_path = build_model_xml(env_path, robot_path)
    success = init_sim(xml_path)
    
    if not success:
        raise HTTPException(500, "MuJoCo model failed to load — check logs")
    
    # Start sim loop as background task
    sim_running = True
    sim_step_count = 0
    sim_task = asyncio.create_task(sim_loop())
    
    return {
        "status": "running",
        "sim_fps": 60,
        "parallel_variants": 512 if gpu_available else 1,
        "best_variant_score": 0.0
    }

@router.post("/correct")
async def correct_sim(req: dict) -> dict:
    correction = req.get("correction", "")
    param_changes = parse_correction(correction)
    logger.info(f"Correction '{correction}' parsed to params: {param_changes}")
    
    if param_changes:
        from cad_generator import last_params_used, last_motion_params, merge_params_and_generate
        
        # Apply changes to current params
        updated_params = dict(last_params_used)
        updated_params.update(param_changes)
        
        # Regenerate STL with updated params
        import asyncio as _asyncio
        loop = _asyncio.get_event_loop()
        
        # Build fake spec from current params to feed into generate
        fake_spec = {
            "task": "updated", "payload_kg": updated_params.get("payload_factor", 1.0) * 5,
            "mounted": updated_params.get("mounted", True),
            "reach_cm": updated_params.get("arm_length_m", 0.9) * 100,
            "dof": updated_params.get("dof", 4),
            "gripper_type": updated_params.get("gripper_type", "parallel"), "notes": ""
        }
        
        await loop.run_in_executor(None, merge_params_and_generate, fake_spec, last_motion_params)
        
        # Reload sim with new STL
        await load_sim()
    
    return {
        "status": "updated",
        "param_changes": param_changes,
        "new_stl_url": "/static/robot_current.stl"
    }

@router.post("/stop")
async def stop_sim() -> dict:
    global sim_running
    sim_running = False
    return {"status": "stopped"}

@router.get("/status")
async def sim_status() -> dict:
    return {
        "running": sim_running,
        "fps": round(current_fps, 1),
        "step": sim_step_count,
        "best_score": round(best_score, 4)
    }
```

---

## Step 2: `backend/adi_agent.py` — ADI Bill of Materials

### Hardcoded ADI catalog + selection logic

See BACKEND_SPEC.md for the full `ADI_CATALOG` list. Copy it exactly.

### `generate_bom(robot_spec: dict, params_used: dict) -> list[dict]` function

Selection rules:
- Always include: ADIS16470 (qty = dof), LTC3780 (qty=1), AD8221 (qty=2)
- If `dof >= 4`: include TMC2209 (qty = dof)
- If `payload_kg >= 2.0`: include AD7606C-18 (qty=1)

For each selected part, build a justification sentence using the robot_spec values. Example:
- ADIS16470: `f"{params_used.get('dof',4)} ADIS16470 IMUs provide per-joint angle feedback for the {robot_spec.get('task','pick and place')} task carrying {robot_spec.get('payload_kg',2.5)}kg payload"`

Return a list of BOM dicts with: `category, part_number, description, justification, quantity, datasheet_url`

### Route

```python
router = APIRouter()

@router.get("/bom")
async def get_bom() -> dict:
    from plan_mode import robot_specs
    from cad_generator import last_params_used
    
    spec = robot_specs.get("default") or robot_specs.get("omi-default") or {}
    if not spec:
        # Use a default spec for demo purposes
        spec = {"task": "pick and place", "payload_kg": 2.5, "dof": 4}
    
    bom = generate_bom(spec, last_params_used)
    return {"bom": bom}
```

---

## Step 3: `backend/design_rationale.py` — Design Rationale

### `generate_explanations(params_used: dict, motion_params: dict, robot_spec: dict) -> list[dict]` function

Deterministic string generation — no Ollama call needed. Faster and more reliable.

Generate one explanation dict per parameter: `{"component": str, "value": str, "reason": str}`

Explanations to generate:

```
"Arm Length":
  value = f"{params_used.get('arm_length_m', 0.9) * 100:.0f}cm"
  reason = f"Motion capture peak wrist reach was {motion_params.get('max_reach_cm', 80):.0f}cm across {motion_params.get('reps_detected', 0)} reps. Added 10% clearance margin."

"Gripper Width":
  value = f"{params_used.get('gripper_width_m', 0.08) * 1000:.0f}mm"
  reason = f"Grip aperture from video: {motion_params.get('grip_aperture_cm', 7):.1f}cm average at moment of object contact."

"Link Thickness":
  value = f"{params_used.get('link_radius_m', 0.02) * 1000:.0f}mm radius"
  reason = f"Scaled for {robot_spec.get('payload_kg', 2.5)}kg payload with 2× safety factor. Baseline 20mm at 1kg payload."

"Degrees of Freedom":
  value = f"{params_used.get('dof', 4)}-DOF"
  reason = f"Matched to spec: {params_used.get('dof', 4)} rotational joints provide full workspace coverage for {robot_spec.get('task', 'pick and place')} task."

"Gripper Type":
  value = params_used.get('gripper_type', 'parallel').capitalize()
  reason = ("Parallel gripper selected for consistent grip force on regular-shaped objects."
            if params_used.get('gripper_type') == 'parallel'
            else "Adaptive gripper selected for irregular object geometries.")

"Base Mounting":
  value = "Fixed base plate" if params_used.get('mounted', True) else "Mobile base"
  reason = ("Fixed mount to surface: optimal for reach repeatability in a defined workspace."
            if params_used.get('mounted', True)
            else "Mobile base: allows repositioning for dynamic workspace coverage.")
```

### Route

```python
router = APIRouter()

@router.get("/rationale")
async def get_rationale() -> dict:
    from cad_generator import last_params_used, last_motion_params
    from plan_mode import robot_specs
    
    spec = robot_specs.get("default") or {}
    explanations = generate_explanations(last_params_used, last_motion_params, spec)
    return {"explanations": explanations}
```

---

## Step 4: Export Endpoint — All Three Artifacts

Add this to `main.py` as an inline route (since it aggregates multiple modules):

```python
from fastapi.responses import FileResponse
import os

@app.get("/api/export/stl")
async def export_stl():
    from cad_generator import STL_OUTPUT_PATH
    if not os.path.exists(STL_OUTPUT_PATH):
        raise HTTPException(404, "No STL generated yet")
    return FileResponse(
        STL_OUTPUT_PATH,
        media_type="model/stl",
        headers={"Content-Disposition": "attachment; filename=forgebot_robot.stl"}
    )
```

The BOM and design rationale routes are already in their respective modules. They are reachable at `/api/export/bom` and `/api/export/rationale`.

---

## Step 5: Final `main.py` Wiring

Replace all remaining stubs in `main.py` with real router imports:

```python
from sim import router as sim_router, ws_router
from adi_agent import router as adi_router
from design_rationale import router as rationale_router

app.include_router(sim_router, prefix="/api/sim")
app.include_router(ws_router)          # handles /ws/sim — no prefix
app.include_router(adi_router, prefix="/api/export")
app.include_router(rationale_router, prefix="/api/export")
```

Remove any remaining inline stub versions of these routes.

---

## Step 6: Full End-to-End Test

Run the complete correction loop with curl:

```bash
# 1. Load sim
curl -X POST http://localhost:8000/api/sim/load
# Expected: {"status":"running","sim_fps":60,...}

# 2. Connect WebSocket and verify frames are arriving
# Use browser DevTools → Network → WS → connect to ws://localhost:8000/ws/sim
# You should see binary frames arriving

# 3. Send a correction
curl -X POST http://localhost:8000/api/sim/correct \
  -H "Content-Type: application/json" \
  -d '{"correction": "extend the reach and make it stronger"}'
# Expected: {"status":"updated","param_changes":{...},"new_stl_url":"..."}

# 4. Get BOM
curl http://localhost:8000/api/export/bom
# Expected: {"bom":[{...ADIS16470...},{...},...]}

# 5. Get design rationale
curl http://localhost:8000/api/export/rationale
# Expected: {"explanations":[{"component":"Arm Length","value":"...","reason":"..."},...]}`

# 6. Download STL
curl http://localhost:8000/api/export/stl -o /tmp/final_robot.stl
# Expected: binary STL file
```

Final commit:
```bash
git add -A && git commit -m "feat(backend): sim WebSocket, correction loop, ADI BOM, design rationale, export — BACKEND COMPLETE" && git push origin backend
```

---

## Merge Instructions (Run After Ayan Finishes)

1. Both push final commits to your branches
2. On GitHub: open a PR from `frontend` into `backend` (the frontend branch into the backend branch)
3. Open Claude Code pointed at the merged repo
4. Say: **"Read ARCHITECTURE.md, TANUSH_3_BACKEND.md, and AYAN_3_FRONTEND.md. The backend branch and frontend branch have been merged. Identify any integration issues between them — endpoint URL mismatches, response format differences, WebSocket message format differences, import errors — and fix them all."**
5. Claude Code does a final integration pass
6. Run full end-to-end demo flow and verify it works
7. Final push to `main`

---

## ✅ Success Criteria — TANUSH_3_BACKEND is Done When:

- [ ] `/ws/sim` streams real MuJoCo JPEG frames (not black images) to browser DevTools
- [ ] GPU monitor shows utilization spiking when sim runs (if GPU available)
- [ ] `POST /api/sim/correct` with a text correction regenerates STL and reloads sim
- [ ] `GET /api/export/bom` returns at least 3 ADI parts with real justifications
- [ ] `GET /api/export/rationale` returns at least 5 design rationale
- [ ] `GET /api/export/stl` returns a downloadable STL file
- [ ] Full correction loop works: speak correction → sim updates → frames change in browser
- [ ] All changes committed and pushed to `backend` branch
- [ ] Ayan is notified: "Backend is ready — all endpoints are live at [tunnel URL]"
