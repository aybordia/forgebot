# AYAN_V2_3_CAD_GENERATION.md - Independent Slice: CAD Generation And OpenSCAD Templates

> Do not push to GitHub while following this file unless Ayan or Tanush explicitly asks.
> This v2 file is designed to be buildable without waiting for Tanush.

## Read These Architecture Files First

Claude Code must read and align to these files before editing:

1. `Claude Cowork Guiding Files/shared/ARCHITECTURE.md`
   - Use section 3.3 for `/api/cad/generate` and `/api/cad/stl`.
   - Use the RobotSpec and MotionParams shapes that feed CAD generation.
2. `Claude Cowork Guiding Files/shared/OPENSCAD_SPEC.md`
   - Copy the OpenSCAD templates and parameter names exactly unless fixing a syntax issue.
   - Use the Python to OpenSCAD generation approach.
3. `Claude Cowork Guiding Files/shared/BACKEND_SPEC.md`
   - Use `cad_generator.py`, static file, temp file, logging, type hint, and executor rules.
4. `Claude Cowork Guiding Files/shared/FRONTEND_SPEC.md`
   - Use CAD URLs and export/capture handoff expectations.
5. `Claude Cowork Guiding Files/shared/DEMO_SCRIPT.md`
   - Use the "generated robot CAD drops into the digital twin" moment as the target behavior.

## Ownership

Ayan owns this complete vertical slice:

- OpenSCAD template files.
- Backend CAD parameter derivation.
- Backend SCAD and STL generation.
- CAD endpoint contracts.
- Lightweight frontend/debug affordance to trigger CAD generation if Plan Mode and motion capture are not ready.

Do not edit Plan Mode, scan/motion processing, sim internals, ADI, Backboard, or export UI except for tiny integration hooks.

## Why This Slice Is Independent

This slice does not need Tanush's work first because:

- `/api/cad/generate` accepts `robot_spec` and `motion_params` in the request body.
- If no real spec or motion params exist, the endpoint can use default demo inputs.
- If OpenSCAD is unavailable, the endpoint can write a valid placeholder STL and return the same response shape.
- Sim and export can consume `static/robot_current.stl` later, but CAD can be tested alone.

## Files To Create Or Modify

Backend:

- `backend/main.py`
- `backend/cad_generator.py`
- `backend/static/robot_current.stl`
- `backend/requirements.txt`
- `robot_templates/arm_4dof.scad`
- `robot_templates/grippers/parallel.scad`
- `robot_templates/grippers/adaptive.scad`

Frontend or debug support:

- `frontend/lib/api.ts`
- `frontend/app/cad-debug/page.tsx` optional, only if helpful for independent testing

## Backend Tasks

1. Create OpenSCAD template files.
   - Copy `arm_4dof.scad`, `grippers/parallel.scad`, and `grippers/adaptive.scad` from `OPENSCAD_SPEC.md`.
   - Keep templates under `robot_templates/`.
2. Implement `backend/cad_generator.py`.
   - `derive_openscad_params(robot_spec, motion_params)`:
     - `arm_length_m` from `motion_params.max_reach_cm / 100`, clamped to OpenSCAD range.
     - `gripper_width_m` from `motion_params.grip_aperture_cm / 100`, clamped to range.
     - `dof`, `mounted`, and `gripper_type` from `robot_spec`.
     - sensible `link_radius_m`, `base_radius_m`, and `joint_ranges_deg`.
   - `generate_scad_file(params)` writes `/tmp/robot.scad`.
   - `compile_scad_to_stl(scad_path, stl_path)` calls `openscad`.
   - `simplify_stl(stl_path)` can be a no-op for hackathon safety.
   - `merge_params_and_generate(robot_spec, motion_params)` returns `stl_url` and `params_used`.
3. Implement CAD routes.
   - `POST /api/cad/generate` returns `{"status":"generated","stl_url":"/static/robot_current.stl","params_used":...}`.
   - `GET /api/cad/stl` returns the STL file as `model/stl`.
4. Add fallbacks.
   - If request body is missing, use demo robot spec and motion params.
   - If OpenSCAD binary is missing or compile fails, write a valid placeholder STL and return `status: "generated"` with a warning logged.
5. Keep outputs stable.
   - Always write final STL to `backend/static/robot_current.stl`.
   - Always write temp SCAD to `/tmp/robot.scad`.

## Optional Frontend Debug Tasks

Use this only if no existing page can trigger CAD generation:

