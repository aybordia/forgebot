# AYAN_1_FRONTEND.md — Frontend Phase 1: Scaffold, Lib Layer, Landing Page

> **Read ARCHITECTURE.md before starting any work in this file.**
> **Hackathon context: working demo over perfect code. Move fast.**
> **After every major step: `git add -A && git commit -m "<message>" && git push origin frontend`**
> **Repo: https://github.com/aybordia/forgebot**

---

## Your Role

You are building frontend phase 1 for Forgebot. The work is split 50-50 between you and Tanush across both stacks — you own frontend phase 1, backend phase 2, and frontend phase 3; Tanush owns backend phase 1, frontend phase 2, and backend phase 3. Frontend work always happens on the `frontend` branch and backend work on the `backend` branch. While working this file, you only touch files in `frontend/`.

The shared contract is `ARCHITECTURE.md` — every API endpoint and WebSocket format defined there is what you call from the frontend. Build to that spec.

**Important:** The backend may not be running when you start. That is fine. Every function in `lib/api.ts` must return mock data when the backend URL is not reachable, so you can build and test the full UI independently.

---

## Step 1: GitHub Branch Setup

```bash
git clone https://github.com/aybordia/forgebot
cd forgebot
git checkout -b frontend
git push -u origin frontend
```

---

## Step 2: Next.js 14 Scaffold

Run this from the repo root — it creates the `frontend/` directory:

```bash
npx create-next-app@14 frontend \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --no-eslint
```

Install additional dependencies:
```bash
cd frontend
npm install three qrcode.react
npm install --save-dev @types/three
```

After install, immediately verify it runs:
```bash
npm run dev
# Should start on http://localhost:3000 with no errors
```

Commit:
```bash
cd ..
git add -A && git commit -m "feat(frontend): Next.js 14 scaffold with Tailwind" && git push origin frontend
```

---

## Step 3: Environment Variables

Create `frontend/.env.local`:
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_ELEVENLABS_API_KEY=your_elevenlabs_key_here
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

**Note:** When Tanush gives you the Cloudflare Tunnel URL (e.g. `https://random-words.trycloudflare.com`), update `NEXT_PUBLIC_BACKEND_URL` to that URL and `NEXT_PUBLIC_WS_URL` to `wss://random-words.trycloudflare.com`. Do this whenever the tunnel URL changes.

The `ELEVENLABS_VOICE_ID` `21m00Tcm4TlvDq8ikWAM` is the "Rachel" voice — a clear neutral English voice. Keep this unless instructed otherwise.

Create `frontend/vercel.json`:
```json
{
  "env": {
    "NEXT_PUBLIC_BACKEND_URL": "@backend_url",
    "NEXT_PUBLIC_WS_URL": "@ws_url",
    "NEXT_PUBLIC_ELEVENLABS_API_KEY": "@elevenlabs_key",
    "NEXT_PUBLIC_ELEVENLABS_VOICE_ID": "@elevenlabs_voice_id"
  }
}
```

---

## Step 4: Global Layout — `frontend/app/layout.tsx`

Replace the default layout entirely with:

```tsx
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Forgebot",
  description: "It's Lovable for robots.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-white min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

Update `frontend/app/globals.css` — keep only the Tailwind directives, remove everything else:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Step 5: `frontend/lib/api.ts` — All Backend Fetch Functions

This is the single source of all HTTP calls. No component ever calls `fetch()` directly.

Every function has a `USE_MOCK` mode: if the backend returns a network error (fetch throws), return mock data silently. This lets Ayan build and test UI without the backend running.

```typescript
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

// Toggle to force mock data everywhere (useful when backend is down)
const FORCE_MOCK = false

// ── Types ───────────────────────────────────────────────────────────────────

export interface RobotSpec {
  task: string
  payload_kg: number
  mounted: boolean
  reach_cm: number
  dof: number
  gripper_type: string
  notes: string
}

export interface ChatResponse {
  reply: string
  is_complete: boolean
  robot_spec: RobotSpec | null
}

export interface MotionParams {
  max_reach_cm: number
  avg_joint_angles_deg: number[]
  grip_aperture_cm: number
  motion_speed: string
  endpoint_height_cm: number
  reps_detected: number
}

export interface BOMItem {
  category: string
  part_number: string
  description: string
  justification: string
  quantity: number
  datasheet_url: string
}

