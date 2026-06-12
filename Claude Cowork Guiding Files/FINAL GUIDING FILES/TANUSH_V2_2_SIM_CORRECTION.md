# TANUSH_V2_2_SIM_CORRECTION.md - Independent Slice: Simulation And Correction

> Do not push to GitHub while following this file unless Tanush explicitly asks.
> This v2 file is designed to be buildable without waiting for Ayan.

## Read These Architecture Files First

Claude Code must read and align to these files before editing:

1. `Claude Cowork Guiding Files/shared/ARCHITECTURE.md`
   - Use section 3.4 for `/api/sim/load`, `/api/sim/correct`, `/api/sim/stop`, `/api/sim/status`, and `/ws/sim`.
   - Use the WebSocket status JSON contract: `fps`, `step`, `score`, `gpu_util_pct`.
2. `Claude Cowork Guiding Files/shared/BACKEND_SPEC.md`
   - Use the backend global rules and route/model expectations.
   - Use `main.py` router wiring conventions.
3. `Claude Cowork Guiding Files/shared/FRONTEND_SPEC.md`
   - Use `app/sim/page.tsx`, `components/SimViewer.tsx`, and `components/CorrectionConsole.tsx`.
4. `Claude Cowork Guiding Files/shared/OPENSCAD_SPEC.md`
   - Use the CAD parameter names when correction changes are returned.
5. `Claude Cowork Guiding Files/shared/DEMO_SCRIPT.md`
   - Use the GPU spike and "extend the reach and widen the grip" correction as the demo target.

## Ownership

Tanush owns this complete vertical slice:

- Backend sim control, WebSocket streaming, and correction endpoint.
- Backboard correction logging with `user_id`, correction text, params before, and params after.
- Frontend sim viewer and correction console.
- Placeholder frames and placeholder STL support so the slice works before CAD, scan, and motion are real.

Do not edit Plan Mode, capture upload, ADI, design rationale, or export pages except for tiny placeholders needed for navigation.

## Why This Slice Is Independent

This slice does not need Ayan's work first because:

- `/api/sim/load` can start from a generated placeholder MuJoCo scene.
- `/ws/sim` can stream generated JPEG frames even before MJX is fully working.
- `/api/sim/correct` can return deterministic parameter changes before CAD regeneration exists.
- The frontend can render a mock canvas/status stream when the WebSocket is unavailable.

## Files To Create Or Modify

Backend:

- `backend/main.py`
- `backend/sim.py`
- `backend/backboard_memory.py`
- `backend/static/robot_current.stl`
- `backend/requirements.txt`

Frontend:

- `frontend/app/sim/page.tsx`
- `frontend/components/SimViewer.tsx`
- `frontend/components/CorrectionConsole.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/websocket.ts`
- `frontend/lib/speech.ts` only if missing

## Backend Tasks

1. Wire a sim router into `backend/main.py`.
   - Include `sim_router` at `/api/sim`.
   - Include `ws_router` without a prefix so `/ws/sim` works.
2. Implement `backend/sim.py` in layers.
   - Layer 1: Always-working stub that streams generated 640x480 JPEG frames every 33ms.
   - Layer 2: MuJoCo CPU scene with ground plane and placeholder robot.
   - Layer 3: Optional MJX GPU path with CPU fallback.
3. Implement `/api/sim/load`.
   - Must work even if no scan mesh or robot STL exists.
   - Creates placeholder STL in `backend/static/robot_current.stl` if needed.
   - Starts the sim loop once; repeated calls should not create duplicate loops.
4. Implement `/ws/sim`.
   - Send JSON status messages as text.
   - Send JPEG frames as binary.
   - Remove dead clients safely.
5. Implement `/api/sim/correct`.
   - Accept `{ "correction": "extend the reach and widen the grip", "user_id": "user_abc123" }`.
   - Return `param_changes` using OpenSCAD/CAD names from `OPENSCAD_SPEC.md`, for example `arm_length_m` and `gripper_width_m`.
   - Log each correction to Backboard memory via `backboard_memory.log_correction(user_id, correction, params_before, params_after)`.
   - If Backboard, Ollama, or CAD generation is unavailable, return deterministic demo changes.
6. Implement `/api/sim/stop` and `/api/sim/status`.
   - Stop the loop cleanly.
   - Return current running state, fps, step, and best score.

## Frontend Tasks

1. Extend `frontend/lib/api.ts`.
   - Export `loadSim`, `stopSim`, `correctSim`, and `getSimStatus`.
   - Use mock responses if backend is unreachable.
2. Implement `frontend/lib/websocket.ts`.
   - Connect to `NEXT_PUBLIC_WS_URL + "/ws/sim"`.
   - Handle binary JPEG frames and text JSON status.
   - Provide callbacks: `onFrame`, `onStatus`, `onConnect`, `onDisconnect`.
   - If the socket fails, keep the UI usable with a mock status timer.
3. Implement `frontend/components/SimViewer.tsx`.
   - Draw JPEG frames onto a canvas.
   - Show connection and FPS overlays.
   - If no frames arrive, show a non-crashing placeholder scene/status.
