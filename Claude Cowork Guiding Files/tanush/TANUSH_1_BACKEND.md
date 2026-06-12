# TANUSH_1_BACKEND.md — Backend Phase 1: Repo Setup, FastAPI Skeleton, MuJoCo GPU

> **Read ARCHITECTURE.md before starting any work in this file.**
> **Hackathon context: working demo over perfect code. Move fast.**
> **After every major step: `git add -A && git commit -m "<message>" && git push origin backend`**
> **Repo: https://github.com/aybordia/forgebot**

---

## Your Role

You are building backend phase 1 for Forgebot. The work is split 50-50 between you and Ayan across both stacks — you own backend phase 1, frontend phase 2, and backend phase 3; Ayan owns frontend phase 1, backend phase 2, and frontend phase 3. Backend work always happens on the `backend` branch and frontend work on the `frontend` branch. While working this file, you only touch files in `backend/`.

The shared contract is `ARCHITECTURE.md` — every API endpoint and WebSocket format defined there is what Ayan's frontend will call. Build exactly to that spec.

---

## Step 1: GitHub Branch Setup

```bash
git clone https://github.com/aybordia/forgebot
cd forgebot
git checkout -b backend
git push -u origin backend
```

Create the full folder structure now so future steps have a home:

```bash
mkdir -p backend/static
mkdir -p robot_templates/grippers
mkdir -p assets
touch backend/main.py
touch backend/plan_mode.py
touch backend/pipeline_a.py
touch backend/pipeline_b.py
touch backend/sim.py
touch backend/cad_generator.py
touch backend/adi_agent.py
touch backend/backboard.py
touch backend/requirements.txt
touch backend/.env
touch robot_templates/arm_4dof.scad
touch robot_templates/grippers/parallel.scad
touch robot_templates/grippers/adaptive.scad
```

Commit this structure immediately:
```bash
git add -A && git commit -m "chore: init backend folder structure" && git push origin backend
```

---

## Step 2: Python Environment Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

Write this exact content to `backend/requirements.txt`:
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
ollama==0.2.0
```

Install:
```bash
pip install -r requirements.txt
```

GPU JAX install (run separately — this is a different index):
```bash
pip install "jax[cuda12_pip]" -f https://storage.googleapis.com/jax-releases/jax_cuda_releases.html
```

Verify JAX GPU:
```bash
python3 -c "import jax; print(jax.devices()); assert jax.devices()[0].platform == 'gpu', 'NO GPU'"
```
If this fails, see Fallback A at the bottom of this file.

---

## Step 3: Ollama + Mistral Setup

```bash
# Install Ollama (if not already installed)
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama daemon in a background terminal
ollama serve &

# Pull Mistral 7B (~4GB — start this early, it takes a few minutes)
ollama pull mistral

# Verify it works
ollama run mistral "Say hello in one word"
```

Ollama listens on `http://localhost:11434`. The FastAPI backend calls it via HTTP POST — never install the `ollama` Python package for this, use `requests` directly.

---

## Step 4: OpenSCAD Install

```bash
# macOS
brew install openscad

# Ubuntu / Debian (ASUS GPU machine)
sudo apt-get install -y openscad

# Verify
openscad --version
```

---

## Step 5: Create `backend/.env`

```
OLLAMA_HOST=http://localhost:11434
STATIC_DIR=./static
ROBOT_TEMPLATES_DIR=../robot_templates
OPENSCAD_BIN=openscad
```

---

## Step 6: FastAPI Skeleton — `backend/main.py`

Build a fully stubbed FastAPI application. Every route from ARCHITECTURE.md must exist and return a valid response — even if the response is fake/hardcoded. This lets Ayan's frontend build and test against real endpoints immediately.

### Exact stub behavior for each endpoint:

**`GET /health`** → `{"status": "ok"}`

**`POST /api/plan/chat`** → `{"reply": "What task should the robot perform?", "is_complete": false, "robot_spec": null}`

**`POST /api/omi-webhook`** → same as above

**`GET /api/plan/spec/{session_id}`** → `{"spec": null}`

**`DELETE /api/plan/reset/{session_id}`** → `{"status": "reset"}`

