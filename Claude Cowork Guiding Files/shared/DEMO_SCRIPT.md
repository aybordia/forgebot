# DEMO_SCRIPT.md — Forgebot 2-Minute Demo Script

> **Claude Code norm:** After every set of changes, always `git add -A && git commit -m "<message>" && git push` to https://github.com/aybordia/forgebot before stopping.

---

## Pre-Demo Setup Checklist (Do this 10 minutes before judges arrive)

- [ ] ASUS GPU machine: `ollama serve` running in background terminal
- [ ] ASUS GPU machine: `uvicorn main:app` running (port 8000)
- [ ] ASUS GPU machine: `cloudflared tunnel --url http://localhost:8000` running — note the URL
- [ ] Update `NEXT_PUBLIC_BACKEND_URL` in Vercel env vars if tunnel URL changed → trigger redeploy
- [ ] Open `https://forgebot.vercel.app` on laptop in full-screen browser (Chrome)
- [ ] Open GPU utilization monitor in a terminal: `watch -n 0.5 nvidia-smi` — position in corner of screen
- [ ] Pre-load the `/sim` page so MuJoCo is warm
- [ ] Have phone ready and charged, Polycam installed, demo .obj file ready to upload (pre-scanned room)
- [ ] Have pre-recorded backup videos ready (30-sec env scan video, 30-sec motion capture video) in case live fails

---

## Demo Flow — Total Time: 2 minutes

### [0:00 – 0:20] PLAN MODE (LIVE)

**What to do:** App is on `/plan` page. Speak into mic button.

**Say:**
> "So Forgebot starts with a conversation. We use Omi — it's a wearable AI necklace — as our voice interface to understand what robot the user actually needs."

*[Click the mic button on screen — mic indicator lights up]*

**Speak into mic:**
> "I need a robot that picks up boxes from a low shelf and moves them to a table."

*[App sends to Ollama, response plays through ElevenLabs voice]*
*[Show the chat bubble appear with the assistant question]*

**Say:**
> "The AI asks one question at a time. Short responses — because they're spoken aloud through the Omi device."

*[The app asks about payload — speak into mic]*

**Speak into mic:**
> "About 2.5 kilograms."

*[App asks about mounting]*

**Speak:**
> "It'll be fixed to a shelf bracket."

*[After 4-5 questions, the robot spec JSON appears on screen as a green card]*

**Say:**
> "Spec locked. Task, payload, reach, DOF — all captured from conversation. Now we build it."

---

### [0:20 – 0:30] PHONE CONNECTION (LIVE)

**What to do:** Navigate to `/capture` page — QR code appears.

**Say:**
> "We scan the real physical environment. I scan the QR code, and my phone becomes a sensor."

*[Scan QR code with phone — phone opens mobile page in browser]*

**Point at laptop screen:**
> "Phone is connected. Two options: scan the room with LiDAR, or record my motion."

---

### [0:30 – 1:00] ENVIRONMENT SCAN + MOTION CAPTURE (PRE-RECORDED VIDEO — 30 sec)

**What to do:** Switch to pre-recorded video. Play it full-screen. Talk over it.

**Say as video plays (env scan portion):**
> "The user scans with Polycam on iPhone 16 — real LiDAR, not photogrammetry. We get a metric-accurate mesh of the whole space in 30 seconds. The coverage heatmap shows red zones turning green as they're captured."

*[Video shows coverage heatmap, guided stages, corner checkpoints]*

**Say as video plays (motion capture portion):**
> "Then they step in front of the camera. MediaPipe Pose — running on the ASUS GPU — tracks all 33 body landmarks at 30 frames per second."

*[Point at GPU monitor — it should be spiking to ~60-80%]*

> "The system counts 3 repetitions of the motion, captures the endpoint pose, extracts reach, joint angles, and grip aperture directly from the human body. Zero manual configuration."

*[Video shows skeleton overlay, rep counter 1/3 → 2/3 → 3/3, CAD morphing to match human proportions]*

---

### [1:00 – 1:25] SIM RUNNING (LIVE)

**What to do:** App is on `/sim` page. The generated robot CAD is already dropped into the digital twin.

*[Point at screen — Three.js canvas is showing MuJoCo sim with robot in scanned room]*

**Say:**
> "The generated robot drops into the digital twin of that exact room. MuJoCo MJX runs 512 physics parameter variants simultaneously on the ASUS GPU — it's not just simulating one robot, it's running hundreds at once to find the most stable configuration."

*[Point at GPU monitor — should be spiking to 85-95%]*

> "This is where that GPU is doing real work."

*[Pause 2 seconds for judges to see GPU utilization]*

---

### [1:25 – 1:40] VOICE CORRECTION (LIVE)

**What to do:** Click correction console mic button. Speak a correction.

**Say:**
> "Now the human corrects it. This is Lovable for robots — you see it, you fix it."

*[Click mic button in CorrectionConsole]*

**Speak into mic:**
> "Extend the reach and widen the grip."

*[App sends to Ollama, parses param changes, regenerates STL, MuJoCo reloads]*
*[Show the "✓ Arm extended to 115cm" confirmation message]*
*[GPU monitor spikes again during STL recompile + sim reload]*

