# BUILD_ORDER.md — Forgebot 8-Hour Build Plan

> **Claude Code norm:** After every set of changes, always `git add -A && git commit -m "<message>" && git push` to https://github.com/aybordia/forgebot before stopping.

---

## Critical Rules

1. **Push to GitHub after every hour.** Repo: https://github.com/aybordia/forgebot
2. **Demo over perfection.** If a feature is 80% done and working, ship it. Don't polish what judges won't see.
3. **Never break the demo flow.** Keep a working `main` branch at all times. Do experimental work on feature branches.
4. **Mobile is secondary.** Get desktop working first. Mobile capture is nice-to-have; a pre-recorded video fallback is fine.

---

## Setup: Do This Before Hour 1 (15 minutes)

### Repo init
```bash
git clone https://github.com/aybordia/forgebot
cd forgebot
mkdir frontend backend robot_templates assets
```

### Environment files
Create `backend/.env`:
```
OLLAMA_HOST=http://localhost:11434
STATIC_DIR=./static
ROBOT_TEMPLATES_DIR=../robot_templates
OPENSCAD_BIN=openscad
BACKBOARD_API_KEY=your_key_here
```

Create `frontend/.env.local`:
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_ELEVENLABS_API_KEY=your_key_here
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

### Install all dependencies FIRST (takes 10-15 minutes — do this immediately)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn[standard] python-multipart pydantic requests numpy trimesh opencv-python mediapipe scipy mujoco mujoco-mjx ollama --break-system-packages
pip install backboard --break-system-packages

# GPU JAX (separate install, do this after the above)
pip install "jax[cuda12_pip]" -f https://storage.googleapis.com/jax-releases/jax_cuda_releases.html --break-system-packages
```

**Frontend:**
```bash
cd frontend
npx create-next-app@14 . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
npm install three qrcode.react
npm install --save-dev @types/three
```

**Ollama (if not already installed):**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull mistral    # downloads Mistral 7B — ~4GB, start now
```

**OpenSCAD:**
```bash
# macOS:
brew install openscad

# Ubuntu:
sudo apt-get install -y openscad
```

**Cloudflare Tunnel:**
```bash
# macOS:
brew install cloudflare/cloudflare/cloudflared
```

---

## TANUSH — Architecture Lead + Demo

### Hour 1: Repo + FastAPI Skeleton + Tunnel

**Goal:** FastAPI is running and reachable from a public URL. Frontend can fetch `/health`.

**Tasks:**
1. Create `backend/main.py` — FastAPI app with CORS middleware, `/health` endpoint, static files mount
2. Create `backend/static/` directory — add a placeholder `robot_current.stl` (any valid STL, even a cube)
3. Run FastAPI: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
4. Start Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:8000`
5. Copy the tunnel URL (e.g. `https://some-words.trycloudflare.com`) into `frontend/.env.local`
6. Verify: curl the tunnel URL `/health` from phone browser — should return `{"status": "ok"}`

**Checkpoint:** FastAPI responds at public HTTPS URL. ✓

---

### Hour 2: WebSocket + Sim Stub

**Goal:** Frontend SimViewer receives frames from WebSocket. Even if frames are just black images, the connection is live.

**Tasks:**
1. Create `backend/sim.py` with:
   - Module-level `sim_running`, `ws_clients`, `latest_frame` state
   - `/ws/sim` WebSocket endpoint
   - WebSocket handler: accepts connection, adds to `ws_clients`, handles ping/pong
   - Stub `sim_loop()`: generates a black 640×480 JPEG every 33ms, broadcasts to all clients
   - `POST /api/sim/load` endpoint: starts `sim_loop()` as asyncio background task
2. Wire `sim.py` router into `main.py`
3. Test WebSocket: open `ws://localhost:8000/ws/sim` in wscat or browser DevTools — confirm binary frames arrive

**Checkpoint:** Browser DevTools shows binary WebSocket messages arriving at ~30fps. ✓

---

### Hour 3: MuJoCo MJX on GPU

**Goal:** MuJoCo is running a real physics simulation. Frames show a robot in a scene.

