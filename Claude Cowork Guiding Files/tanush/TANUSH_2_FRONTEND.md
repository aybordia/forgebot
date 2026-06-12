# TANUSH_2_FRONTEND.md — Frontend Phase 2: Plan Mode, QR Panel, Mobile Capture

> **Read ARCHITECTURE.md before starting any work in this file.**
> **Prerequisites: AYAN_1_FRONTEND.md (Ayan's frontend phase 1) must be fully complete. All lib files exist and work.**
> **Hackathon context: working demo over perfect code. Move fast.**
> **After every major step: `git add -A && git commit -m "<message>" && git push origin frontend`**

---

## What You Are Building in This File

1. **`components/PlanMode.tsx`** — voice conversation UI for robot spec generation
2. **`app/plan/page.tsx`** — Plan Mode page wrapper
3. **`components/QRPanel.tsx`** — QR code display for phone connection
4. **`app/capture/page.tsx`** — desktop QR + status page
5. **`components/MobileCapture.tsx`** — mobile-optimized upload UI (shown on phone)

If the backend is not ready, all conversation uses mock data from `lib/api.ts`. The UI must be fully functional and testable without any backend.

---

## Step 1: `frontend/components/PlanMode.tsx`

### Props

```tsx
interface PlanModeProps {
  onSpecComplete: (spec: RobotSpec) => void
}
```

### State

```tsx
interface Message {
  role: "user" | "assistant"
  content: string
  id: string  // crypto.randomUUID() or Date.now().toString()
}

const [messages, setMessages] = useState<Message[]>([])
const [inputText, setInputText] = useState<string>("")
const [isListening, setIsListening] = useState<boolean>(false)
const [isLoading, setIsLoading] = useState<boolean>(false)
const [sessionId] = useState<string>(() => `session-${Date.now()}`)
const [specReady, setSpecReady] = useState<boolean>(false)
const [finalSpec, setFinalSpec] = useState<RobotSpec | null>(null)
const chatBottomRef = useRef<HTMLDivElement>(null)
const stopListeningRef = useRef<(() => void) | null>(null)
```

### On Mount Behavior

When the component mounts, immediately trigger the first assistant question by calling `planChat` with an empty message:

```tsx
useEffect(() => {
  async function triggerFirstQuestion() {
    setIsLoading(true)
    try {
      const res = await planChat("", sessionId, userId)
      appendMessage("assistant", res.reply)
      await speakText(res.reply)
    } catch (e) {
      appendMessage("assistant", "What task should the robot perform?")
    } finally {
      setIsLoading(false)
    }
  }
  triggerFirstQuestion()
}, [])  // empty deps — runs once on mount
```

### Helper Functions

```tsx
function appendMessage(role: "user" | "assistant", content: string) {
  setMessages(prev => [...prev, { role, content, id: Date.now().toString() }])
}

async function sendMessage(text: string) {
  if (!text.trim() || isLoading) return
  setInputText("")
  appendMessage("user", text)
  setIsLoading(true)
  
  try {
    const res = await planChat(text, sessionId, userId)  // from lib/api.ts
    appendMessage("assistant", res.reply)
    await speakText(res.reply)  // from lib/elevenlabs.ts
    
    if (res.is_complete && res.robot_spec) {
      setSpecReady(true)
      setFinalSpec(res.robot_spec)
    }
  } catch (e) {
    appendMessage("assistant", "I had trouble connecting. Try again.")
  } finally {
    setIsLoading(false)
  }
}

function toggleListening() {
  if (isListening) {
    stopListeningRef.current?.()
    stopListeningRef.current = null
    setIsListening(false)
    return
  }
  
  const stop = createSpeechRecognizer(  // from lib/speech.ts
    (result) => {
      setInputText(result.transcript)
      setIsListening(false)
      stopListeningRef.current = null
      // Auto-send after voice capture
      sendMessage(result.transcript)
    },
    (err) => {
      console.warn("Speech error:", err)
      setIsListening(false)
    },
    () => setIsListening(false)
  )
  stopListeningRef.current = stop
  setIsListening(true)
}
```

### Auto-scroll to bottom

```tsx
useEffect(() => {
  chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
}, [messages])
```

### Layout

```tsx
return (
  <div className="flex flex-col h-full max-w-2xl mx-auto">
    
    {/* Header */}
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      <span className="text-sm font-medium text-gray-300">PLAN MODE</span>
      <span className="ml-auto text-xs text-gray-600 bg-gray-900 px-2 py-1 rounded-full">
        Omi Voice Interface
      </span>
    </div>
    
    {/* Chat messages — scrollable */}
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[78%] px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-blue-600 rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl text-white"
                : "bg-gray-800 rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl text-gray-200"
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}
      
      {/* Loading dots */}
      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-gray-800 rounded-2xl px-4 py-3">
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{animationDelay:"0ms"}}/>
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{animationDelay:"150ms"}}/>
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{animationDelay:"300ms"}}/>
            </span>
          </div>
        </div>
      )}
      
      <div ref={chatBottomRef} />
    </div>
    
    {/* Spec complete card */}
    {specReady && finalSpec && (
      <div className="mx-4 mb-3 p-4 bg-green-950 border border-green-700 rounded-xl">
        <p className="text-green-400 text-xs font-semibold mb-2">✅ ROBOT SPEC READY</p>
        <div className="grid grid-cols-2 gap-1 text-xs text-green-300">
          <span className="text-green-600">Task:</span><span>{finalSpec.task}</span>
          <span className="text-green-600">Payload:</span><span>{finalSpec.payload_kg}kg</span>
          <span className="text-green-600">Reach:</span><span>{finalSpec.reach_cm}cm</span>
          <span className="text-green-600">DOF:</span><span>{finalSpec.dof}</span>
          <span className="text-green-600">Gripper:</span><span>{finalSpec.gripper_type}</span>
          <span className="text-green-600">Mounted:</span><span>{finalSpec.mounted ? "Fixed" : "Mobile"}</span>
        </div>
        <button
          onClick={() => props.onSpecComplete(finalSpec)}
          className="mt-3 w-full py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Continue to Capture →
        </button>
      </div>
    )}
    
    {/* Input bar */}
    <div className="px-4 py-3 border-t border-gray-800 flex gap-2">
      {/* Mic button */}
      <button
        onClick={toggleListening}
        className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          isListening
            ? "bg-red-600 animate-pulse"
            : "bg-gray-800 hover:bg-gray-700"
        }`}
      >
        🎤
      </button>
      
      {/* Text input */}
      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") sendMessage(inputText) }}
        placeholder={isListening ? "Listening..." : "Type or speak..."}
        className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
        disabled={isListening || isLoading}
      />
      
      {/* Send button */}
      <button
        onClick={() => sendMessage(inputText)}
        disabled={!inputText.trim() || isLoading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-sm font-medium rounded-xl transition-colors"
      >
        Send
      </button>
    </div>
  </div>
)
```

### Import statements at top of component file

```tsx
"use client"
import { useState, useEffect, useRef } from "react"
import { planChat, type RobotSpec } from "@/lib/api"
import { speakText } from "@/lib/elevenlabs"
import { createSpeechRecognizer } from "@/lib/speech"
```

---

## Step 2: `frontend/app/plan/page.tsx`

```tsx
"use client"
import { useRouter } from "next/navigation"
import PlanMode from "@/components/PlanMode"
import type { RobotSpec } from "@/lib/api"

