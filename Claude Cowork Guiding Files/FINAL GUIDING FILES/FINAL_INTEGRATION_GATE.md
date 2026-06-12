# FINAL_INTEGRATION_GATE.md - Final Merge And Demo Checklist

> Run this after Tanush and Ayan merge their slices. Do not call the product done until every required check passes or has a documented fallback from `shared/DEMO_SCRIPT.md`.

## Read These Files First

1. `Claude Cowork Guiding Files/shared/ARCHITECTURE.md`
2. `Claude Cowork Guiding Files/shared/BACKEND_SPEC.md`
3. `Claude Cowork Guiding Files/shared/FRONTEND_SPEC.md`
4. `Claude Cowork Guiding Files/shared/OPENSCAD_SPEC.md`
5. `Claude Cowork Guiding Files/shared/BUILD_ORDER.md`
6. `Claude Cowork Guiding Files/shared/DEMO_SCRIPT.md`

## Goal

The final product is a full Forgebot demo loop:

`/plan -> /capture -> /api/cad/generate -> /sim -> correction -> /export`

The demo must still survive missing hardware, missing GPU, missing Ollama, missing OpenSCAD, or failed live phone capture by using the fallback behavior explicitly required in the slice files.

## Preflight Setup

1. Confirm repo structure:

```bash
test -d backend
test -d frontend
test -d robot_templates
test -d "Claude Cowork Guiding Files/FINAL GUIDING FILES"
```

2. Confirm required env files exist or are documented:

```bash
test -f backend/.env || test -f backend/.env.example
test -f frontend/.env.local || test -f frontend/.env.example || true
```

3. Confirm local defaults:

- Backend default URL: `http://localhost:8000`
- Frontend default URL: `http://localhost:3000`
- WebSocket default URL: `ws://localhost:8000/ws/sim`
- STL output path: `backend/static/robot_current.stl`
- Environment mesh path: `/tmp/environment_clean.stl`
- Robot SCAD temp path: `/tmp/robot.scad`
- Plan spec storage key: `robot_spec`

## Backend Full Contract Check

Start backend:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

In another terminal, run:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/scan/status
curl http://localhost:8000/api/motion/status
curl http://localhost:8000/api/sim/status
curl http://localhost:8000/api/export/bom
curl http://localhost:8000/api/export/backboard
curl -I http://localhost:8000/api/export/stl
curl http://localhost:8000/mobile
```

Pass conditions:

- No command returns a stack trace.
- No command returns a 404 for an architecture endpoint.
- JSON endpoints return JSON-shaped responses.
- STL endpoint returns a downloadable file or valid placeholder.
- `/mobile` returns HTML.

## Plan Mode Gate

Run:

```bash
curl -X POST http://localhost:8000/api/plan/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I need a robot that picks boxes from a low shelf and moves them to a table","session_id":"final-gate-plan"}'
```

Then continue the same `session_id` until complete.

Pass conditions:

- Response always includes `reply`, `is_complete`, and `robot_spec`.
- Completed `robot_spec` includes `task`, `payload_kg`, `mounted`, `reach_cm`, `dof`, `gripper_type`, and `notes`.
- `GET /api/plan/spec/final-gate-plan` returns the same completed spec.
- Ollama failure falls back to deterministic demo behavior instead of stopping the demo.

## Capture Gate

Run:

```bash
curl http://localhost:8000/api/scan/status
curl http://localhost:8000/api/motion/status
```

If sample files are available, upload them:

```bash
curl -X POST http://localhost:8000/api/scan/upload -F "file=@/absolute/path/to/sample.obj"
curl -X POST http://localhost:8000/api/motion/upload -F "file=@/absolute/path/to/sample.mp4"
```

Pass conditions:

- Scan status starts safely and changes to loaded after upload or fallback.
- Motion status starts safely and changes to processed after upload or fallback.
- Motion params include `max_reach_cm`, `avg_joint_angles_deg`, `grip_aperture_cm`, `motion_speed`, `endpoint_height_cm`, and `reps_detected`.
- Bad file types return clear errors, not crashes.

## CAD Gate

Run:

```bash
curl -X POST http://localhost:8000/api/cad/generate \
  -H "Content-Type: application/json" \
  -d '{"robot_spec":{"task":"pick boxes","payload_kg":2.5,"mounted":true,"reach_cm":100,"dof":4,"gripper_type":"parallel","notes":"final gate"},"motion_params":{"max_reach_cm":98,"avg_joint_angles_deg":[45,90,60,20],"grip_aperture_cm":8.5,"motion_speed":"slow","endpoint_height_cm":72,"reps_detected":3}}'
