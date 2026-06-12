# AYAN_V2_2_CAPTURE_PIPELINE.md - Independent Slice: Capture, Mobile Upload, Scan And Motion

> Do not push to GitHub while following this file unless Ayan or Tanush explicitly asks.
> This v2 file is designed to be buildable without waiting for Tanush.

## Read These Architecture Files First

Claude Code must read and align to these files before editing:

1. `Claude Cowork Guiding Files/ARCHITECTURE.md`
   - Use section 3.2 for scan endpoints.
   - Use section 3.3 for motion upload and motion parameter format.
   - Use the phone/mobile part of the system diagram.
2. `Claude Cowork Guiding Files/BACKEND_SPEC.md`
   - Use `pipeline_a.py`, `pipeline_b.py`, temp file, async executor, and logging rules.
3. `Claude Cowork Guiding Files/FRONTEND_SPEC.md`
   - Use `app/capture/page.tsx`, `components/QRPanel.tsx`, and `components/MobileCapture.tsx`.
4. `Claude Cowork Guiding Files/DEMO_SCRIPT.md`
   - Use the environment scan and motion capture demo flow, including prerecorded fallback.

## Ownership

Ayan owns this complete vertical slice:

- Backend scan upload/status.
- Backend motion upload/status.
- Static or frontend mobile capture UI.
- Desktop capture page with QR and checklist.
- Mock and fallback behavior so this works before CAD or sim is ready.

Do not edit Plan Mode, CAD generation, sim internals, ADI, Backboard, or export logic except for reading saved data if needed.

## Why This Slice Is Independent

This slice does not need Tanush's work first because:

- Scan upload can clean and save an environment STL without sim consuming it yet.
- Motion upload can return deterministic demo motion params if MediaPipe is unavailable.
- Capture UI can poll scan/motion status and mark completion without CAD or sim.
- Mobile page can upload directly to backend endpoints and does not require Plan Mode.

## Files To Create Or Modify

Backend:

- `backend/main.py`
- `backend/pipeline_a.py`
- `backend/pipeline_b.py`
- `backend/static/mobile.html`
- `backend/requirements.txt`

Frontend:

- `frontend/app/capture/page.tsx`
- `frontend/components/QRPanel.tsx`
- `frontend/components/MobileCapture.tsx`
- `frontend/lib/api.ts`

Optional assets:

- `assets/demo_env_scan.mp4`
- `assets/demo_motion_capture.mp4`

## Backend Tasks

1. Wire scan and motion routers into `backend/main.py`.
   - Include `pipeline_a` at `/api/scan`.
   - Include `pipeline_b` at `/api`.
2. Implement `backend/pipeline_a.py`.
   - `POST /api/scan/upload` accepts `.obj`.
   - Save original to `/tmp/environment.obj`.
   - Clean with trimesh if available.
   - Export cleaned mesh to `/tmp/environment_clean.stl`.
   - Return `status`, `mesh_bounds`, `vertex_count`, and `cleaned_vertex_count`.
   - `GET /api/scan/status` returns whether a scan is loaded.
   - If trimesh is unavailable or file is not ideal, use safe demo bounds and log fallback.
3. Implement `backend/pipeline_b.py`.
   - `POST /api/motion/upload` accepts `.mp4`, `.mov`, or `.webm`.
   - Save to `/tmp/motion_video.mp4`.
   - Try MediaPipe pose extraction if available.
   - Always return the motion params shape from `ARCHITECTURE.md`.
   - `GET /api/motion/status` returns `{"processed": bool, "motion_params": ...}`.
4. Implement `GET /mobile`.
   - Serve `backend/static/mobile.html`.
   - The page should have two upload buttons: environment `.obj` and motion video.
   - Show upload status on the phone.

## Frontend Tasks

1. Extend `frontend/lib/api.ts`.
   - Export `uploadScan`, `getScanStatus`, `uploadMotion`, and `getMotionStatus`.
   - Use mock fallbacks that let the checklist complete during local UI testing.
2. Implement `frontend/components/QRPanel.tsx`.
   - Generate QR from `NEXT_PUBLIC_BACKEND_URL + "/mobile"`.
   - Show the URL as monospace text for manual entry.
3. Implement `frontend/components/MobileCapture.tsx`.
   - Mobile-first upload interface.
   - Buttons for environment scan and motion capture.
   - Upload files to backend through `lib/api.ts`.
   - Show success/error state for each upload.
4. Implement `frontend/app/capture/page.tsx`.
   - On desktop, show QR panel and status checklist.
   - Poll `GET /api/scan/status` and `GET /api/motion/status` every 3 seconds.
   - Enable "Continue to Sim" only when both are complete.
   - On mobile width, render `MobileCapture`.
   - If `/sim` is not implemented yet, show "Capture complete" instead of crashing.

## Acceptance Checks

Backend:

```bash
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
curl http://localhost:8000/api/scan/status
curl http://localhost:8000/api/motion/status
curl http://localhost:8000/mobile
```

Frontend:

```bash
cd frontend && npm run dev
```

Manual browser check:

- Open `http://localhost:3000/capture`.
- Confirm QR renders.
- Open the mobile URL directly in a browser.
- Upload any small test file through the UI and confirm errors are clear or fallback status works.
- Confirm the desktop checklist can complete with real backend or mock fallback.

## Do Not Block On

- Plan Mode producing a spec.
- CAD generation consuming motion params.
- Sim loading environment mesh.
- Export page.
- Tanush's slices.