export interface Explanation {
  component: string
  value: string
  reason: string
}

export interface SimStatus {
  fps: number
  step: number
  score: number
  gpu_util_pct: number
}

// ── Helper ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit, mockData?: T): Promise<T> {
  if (FORCE_MOCK && mockData !== undefined) return mockData
  try {
    const res = await fetch(`${BASE}${path}`, options)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`)
    return res.json()
  } catch (e) {
    if (mockData !== undefined) {
      console.warn(`[api] Backend unreachable for ${path} — using mock data`)
      return mockData
    }
    throw e
  }
}

// ── Plan Mode ───────────────────────────────────────────────────────────────

export async function planChat(message: string, sessionId: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>(
    "/api/plan/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId }),
    },
    { reply: "What task should the robot perform?", is_complete: false, robot_spec: null }
  )
}

export async function omiWebhook(transcript: string, sessionId: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>(
    "/api/omi-webhook",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, session_id: sessionId }),
    },
    { reply: "How heavy are the objects it needs to handle?", is_complete: false, robot_spec: null }
  )
}

export async function resetPlanSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/plan/reset/${sessionId}`, { method: "DELETE" })
  } catch (_) {}
}

// ── Scan + Motion ────────────────────────────────────────────────────────────

export async function uploadEnvironmentMesh(file: File): Promise<{ status: string; mesh_bounds: object }> {
  const form = new FormData()
  form.append("file", file)
  return apiFetch(
    "/api/scan/upload",
    { method: "POST", body: form },
    { status: "loaded", mesh_bounds: { min: [-2, 0, -2], max: [2, 3, 2] } }
  )
}

export async function uploadMotionVideo(file: File): Promise<{ status: string; frames_analyzed: number; motion_params: MotionParams }> {
  const form = new FormData()
  form.append("file", file)
  return apiFetch(
    "/api/motion/upload",
    { method: "POST", body: form },
    {
      status: "processed",
      frames_analyzed: 120,
      motion_params: {
        max_reach_cm: 85, avg_joint_angles_deg: [45, 95, 65, 20],
        grip_aperture_cm: 7.5, motion_speed: "medium",
        endpoint_height_cm: 72, reps_detected: 3
      }
    }
  )
}

export async function getScanStatus(): Promise<{ loaded: boolean }> {
  return apiFetch("/api/scan/status", undefined, { loaded: false })
}

export async function getMotionStatus(): Promise<{ processed: boolean }> {
  return apiFetch("/api/motion/status", undefined, { processed: false })
}

// ── CAD + Sim ────────────────────────────────────────────────────────────────

export async function generateCAD(robotSpec: RobotSpec, motionParams: MotionParams): Promise<{ status: string; stl_url: string; params_used: object }> {
  return apiFetch(
    "/api/cad/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robot_spec: robotSpec, motion_params: motionParams }),
    },
    { status: "generated", stl_url: "/static/robot_current.stl", params_used: {} }
  )
}

export async function loadSim(): Promise<{ status: string }> {
  return apiFetch("/api/sim/load", { method: "POST" }, { status: "running" })
}

export async function correctSim(correction: string): Promise<{ status: string; param_changes: object }> {
  return apiFetch(
    "/api/sim/correct",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correction }),
    },
    { status: "updated", param_changes: { arm_length_m: 1.1 } }
  )
}