```

Then run:

```bash
test -f /tmp/robot.scad
test -f backend/static/robot_current.stl
curl -I http://localhost:8000/api/cad/stl
```

Pass conditions:

- CAD response includes `status`, `stl_url`, and `params_used`.
- `params_used` includes arm length, gripper width, DOF, mounted, gripper type, link radius, and base radius.
- OpenSCAD failure produces a logged placeholder STL, not a failed demo.

## Sim And Correction Gate

Run:

```bash
curl -X POST http://localhost:8000/api/sim/load -H "Content-Type: application/json" -d '{}'
curl http://localhost:8000/api/sim/status
curl -X POST http://localhost:8000/api/sim/correct \
  -H "Content-Type: application/json" \
  -d '{"correction":"extend the reach and widen the grip"}'
```

Pass conditions:

- Sim starts with CAD STL if available, otherwise placeholder.
- Repeated `/api/sim/load` calls do not create duplicate loops.
- Correction response includes `status`, `param_changes`, and `new_stl_url`.
- Correction parameter names are compatible with CAD generation.
- `/ws/sim` sends status and frame messages to the frontend or a documented placeholder stream.

## Export Gate

Run:

```bash
curl http://localhost:8000/api/export/bom
curl http://localhost:8000/api/export/backboard
curl -I http://localhost:8000/api/export/stl
```

Pass conditions:

- BOM has useful items with category, part number, description, quantity, justification, and datasheet URL.
- Backboard explanations include component, value, and reason.
- Export STL returns the latest `backend/static/robot_current.stl` when available.
- Export still works with deterministic demo data if upstream slices are incomplete.

## Frontend Gate

Start frontend:

```bash
cd frontend
npm run dev
```

Browser pass:

- `http://localhost:3000` loads.
- `/plan` completes a spec and writes `localStorage.robot_spec`.
- `/capture` renders QR, mobile URL, and two-item checklist.
- `/sim` loads without blank crash and shows frame/status/correction UI.
- `/export` renders Backboard, ADI BOM, Download STL, Copy BOM, and Share Demo Link.
- Stopping the backend does not crash the frontend; mocks or offline states appear.

## Cloudflare And Phone Gate

Run:

```bash
cloudflared tunnel --url http://localhost:8000
```

Pass conditions:

- Tunnel `/health` opens from a phone browser.
- `NEXT_PUBLIC_BACKEND_URL` uses the HTTPS tunnel URL.
- `NEXT_PUBLIC_WS_URL` uses the matching WSS tunnel URL.
- QR code points to the tunnel `/mobile`, not `localhost`, for phone testing.
- If tunnel fails, laptop upload fallback from `shared/DEMO_SCRIPT.md` is ready.

## Demo Rehearsal Gate

Run the demo script three times:

1. Live happy path.
2. Backend fallback path with Ollama or OpenSCAD unavailable.
3. Phone/tunnel fallback path using prerecorded or laptop uploads.

Pass conditions:

- Demo reaches export every time.
- No route crashes to a white screen.
- No endpoint shape changes are needed during rehearsal.
- GPU monitor story is visible when GPU features are available.
- The team can explain every fallback without sounding surprised.

## Final Definition Of Done

The build is done only when:

- All six slice-level `What Success Looks Like` sections pass.
- This final integration gate passes.
- `main` contains the latest merged work.
- The working tree is clean.
- Any failed hardware/cloud dependency has a documented fallback that still completes the two-minute demo.
