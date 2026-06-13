import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

BACKBOARD_API_KEY = os.getenv("BACKBOARD_API_KEY", "")
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not BACKBOARD_API_KEY:
        logger.warning("BACKBOARD_API_KEY not set — Backboard disabled")
        return None
    try:
        from backboard import BackboardClient
        _client = BackboardClient(api_key=BACKBOARD_API_KEY)
        return _client
    except ImportError:
        logger.warning("backboard-sdk not installed — Backboard disabled")
        return None
    except Exception as e:
        logger.warning(f"Backboard client init failed: {e}")
        return None


async def send_memory_message(message: str, thread_id: Optional[str] = None) -> tuple[str, Optional[str]]:
    client = _get_client()
    if not client:
        return "", None
    try:
        kwargs: dict = {"memory": "Auto"}
        if thread_id:
            kwargs["thread_id"] = thread_id
        response = await client.send_message(message, **kwargs)
        return response.content, getattr(response, "thread_id", None)
    except Exception as e:
        logger.warning(f"Backboard call failed: {e}")
        return "", None


# Thread IDs per user for persistent memory across sessions
_user_threads: dict[str, str] = {}


async def get_user_context(user_id: str) -> str:
    thread_id = _user_threads.get(user_id)
    content, new_thread = await send_memory_message(
        "Summarize what this user has built before and their preferences.",
        thread_id,
    )
    if new_thread:
        _user_threads[user_id] = new_thread
    return content


async def log_correction(user_id: str, correction: str, params_before: dict, params_after: dict) -> None:
    thread_id = _user_threads.get(user_id)
    _, new_thread = await send_memory_message(
        f"User corrected: '{correction}'. Params changed from {params_before} to {params_after}.",
        thread_id,
    )
    if new_thread:
        _user_threads[user_id] = new_thread
