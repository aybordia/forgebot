# TANUSH_V2_3_EXPORT_DEMO.md - Independent Slice: Export, ADI BOM, Backboard, Demo Polish

> Do not push to GitHub while following this file unless Tanush explicitly asks.
> This v2 file is designed to be buildable without waiting for Ayan.

## Read These Architecture Files First

Claude Code must read and align to these files before editing:

1. `Claude Cowork Guiding Files/ARCHITECTURE.md`
   - Use section 3.5 for export endpoints and response formats.
   - Use section 3.3 for STL URLs and CAD output references.
2. `Claude Cowork Guiding Files/BACKEND_SPEC.md`
   - Use `adi_agent.py`, `backboard.py`, static file, and response model expectations.
3. `Claude Cowork Guiding Files/FRONTEND_SPEC.md`
   - Use `app/export/page.tsx`, `components/ADIPartsPanel.tsx`, and `components/BackboardPanel.tsx`.
4. `Claude Cowork Guiding Files/OPENSCAD_SPEC.md`
   - Use parameter names and generated STL expectations when explaining design choices.
5. `Claude Cowork Guiding Files/DEMO_SCRIPT.md`
   - Use the sponsor callouts and export screen story as the target presentation.

## Ownership

Tanush owns this complete vertical slice:

- Backend ADI BOM endpoint.
- Backend Backboard explanations endpoint.
- Backend STL export endpoint with placeholder fallback.
- Frontend export page and panels.
- Demo copy and fallback behavior for judging.

Do not edit Plan Mode, capture, motion processing, or sim internals except for reading their saved artifacts if present.

## Why This Slice Is Independent

This slice does not need Ayan's work first because:

- The BOM can be generated from a default robot spec if Plan Mode is not done.
- Backboard explanations can be deterministic and based on default params if CAD is not done.
- STL export can return a placeholder valid STL if real CAD is not done.
- The frontend export page can fetch real endpoints or use mock data.

## Files To Create Or Modify

Backend:

- `backend/main.py`
- `backend/adi_agent.py`
- `backend/backboard.py`
- `backend/static/robot_current.stl`
- `backend/requirements.txt`

Frontend:

- `frontend/app/export/page.tsx`
- `frontend/components/ADIPartsPanel.tsx`
- `frontend/components/BackboardPanel.tsx`
- `frontend/lib/api.ts`

Optional demo support:

- `assets/demo_robot_spec.json`
- `assets/demo_motion_params.json`

## Backend Tasks

1. Wire export routers into `backend/main.py`.
   - Include ADI and Backboard routers at `/api/export`.
   - Serve static files from `backend/static`.
2. Implement `backend/adi_agent.py`.
   - Endpoint: `GET /api/export/bom`.
   - Return a Pydantic response model or list model matching `ARCHITECTURE.md`.
   - Use a hardcoded Analog Devices-focused catalog.
   - Include real-looking part categories: IMU/angle feedback, motor driver, power, sensing.
   - Base decisions on available robot spec if present; otherwise use a default demo spec.
3. Implement `backend/backboard.py`.
   - Endpoint: `GET /api/export/backboard`.
   - Return explanations for reach, payload, DOF, gripper, mounting, motion capture, and sim validation.
   - Each explanation should name the input signal and the resulting design choice.
4. Implement STL export.
   - Endpoint: `GET /api/export/stl`.
   - Return `backend/static/robot_current.stl` if present.
   - If missing, create a minimal valid ASCII STL placeholder and return it.
5. Keep data deterministic.
   - The demo should look reliable even if Plan Mode, CAD, or sim are not complete.
   - Log when default demo data is used.

## Frontend Tasks

1. Extend `frontend/lib/api.ts`.
   - Export `getBOM`, `getBackboard`, and `downloadStlUrl`.
   - Mock data must match backend response shapes.
2. Implement `frontend/components/ADIPartsPanel.tsx`.
   - Show category, part number, description, quantity, justification, and datasheet link.
   - Keep it scan-friendly for judges.
3. Implement `frontend/components/BackboardPanel.tsx`.
   - Show design explanations as compact decision cards.
   - Use values and reasons from the endpoint, not hardcoded component text.
4. Implement `frontend/app/export/page.tsx`.
   - Fetch BOM and Backboard in parallel.
   - Provide buttons: Download STL, Copy BOM, Share Demo Link.
   - If endpoints fail, show mock data and keep buttons usable.
5. Add demo polish.
   - The page should make Analog Devices and Backboard obvious.
   - Keep copy aligned with `DEMO_SCRIPT.md`.

## Acceptance Checks

Backend:

```bash
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
curl http://localhost:8000/api/export/bom
curl http://localhost:8000/api/export/backboard
curl -I http://localhost:8000/api/export/stl
```

Frontend:

```bash
cd frontend && npm run dev
```

Manual browser check:

- Open `http://localhost:3000/export`.
- Confirm BOM and Backboard panels render without any other slice being complete.
- Confirm Download STL returns a file.
- Confirm Copy BOM copies valid JSON.

## Do Not Block On

- Real Plan Mode spec.
- Real motion capture.
- Real OpenSCAD output.
- Real sim scoring.
- Ayan's pages.

## What Success Looks Like

This slice is successful when the product can always produce a judge-ready export screen: a downloadable STL, an Analog Devices BOM, and Backboard-style explanations, even if upstream slices are still using fallback data.

### Solo Success Criteria

- `GET /api/export/bom` returns a non-empty list of BOM items.
- Every BOM item includes `category`, `part_number`, `description`, `justification`, `quantity`, and `datasheet_url`.
- `GET /api/export/backboard` returns a non-empty list of explanations.
- Every explanation includes `component`, `value`, and `reason`.
- `GET /api/export/stl` returns a valid STL file or a safe placeholder STL.
- The frontend `/export` page loads BOM and Backboard data in parallel.
- The export page works when Plan Mode, CAD, and Sim have not run yet.
- Copy BOM puts valid JSON on the clipboard.
- Download STL opens or downloads the backend STL URL.

### Backend Test Steps

1. Start the backend:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

2. Verify BOM:

```bash
curl http://localhost:8000/api/export/bom
```

3. Confirm the BOM contains at least three useful electronics entries and at least one Analog Devices-style sensing/control part.
4. Verify Backboard explanations:

```bash
curl http://localhost:8000/api/export/backboard
```

5. Confirm explanations mention design choices such as reach, payload, DOF, gripper, mounting, or sim validation.
6. Verify STL response:

```bash
curl -I http://localhost:8000/api/export/stl
curl http://localhost:8000/api/export/stl | head
```

7. Confirm the STL starts with `solid` or returns a valid binary STL response.

### Frontend Test Steps

1. Start the frontend:

```bash
cd frontend
npm run dev
```

2. Open `http://localhost:3000/export`.
3. Confirm the Backboard panel renders explanation cards.
4. Confirm the ADI panel renders a readable BOM table or cards.
5. Click Copy BOM and paste into a text editor; it should be valid JSON.
6. Click Download STL; it should open or download from the backend.
7. Stop the backend and refresh `/export`; the page should still show mock export data with a clear non-crashing state.

### Integration Handoff Checks

- If Plan Mode has saved `robot_spec`, export should use it when available or gracefully fall back.
- If CAD has generated `backend/static/robot_current.stl`, `/api/export/stl` should return that exact file.
- If Sim has produced correction changes or scores, Backboard explanations should be able to include them without changing the response shape.
- The frontend must consume export endpoints only through `frontend/lib/api.ts`.
- After merging all slices, `/export` should be reachable from `/sim` and should not require demo data to be manually pasted.

