import json
import logging
import os
import re
from typing import Optional

import requests
from fastapi import APIRouter
from pydantic import BaseModel

import backboard_memory

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Module state ────────────────────────────────────────────────────────────

robot_specs: dict[str, dict | None] = {}
conversation_history: dict[str, list[dict]] = {}
thread_ids: dict[str, str] = {}

# ── Pydantic models ─────────────────────────────────────────────────────────

class RobotSpec(BaseModel):
    task: str
    payload_kg: float
    mounted: bool
    reach_cm: float
    dof: int
    gripper_type: str
    notes: str = ""

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    user_id: str = "default-user"

class OmiWebhookRequest(BaseModel):
    transcript: str
    session_id: str = "omi-default"
    user_id: str = "default-user"

class ChatResponse(BaseModel):
    reply: str
    is_complete: bool
    robot_spec: Optional[RobotSpec] = None

class UserContextResponse(BaseModel):
    has_history: bool
    summary: str = ""

# ── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are Forgebot, a robot design assistant. Your job is to gather requirements for a custom robot arm by asking one short question at a time.

You need to determine these parameters:
1. task — what will the robot do? (e.g. "pick and place", "sort objects", "assembly")
2. payload_kg — how heavy are the objects? (number in kg)
3. mounted — is it fixed to a surface or freestanding? (true/false)
4. reach_cm — how far does it need to reach? (number in cm)
5. dof — how many degrees of freedom? (3, 4, 5, or 6)
6. gripper_type — "parallel" for regular shapes, "adaptive" for irregular shapes

Rules:
- Ask ONE question at a time. Keep responses under 2 sentences.
- Be conversational and friendly but efficient.
- Infer values when the user gives enough context (e.g. "boxes" implies parallel gripper).
- When you have all 6 parameters, output ONLY a JSON object with keys: task, payload_kg, mounted, reach_cm, dof, gripper_type, notes. Nothing else — just the JSON.
- The notes field should summarize the use case in one sentence.
- Do not ask for confirmation before outputting the JSON. Once you have all info, output it immediately."""

# ── Demo fallback ────────────────────────────────────────────────────────────

DEMO_QUESTIONS = [
    "What task should the robot perform?",
    "How heavy are the objects it needs to handle?",
    "Will the robot be fixed to a surface or freestanding?",
    "How far does it need to reach in centimeters?",
    "How many degrees of freedom do you need — 3, 4, 5, or 6?",
]

DEMO_SPEC = {
    "task": "pick and place",
    "payload_kg": 2.5,
    "mounted": True,
    "reach_cm": 100,
    "dof": 4,
    "gripper_type": "parallel",
    "notes": "Warehouse box sorting from low shelf to table height"
}

# ── Core logic ───────────────────────────────────────────────────────────────

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")


def try_extract_spec(reply: str) -> dict | None:
    try:
        match = re.search(r'\{[^{}]*\}', reply, re.DOTALL)
        if not match:
            return None
        data = json.loads(match.group())
        required = {"task", "payload_kg", "mounted", "reach_cm", "dof", "gripper_type"}
        if not required.issubset(data.keys()):
            return None
        data["payload_kg"] = float(data["payload_kg"])
        data["reach_cm"] = float(data["reach_cm"])
        data["dof"] = int(data["dof"])
        data["mounted"] = bool(data["mounted"])
        data.setdefault("notes", "")
        return data
    except Exception:
        return None


async def plan_mode_message(user_message: str, session_id: str, user_id: str) -> str:
    # Try Backboard first
    thread_id = thread_ids.get(session_id)
    msg = f"[System context: {SYSTEM_PROMPT}]\n\nUser: {user_message}" if not thread_id else user_message
    content, new_thread_id = await backboard_memory.send_memory_message(msg, thread_id)
    if content:
        if new_thread_id:
            thread_ids[session_id] = new_thread_id
        return content

    # Fallback: local Ollama
    try:
        history = conversation_history.setdefault(session_id, [])
        if not history:
            history.append({"role": "system", "content": SYSTEM_PROMPT})
        history.append({"role": "user", "content": user_message})

        resp = requests.post(
            f"{OLLAMA_HOST}/api/chat",
            json={"model": "mistral", "messages": history, "stream": False},
            timeout=30,
        )
        if resp.status_code == 200:
            reply = resp.json()["message"]["content"]
            history.append({"role": "assistant", "content": reply})
            logger.info("Plan mode: used Ollama fallback")
            return reply
    except Exception as e:
        logger.warning(f"Ollama fallback failed: {e}")

    # Final fallback: deterministic demo
    history = conversation_history.setdefault(session_id, [])
    user_count = sum(1 for m in history if m.get("role") == "user")
    history.append({"role": "user", "content": user_message})

    if user_count >= len(DEMO_QUESTIONS):
        reply = json.dumps(DEMO_SPEC)
    else:
        idx = min(user_count, len(DEMO_QUESTIONS) - 1)
        reply = DEMO_QUESTIONS[idx]

    history.append({"role": "assistant", "content": reply})
    logger.info("Plan mode: used deterministic demo fallback")
    return reply


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def plan_chat(req: ChatRequest) -> ChatResponse:
    reply = await plan_mode_message(req.message, req.session_id, req.user_id)
    spec_data = try_extract_spec(reply)
    is_complete = spec_data is not None

    if is_complete:
        robot_specs[req.session_id] = spec_data
        logger.info(f"Plan mode complete for session {req.session_id}: {spec_data}")

    return ChatResponse(
        reply=reply if not is_complete else "Your robot spec is ready!",
        is_complete=is_complete,
        robot_spec=RobotSpec(**spec_data) if spec_data else None,
    )


@router.post("/omi-webhook", response_model=ChatResponse)
async def omi_webhook(req: OmiWebhookRequest) -> ChatResponse:
    chat_req = ChatRequest(message=req.transcript, session_id=req.session_id, user_id=req.user_id)
    return await plan_chat(chat_req)


@router.get("/context/{user_id}", response_model=UserContextResponse)
async def get_context(user_id: str) -> UserContextResponse:
    summary = await backboard_memory.get_user_context(user_id)
    if summary:
        return UserContextResponse(has_history=True, summary=summary)
    return UserContextResponse(has_history=False, summary="")


@router.get("/spec/{session_id}")
async def get_spec(session_id: str) -> dict:
    return {"spec": robot_specs.get(session_id)}


@router.delete("/reset/{session_id}")
async def reset_session(session_id: str) -> dict:
    robot_specs.pop(session_id, None)
    conversation_history.pop(session_id, None)
    thread_ids.pop(session_id, None)
    return {"status": "reset"}