**`POST /api/scan/upload`** → `{"status": "loaded", "mesh_bounds": {"min": [-2.5, -0.1, -3.0], "max": [2.5, 3.2, 3.0]}, "vertex_count": 5000, "cleaned_vertex_count": 4800}`

**`GET /api/scan/status`** → `{"loaded": false, "bounds": null, "vertex_count": null}`

**`POST /api/motion/upload`** → `{"status": "processed", "frames_analyzed": 100, "motion_params": {"max_reach_cm": 80.0, "avg_joint_angles_deg": [45.0, 90.0, 60.0, 20.0], "grip_aperture_cm": 7.0, "motion_speed": "medium", "endpoint_height_cm": 75.0, "reps_detected": 3}}`

**`POST /api/cad/generate`** → `{"status": "generated", "stl_url": "/static/robot_current.stl", "params_used": {}}`

**`GET /api/cad/stl`** → 404 until real STL exists (use `FileResponse`, return 404 if file missing)

**`POST /api/sim/load`** → `{"status": "running", "sim_fps": 60, "parallel_variants": 512, "best_variant_score": 0.0}`

**`POST /api/sim/correct`** → `{"status": "updated", "param_changes": {"arm_length_m": 1.1}, "new_stl_url": "/static/robot_current.stl"}`

**`POST /api/sim/stop`** → `{"status": "stopped"}`

**`GET /api/sim/status`** → `{"running": false, "fps": 0.0, "step": 0, "best_score": 0.0}`

**`GET /api/export/bom`** → hardcoded BOM list with 3 ADI parts (see ARCHITECTURE.md section 3.5 for format)

**`GET /api/export/backboard`** → hardcoded explanations list with 3 entries (see ARCHITECTURE.md section 3.5 for format)

**`GET /api/export/stl`** → FileResponse or 404

**`GET /mobile`** → serve `static/mobile.html` (create a minimal placeholder HTML file)

**`/ws/sim`** (WebSocket) → accept connection, immediately send a status JSON, then loop sending a small black 640×480 JPEG every 33ms

### FastAPI structure requirements:
- CORS middleware: `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`
- StaticFiles mounted at `/static` pointing to `./static/`
- All routes defined inline in `main.py` for now (no separate routers yet — keep it simple for the skeleton)
- Pydantic request/response models defined at top of `main.py`
- `if __name__ == "__main__": uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)`

### Placeholder STL for `/static/robot_current.stl`:
Create a minimal valid STL file so the frontend doesn't get a 404:
```bash
cat > backend/static/robot_current.stl << 'EOF'
solid cube
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid cube
EOF
```

### Placeholder mobile.html for `/static/mobile.html`:
```html
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Forgebot Mobile</title></head>
<body style="background:#111;color:#fff;font-family:sans-serif;padding:2rem;text-align:center;">
  <h1>FORGEBOT</h1>
  <button onclick="document.getElementById('envfile').click()" 
    style="display:block;width:100%;padding:1.5rem;background:#3b82f6;color:#fff;border:none;border-radius:1rem;font-size:1.2rem;margin-bottom:1rem;">
    📷 Scan Environment
  </button>
  <input id="envfile" type="file" accept=".obj" style="display:none" onchange="uploadFile(this,'scan')">
  <button onclick="document.getElementById('motionfile').click()"
    style="display:block;width:100%;padding:1.5rem;background:#10b981;color:#fff;border:none;border-radius:1rem;font-size:1.2rem;">
    🏃 Record Motion
  </button>
  <input id="motionfile" type="file" accept="video/*" capture="user" style="display:none" onchange="uploadFile(this,'motion')">
  <p id="status" style="margin-top:1rem;color:#9ca3af;"></p>
  <script>
    async function uploadFile(input, type) {
      const file = input.files[0]; if (!file) return;
      document.getElementById('status').textContent = 'Uploading...';
      const form = new FormData(); form.append('file', file);
      const url = type === 'scan' ? '/api/scan/upload' : '/api/motion/upload';
      const res = await fetch(url, { method: 'POST', body: form });
      const data = await res.json();
      document.getElementById('status').textContent = res.ok ? '✅ ' + JSON.stringify(data.status) : '❌ Error';
    }
  </script>
</body>
</html>
```

---

## Step 7: MuJoCo MJX GPU Initialization

