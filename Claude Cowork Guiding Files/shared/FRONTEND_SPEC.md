# FRONTEND_SPEC.md — Forgebot Frontend Specification

> **Claude Code norm:** After every set of changes, always `git add -A && git commit -m "<message>" && git push` to https://github.com/aybordia/forgebot before stopping.

---

## Global Rules for Claude Code

- All files in `forgebot/frontend/`
- Use Next.js 14 App Router — every page is in `app/` with `page.tsx`
- Tailwind CSS only — no inline styles except for Three.js canvas sizing
- All fetch calls go through `lib/api.ts` — never call `fetch()` directly in a component
- Every component receives typed props — no `any`
- The `NEXT_PUBLIC_BACKEND_URL` env var is the base URL for all fetch calls
- The `NEXT_PUBLIC_WS_URL` env var is the base URL for WebSocket connections
- Mobile breakpoint: `max-width: 768px` (Tailwind `md:` prefix)
- Color palette: dark background (`bg-gray-950`), accent blue (`blue-500`), text white

---

## App Router Pages

### `app/layout.tsx`
Root layout. Sets global font (Inter from `next/font/google`), dark background, global Tailwind classes.

```tsx
// Props: { children: React.ReactNode }
// Body classes: "bg-gray-950 text-white min-h-screen font-sans"
// <head>: title="Forgebot", meta viewport for mobile
```

### `app/page.tsx` — Landing / Router
Shows Forgebot logo, tagline "It's Lovable for robots", and a START button.
On click, routes to `/plan`.

```tsx
// Layout: full-screen centered column
// Large "FORGEBOT" text in blue-500
// Tagline in gray-400 text-xl
// "Begin" button → router.push("/plan")
// Bottom-right: small "Built for Milpitas Hacks 3" text
// No state needed
```

### `app/plan/page.tsx` — Plan Mode
Full plan mode conversation screen. Imports and renders `<PlanMode />`.
When `PlanMode` calls `onSpecComplete(spec)`, stores spec in `localStorage` key `"robot_spec"` and routes to `/capture`.

```tsx
import PlanMode from "@/components/PlanMode"

// State: none — all state is in PlanMode component
// On spec complete: localStorage.setItem("robot_spec", JSON.stringify(spec)); router.push("/capture")
```

### `app/capture/page.tsx` — QR + Phone Connection
Shows QR code panel and instructions. Imports `<QRPanel />`.
Also handles mobile detection: if `window.innerWidth < 768`, renders `<MobileCapture />` instead.

```tsx
// State:
//   isMobile: boolean — set on mount via window.innerWidth check
//   uploadedEnv: boolean — true after env mesh uploaded
//   uploadedMotion: boolean — true after motion video uploaded

// Layout (desktop):
//   Left half: <QRPanel />
//   Right half: status checklist showing [ ] Environment scanned  [ ] Motion captured
//   "Continue to Sim →" button — only enabled when both uploadedEnv and uploadedMotion are true
//   Button routes to /sim

// Layout (mobile — MobileCapture):
//   Renders <MobileCapture onEnvUploaded={() => ...} onMotionUploaded={() => ...} />

// Uses polling: every 3 seconds, GET /api/scan/status and GET /api/motion/status
// When scan loaded=true → set uploadedEnv=true
// When motion has been processed → set uploadedMotion=true
// (Note: add GET /api/motion/status endpoint to backend that returns {"processed": bool})
```

### `app/sim/page.tsx` — Sim Viewer
Main simulation view. Imports `<SimViewer />` and `<CorrectionConsole />`.
On mount, calls `POST /api/sim/load` to start the simulation.

```tsx
// State:
//   simLoaded: boolean
//   simError: string | null

// On mount: call api.loadSim() → sets simLoaded=true or simError
// Layout:
//   Top bar: "FORGEBOT SIM" title, GPU indicator badge (see below), stop button
//   Main area (80% height): <SimViewer />
//   Bottom panel (20% height): <CorrectionConsole />
// GPU indicator badge: green "GPU ●" badge — data comes from WebSocket status messages
```

### `app/export/page.tsx` — Export
Shows CAD export options, ADI BOM, and Backboard panel. Fetches both on mount.