**Tasks:**
1. In `sim.py`, implement `build_model_xml()` — generates minimal MuJoCo XML with a ground plane and a box representing the robot
2. Implement `init_mjx_sim()`:
   - Try GPU path: `jax.devices()[0].platform == 'gpu'` check
   - If GPU: initialize MJX, create 512 batched states, JIT-compile `step_batch_gpu`
   - If CPU: fall back to single `mujoco.MjData`, set `gpu_available=False`
3. Implement `render_frame()` — uses `mujoco.Renderer(model, 480, 640)` to render JPEG
4. Update `sim_loop()` to:
   - Call `step_batch_gpu` or `mujoco.mj_step` each iteration
   - Call `render_frame()` every 2 steps
   - Broadcast JPEG bytes to all WebSocket clients
   - Every 30 steps: broadcast status JSON with fps + gpu_util
5. Update `POST /api/sim/load` to call `init_mjx_sim()` before starting loop
6. Test: open frontend sim page — should see a rendered 3D scene streaming live

**Checkpoint:** Three.js canvas shows live MuJoCo frames. GPU monitor shows utilization. ✓

---

### Hour 4: Pipeline A + Pipeline B Connected to Sim

**Goal:** Uploading a mesh and a video loads them into the sim.

**Tasks:**
1. Create `backend/pipeline_a.py`:
   - `POST /api/scan/upload` endpoint
   - `clean_mesh()` function (trimesh load + process)
   - `GET /api/scan/status` endpoint
2. Create `backend/pipeline_b.py`:
   - `POST /api/motion/upload` endpoint
   - `process_video()` function (MediaPipe pose extraction)
   - Store motion params in module-level `last_motion_params`
3. Create `backend/cad_generator.py`:
   - `derive_openscad_params()` function
   - `generate_scad_file()` function
   - `compile_scad_to_stl()` function (calls OpenSCAD CLI)
   - `simplify_stl()` function
   - `merge_params_and_generate()` top-level function
4. Create robot templates: `robot_templates/arm_4dof.scad`, `robot_templates/grippers/parallel.scad`, `robot_templates/grippers/adaptive.scad` (paste from OPENSCAD_SPEC.md)
5. Update `sim.py`: `build_model_xml()` reads from `pipeline_a.environment_mesh` and `static/robot_current.stl` if they exist
6. Test end-to-end:
   - Upload a sample .obj (can use any .obj from the internet for testing)
   - Upload a short .mp4 video of arm movement
   - Call `POST /api/cad/generate` — verify STL appears in `static/`
   - Call `POST /api/sim/load` — verify robot STL shows in sim

**Checkpoint:** Uploading a .obj and .mp4 produces a robot STL that appears in the MuJoCo sim. ✓

---

### Hour 5: Correction Loop

**Goal:** Speaking a correction updates the sim live.

**Tasks:**
1. In `sim.py`, implement `parse_correction()` — uses Backboard/LLM if available, local Ollama fallback if available, and deterministic keyword fallback
2. Implement `POST /api/sim/correct`:
   - Calls `parse_correction()`
   - Loads `cad_generator.last_params_used`
   - Applies param overrides
   - Calls `cad_generator.merge_params_and_generate()` with updated params
   - Calls `backboard_memory.log_correction(user_id, correction, params_before, params_after)`
   - Stops current sim, calls `init_mjx_sim()` with new STL, restarts `sim_loop()`
3. Test: POST `{"correction": "make the arm longer"}` to `/api/sim/correct` — verify STL changes and sim reloads
4. Create `backend/plan_mode.py` — full implementation per BACKEND_SPEC.md
5. Test plan mode: POST to `/api/plan/chat` with `user_id` — verify Backboard-aware response or fallback response

**Checkpoint:** Voice correction → new STL → sim reloads. Plan Mode conversation works end-to-end. ✓

---

### Hour 6: ADI BOM + Design Rationale + Backboard Memory + Pre-Record Demo Videos

**Goal:** Export page works. Demo videos are recorded and ready.