export default function PlanPage() {
  const router = useRouter()

  function handleSpecComplete(spec: RobotSpec) {
    localStorage.setItem("robot_spec", JSON.stringify(spec))
    router.push("/capture")
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col max-h-screen overflow-hidden">
        <PlanMode onSpecComplete={handleSpecComplete} />
      </div>
    </main>
  )
}
```

---

## Step 3: `frontend/components/QRPanel.tsx`

```tsx
"use client"
import QRCode from "qrcode.react"

interface QRPanelProps {
  backendUrl: string
}

export default function QRPanel({ backendUrl }: QRPanelProps) {
  const mobileUrl = `${backendUrl}/mobile`

  return (
    <div className="flex flex-col items-center gap-5 p-8 bg-gray-900 rounded-2xl border border-gray-800">
      <p className="text-sm text-gray-400 text-center">
        Scan with your phone to capture the environment
      </p>
      <div className="p-3 bg-white rounded-xl">
        <QRCode
          value={mobileUrl}
          size={200}
          bgColor="#ffffff"
          fgColor="#111827"
          level="M"
        />
      </div>
      <p className="text-xs text-gray-600 font-mono text-center break-all max-w-[220px]">
        {mobileUrl}
      </p>
      <p className="text-xs text-gray-700 text-center">
        iPhone: use Polycam for LiDAR scan, then upload .obj
      </p>
    </div>
  )
}
```

---

## Step 4: `frontend/components/MobileCapture.tsx`

This renders when the page is opened on a phone (screen width < 768px).

### Props

```tsx
interface MobileCaptureProps {
  onEnvUploaded: () => void
  onMotionUploaded: () => void
}
```

### State

```tsx
const [mode, setMode] = useState<"menu" | "env" | "motion">("menu")
const [envStage, setEnvStage] = useState<number>(0)   // 0=not started, 1-5=stages
const [envChecks, setEnvChecks] = useState<boolean[]>([false, false, false, false])  // 4 corners
const [repCount, setRepCount] = useState<number>(0)   // 0-3
const [uploading, setUploading] = useState<boolean>(false)
const [uploadStatus, setUploadStatus] = useState<string | null>(null)
```

### Environment scan stages content

```
Stage 0 (not started): instruction card with description + "Start Scan" button
Stage 1: "Stand in center. Hold still for 3 seconds." + animated circle countdown (3s)
Stage 2: "Slowly pan LEFT →" + horizontal progress arc filling left → right over 5s
Stage 3: "← Slowly pan RIGHT" + horizontal progress arc filling right → left over 5s
Stage 4: "Tilt DOWN to capture the floor" + downward arrow animation
Stage 5: "Walk to each corner and tap when there" + 4 tap buttons in grid layout
  After all 4 tapped: file input appears + Upload .obj button