export async function stopSim(): Promise<void> {
  try { await fetch(`${BASE}/api/sim/stop`, { method: "POST" }) } catch (_) {}
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function getBOM(): Promise<{ bom: BOMItem[] }> {
  return apiFetch<{ bom: BOMItem[] }>(
    "/api/export/bom",
    undefined,
    {
      bom: [
        { category: "IMU", part_number: "ADIS16470", description: "10-DOF MEMS inertial sensor", justification: "Per-joint angle feedback for 4-DOF arm carrying 2.5kg", quantity: 4, datasheet_url: "https://www.analog.com/en/products/adis16470.html" },
        { category: "Motor Driver", part_number: "TMC2209", description: "Stepper motor driver with StealthChop2", justification: "Silent precise control of 4 stepper joints", quantity: 4, datasheet_url: "https://www.analog.com/en/products/tmc2209.html" },
        { category: "Power Management", part_number: "LTC3780", description: "Synchronous buck-boost DC/DC controller", justification: "Regulated 12V rail for motor drivers from battery input", quantity: 1, datasheet_url: "https://www.analog.com/en/products/ltc3780.html" },
      ]
    }
  )
}

export async function getBackboard(): Promise<{ explanations: Explanation[] }> {
  return apiFetch<{ explanations: Explanation[] }>(
    "/api/export/backboard",
    undefined,
    {
      explanations: [
        { component: "Arm Length", value: "98cm", reason: "Motion capture peak wrist reach was 80cm. Added 10% clearance margin." },
        { component: "Gripper Width", value: "75mm", reason: "Grip aperture from video: 7.5cm average at object contact." },
        { component: "Link Thickness", value: "15mm radius", reason: "Scaled for 2.5kg payload with 2× safety factor." },
        { component: "Degrees of Freedom", value: "4-DOF", reason: "Matched to spec: 4 joints for full pick-and-place workspace." },
        { component: "Gripper Type", value: "Parallel", reason: "Parallel gripper selected for consistent grip on box geometry." },
      ]
    }
  )
}
```

---

## Step 6: `frontend/lib/speech.ts` — Web Speech API

```typescript
export type SpeechResult = {
  transcript: string
  confidence: number
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
}

export function createSpeechRecognizer(
  onResult: (result: SpeechResult) => void,
  onError?: (error: string) => void,
  onEnd?: () => void
): (() => void) | null {
  // Returns a stop() function, or null if not supported
  
  if (!isSpeechSupported()) {
    console.warn("Web Speech API not supported in this browser")
    return null
  }
  
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  
  const recognition = new SpeechRecognition()
  recognition.continuous = false        // stop after first complete utterance
  recognition.interimResults = false    // final results only
  recognition.lang = "en-US"
  recognition.maxAlternatives = 1
  
  recognition.onresult = (event: any) => {
    const result = event.results[0][0]
    onResult({ transcript: result.transcript, confidence: result.confidence })
  }
  
  recognition.onerror = (event: any) => {
    if (onError) onError(event.error)
  }
  
  recognition.onend = () => {
    if (onEnd) onEnd()
  }
  
  recognition.start()
  
  // Return stop function
  return () => {
    try { recognition.stop() } catch (_) {}
  }
}
```

---

## Step 7: `frontend/lib/elevenlabs.ts` — TTS

```typescript
const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
const VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"

let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (typeof window !== "undefined") {
    window.speechSynthesis?.cancel()
  }
}

export async function speakText(text: string): Promise<void> {
  // Stop anything currently playing
  stopSpeaking()
  
  // Try ElevenLabs first
  if (ELEVENLABS_API_KEY) {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      )
      
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        currentAudio = audio
        audio.play()
        audio.onended = () => {
          URL.revokeObjectURL(url)
          currentAudio = null
        }
        return
      }
    } catch (e) {
      console.warn("ElevenLabs TTS failed, using browser fallback:", e)
    }
  }
  
  // Fallback: browser speechSynthesis
  if (typeof window !== "undefined" && window.speechSynthesis) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0
    window.speechSynthesis.speak(utterance)
  }
}
```

---

## Step 8: `frontend/lib/websocket.ts` — WebSocket Manager

```typescript
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"

export interface SimStatus {
  fps: number
  step: number
  score: number
  gpu_util_pct: number
}

export interface WebSocketConfig {
  onFrame: (data: ArrayBuffer) => void
  onStatus: (status: SimStatus) => void
  onConnect: () => void
  onDisconnect: () => void
  onError?: (msg: string) => void
}