```tsx
// State:
//   bom: BOMItem[] | null
//   explanations: Explanation[] | null
//   loading: boolean

// On mount: fetch /api/export/bom and /api/export/backboard in parallel (Promise.all)
// Layout (two-column):
//   Left column: <BackboardPanel explanations={explanations} />
//   Right column: <ADIPartsPanel bom={bom} />
//   Bottom: three export buttons
//     "Download STL" → window.open(BACKEND_URL + "/api/export/stl")
//     "Copy BOM" → copies JSON to clipboard
//     "Share Demo Link" → copies window.location.origin to clipboard
```

---

## Components

### `components/PlanMode.tsx`

**Purpose:** Voice conversation UI for robot spec generation.

**Props:**
```tsx
interface PlanModeProps {
  onSpecComplete: (spec: RobotSpec) => void
}
```

**State:**
```tsx
const [messages, setMessages] = useState<Message[]>([])
// Message = { role: "user" | "assistant", content: string, timestamp: Date }

const [inputText, setInputText] = useState<string>("")
const [isListening, setIsListening] = useState<boolean>(false)
const [isLoading, setIsLoading] = useState<boolean>(false)
const [sessionId] = useState<string>(() => `session-${Date.now()}`)
const [specReady, setSpecReady] = useState<boolean>(false)
```

**Layout:**
```
┌─────────────────────────────────────────┐
│  🤖 PLAN MODE  [Omi indicator]          │
├─────────────────────────────────────────┤
│                                         │
│  [assistant bubble] "What task should   │
│   the robot perform?"                   │
│                                         │
│            [user bubble] "Pick boxes"   │
│                                         │
│  [assistant bubble] "How heavy..."      │
│                                         │
│  (auto-scrolls to bottom)               │
├─────────────────────────────────────────┤
│  [🎤 mic button]  [text input field]   [Send]│
└─────────────────────────────────────────┘
```

**Behavior:**
1. On mount: send initial empty message to POST /api/plan/chat to trigger first question from Mistral. Display assistant response as first bubble.
2. Mic button: calls `startListening()` from `lib/speech.ts`. While listening, button pulses red. When speech ends, populates `inputText`.
3. Send button / Enter key: calls `api.planChat(inputText, sessionId)`. Appends user + assistant bubbles. If `is_complete=true`, calls `onSpecComplete(spec)`.
4. Each assistant response: call `speakText(reply)` from `lib/elevenlabs.ts` to read it aloud.
5. Auto-scroll: `useEffect` on `messages` change → scroll chat div to bottom.
6. Spec display: when `is_complete=true`, show a green card below chat with spec JSON formatted nicely.

**Chat bubble styling:**
- User: `bg-blue-600 rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl ml-auto max-w-[75%]`
- Assistant: `bg-gray-800 rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl mr-auto max-w-[75%]`

---

### `components/QRPanel.tsx`

**Purpose:** Displays QR code for phone to scan.

**Props:**
```tsx
interface QRPanelProps {
  backendUrl: string    // from process.env.NEXT_PUBLIC_BACKEND_URL
}
```

**State:** none

**Implementation:**
```tsx
import QRCode from "qrcode.react"

// Render:
// <div className="flex flex-col items-center gap-4 p-8 bg-gray-900 rounded-2xl">
//   <p className="text-gray-400 text-sm">Scan with your phone to capture environment</p>
//   <QRCode value={`${props.backendUrl}/mobile`} size={256} bgColor="#111827" fgColor="#3b82f6" />
//   <p className="text-xs text-gray-500 font-mono">{props.backendUrl}/mobile</p>
// </div>
```

**Note:** `/mobile` is a page in the Next.js app but served via the backend URL because the phone talks directly to the FastAPI backend. The mobile page at `/mobile` must be served by FastAPI as a static HTML file (not Next.js). See `MobileCapture` for that HTML.

---

### `components/SimViewer.tsx`

**Purpose:** Three.js canvas that renders JPEG frames streamed from WebSocket.

**Props:**
```tsx
interface SimViewerProps {
  onStatusUpdate: (status: SimStatus) => void
  // SimStatus = { fps: number, step: number, score: number, gpu_util_pct: number }
}
```

**State:**
```tsx
const canvasRef = useRef<HTMLCanvasElement>(null)
const wsRef = useRef<WebSocket | null>(null)
const [connected, setConnected] = useState<boolean>(false)
const [fps, setFps] = useState<number>(0)
```