1. Extend `frontend/lib/api.ts` with `generateCad` and `getCadStlUrl`.
2. Add `frontend/app/cad-debug/page.tsx`.
   - Button: "Generate Demo CAD".
   - Show returned `params_used`.
   - Link to download/view `/api/cad/stl`.
3. Keep this page out of the main demo nav unless the humans ask to show it.

## Acceptance Checks

Backend:

```bash
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
curl -X POST http://localhost:8000/api/cad/generate -H "Content-Type: application/json" -d '{"robot_spec":{"task":"pick boxes","payload_kg":2.5,"mounted":true,"reach_cm":100,"dof":4,"gripper_type":"parallel","notes":"demo"},"motion_params":{"max_reach_cm":98,"avg_joint_angles_deg":[45,90,60,20],"grip_aperture_cm":8.5,"motion_speed":"slow","endpoint_height_cm":72,"reps_detected":3}}'
curl -I http://localhost:8000/api/cad/stl
test -f backend/static/robot_current.stl
```

OpenSCAD check, if installed:

```bash
openscad --version
```

## Do Not Block On

- Real Plan Mode.
- Real MediaPipe.
- Real sim loading the STL.
- Export UI.
- Tanush's slices.

## What Success Looks Like

This slice is successful when a robot spec plus motion params can produce stable CAD parameters, write a SCAD file, generate or safely fallback to an STL, and expose that STL for Sim and Export to consume.

### Solo Success Criteria

- `robot_templates/arm_4dof.scad` exists and includes the master arm assembly from `OPENSCAD_SPEC.md`.
- `robot_templates/grippers/parallel.scad` and `robot_templates/grippers/adaptive.scad` exist.
- `derive_openscad_params` clamps values to the ranges in `OPENSCAD_SPEC.md`.
- `POST /api/cad/generate` accepts explicit `robot_spec` and `motion_params`.
- `POST /api/cad/generate` also works with missing body by using demo inputs.
- `/tmp/robot.scad` is written on generation.
- `backend/static/robot_current.stl` is written on generation.
- `GET /api/cad/stl` returns the current STL with an STL-compatible content type.
- If OpenSCAD is missing or fails, the endpoint still returns a placeholder STL and logs the fallback.

### Backend Test Steps

1. Start the backend:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

2. Generate CAD from explicit inputs:

```bash
curl -X POST http://localhost:8000/api/cad/generate \
  -H "Content-Type: application/json" \
  -d '{"robot_spec":{"task":"pick boxes","payload_kg":2.5,"mounted":true,"reach_cm":100,"dof":4,"gripper_type":"parallel","notes":"demo"},"motion_params":{"max_reach_cm":98,"avg_joint_angles_deg":[45,90,60,20],"grip_aperture_cm":8.5,"motion_speed":"slow","endpoint_height_cm":72,"reps_detected":3}}'
```

3. Confirm the response includes `status`, `stl_url`, and `params_used`.
4. Confirm key params are present: `arm_length_m`, `gripper_width_m`, `dof`, `mounted`, `gripper_type`, `link_radius_m`, and `base_radius_m`.
5. Confirm files exist:

```bash
test -f /tmp/robot.scad
test -f backend/static/robot_current.stl
```

6. Verify STL endpoint:

```bash
curl -I http://localhost:8000/api/cad/stl
curl http://localhost:8000/api/cad/stl | head
```

7. Generate CAD with an empty body and confirm fallback demo inputs still produce an STL:

```bash
curl -X POST http://localhost:8000/api/cad/generate \
  -H "Content-Type: application/json" \
  -d '{}'
```

8. If OpenSCAD is installed, confirm the real compiler path:

```bash
openscad --version
```

### Optional Frontend Debug Test Steps

1. Start the frontend:

```bash
cd frontend
npm run dev
```

2. Open `http://localhost:3000/cad-debug` if that page was created.
3. Click Generate Demo CAD.
4. Confirm returned params are visible.
5. Click the STL link and confirm a file opens or downloads.

### Integration Handoff Checks

- Plan Mode's `robot_spec` can be passed directly into `/api/cad/generate`.
- Capture's `motion_params` can be passed directly into `/api/cad/generate`.
- Sim can load `backend/static/robot_current.stl` after generation.
- Export can return the same `backend/static/robot_current.stl` through `/api/export/stl`.
- Correction changes from `/api/sim/correct` should use the same parameter naming so CAD can regenerate without a translation layer.
- After all slices merge, the path `/plan -> /capture -> /api/cad/generate -> /sim -> /export` should not require shape changes.
- Before marking the whole product done, also run `Claude Cowork Guiding Files/FINAL GUIDING FILES/FINAL_INTEGRATION_GATE.md`.