**Say:**
> "Ollama — running locally on this machine — parses the natural language into parameter changes. OpenSCAD regenerates the CAD. The sim reloads. No API calls, no cloud, no latency."

---

### [1:40 – 1:55] EXPORT + SPONSORS (LIVE)

**What to do:** Navigate to `/export` page.

**Say:**
> "Export screen. Three things happen here."

*[Point at Backboard panel on left]*

> "First: Backboard. Every design decision is explained. Why this arm length? Because motion capture showed 98cm peak reach. Why parallel gripper? Box geometry. The user understands the robot — they don't just accept it blindly."

*[Point at ADI BOM panel on right]*

> "Second: Analog Devices recommends the exact electronics. ADIS16470 IMUs for per-joint angle feedback. TMC2209 motor drivers. LTC3780 for power management. Real part numbers. Real datasheets. A real bill of materials from the robot's actual spec."

*[Point at export buttons]*

> "And one click: STL file, BOM, design explanation. Ready to send to a manufacturer."

---

### [1:55 – 2:00] CLOSING LINE

**Say:**
> "Forgebot is the first step in Roboscale's vision: a world where anyone can design a production-ready robot in an afternoon. You describe it, you show it, you ship it."

*[If time permits, gesture at laptop screen showing the full UI]*

---

## Sponsor Callouts Summary

| Sponsor | When to mention | What to say |
|---|---|---|
| **Omi** | Plan Mode | "We use Omi — a wearable AI necklace — as our voice interface" |
| **ASUS GPU** | Sim load + correction | "MJX runs 512 physics variants on the ASUS GPU" + point at GPU monitor |
| **Analog Devices** | Export page | "Analog Devices recommends exact electronics — ADIS16470 IMUs, TMC2209 drivers" |
| **Vercel** | (skip unless asked) | "Frontend deployed on Vercel — one URL, no local setup" |
| **Backboard** | Export page | "Backboard explains every design decision" |

---

## GPU Monitor Setup

In a terminal (positioned bottom-right, 20% of screen width):
```bash
watch -n 0.5 "nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader"
```

Expected readings during demo:
- Plan Mode (Ollama): 15-30% GPU (Mistral 7B inference)
- MediaPipe pose processing: 55-70% GPU
- MuJoCo MJX 512 variants: 80-95% GPU
- STL recompile (OpenSCAD): 5% GPU (CPU-bound), brief
- MuJoCo reload after correction: 70-85% GPU

**What to say when GPU spikes:** Just point at it and pause. Judges notice. Don't over-explain.

---

## Fallback Plans

### If Ollama is slow / times out during Plan Mode conversation
**Say:** "The LLM is running locally on this GPU — no API calls. Let me paste the spec directly."
**Do:** Have a pre-typed robot spec JSON in a text file. Paste it into the spec field manually (add a `?spec=...` URL param handler or a debug text input on the plan page that bypasses conversation).

### If MuJoCo sim crashes on load
**Say:** "Let me show you the architecture while it reloads — this is the exact system."
**Do:** Switch to ARCHITECTURE.md diagram on screen. Restart `uvicorn`. Reload sim page.
**Fallback visual:** Show the pre-generated robot STL in a browser-based STL viewer (e.g., https://3dviewer.net) while sim restarts.

### If MediaPipe video processing hangs
**Say:** "We have motion params from the pre-recorded session."
**Do:** Use the `DEFAULT_MOTION_PARAMS` fallback — POST to `/api/cad/generate` with hardcoded params. Proceed to sim.

### If Cloudflare Tunnel disconnects (phone can't connect)
**Say:** "Phone is already connected — let me show you the upload that just came through."
**Do:** Upload the pre-recorded .obj file directly from laptop via a curl command or a local file picker in the browser.

### If voice recognition fails
**Say:** "Let me type this one — same pipeline, just different input."
**Do:** Type the correction into the text field instead of speaking. All same logic.

### If Vercel deploy is broken
**Say:** "Running locally to show you the full stack."
**Do:** `npm run dev` locally, set `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`.

---

## Questions Judges Might Ask

**Q: Is the simulation real-time?**
A: Yes — MuJoCo MJX at ~60Hz physics, 30fps render, streamed live via WebSocket.

**Q: How accurate is the motion capture?**
A: MediaPipe Pose, model_complexity=2, calibrated to shoulder width. Joint angles within ~5 degrees. Good enough for parameterizing a robot spec, not surgical precision.

**Q: Why OpenSCAD and not something like FreeCAD?**
A: OpenSCAD is fully parametric and scriptable — perfect for programmatic generation. We define the shape mathematically; Python just fills in the numbers.

**Q: How long does the full pipeline take?**
A: Plan Mode: ~2 minutes of conversation. Env scan: 30-60 seconds. Motion capture: 30 seconds. CAD generate: ~5 seconds. Sim load: ~3 seconds. Total: under 5 minutes from conversation to running sim.

**Q: Can it do more than arms?**
A: The current templates are for serial-chain arms, but OpenSCAD is just code — you can add any template. Delta robots, parallel mechanisms, mobile bases — just add more .scad templates and selection logic.