```

Stage auto-advance logic: stages 1-4 use `setTimeout` to auto-advance after their duration. Stage 5 requires all 4 corner checks before showing upload.

### Motion capture layout

```
Full screen dark background
Center: SVG human silhouette outline (white stroke, no fill)
  <svg width="200" height="350">
    <!-- Simple stick figure: circle head, line torso, arm lines, leg lines -->
    <circle cx="100" cy="40" r="25" fill="none" stroke="white" strokeWidth="2"/>
    <line x1="100" y1="65" x2="100" y2="200" stroke="white" strokeWidth="2"/>
    <line x1="100" y1="100" x2="50" y2="160" stroke="white" strokeWidth="2"/>
    <line x1="100" y1="100" x2="150" y2="160" stroke="white" strokeWidth="2"/>
    <line x1="100" y1="200" x2="70" y2="300" stroke="white" strokeWidth="2"/>
    <line x1="100" y1="200" x2="130" y2="300" stroke="white" strokeWidth="2"/>
  </svg>

Text below: "Perform the task slowly, 3 times"
Rep counter: large "2 / 3" display
  [Rep +1] button to manually increment (in case auto-detection isn't implemented yet)
When repCount >= 3: file input + "Upload Video" button appears
```

### Upload handlers

```tsx
async function handleEnvUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setUploading(true)
  setUploadStatus("Uploading environment mesh...")
  try {
    await uploadEnvironmentMesh(file)  // from lib/api.ts
    setUploadStatus("✅ Environment captured!")
    setTimeout(() => props.onEnvUploaded(), 1500)
  } catch (err) {
    setUploadStatus("❌ Upload failed. Try again.")
  } finally {
    setUploading(false)
  }
}

async function handleMotionUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setUploading(true)
  setUploadStatus("Processing motion video...")
  try {
    await uploadMotionVideo(file)  // from lib/api.ts
    setUploadStatus("✅ Motion captured!")
    setTimeout(() => props.onMotionUploaded(), 1500)
  } catch (err) {
    setUploadStatus("❌ Upload failed. Try again.")
  } finally {
    setUploading(false)
  }
}
```

### Menu layout (mode === "menu")

```tsx
<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 gap-6">
  <h1 className="text-3xl font-black text-blue-500">FORGEBOT</h1>
  <p className="text-gray-400 text-center text-sm">Choose a capture mode</p>
  
  <button onClick={() => setMode("env")}
    className="w-full py-6 bg-blue-600 rounded-2xl text-xl font-semibold">
    📷 Scan Environment
  </button>
  
  <button onClick={() => setMode("motion")}
    className="w-full py-6 bg-emerald-600 rounded-2xl text-xl font-semibold">
    🏃 Record Motion
  </button>