**WebSocket Connection (from `lib/websocket.ts`):**
```tsx
// On mount:
useEffect(() => {
  const ws = createSimWebSocket({
    onFrame: (jpegBytes: ArrayBuffer) => {
      // Draw frame to canvas
      const blob = new Blob([jpegBytes], { type: "image/jpeg" })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        const ctx = canvasRef.current?.getContext("2d")
        ctx?.drawImage(img, 0, 0, canvasRef.current!.width, canvasRef.current!.height)
        URL.revokeObjectURL(url)
      }
      img.src = url
    },
    onStatus: (status: SimStatus) => {
      setFps(status.fps)
      props.onStatusUpdate(status)
    },
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
  })
  wsRef.current = ws
  return () => ws.close()
}, [])
```

**Canvas rendering:**
```tsx
// Canvas element: width=640 height=480, className="w-full h-full object-contain"
// If not connected: show "Connecting to sim..." overlay centered on canvas
// Overlay: absolute positioned div with bg-gray-950/80 text-gray-400
```

**Layout:**
```tsx
<div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
  <canvas ref={canvasRef} width={640} height={480} className="w-full h-full object-contain" />
  {!connected && <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80">
    <p className="text-gray-400 animate-pulse">Connecting to sim...</p>
  </div>}
  <div className="absolute top-2 right-2 bg-black/50 rounded px-2 py-1 text-xs text-green-400">
    {fps.toFixed(1)} FPS
  </div>
</div>
```

---

### `components/CorrectionConsole.tsx`

**Purpose:** Voice/text input to correct the robot design.

**Props:**
```tsx
interface CorrectionConsoleProps {
  onCorrection: (correctionText: string) => void  // called after API responds
}
```

**State:**
```tsx
const [inputText, setInputText] = useState<string>("")
const [isListening, setIsListening] = useState<boolean>(false)
const [isProcessing, setIsProcessing] = useState<boolean>(false)
const [lastChange, setLastChange] = useState<string | null>(null)
// lastChange: shows "✓ Arm extended to 115cm" after successful correction
```

**Layout:**
```
┌───────────────────────────────────────────────────────┐
│ 🎙️ CORRECTION CONSOLE                                 │
│ ┌───────────────────────────────────────┐ [🎤] [Send] │
│ │ "extend the reach, widen the grip..." │             │
│ └───────────────────────────────────────┘             │
│  ✓ Arm extended to 115cm, grip widened to 110mm       │
└───────────────────────────────────────────────────────┘
```

**Behavior:**
1. Mic button: starts Web Speech API continuous listen. Button glows red while listening.
2. Speech result populates inputText. Stops listening automatically after 3s of silence.
3. Send (or Enter): calls `api.correctSim(inputText)`. Sets isProcessing=true. On response: sets lastChange to summary of param_changes. Calls `props.onCorrection(inputText)`.
4. Keyboard shortcut: `Ctrl+Space` toggles listening.

---

### `components/BackboardPanel.tsx`

**Purpose:** Shows design decision explanations alongside a static CAD preview image.

