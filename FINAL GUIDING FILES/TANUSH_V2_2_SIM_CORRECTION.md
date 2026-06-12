# TANUSH_V2_2_SIM_CORRECTION.md - Independent Slice: Simulation And Correction

> Do not push to GitHub while following this file unless Tanush explicitly asks.
> This v2 file is designed to be buildable without waiting for Ayan.

## Read These Architecture Files First

Claude Code must read and align to these files before editing:

1. `Claude Cowork Guiding Files/ARCHITECTURE.md`
   - Use section 3.4 for `/api/sim/load`, `/api/sim/correct`, `/api/sim/stop`, `/api/sim/status`, and `/ws/sim`.
   - Use the WebSocket status JSON contract: `fps`, `step`, `score`, `gpu_util_pct`.
2. `Claude Cowork Guiding Files/BACKEND_SPEC.md`
   - Use the backend global rules and route/model expectations.
   - Use `main.py` router wiring conventions.
3. `Claude Cowork Guiding Files/FRONTEND_SPEC.md`
   - Use `app/sim/page.tsx`, `components/SimViewer.tsx`, and `components/CorrectionConsole.tsx`.
4. `Claude Cowork Guiding Files/OPENSCAD_SPEC.md`
   - Use the CAD parameter names when correction changes are returned.
5. `Claude Cowork Guiding Files/DEMO_SCRIPT.md`
   - Use the GPU spike and "extend the reach and widen the grip" correction as the demo target.

## Ownership

Tanush owns this complete vertical slice:

- Backend sim control, WebSocket streaming, and correction endpoint.
- Frontend sim viewer and correction console.
- Placeholder frames and placeholder STL support so the slice works before CAD, scan, and motion are real.

Do not edit Plan Mode, capture upload, ADI, Backboard, or export pages except for tiny placeholders needed for navigation.

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
   - Accept `{ "correction": "extend the reach and widen the grip" }`.
   - Return `param_changes` using OpenSCAD/CAD names from `OPENSCAD_SPEC.md`, for example `arm_length_m` and `gripper_width_m`.
   - If Ollama or CAD generation is unavailable, return deterministic demo changes.
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
curl -X POST http://localhost:8000/api/sim/correct -H "Content-Type: application/json" -d '{"correction":"extend the reach and widen the grip","user_id":"tanush-sim-test"}'
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

