"""
End-to-end automated test for all Tanush-owned slices.

Real-life use case: A warehouse engineer designs a 4-DOF arm to pick and
place 3kg boxes on a fixed workbench, simulates it, corrects the reach/grip,
then exports the BOM, rationale, and STL.

Run with the backend already serving on :8000:
    source venv/bin/activate && uvicorn main:app --port 8000 &
    python test_e2e.py
"""
import asyncio
import json
import sys
import time

import requests
import websockets

BASE = "http://localhost:8000"
WS = "ws://localhost:8000/ws/sim"

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  {PASS} {name}")
    else:
        print(f"  {FAIL} {name}  {detail}")
        failures.append(name)


# ── Phase 0: Health ──────────────────────────────────────────────────────────

def test_health() -> None:
    print("\n[Phase 0] Health & session")
    r = requests.get(f"{BASE}/health", timeout=5)
    check("GET /health returns ok", r.status_code == 200 and r.json().get("status") == "ok",
          f"got {r.status_code}")

    r = requests.get(f"{BASE}/api/session", timeout=5)
    body = r.json()
    check("GET /api/session returns ids",
          r.status_code == 200 and "session_id" in body and "user_id" in body,
          str(body))


# ── Phase 1: Plan Mode (text-only, real conversation) ────────────────────────

def test_plan_mode() -> dict:
    print("\n[Phase 1] Plan Mode — real warehouse use case (text only)")
    session = f"e2e_{int(time.time())}"
    user = "warehouse-engineer"

    # First turn: empty message triggers greeting
    r = requests.post(f"{BASE}/api/plan/chat",
                      json={"message": "", "session_id": session, "user_id": user}, timeout=30)
    check("Opening greeting returned", r.status_code == 200 and len(r.json()["reply"]) > 0)

    conversation = [
        "I need a robot arm to pick and place cardboard boxes in a warehouse",
        "The boxes weigh about 3 kilograms each",
        "It will be bolted to a fixed workbench",
        "It needs to reach roughly 80 centimeters",
        "Four degrees of freedom should be enough",
        "Use a parallel gripper since the boxes are regular shaped",
    ]

    spec = None
    completed = False
    for msg in conversation:
        r = requests.post(f"{BASE}/api/plan/chat",
                          json={"message": msg, "session_id": session, "user_id": user}, timeout=30)
        check(f"Turn accepted: '{msg[:40]}...'", r.status_code == 200, f"status {r.status_code}")
        body = r.json()
        if body.get("is_complete") and body.get("robot_spec"):
            spec = body["robot_spec"]
            completed = True
            break

    check("Conversation completed with a spec", completed, "never produced robot_spec")

    if spec:
        check("Spec task is non-empty", bool(spec.get("task")), str(spec.get("task")))
        check("Spec payload reflects ~3kg input", 2.0 <= spec.get("payload_kg", 0) <= 4.0,
              f"got {spec.get('payload_kg')}")
        check("Spec mounted is True", spec.get("mounted") is True, str(spec.get("mounted")))
        check("Spec reach reflects ~80cm input", 60 <= spec.get("reach_cm", 0) <= 100,
              f"got {spec.get('reach_cm')}")
        check("Spec dof is 4", spec.get("dof") == 4, f"got {spec.get('dof')}")
        check("Spec gripper is parallel", spec.get("gripper_type") == "parallel",
              f"got {spec.get('gripper_type')}")
        check("Spec has notes", bool(spec.get("notes")), "empty notes")

        # Verify spec persisted server-side under the session
        r = requests.get(f"{BASE}/api/plan/spec/{session}", timeout=5)
        check("GET /spec/{session} returns saved spec",
              r.status_code == 200 and r.json().get("spec") is not None)

    return spec or {}


# ── Phase 2: Simulation & Correction ─────────────────────────────────────────

async def _ws_collect(duration: float = 2.0) -> tuple[int, int, dict]:
    """Connect to /ws/sim and collect frames + status for `duration` seconds."""
    frames = 0
    status_msgs = 0
    last_status: dict = {}
    try:
        async with websockets.connect(WS) as ws:
            end = time.monotonic() + duration
            while time.monotonic() < end:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                if isinstance(msg, bytes):
                    frames += 1
                else:
                    status_msgs += 1
                    last_status = json.loads(msg)
    except Exception as e:
        print(f"     ws error: {e}")
    return frames, status_msgs, last_status