**Props:**
```tsx
interface BackboardPanelProps {
  explanations: Explanation[] | null
  // Explanation = { component: string, value: string, reason: string }
}
```

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  DESIGN LITERACY — powered by Backboard              │
│                                                      │
│  Component        Value        Why                   │
│  ─────────────────────────────────────────────────   │
│  Arm Length       98cm         Motion capture showed │
│                               peak wrist reach...    │
│  Gripper Width    85mm         Grip aperture from... │
│  Link Thickness   20mm radius  Scaled for 2.5kg...   │
│  DOF              4-DOF        Matched to spec...    │
│  Gripper Type     Parallel     For box gripping...   │
└──────────────────────────────────────────────────────┘
```

**Implementation:**
```tsx
// Table: className="w-full text-sm"
// Header row: "Component" | "Value" | "Why" — text-gray-400 font-medium
// Data rows: alternating bg-gray-900 / bg-gray-800
// "Why" column: text-gray-300 text-xs (longer text)
// If explanations is null: show skeleton loader (4 rows of gray animate-pulse bars)
```

---

### `components/ADIPartsPanel.tsx`

**Purpose:** Renders the Analog Devices Bill of Materials.

**Props:**
```tsx
interface ADIPartsPanelProps {
  bom: BOMItem[] | null
  // BOMItem = { category: string, part_number: string, description: string,
  //              justification: string, quantity: number, datasheet_url: string }
}
```

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  🔩 ANALOG DEVICES BILL OF MATERIALS                 │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ IMU  ADIS16470  ×4                              │ │
│  │ 10-DOF inertial sensor                          │ │
│  │ "4 IMUs for per-joint angle feedback..."        │ │
│  │                              [Datasheet ↗]      │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Motor Driver  TMC2209  ×4                       │ │
│  │ ...                                             │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Implementation:**
```tsx
// Each BOM item: card with bg-gray-900 rounded-xl p-4 mb-3
// Category badge: small colored pill — IMU=blue, Motor Driver=green, Power=yellow, Signal=purple
// Part number: text-white font-mono font-bold
// Quantity: "×{n}" in gray-400
// Description: text-gray-300 text-sm
// Justification: italic text-gray-400 text-xs
// Datasheet link: opens in new tab, text-blue-400 hover:text-blue-300
// If bom is null: 3 skeleton cards
```

---

### `components/MobileCapture.tsx`

**Purpose:** Mobile-only page for phone capture flow.

**Props:**
```tsx
interface MobileCaptureProps {
  onEnvUploaded: () => void
  onMotionUploaded: () => void
}
```

**State:**
```tsx
const [mode, setMode] = useState<"menu" | "env" | "motion">("menu")
const [stage, setStage] = useState<number>(0)   // scan stage 1-5
const [uploading, setUploading] = useState<boolean>(false)
const [repCount, setRepCount] = useState<number>(0)  // 0-3 for motion
```

**Layouts:**

Mode `"menu"`:
```
┌──────────────────────────────┐
│      FORGEBOT MOBILE         │
│                              │
│  [📷 Scan Environment]       │
│                              │
│  [🏃 Record Motion]          │
└──────────────────────────────┘
```

Mode `"env"` (Stage display):
- Stage 1: "Stand in center, hold still 3 seconds" + animated circle
- Stage 2: "Pan slowly LEFT →" + progress arc filling left-to-right
- Stage 3: "← Pan slowly RIGHT" + progress arc
- Stage 4: "Tilt DOWN to capture floor" + tilt indicator
- Stage 5: "Walk to each corner and pause" + 4 checkboxes
- After stage 5: file input (`<input type="file" accept=".obj">`) + Upload button
- On file select + upload: POST to `/api/scan/upload`, calls `onEnvUploaded()`

Mode `"motion"`:
- Big centered silhouette outline (SVG person shape)
- Text: "Step into the silhouette"
- Once user starts recording: rep counter (1/3, 2/3, 3/3)
- Video file input + Upload button
- On upload: POST to `/api/motion/upload`, calls `onMotionUploaded()`

**Note:** Stage progression for env mode uses `setTimeout` for animated stages (3s each), then auto-advances. Stage 5 is manual (user must tap each corner checkpoint).

---

## Library Files

### `lib/api.ts`

All API calls. Every function is `async` and returns typed data.

```typescript
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

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

export async function planChat(message: string, sessionId: string): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/api/plan/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId })
  })
  if (!res.ok) throw new Error(`Plan chat failed: ${res.status}`)
  return res.json()
}

export async function resetPlanSession(sessionId: string): Promise<void> {
  await fetch(`${BASE}/api/plan/reset/${sessionId}`, { method: "DELETE" })
}

export async function uploadEnvironmentMesh(file: File): Promise<any> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(`${BASE}/api/scan/upload`, { method: "POST", body: form })
  if (!res.ok) throw new Error(`Mesh upload failed: ${res.status}`)
  return res.json()
}

export async function uploadMotionVideo(file: File): Promise<any> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(`${BASE}/api/motion/upload`, { method: "POST", body: form })
  if (!res.ok) throw new Error(`Motion upload failed: ${res.status}`)
  return res.json()
}

export async function loadSim(): Promise<any> {
  const res = await fetch(`${BASE}/api/sim/load`, { method: "POST" })
  if (!res.ok) throw new Error(`Sim load failed: ${res.status}`)
  return res.json()
}