export function createSimWebSocket(config: WebSocketConfig): { close: () => void } {
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true
  let pingInterval: ReturnType<typeof setInterval> | null = null

  function connect() {
    ws = new WebSocket(`${WS_BASE}/ws/sim`)
    ws.binaryType = "arraybuffer"  // CRITICAL — must be set before onmessage fires

    ws.onopen = () => {
      config.onConnect()
      // Keep-alive ping every 10 seconds
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }))
        }
      }, 10000)
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        config.onFrame(event.data)
      } else {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type === "status") config.onStatus(msg as SimStatus)
          if (msg.type === "error" && config.onError) config.onError(msg.message)
        } catch (_) {}
      }
    }

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval)
      config.onDisconnect()
      if (shouldReconnect) {
        reconnectTimer = setTimeout(connect, 2000)
      }
    }

    ws.onerror = () => {
      ws?.close()  // triggers onclose → reconnect
    }
  }

  connect()

  return {
    close: () => {
      shouldReconnect = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingInterval) clearInterval(pingInterval)
      ws?.close()
    }
  }
}
```

---

## Step 9: `frontend/app/page.tsx` — Landing Page

```tsx
"use client"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()
  
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Logo / Title */}
      <div className="text-center mb-12">
        <h1 className="text-7xl font-black tracking-tight text-blue-500 mb-4">
          FORGEBOT
        </h1>
        <p className="text-xl text-gray-400 font-light">
          It's Lovable for robots.
        </p>
        <p className="text-sm text-gray-600 mt-2">
          You see it. You fix it. You ship it.
        </p>
      </div>
      
      {/* CTA Button */}
      <button
        onClick={() => router.push("/plan")}
        className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold rounded-2xl transition-colors duration-200 shadow-lg shadow-blue-900/30"
      >
        Begin →
      </button>
      
      {/* Bottom branding */}
      <div className="absolute bottom-6 text-center">
        <p className="text-xs text-gray-700">
          Built for Milpitas Hacks 3 · 2026 · Roboscale
        </p>
        <p className="text-xs text-gray-700 mt-1">
          Powered by ASUS GPU · Omi · Analog Devices · Vercel · Backboard
        </p>
      </div>
    </main>
  )
}
```

---

## Step 10: Vercel Deployment

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# From the frontend/ directory
cd frontend
vercel

# Follow prompts:
# - Link to existing project or create new
# - Project name: forgebot
# - Root directory: ./ (already in frontend/)
# - Framework: Next.js (auto-detected)
```

After first deploy, go to Vercel dashboard → Settings → Environment Variables and add:
- `backend_url` = `http://localhost:8000` (update to tunnel URL when available)
- `ws_url` = `ws://localhost:8000` (update to wss:// tunnel URL)
- `elevenlabs_key` = your ElevenLabs API key
- `elevenlabs_voice_id` = `21m00Tcm4TlvDq8ikWAM`

Deploy again with env vars set:
```bash
vercel --prod
```

---

## Step 11: Test ElevenLabs + Speech API

Add a temporary test button to `app/page.tsx` to verify both work:

```tsx
// Add this inside the <main> tag temporarily, below the Begin button:
<div className="mt-8 flex gap-4">
  <button
    onClick={() => {
      import("@/lib/elevenlabs").then(({ speakText }) => {
        speakText("Forgebot is ready. Describe your robot.")
      })
    }}
    className="px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-700"
  >
    Test Voice
  </button>
  <button
    onClick={() => {
      import("@/lib/speech").then(({ createSpeechRecognizer }) => {
        createSpeechRecognizer(
          (result) => alert(`Heard: "${result.transcript}"`),
          (err) => alert(`Error: ${err}`)
        )
      })
    }}
    className="px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-700"
  >
    Test Mic
  </button>
</div>
```

Remove these test buttons once verified.

Commit everything:
```bash
git add -A && git commit -m "feat(frontend): lib layer complete — api, speech, elevenlabs, websocket" && git push origin frontend
```

---

## ✅ Success Criteria — AYAN_1_FRONTEND is Done When:

- [ ] `npm run dev` starts on port 3000 with no TypeScript errors
- [ ] Landing page renders: "FORGEBOT" title, tagline, Begin button
- [ ] "Test Voice" button → ElevenLabs (or browser TTS fallback) speaks the test string
- [ ] "Test Mic" button → browser asks for mic permission → recognizes speech → alert shows transcript
- [ ] App is deployed and accessible at Vercel URL
- [ ] `lib/api.ts` `planChat()` works: returns mock data when backend is offline, real data when online
- [ ] `lib/websocket.ts` `createSimWebSocket()` connects, handles binary messages, auto-reconnects
- [ ] All lib files have no TypeScript errors
- [ ] All changes committed and pushed to `frontend` branch

**When all boxes are checked, move to AYAN_2_BACKEND.md — you switch to the backend, while Tanush picks up frontend phase 2 in TANUSH_2_FRONTEND.md.**