</div>
```

All buttons use large tap targets (min-height 64px), large font size (text-lg or larger), and padding suitable for thumb tapping on mobile.

---

## Step 5: `frontend/app/capture/page.tsx`

### State

```tsx
const [isMobile, setIsMobile] = useState<boolean>(false)
const [envReady, setEnvReady] = useState<boolean>(false)
const [motionReady, setMotionReady] = useState<boolean>(false)
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
```

### Mobile detection on mount

```tsx
useEffect(() => {
  setIsMobile(window.innerWidth < 768)
}, [])
```

### Backend polling

```tsx
useEffect(() => {
  const interval = setInterval(async () => {
    try {
      const scanStatus = await getScanStatus()     // from lib/api.ts
      const motionStatus = await getMotionStatus() // from lib/api.ts
      setEnvReady(scanStatus.loaded)
      setMotionReady(motionStatus.processed)
    } catch (_) {}
  }, 3000)
  return () => clearInterval(interval)
}, [])
```

### Desktop layout (isMobile === false)

```tsx
<main className="min-h-screen p-6 md:p-10">
  <h2 className="text-2xl font-bold mb-2">Connect Your Phone</h2>
  <p className="text-gray-400 text-sm mb-8">Scan the QR code to capture the environment and your motion</p>
  
  <div className="grid md:grid-cols-2 gap-8">
    {/* QR code */}
    <QRPanel backendUrl={backendUrl} />
    
    {/* Status checklist */}
    <div className="flex flex-col gap-4 justify-center">
      <h3 className="text-lg font-semibold text-gray-300">Capture Status</h3>
      
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${envReady ? "border-green-700 bg-green-950" : "border-gray-800 bg-gray-900"}`}>
        <span className="text-2xl">{envReady ? "✅" : "⏳"}</span>
        <div>
          <p className="font-medium text-sm">Environment Scanned</p>
          <p className="text-xs text-gray-500">{envReady ? "Mesh loaded into sim" : "Upload .obj from Polycam"}</p>
        </div>
      </div>
      
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${motionReady ? "border-green-700 bg-green-950" : "border-gray-800 bg-gray-900"}`}>
        <span className="text-2xl">{motionReady ? "✅" : "⏳"}</span>
        <div>
          <p className="font-medium text-sm">Motion Captured</p>
          <p className="text-xs text-gray-500">{motionReady ? "Parameters extracted" : "Record and upload video"}</p>
        </div>
      </div>
      
      <button
        onClick={() => router.push("/sim")}
        disabled={!envReady || !motionReady}
        className="mt-4 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
      >
        Continue to Simulation →
      </button>
      
      {/* Skip button for demo / testing */}
      <button
        onClick={() => router.push("/sim")}
        className="text-xs text-gray-700 hover:text-gray-500 text-center"
      >
        Skip capture (demo mode)
      </button>
    </div>
  </div>
</main>
```

### Mobile layout (isMobile === true)

```tsx
return (
  <MobileCapture
    onEnvUploaded={() => setEnvReady(true)}
    onMotionUploaded={() => setMotionReady(true)}
  />
)
```

---

## Step 6: Commit + Test

Run through the plan mode conversation manually:

1. Open `http://localhost:3000`
2. Click "Begin" → should go to `/plan`
3. First assistant question should appear AND be spoken aloud
4. Speak or type a response
5. Continue until spec appears
6. Click "Continue to Capture" → goes to `/capture`
7. QR code should display
8. Open the QR URL on phone → should show mobile page (served by backend at `/mobile`)

Commit:
```bash
git add -A && git commit -m "feat(frontend): PlanMode, QRPanel, MobileCapture, capture page" && git push origin frontend
```

---

## ✅ Success Criteria — TANUSH_2_FRONTEND is Done When:

- [ ] Plan Mode conversation flows end-to-end: first question appears on mount, each reply plays via ElevenLabs (or browser TTS), spec JSON card appears after ~5 exchanges
- [ ] Mic button toggles (red pulsing when active), captured speech auto-sends
- [ ] Spec complete → green card appears → "Continue" button routes to `/capture`
- [ ] `/capture` shows QR code on desktop
- [ ] On phone (< 768px): mobile menu appears with "📷 Scan Environment" and "🏃 Record Motion" buttons
- [ ] Scan stage 1-5 UI advances with animations (even without real LiDAR)
- [ ] Motion silhouette + rep counter visible on mobile
- [ ] File upload from mobile correctly POSTs to backend (or returns mock success)
- [ ] Desktop capture page status cards update when `getScanStatus()` / `getMotionStatus()` return `loaded: true`
- [ ] All changes committed and pushed to `frontend` branch

**When all boxes are checked, hand the frontend back to Ayan for AYAN_3_FRONTEND.md and move yourself to TANUSH_3_BACKEND.md.**