**Tasks:**
1. Create `backend/adi_agent.py` — `generate_bom()` using hardcoded catalog + selection rules
2. Create `backend/design_rationale.py` — `generate_explanations()` deterministic generation
3. Create `backend/backboard_memory.py` — persistent memory helpers for Plan Mode resume and correction logging
4. Wire all relevant routers/helpers into `main.py`, `plan_mode.py`, and `sim.py`
5. Test: GET `/api/export/bom`, GET `/api/export/rationale`, and GET `/api/plan/context/{user_id}` — verify real data or safe fallback returns
6. **Pre-record demo videos:**
   - Video 1 (30 sec): Screen record of guided environment scan flow on phone (stages 1-5 + heatmap)
   - Video 2 (30 sec): Screen record of motion capture on phone (silhouette alignment + skeleton overlay + rep counter)
   - Save both as MP4, rename to `demo_env_scan.mp4` and `demo_motion_capture.mp4`

**Checkpoint:** All export endpoints return real data. Demo videos saved. ✓

---

### Hour 7: Demo Rehearsal + Bug Fixes

**Goal:** Run the full demo script 3 times. Fix every breaking issue.

**Tasks:**
1. Full run-through of `DEMO_SCRIPT.md` — time it with a stopwatch
2. Verify: Plan Mode voice → spec extraction → QR → sim → correction → export
3. Fix any bugs that interrupt the demo flow (other bugs can wait)
4. Verify GPU monitor shows utilization spikes at the right moments
5. Test fallback plans: manually trigger each failure mode and practice the recovery line
6. Make sure `git push` is done with all changes

**Checkpoint:** Demo runs cleanly in 2 minutes, 3 times in a row. ✓

---

### Hour 8: Final Polish + Deploy + Rehearsal

**Goal:** Vercel deployment is live. Demo is ready.

**Tasks:**
1. Push frontend to Vercel: `vercel --prod` from `frontend/` directory
2. Update Vercel env vars with current Cloudflare Tunnel URL
3. Verify app works at `https://forgebot.vercel.app`
4. Final demo rehearsal — standing up, presenting out loud as if to judges
5. Write down the 3-5 key phrases to say during GPU monitor spike moments
6. Final `git push` with all changes

**Checkpoint:** App is live on Vercel. Team is confident. ✓

---

## TEAMMATE — Frontend + Integrations

### Hour 1: Next.js Scaffold + Vercel Deploy

**Goal:** A blank Next.js app is deployed on Vercel and accessible at a URL.

**Tasks:**
1. Scaffold Next.js: `npx create-next-app@14 frontend --typescript --tailwind --app`
2. Install dependencies: `npm install three qrcode.react @types/three`
3. Create `app/layout.tsx` — dark background (`bg-gray-950`), Inter font, title "Forgebot"
4. Create `app/page.tsx` — landing page with "FORGEBOT" title, tagline, "Begin" button → `/plan`
5. Create `vercel.json` in `frontend/`
6. Deploy: `vercel --prod` or push to GitHub (if Vercel is connected to repo)
7. Note the Vercel URL — share with Tanush

**Checkpoint:** `https://forgebot.vercel.app` shows the landing page. ✓

---

### Hour 2: Plan Mode UI + Voice + ElevenLabs

**Goal:** Typing or speaking messages works in Plan Mode. Voice plays back.

**Tasks:**
1. Create `lib/api.ts` — `planChat()` function (full implementation per FRONTEND_SPEC.md)
2. Create `lib/speech.ts` — `createSpeechRecognizer()` wrapper
3. Create `lib/elevenlabs.ts` — `speakText()` with ElevenLabs + browser TTS fallback
4. Create `components/PlanMode.tsx` — chat bubbles, mic button, text input, send button
   - On mount: call `planChat("")` to trigger first assistant question
   - Mic: toggle listening, populate input on result
   - Send: call `planChat()`, append bubbles, call `speakText()` on reply
   - On `is_complete=true`: show green spec card, call `props.onSpecComplete`
5. Create `app/plan/page.tsx` — renders `<PlanMode>`, on spec complete saves to localStorage and routes to `/capture`

**Checkpoint:** Full Plan Mode conversation works. Voice input works. ElevenLabs (or browser TTS fallback) speaks responses. ✓