export async function correctSim(correction: string): Promise<any> {
  const res = await fetch(`${BASE}/api/sim/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correction })
  })
  if (!res.ok) throw new Error(`Correction failed: ${res.status}`)
  return res.json()
}

export async function getBOM(): Promise<{ bom: BOMItem[] }> {
  const res = await fetch(`${BASE}/api/export/bom`)
  if (!res.ok) throw new Error(`BOM fetch failed: ${res.status}`)
  return res.json()
}

export async function getBackboard(): Promise<{ explanations: Explanation[] }> {
  const res = await fetch(`${BASE}/api/export/backboard`)
  if (!res.ok) throw new Error(`Backboard fetch failed: ${res.status}`)
  return res.json()
}

export async function getScanStatus(): Promise<{ loaded: boolean }> {
  const res = await fetch(`${BASE}/api/scan/status`)
  return res.json()
}
```

---

### `lib/speech.ts`

Web Speech API wrapper.

```typescript
// Returns SpeechRecognition instance or null if not supported
export function createSpeechRecognizer(): SpeechRecognition | null {
  const SpeechRecognition = (window as any).SpeechRecognition 
    || (window as any).webkitSpeechRecognition
  if (!SpeechRecognition) return null
  
  const recognition = new SpeechRecognition()
  recognition.continuous = false       // stops after first utterance
  recognition.interimResults = false   // only final results
  recognition.lang = "en-US"
  recognition.maxAlternatives = 1
  return recognition
}

// Usage pattern:
// const rec = createSpeechRecognizer()
// rec.onresult = (event) => { const text = event.results[0][0].transcript; ... }
// rec.onerror = (event) => { console.error(event.error) }
// rec.start()  // starts listening
// rec.stop()   // stops listening
```

---

### `lib/elevenlabs.ts`

ElevenLabs TTS API wrapper.

```typescript
const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
const VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"
// Voice ID above is "Rachel" — a clear, neutral voice

export async function speakText(text: string): Promise<void> {
  // If API key not set OR window.speechSynthesis available as fallback:
  if (!ELEVENLABS_API_KEY) {
    // Fallback to browser TTS
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)
    return
  }

  // ElevenLabs call:
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
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    }
  )

  if (!response.ok) {
    // Fallback to browser TTS on API failure
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
    return
  }

  const audioBlob = await response.blob()
  const audioUrl = URL.createObjectURL(audioBlob)
  const audio = new Audio(audioUrl)
  audio.play()
  audio.onended = () => URL.revokeObjectURL(audioUrl)
}
```

---

### `lib/websocket.ts`

WebSocket connection manager for sim stream.

```typescript
interface SimStatus {
  fps: number
  step: number
  score: number
  gpu_util_pct: number
}

interface WebSocketConfig {
  onFrame: (data: ArrayBuffer) => void
  onStatus: (status: SimStatus) => void
  onConnect: () => void
  onDisconnect: () => void
}

export function createSimWebSocket(config: WebSocketConfig): WebSocket {
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"
  const ws = new WebSocket(`${WS_URL}/ws/sim`)

  ws.binaryType = "arraybuffer"  // CRITICAL — must be set to receive JPEG bytes

  ws.onopen = () => {
    config.onConnect()
    // Start ping interval (every 10s keep-alive)
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }))
      }
    }, 10000)
  }

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      // Binary = JPEG frame
      config.onFrame(event.data)
    } else {
      // Text = JSON status or pong
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === "status") config.onStatus(msg)
        // ignore pong and error for now
      } catch (_) {}
    }
  }

  ws.onclose = () => {
    config.onDisconnect()
    // Auto-reconnect after 2 seconds
    setTimeout(() => createSimWebSocket(config), 2000)
  }

  ws.onerror = () => ws.close()  // triggers onclose → reconnect

  return ws
}
```

---

## `package.json`

```json
{
  "name": "forgebot-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "three": "^0.164.1",
    "qrcode.react": "^3.1.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@types/three": "^0.164.0",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "autoprefixer": "^10",
    "eslint": "^8",
    "eslint-config-next": "14.2.3"
  }
}
```

**Install command:**
```bash
cd frontend && npm install
```

---

## Mobile Static Page (served by FastAPI)

FastAPI must serve a minimal HTML file at `/mobile` for the phone browser. This is NOT a Next.js page — it's a static HTML file in `backend/static/mobile.html` served by FastAPI's StaticFiles.

Add this to `main.py`:
```python
from fastapi.responses import FileResponse

@app.get("/mobile")
async def mobile_page():
    return FileResponse("static/mobile.html")
```

`static/mobile.html` should be a single-file HTML page with:
- Two buttons: "📷 Scan Environment" and "🏃 Record Motion"
- File picker for .obj and video
- JavaScript `fetch()` calls to POST `/api/scan/upload` and `/api/motion/upload`
- Success/error messages
- Mobile-optimized CSS (large buttons, no zoom on inputs)
- No external dependencies — pure HTML/CSS/JS

---

## Vercel Deployment

`frontend/vercel.json`:
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

Set these in Vercel dashboard: Settings → Environment Variables.
Update `NEXT_PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_WS_URL` every time Cloudflare Tunnel restarts.
