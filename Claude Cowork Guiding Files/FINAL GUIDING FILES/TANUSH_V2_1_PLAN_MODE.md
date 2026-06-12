# TANUSH_V2_1_PLAN_MODE.md - Independent Slice: Plan Mode Conversation

> Do not push to GitHub while following this file unless Tanush explicitly asks.
> This v2 file is designed to be buildable without waiting for Ayan.

## Read These Architecture Files First

Claude Code must read and align to these files before editing:

1. `Claude Cowork Guiding Files/shared/ARCHITECTURE.md`
   - Use section 3.1 for `/api/plan/chat`, `/api/omi-webhook`, `/api/plan/spec/{session_id}`, and `/api/plan/reset/{session_id}`.
   - Use section 6 for the `RobotSpec` fields and exact response shape.
2. `Claude Cowork Guiding Files/shared/BACKEND_SPEC.md`
   - Use `plan_mode.py` models, `SYSTEM_PROMPT`, `get_ollama_response`, and `try_extract_spec`.
   - Follow the backend global rules: type hints, logging, Pydantic response models, temp files in `/tmp`.
3. `Claude Cowork Guiding Files/shared/FRONTEND_SPEC.md`
   - Use the `app/plan/page.tsx`, `components/PlanMode.tsx`, `lib/api.ts`, `lib/speech.ts`, and `lib/elevenlabs.ts` requirements.
4. `Claude Cowork Guiding Files/shared/DEMO_SCRIPT.md`
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

## What Success Looks Like

This slice is successful when a user can describe a robot need, answer the assistant's clarifying questions, and end with a valid `RobotSpec` saved in the browser for the rest of the product to consume.

### Solo Success Criteria

- `GET /health` returns `{"status":"ok"}` while the backend is running.
- `POST /api/plan/chat` always returns the architecture contract: `reply`, `is_complete`, and `robot_spec`.
- `POST /api/omi-webhook` accepts `transcript` and returns the same response shape as chat.
- `GET /api/plan/spec/{session_id}` returns `null` before completion and the completed spec after completion.
- `DELETE /api/plan/reset/{session_id}` clears that session without affecting other sessions.
- The frontend `/plan` page works with text input even if browser speech recognition is unavailable.
- The frontend `/plan` page works without an ElevenLabs key; missing audio must not break chat.
- The mock/fallback path reaches a completed spec when Ollama is off.
- The real Ollama path reaches a completed spec when `ollama serve` and `mistral` are available.

### Backend Test Steps

1. Start the backend:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

2. Verify health:

```bash
curl http://localhost:8000/health
```

3. Verify chat contract:

```bash
curl -X POST http://localhost:8000/api/plan/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I need a robot that moves boxes from a shelf to a table","session_id":"plan-success"}'
```

4. Continue the same `session_id` through payload, mounting, reach, and constraints until `is_complete` becomes `true`.
5. Confirm `robot_spec` includes `task`, `payload_kg`, `mounted`, `reach_cm`, `dof`, `gripper_type`, and `notes`.
6. Confirm spec retrieval:

```bash
curl http://localhost:8000/api/plan/spec/plan-success
```

7. Confirm reset:

```bash
curl -X DELETE http://localhost:8000/api/plan/reset/plan-success
curl http://localhost:8000/api/plan/spec/plan-success
```

### Frontend Test Steps

1. Start the frontend:

```bash
cd frontend
npm run dev
```

2. Open `http://localhost:3000/plan`.
3. Send messages by typing; do not rely on voice for the first test.
4. Confirm assistant messages append in order and the chat autoscrolls.
5. Complete a full mock or real conversation.
6. Confirm a green/spec-ready card appears.
7. Open browser DevTools and verify `localStorage.getItem("robot_spec")` is valid JSON.
8. Refresh the page and confirm it does not crash with saved local storage present.

### Integration Handoff Checks

- The saved `localStorage` key must be exactly `robot_spec`.
- The saved spec must be usable as the `robot_spec` input to `/api/cad/generate`.
- The completed page should route to `/capture` if it exists, but must not fail if Ayan's capture slice is not implemented yet.
- No component outside `frontend/lib/api.ts` should call the plan endpoints directly.
- After merging with Ayan's capture slice, the full path `/plan -> /capture` should work without changing the spec shape.
- Before marking the whole product done, also run `Claude Cowork Guiding Files/FINAL GUIDING FILES/FINAL_INTEGRATION_GATE.md`.
