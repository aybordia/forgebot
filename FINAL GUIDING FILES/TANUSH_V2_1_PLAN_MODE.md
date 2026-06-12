# TANUSH_V2_1_PLAN_MODE.md - Independent Slice: Plan Mode Conversation

> Do not push to GitHub while following this file unless Tanush explicitly asks.
> This v2 file is designed to be buildable without waiting for Ayan.

## Read These Architecture Files First

Claude Code must read and align to these files before editing:

1. `Claude Cowork Guiding Files/ARCHITECTURE.md`
   - Use section 3.1 for `/api/plan/chat`, `/api/omi-webhook`, `/api/plan/spec/{session_id}`, and `/api/plan/reset/{session_id}`.
   - Use section 6 for the `RobotSpec` fields and exact response shape.
2. `Claude Cowork Guiding Files/BACKEND_SPEC.md`
   - Use `plan_mode.py` models, `SYSTEM_PROMPT`, `get_ollama_response`, and `try_extract_spec`.
   - Follow the backend global rules: type hints, logging, Pydantic response models, temp files in `/tmp`.
3. `Claude Cowork Guiding Files/FRONTEND_SPEC.md`
   - Use the `app/plan/page.tsx`, `components/PlanMode.tsx`, `lib/api.ts`, `lib/speech.ts`, and `lib/elevenlabs.ts` requirements.
4. `Claude Cowork Guiding Files/DEMO_SCRIPT.md`
   - Use the Plan Mode demo language and the "Spec locked" flow as the user experience target.

## Ownership

Tanush owns this complete vertical slice:

- Backend plan conversation endpoints.
- Frontend plan page and chat UI.
- Mock fallback so this slice works if Ollama, the backend, or Ayan's files are missing.

Do not edit capture, CAD, sim, export, ADI, or Backboard implementation except for tiny placeholder routes needed to keep navigation from breaking.

## Why This Slice Is Independent

This slice does not need Ayan's work first because:

- The backend can run with only `backend/main.py` and `backend/plan_mode.py`.
- The frontend can run with only `frontend/app/plan/page.tsx`, `frontend/components/PlanMode.tsx`, and local helper files.
- `lib/api.ts` must return mock plan responses if the backend is unreachable.
- When the spec is complete, route to `/capture`, but if `/capture` does not exist yet, show a "Spec saved" state instead of crashing.

## Files To Create Or Modify

Backend:

- `backend/main.py`
- `backend/plan_mode.py`
- `backend/requirements.txt`
- `backend/.env.example`

Frontend:

- `frontend/app/plan/page.tsx`
- `frontend/components/PlanMode.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/speech.ts`
- `frontend/lib/elevenlabs.ts`
- `frontend/app/layout.tsx` only if it does not exist
- `frontend/app/page.tsx` only if it does not exist

## Backend Tasks

1. Create a minimal FastAPI app if `backend/main.py` does not exist.
   - Include CORS.
   - Include `/health`.
   - Include the plan router at `/api/plan`.
   - Also expose `/api/omi-webhook` at the root API path if the existing architecture expects it outside `/api/plan`.
2. Implement `backend/plan_mode.py` from `BACKEND_SPEC.md`.
   - Copy the exact `SYSTEM_PROMPT`.
   - Use `requests.post("http://localhost:11434/api/chat", ...)`.
   - Maintain `conversation_history` and `robot_specs` keyed by `session_id`.
   - Validate extracted specs with required keys: `task`, `payload_kg`, `mounted`, `reach_cm`, `dof`, `gripper_type`.
3. Add a demo fallback mode.
   - If Ollama is unreachable, return deterministic assistant questions instead of failing hard.
   - After five user answers, return a valid demo `RobotSpec`.
   - Log that fallback mode was used.
4. Add response models for every route.
   - Do not return raw dicts from route handlers if a Pydantic model can describe the response.

## Frontend Tasks

1. Implement or extend `frontend/lib/api.ts`.
   - Export `RobotSpec`, `ChatResponse`, and `planChat`.
   - All fetch calls go through this file.
   - If the backend is unavailable, return mock responses.
   - The mock must eventually return `is_complete: true` and a realistic spec so the UI can be tested alone.
2. Implement `frontend/lib/speech.ts`.
   - Use browser `SpeechRecognition` when available.
   - Return a cleanup function so the mic can stop safely.
   - If unavailable, fail gracefully and let text input still work.
3. Implement `frontend/lib/elevenlabs.ts`.
   - Use `NEXT_PUBLIC_ELEVENLABS_API_KEY` and `NEXT_PUBLIC_ELEVENLABS_VOICE_ID`.
   - If missing, no-op instead of throwing.
4. Implement `frontend/components/PlanMode.tsx`.
   - Match `FRONTEND_SPEC.md` behavior.
   - Start with the first assistant question.
   - Support text entry, Enter to send, mic capture, assistant speech, autoscroll, loading dots, and final spec card.
5. Implement `frontend/app/plan/page.tsx`.
   - Store completed spec in `localStorage` key `robot_spec`.
   - Route to `/capture` if available.
   - If routing fails during partial builds, keep the completed spec visible.

## Acceptance Checks

Run only the checks available in the current repo:

```bash
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
curl http://localhost:8000/health
curl -X POST http://localhost:8000/api/plan/chat -H "Content-Type: application/json" -d '{"message":"I need a robot that moves boxes","session_id":"tanush-plan-test"}'
```

```bash
cd frontend && npm run dev
```

Manual browser check:

- Open `http://localhost:3000/plan`.
- Send text messages without Ollama running.
- Confirm the mock conversation reaches a completed spec.
- Confirm the spec is saved to `localStorage`.

## Do Not Block On

- Ayan's capture page.
- Real scan or motion upload.
- Real CAD generation.
- Real sim rendering.
- Vercel deployment.