def test_sim() -> None:
    print("\n[Phase 2] Simulation & Correction")

    r = requests.post(f"{BASE}/api/sim/load", json={}, timeout=10)
    body = r.json()
    check("POST /sim/load starts sim", r.status_code == 200 and body.get("status") in ("running", "already_running"),
          str(body))

    # Idempotency — second load must not error / must not double-run
    r2 = requests.post(f"{BASE}/api/sim/load", json={}, timeout=10)
    check("POST /sim/load is idempotent", r2.status_code == 200 and r2.json().get("status") in ("running", "already_running"),
          str(r2.json()))

    time.sleep(0.5)
    r = requests.get(f"{BASE}/api/sim/status", timeout=5)
    st = r.json()
    check("GET /sim/status running=True", st.get("running") is True, str(st))
    check("Sim step advancing", st.get("step", 0) > 0, f"step={st.get('step')}")

    # WebSocket streaming
    frames, status_msgs, last = asyncio.run(_ws_collect(2.0))
    check("WebSocket streamed JPEG frames", frames > 10, f"got {frames} frames in 2s")
    check("WebSocket streamed status JSON", status_msgs > 10, f"got {status_msgs} status msgs")
    if last:
        check("Status JSON has fps/step/score/gpu_util_pct",
              all(k in last for k in ("fps", "step", "score", "gpu_util_pct")), str(last))

    # Correction — the demo target line
    r = requests.post(f"{BASE}/api/sim/correct",
                      json={"correction": "extend the reach and widen the grip", "user_id": "warehouse-engineer"},
                      timeout=20)
    body = r.json()
    check("POST /sim/correct returns updated", r.status_code == 200 and body.get("status") == "updated",
          str(body))
    pc = body.get("param_changes", {})
    check("Correction changed arm_length_m", "arm_length_m" in pc, str(pc))
    check("Correction changed gripper_width_m", "gripper_width_m" in pc, str(pc))
    check("Correction returns new_stl_url", bool(body.get("new_stl_url")), str(body))

    # A second, different correction to prove parsing isn't hardcoded
    r = requests.post(f"{BASE}/api/sim/correct",
                      json={"correction": "make the links thicker and stronger", "user_id": "warehouse-engineer"},
                      timeout=20)
    pc2 = r.json().get("param_changes", {})
    check("Different correction maps to link_radius_m", "link_radius_m" in pc2, str(pc2))

    r = requests.post(f"{BASE}/api/sim/stop", timeout=5)
    check("POST /sim/stop stops sim", r.status_code == 200 and r.json().get("status") == "stopped",
          str(r.json()))

    time.sleep(0.3)
    r = requests.get(f"{BASE}/api/sim/status", timeout=5)
    check("Sim is stopped after /stop", r.json().get("running") is False, str(r.json()))


# ── Phase 3: Export ──────────────────────────────────────────────────────────

def test_export() -> None:
    print("\n[Phase 3] Export — BOM, rationale, STL")

    r = requests.get(f"{BASE}/api/export/bom", timeout=10)
    body = r.json()
    bom = body.get("bom", [])
    check("GET /export/bom returns parts", r.status_code == 200 and len(bom) >= 3, f"{len(bom)} parts")
    if bom:
        keys = {"category", "part_number", "description", "justification", "quantity", "datasheet_url"}
        check("BOM items have all fields", all(keys.issubset(p.keys()) for p in bom),
              str(bom[0].keys()))
        check("BOM uses real ADI part numbers",
              any(p["part_number"].startswith(("AD", "LT", "TMC")) for p in bom),
              str([p["part_number"] for p in bom]))
        check("BOM justifications are non-empty",
              all(len(p["justification"]) > 10 for p in bom))

    r = requests.get(f"{BASE}/api/export/rationale", timeout=10)
    body = r.json()
    exps = body.get("explanations", [])
    check("GET /export/rationale returns explanations", r.status_code == 200 and len(exps) >= 5,
          f"{len(exps)} explanations")
    if exps:
        check("Explanations have component/value/reason",
              all({"component", "value", "reason"}.issubset(e.keys()) for e in exps))

    r = requests.get(f"{BASE}/api/export/stl", timeout=10)
    check("GET /export/stl returns a file",
          r.status_code == 200 and len(r.content) > 0 and "stl" in r.headers.get("content-type", "").lower(),
          f"status {r.status_code}, type {r.headers.get('content-type')}, {len(r.content)} bytes")
    check("STL content is valid ASCII solid",
          r.content.lstrip().startswith(b"solid"), r.content[:20])


# ── Runner ───────────────────────────────────────────────────────────────────

def main() -> int:
    print("=" * 60)
    print("FORGEBOT END-TO-END TEST  (Tanush slices, text-only)")
    print("=" * 60)
    try:
        test_health()
        test_plan_mode()
        test_sim()
        test_export()
    except requests.exceptions.ConnectionError:
        print(f"\n{FAIL} Backend not reachable at {BASE} — is uvicorn running?")
        return 2

    print("\n" + "=" * 60)
    if failures:
        print(f"{FAIL} {len(failures)} CHECK(S) FAILED:")
        for f in failures:
            print(f"    - {f}")
        return 1
    print(f"{PASS} ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