4. Implement `frontend/components/CorrectionConsole.tsx`.
   - Support text input and optional voice input.
   - Submit to `correctSim`.
   - Show the returned parameter changes in a compact confirmation.
5. Implement `frontend/app/sim/page.tsx`.
   - Call `loadSim` on mount.
   - Show GPU badge from WebSocket status.
   - Keep the page useful even when backend is offline.

## Acceptance Checks

Backend:

```bash
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
curl -X POST http://localhost:8000/api/sim/load -H "Content-Type: application/json" -d '{}'
curl http://localhost:8000/api/sim/status
curl -X POST http://localhost:8000/api/sim/correct -H "Content-Type: application/json" -d '{"correction":"extend the reach and widen the grip","user_id":"user-sim-test"}'
```

Frontend:

```bash
cd frontend && npm run dev
```

Manual browser check:

- Open `http://localhost:3000/sim`.
- Confirm the page does not crash if no scan, motion, or CAD files exist.
- Confirm the correction console returns visible parameter changes.
- Confirm the GPU badge updates from real or mock status.

## Do Not Block On

- Real environment mesh upload.
- Real robot STL generation.
- Plan Mode spec completion.
- Export page.
- Ayan's frontend foundation, as long as you create missing local shell files carefully.

## What Success Looks Like

This slice is successful when the product can start a simulation, stream visual frames/status to the browser, accept a natural-language correction, and report CAD-style parameter changes without depending on scan, motion, or CAD being finished first.

### Solo Success Criteria

- `POST /api/sim/load` starts the sim exactly once and returns a running response.
- Repeated `POST /api/sim/load` calls do not create duplicate background loops.
- `/ws/sim` accepts a browser WebSocket connection.
- `/ws/sim` sends status text messages with `fps`, `step`, `score`, and `gpu_util_pct`.
- `/ws/sim` sends binary JPEG frames or a documented placeholder frame stream.
- `GET /api/sim/status` reflects whether the sim is running.
- `POST /api/sim/correct` logs correction memory when Backboard is available and returns deterministic `param_changes` even if Backboard, Ollama, or CAD is unavailable.
- `POST /api/sim/stop` stops the loop and leaves the backend able to start again.
- The frontend `/sim` page remains usable if the backend is offline by showing mock status or a clear connection state.

### Backend Test Steps

1. Start the backend:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

2. Start the sim:

```bash
curl -X POST http://localhost:8000/api/sim/load \
  -H "Content-Type: application/json" \
  -d '{}'
```

3. Check status:

```bash
curl http://localhost:8000/api/sim/status
```

4. Submit the demo correction:

```bash
curl -X POST http://localhost:8000/api/sim/correct \
  -H "Content-Type: application/json" \
  -d '{"correction":"extend the reach and widen the grip","user_id":"user-sim-test"}'
```

5. Confirm the correction response includes `status`, `param_changes`, and `new_stl_url`.
6. Confirm `param_changes` uses CAD/OpenSCAD-style names such as `arm_length_m` or `gripper_width_m`.
7. Stop and restart:

```bash
curl -X POST http://localhost:8000/api/sim/stop -H "Content-Type: application/json" -d '{}'
curl -X POST http://localhost:8000/api/sim/load -H "Content-Type: application/json" -d '{}'
```

8. Confirm the backend logs do not show duplicate sim loops after repeated starts.

### WebSocket Test Steps

1. Open browser DevTools on any page or use a WebSocket client.
2. Connect to `ws://localhost:8000/ws/sim`.
3. Confirm at least one JSON text message arrives with status fields.
4. Confirm binary messages arrive after `/api/sim/load` starts.
5. Disconnect the client and confirm the backend does not throw repeated dead-client errors.

### Frontend Test Steps

1. Start the frontend:

```bash
cd frontend
npm run dev
```

2. Open `http://localhost:3000/sim`.
3. Confirm the sim viewer shows connected, loading, or mock state instead of a blank crash.
4. Confirm FPS/step/GPU UI updates from real or mock status.
5. Type `extend the reach and widen the grip` into the correction console.
6. Confirm the UI shows the returned parameter changes.
7. Stop the backend and refresh `/sim`; the page should still render a useful offline state.

### Integration Handoff Checks

- If Ayan's CAD slice has produced `backend/static/robot_current.stl`, `/api/sim/load` should prefer it over the placeholder.
- If Ayan's capture slice has produced `/tmp/environment_clean.stl`, the sim should include or safely ignore it without failing.
- The WebSocket status shape must match `frontend/lib/websocket.ts` and `SimViewer`.
- Correction `param_changes` must be compatible with the CAD parameter names from `OPENSCAD_SPEC.md`.
- Correction memory must be queryable later through Plan Mode context for the same `user_id`.
- After merging all slices, the path `/capture -> /sim -> correction -> /export` should not require any response shape changes.
- Before marking the whole product done, also run `Claude Cowork Guiding Files/FINAL GUIDING FILES/FINAL_INTEGRATION_GATE.md`.