---

### Hour 3: QR Panel + Mobile Capture Page

**Goal:** QR code shows on capture page. Phone can scan and see the mobile upload UI.

**Tasks:**
1. Create `components/QRPanel.tsx` — renders `<QRCode>` from `qrcode.react` with backend URL
2. Create `components/MobileCapture.tsx` — menu, env scan stages, motion record UI
3. Create `app/capture/page.tsx`:
   - Desktop: QR panel + status checklist + "Continue" button
   - Mobile detection: if `window.innerWidth < 768`, render `<MobileCapture>`
   - Poll `/api/scan/status` every 3 seconds
4. Ask Tanush for the Cloudflare Tunnel URL — update `.env.local`
5. Test on phone: scan QR, see mobile page, upload a file

**Checkpoint:** QR code is visible and phone can open the mobile upload page. ✓

---

### Hour 4: SimViewer — WebSocket + Three.js Canvas

**Goal:** `/sim` page shows live frames from MuJoCo via WebSocket.

**Tasks:**
1. Create `lib/websocket.ts` — `createSimWebSocket()` with auto-reconnect (full implementation per FRONTEND_SPEC.md)
2. Create `components/SimViewer.tsx`:
   - `canvasRef = useRef<HTMLCanvasElement>`
   - Connect WebSocket on mount, disconnect on unmount
   - `onFrame`: blob → objectURL → draw to canvas with `ctx.drawImage`
   - `onStatus`: update fps state, call `props.onStatusUpdate`
   - Show "Connecting..." overlay when not connected
   - FPS display badge in top-right corner
3. Create `app/sim/page.tsx`:
   - On mount: call `api.loadSim()`
   - Render `<SimViewer>` and `<CorrectionConsole>` (stub for now)
   - GPU badge in top bar using `gpuUtil` from status updates
4. Test: navigate to `/sim` — should see live frames. WebSocket reconnects after page focus.

**Checkpoint:** `/sim` shows live Three.js frames streaming from MuJoCo. FPS counter visible. ✓

---

### Hour 5: Correction Console + Design Rationale + ADI BOM

**Goal:** Correction console works. Export page shows data.

**Tasks:**
1. Create `components/CorrectionConsole.tsx`:
   - Mic button (uses `lib/speech.ts`), text input fallback, send button
   - On send: `api.correctSim(text, userId)`, show `lastChange` confirmation
   - `Ctrl+Space` keyboard shortcut toggles listening
2. Update `app/sim/page.tsx` — render `<CorrectionConsole onCorrection={...}>` in bottom panel
3. Create `components/DesignRationalePanel.tsx` — table of component/value/reason rows, skeleton loader
4. Create `components/ADIPartsPanel.tsx` — cards with category badges, part numbers, datasheets
5. Create `app/export/page.tsx`:
   - On mount: `Promise.all([api.getBOM(), api.getDesignRationale()])`
   - Two-column layout: DesignRationalePanel left, ADIPartsPanel right
   - Download STL, Copy BOM, Share Link buttons

**Checkpoint:** Correction console works. Export page shows BOM and design rationales. ✓

---

### Hour 6: Full UI Polish + Export Page Complete

**Goal:** App looks good. All transitions are smooth. No broken layouts.

**Tasks:**
1. Add page transition: fade in on route change (use Tailwind `animate-fade-in` or CSS transition)
2. Make all loading states explicit: skeleton loaders in DesignRationalePanel, ADIPartsPanel, SimViewer
3. Add error states: if API call fails, show red error card instead of blank (never silent failure)
4. Test on mobile: all pages should be readable on phone screen
5. Check all `console.error` logs — fix any type errors or fetch failures
6. Verify Vercel deployment is updated and working

**Checkpoint:** Full app UI is polished, no broken screens, mobile-readable. ✓

---

### Hour 7: End-to-End Flow Testing on Mobile Phone

**Goal:** Complete demo flow works on real phone + laptop together.

