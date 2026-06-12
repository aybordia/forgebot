# AYAN_V2_1_APP_FOUNDATION.md - Independent Slice: App Foundation And Shared Contracts

> Do not push to GitHub while following this file unless Ayan or Tanush explicitly asks.
> This v2 file is designed to be buildable without waiting for Tanush.

## Read These Architecture Files First

Claude Code must read and align to these files before editing:

1. `Claude Cowork Guiding Files/ARCHITECTURE.md`
   - Use the full endpoint list in section 3 as the API contract.
   - Use the port map for local defaults.
2. `Claude Cowork Guiding Files/FRONTEND_SPEC.md`
   - Use the global frontend rules, app router pages, and `lib/api.ts` fetch rule.
3. `Claude Cowork Guiding Files/BACKEND_SPEC.md`
   - Use the backend global rules and `main.py` app structure.
4. `Claude Cowork Guiding Files/BUILD_ORDER.md`
   - Use setup commands only; ignore its old push-every-hour instruction unless the humans ask.
5. `Claude Cowork Guiding Files/DEMO_SCRIPT.md`
   - Use the app's demo route order: `/plan`, `/capture`, `/sim`, `/export`.

## Ownership

Ayan owns the shared foundation:

- Frontend scaffold, layout, landing page, API client, and shared types.
- Backend skeleton with every route stubbed to the architecture contract.
- This foundation exists so every later v2 slice can build independently.

Do not implement deep Plan Mode, capture processing, CAD generation, MJX sim, ADI selection, or Backboard logic here. Stub them cleanly.

## Why This Slice Is Independent

This slice does not need Tanush's work first because:

- The backend returns valid stub responses for every endpoint.
- The frontend `lib/api.ts` returns mock data if the backend is not running.
- All pages can route without crashing, even if detailed components are implemented later.

## Files To Create Or Modify

Backend:

- `backend/main.py`
- `backend/requirements.txt`
- `backend/static/mobile.html`
- `backend/static/robot_current.stl`
- `backend/.env.example`

Frontend:

- `frontend/package.json`
- `frontend/app/layout.tsx`
- `frontend/app/globals.css`
- `frontend/app/page.tsx`
- `frontend/app/plan/page.tsx` placeholder only
- `frontend/app/capture/page.tsx` placeholder only
- `frontend/app/sim/page.tsx` placeholder only
- `frontend/app/export/page.tsx` placeholder only
- `frontend/lib/api.ts`
- `frontend/lib/websocket.ts`

## Backend Tasks

1. Create the backend skeleton.
   - FastAPI app titled `Forgebot API`.
   - CORS allow all origins.
   - StaticFiles mounted at `/static`.
   - `/health` returns `{"status": "ok"}`.
2. Stub every architecture endpoint.
   - Use response shapes from `ARCHITECTURE.md`, not invented shapes.
   - Include plan, scan, motion, CAD, sim, correction, export, and mobile routes.
3. Add `/ws/sim`.
   - Accept connection.
   - Send one status JSON.
   - Send placeholder JPEG or harmless text if JPEG generation is unavailable.
4. Add placeholder assets.
   - `backend/static/robot_current.stl` must be valid ASCII STL.
   - `backend/static/mobile.html` must offer basic upload controls.
5. Keep stubs obvious.
   - Add logs like `logger.info("Using foundation stub for /api/sim/load")`.
   - Do not pretend expensive processing is real.

## Frontend Tasks

1. Scaffold Next.js 14 with TypeScript, Tailwind, and App Router if missing.
2. Implement `frontend/app/layout.tsx`.
   - Match `FRONTEND_SPEC.md`: Inter font, dark background, title `Forgebot`.
3. Implement `frontend/app/page.tsx`.
   - Landing/router page with `FORGEBOT`, tagline, and Begin button to `/plan`.
4. Add placeholder route pages.
   - `/plan`, `/capture`, `/sim`, and `/export` should exist and link forward/back.
   - Each placeholder should state which v2 file owns the real implementation.
5. Implement `frontend/lib/api.ts`.
   - Define all shared TypeScript types from the architecture: `RobotSpec`, `MotionParams`, `BOMItem`, `Explanation`, `SimStatus`, endpoint responses.
   - Export functions for every backend endpoint.
   - No component should need direct `fetch`.
   - Every function should have a mock fallback.
6. Implement `frontend/lib/websocket.ts`.
   - Centralize sim WebSocket creation.
   - Reconnect or fail gracefully.

## Acceptance Checks

Backend:

```bash
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
curl http://localhost:8000/health
curl http://localhost:8000/api/scan/status
curl http://localhost:8000/api/sim/status
curl http://localhost:8000/api/export/bom
```

Frontend:

```bash
cd frontend && npm run dev
```

Manual browser check:

- Open `http://localhost:3000`.
- Click through `/plan`, `/capture`, `/sim`, and `/export`.
- Turn the backend off and confirm pages still render with mock data.

## Do Not Block On

- Real Ollama.
- Real MediaPipe.
- Real OpenSCAD.
- Real MJX GPU.
- Tanush's vertical slices.

## What Success Looks Like

This slice is successful when both stacks have a stable contract foundation: the frontend can route through the whole product, the backend exposes every architecture endpoint with correct shapes, and later slices can replace stubs without changing callers.

### Solo Success Criteria

- The backend starts on port `8000` with no import errors.
- `GET /health` returns `{"status":"ok"}`.
- Every endpoint listed in `ARCHITECTURE.md` exists and returns the expected top-level fields.
- `/ws/sim` accepts a WebSocket connection and sends a recognizable status message.
- `backend/static/robot_current.stl` exists and is a valid placeholder STL.
- `GET /mobile` returns a usable mobile placeholder page.
- The frontend starts on port `3000`.
- `/`, `/plan`, `/capture`, `/sim`, and `/export` all render without crashing.
- All frontend network calls go through `frontend/lib/api.ts` or `frontend/lib/websocket.ts`.
- Turning off the backend does not break frontend rendering because mocks are available.

### Backend Contract Test Steps

1. Start the backend:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

2. Run the minimum endpoint smoke test:

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

3. Confirm no endpoint returns an HTML error page or stack trace.
4. Confirm stub responses are clearly marked in logs or code comments so later slices know what to replace.

### Frontend Contract Test Steps

1. Start the frontend:

```bash
cd frontend
npm run dev
```

2. Open `http://localhost:3000`.
3. Click through the demo route order: `/plan`, `/capture`, `/sim`, `/export`.
4. Confirm each route has a visible owner/placeholder state if the real slice is not implemented.
5. Stop the backend and refresh each route.
6. Confirm each route still renders with mock data or a graceful offline message.

### Integration Handoff Checks

- Later slices should be able to replace stub route handlers without changing endpoint URLs.
- Later frontend slices should reuse the existing shared types in `lib/api.ts`.
- `NEXT_PUBLIC_BACKEND_URL` should default to `http://localhost:8000`.
- `NEXT_PUBLIC_WS_URL` should default to `ws://localhost:8000`.
- The route order must remain compatible with the demo: `/plan -> /capture -> /sim -> /export`.
- After all slices merge, this foundation should disappear into the product instead of leaving duplicate placeholder UI.