Add a startup verification function to `main.py` that runs on app start (use FastAPI's `@app.on_event("startup")`):

```python
@app.on_event("startup")
async def startup():
    import jax
    import mujoco
    import mujoco.mjx as mjx
    
    try:
        devices = jax.devices()
        gpu_device = next((d for d in devices if d.platform == 'gpu'), None)
        if gpu_device:
            logger.info(f"✅ JAX GPU detected: {gpu_device}")
        else:
            logger.warning("⚠️  No JAX GPU detected — will use CPU fallback")
    except Exception as e:
        logger.warning(f"JAX check failed: {e}")
    
    # Verify MuJoCo loads
    try:
        xml = """
        <mujoco><option gravity="0 0 -9.81"/><worldbody>
          <geom type="plane" size="5 5 0.1"/>
          <body pos="0 0 1"><geom type="sphere" size="0.1" mass="1"/></body>
        </worldbody></mujoco>"""
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix='.xml', mode='w', delete=False) as f:
            f.write(xml); tmppath = f.name
        model = mujoco.MjModel.from_xml_path(tmppath)
        os.unlink(tmppath)
        logger.info("✅ MuJoCo loaded successfully")
    except Exception as e:
        logger.error(f"❌ MuJoCo failed to load: {e}")
```

This runs automatically on `uvicorn main:app --reload`. Check terminal for the ✅ lines before proceeding.

---

## Step 8: Cloudflare Tunnel

Install and run in a separate terminal (keep this running the whole hackathon):

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Ubuntu
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Run tunnel
cloudflared tunnel --url http://localhost:8000
```

It will print something like:
```
https://random-words-here.trycloudflare.com
```

**Copy this URL** and give it to Ayan so they can put it in `frontend/.env.local` as `NEXT_PUBLIC_BACKEND_URL`.

The tunnel URL changes every time you restart `cloudflared`. Try not to restart it during the demo.

---

## Step 9: GPU Utilization Monitor

Open a third terminal and run this for the demo:

```bash
watch -n 0.5 "nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader,nounits"
```

Position this terminal in the bottom-right of your screen, visible but not overlapping the main app.

---

## Step 10: Run FastAPI and Verify Everything

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Verify these manually with curl or browser:

```bash
# Health check
curl http://localhost:8000/health
# Expected: {"status":"ok"}

# Stub plan chat
curl -X POST http://localhost:8000/api/plan/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello", "session_id": "test"}'
# Expected: {"reply":"What task should...","is_complete":false,"robot_spec":null}

# WebSocket (use wscat or browser DevTools)
# ws://localhost:8000/ws/sim should send binary frames + status JSON
```

Commit working skeleton:
```bash
git add -A && git commit -m "feat(backend): FastAPI skeleton with all stub routes + MuJoCo GPU verification" && git push origin backend
```

---

## ✅ Success Criteria — TANUSH_1_BACKEND is Done When:

- [ ] `uvicorn main:app --reload` starts with no errors
- [ ] `curl http://localhost:8000/health` returns `{"status":"ok"}`
- [ ] Terminal shows `✅ JAX GPU detected` OR `⚠️ No JAX GPU detected` (either is acceptable — failure is a crash)
- [ ] Terminal shows `✅ MuJoCo loaded successfully`
- [ ] `ws://localhost:8000/ws/sim` accepts connections and sends binary frames
- [ ] All routes from ARCHITECTURE.md return stub JSON (no 500 errors)
- [ ] Cloudflare Tunnel URL is running and reachable from phone browser
- [ ] `nvidia-smi` monitor is open and visible
- [ ] Everything committed and pushed to `backend` branch

**When all boxes are checked, move to TANUSH_2_FRONTEND.md — you switch to the frontend, while Ayan picks up backend phase 2 in AYAN_2_BACKEND.md.**

---

## Fallback A: GPU Not Available

If `jax.devices()[0].platform != 'gpu'`:

1. Set a module-level flag in `main.py`: `GPU_AVAILABLE = False`
2. In sim-related code, always check this flag and use CPU path
3. For the demo: do not mention GPU utilization for the sim — focus on Ollama inference GPU usage instead
4. MediaPipe still uses GPU via its own backend — test separately
5. The demo still works — just drop the "512 parallel variants" claim; say "running physics simulation" instead