**Tasks:**
1. On phone: open Forgebot, scan QR, go through mobile upload flow (real or simulated)
2. Watch laptop: verify scan status updates, sim loads, robot appears
3. On laptop: speak correction, verify sim updates
4. On laptop: navigate to export, verify BOM and design rationale
5. List all bugs found — fix only the ones that break the demo flow
6. Practice handing phone to Tanush at the right moment in demo

**Checkpoint:** Full demo flow works with phone + laptop together. ✓

---

### Hour 8: Bug Fixes + Final Vercel Deploy

**Goal:** Production build is clean and deployed.

**Tasks:**
1. Run `npm run build` — fix any TypeScript/Next.js build errors
2. Update Vercel env vars with final Cloudflare Tunnel URL
3. `vercel --prod`
4. Test at production URL one more time
5. Final `git push` with all changes

**Checkpoint:** Production URL works. Git is up to date. ✓

---

## Critical Path (What Blocks Everything)

```
[Backboard key set] → Plan Mode has persistent memory
[Ollama running] → Plan Mode fallback works
      ↓
[FastAPI running] → all backend features
      ↓
[Cloudflare Tunnel] → phone can reach backend
      ↓
[WebSocket working] → SimViewer shows frames
      ↓
[MuJoCo MJX initialized] → real physics sim
      ↓
[CAD generate working] → pipeline B complete
      ↓
[Correction loop] → full demo flow
```

**Priority order if time runs short:**
1. Plan Mode conversation (Omi sponsor)
2. SimViewer showing live frames (ASUS GPU story)
3. One voice correction working (human-in-the-loop story)
4. Export page with ADI BOM (Analog Devices sponsor)
5. Mobile capture (nice-to-have — use pre-recorded video as fallback)

---

## Fallback Plans

### Fallback A: MuJoCo MJX GPU fails
```
Error: jax.devices()[0].platform != 'gpu'
```
- Set `gpu_available = False` in `sim.py`
- Remove 512-variant parallel runs — run single CPU simulation
- Keep everything else the same — render_frame still works
- During demo: don't mention GPU utilization for sim; focus on CAD generation speed
- GPU monitor will show utilization only during Ollama/MediaPipe

### Fallback B: Polycam .obj import fails (bad mesh)
- Use `trimesh.creation.box(extents=[5, 5, 3])` as a procedural room box in `pipeline_a.py`
- Load this into MuJoCo as the environment — it's a valid collision mesh
- During demo: "We're using a simplified environment mesh here for stability"

### Fallback C: MediaPipe video processing fails
```
Error: fewer than 10 frames with pose detected
```
- Return `DEFAULT_MOTION_PARAMS` from `process_video()`
- `DEFAULT_MOTION_PARAMS = {"max_reach_cm": 80, "avg_joint_angles_deg": [45, 90, 60, 20], "grip_aperture_cm": 7, ...}`
- Robot still generates — just not from this specific video
- During demo: skip motion capture video segment, go straight to CAD result

### Fallback D: OpenSCAD not installed
```
Error: openscad: command not found
```
- Pre-compile a set of STL variants at different parameter settings (arm_length 0.6, 0.8, 1.0, 1.2m)
- In `compile_scad_to_stl()`: detect this error, copy the closest pre-compiled STL to `robot_current.stl`
- During demo: STL still loads in sim — just not recompiled from scratch

### Fallback E: ElevenLabs TTS quota exceeded
- `lib/elevenlabs.ts` already falls back to `window.speechSynthesis`
- No code change needed — fallback is built in
- Browser TTS voice is different but functional

---

## Git Workflow

**Branch naming:**
- `main` — always demo-ready
- `backend/feature-name` — Tanush's work
- `frontend/feature-name` — teammate's work

**Merge strategy:** Fast PR merges directly to `main` every hour. No squash — keep history.

**Commit message format:**
```
feat(backend): add MuJoCo MJX GPU initialization
fix(frontend): WebSocket reconnect on tab focus
chore: push working demo state hour 4
```

**Every hour — both teammates run:**
```bash
git add -A
git commit -m "chore: hour X checkpoint — [what's working]"
git push origin main
```

**Sync between teammates:**
```bash
git pull origin main  # before starting any new work
```
