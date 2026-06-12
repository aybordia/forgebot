# AYAN_3_FRONTEND.md — Frontend Phase 3: Sim Viewer, Correction Console, Export, Final Polish

> **Read ARCHITECTURE.md before starting any work in this file.**
> **Prerequisites: AYAN_1_FRONTEND.md and TANUSH_2_FRONTEND.md (frontend phases 1 and 2) must be fully complete.**
> **Hackathon context: working demo over perfect code. Move fast.**
> **After every major step: `git add -A && git commit -m "<message>" && git push origin frontend`**

---

## What You Are Building in This File

1. **`components/SimViewer.tsx`** — Three.js canvas receiving JPEG frames from WebSocket
2. **`app/sim/page.tsx`** — Sim viewer page with GPU badge and top bar
3. **`components/CorrectionConsole.tsx`** — Voice/text correction input
4. **`components/ADIPartsPanel.tsx`** — Analog Devices BOM table
5. **`components/DesignRationalePanel.tsx`** — Design rationale cards
6. **`app/export/page.tsx`** — Export page with all three artifacts
7. **Global polish** — consistent UI across all pages, sponsor footer

---

## Step 1: `frontend/components/SimViewer.tsx`

### Props

```tsx
interface SimViewerProps {
  onStatusUpdate: (status: SimStatus) => void
}
// SimStatus from lib/websocket.ts: { fps, step, score, gpu_util_pct }
```

### State + Refs

```tsx
const canvasRef = useRef<HTMLCanvasElement>(null)
const wsRef = useRef<ReturnType<typeof createSimWebSocket> | null>(null)
const [connected, setConnected] = useState<boolean>(false)
const [fps, setFps] = useState<number>(0)
const [step, setStep] = useState<number>(0)
```

### Frame rendering function

This is the most performance-sensitive part. Use `createImageBitmap` for best performance:

```tsx
function renderFrame(data: ArrayBuffer) {
  const canvas = canvasRef.current
  if (!canvas) return
  
  const blob = new Blob([data], { type: "image/jpeg" })
  createImageBitmap(blob).then((bitmap) => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
  })
}
```

If `createImageBitmap` is not available (rare): fall back to `URL.createObjectURL` + `img.onload` + `ctx.drawImage`.

### WebSocket connection lifecycle

```tsx
useEffect(() => {
  const ws = createSimWebSocket({
    onFrame: renderFrame,
    onStatus: (status) => {
      setFps(status.fps)
      setStep(status.step)
      props.onStatusUpdate(status)
    },
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
  })
  wsRef.current = ws
  
  return () => {
    ws.close()
  }
}, [])  // empty deps — connect once on mount, disconnect on unmount
```

### JSX

```tsx
return (
  <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
    
    {/* Main canvas — fills container */}
    <canvas
      ref={canvasRef}
      width={640}
      height={480}
      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
    />
    
    {/* Connection overlay — shown when not connected */}
    {!connected && (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/90 gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Connecting to physics engine...</p>
      </div>
    )}
    
    {/* Stats overlay — top-left */}
    {connected && (
      <div className="absolute top-2 left-2 bg-black/60 rounded-lg px-2 py-1 text-xs font-mono text-green-400 space-y-0.5">
        <div>{fps.toFixed(1)} FPS</div>
        <div>Step {step.toLocaleString()}</div>
      </div>
    )}
    
    {/* Connection badge — top-right */}
    <div className={`absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${connected ? "bg-green-950/80 text-green-400" : "bg-red-950/80 text-red-400"}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
      {connected ? "LIVE" : "DISCONNECTED"}
    </div>
  </div>
)
```

### Imports

```tsx
"use client"
import { useRef, useEffect, useState } from "react"
import { createSimWebSocket, type SimStatus } from "@/lib/websocket"
```

---

## Step 2: `frontend/app/sim/page.tsx`

### State

```tsx
const [simLoaded, setSimLoaded] = useState<boolean>(false)
const [simError, setSimError] = useState<string | null>(null)
const [gpuUtil, setGpuUtil] = useState<number>(0)
const [lastCorrection, setLastCorrection] = useState<string | null>(null)
```

### On Mount

```tsx
useEffect(() => {
  async function startSim() {
    try {
      await loadSim()  // from lib/api.ts
      setSimLoaded(true)
    } catch (e) {
      setSimError("Sim failed to load — backend may not be running")
      setSimLoaded(true)  // still show UI even if backend is offline
    }
  }
  startSim()
}, [])
```

### JSX

```tsx
"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import SimViewer from "@/components/SimViewer"
import CorrectionConsole from "@/components/CorrectionConsole"
import { loadSim, type SimStatus } from "@/lib/api"

export default function SimPage() {
  // ... state declared above ...

  return (
    <main className="flex flex-col h-screen bg-gray-950">
      
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <span className="font-black text-blue-500 tracking-wider">FORGEBOT</span>
        <span className="text-gray-700">|</span>
        <span className="text-sm text-gray-400">Simulation</span>
        
        {/* GPU badge */}
        <div className="ml-auto flex items-center gap-2 bg-orange-950/50 border border-orange-800/50 rounded-full px-3 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-xs text-orange-400 font-mono">GPU {gpuUtil}%</span>
        </div>
        
        {/* Export button */}
        <button
          onClick={() => router.push("/export")}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
        >
          Export →
        </button>
      </div>
      
      {/* Error banner */}
      {simError && (
        <div className="bg-red-950/50 border-b border-red-800/50 px-4 py-2 text-red-400 text-xs">
          ⚠️ {simError}
        </div>
      )}
      
      {/* Sim canvas — takes most of the space */}
      <div className="flex-1 min-h-0 p-3">
        <SimViewer
          onStatusUpdate={(status) => setGpuUtil(status.gpu_util_pct)}
        />
      </div>
      
      {/* Correction console — fixed height at bottom */}
      <div className="flex-shrink-0 border-t border-gray-800 p-3">
        <CorrectionConsole
          onCorrection={(text) => setLastCorrection(text)}
        />
      </div>
    </main>
  )
}
```

---

## Step 3: `frontend/components/CorrectionConsole.tsx`

### Props

```tsx
interface CorrectionConsoleProps {
  onCorrection: (correctionText: string) => void
}
```

### State

```tsx
const [inputText, setInputText] = useState<string>("")
const [isListening, setIsListening] = useState<boolean>(false)
const [isProcessing, setIsProcessing] = useState<boolean>(false)
const [corrections, setCorrections] = useState<string[]>([])  // log of recent corrections
const stopListeningRef = useRef<(() => void) | null>(null)
```

### Send correction handler

```tsx
async function handleSendCorrection(text: string) {
  if (!text.trim() || isProcessing) return
  setInputText("")
  setIsProcessing(true)
  
  try {
    const res = await correctSim(text, userId)  // from lib/api.ts
    
    // Format summary of what changed
    const changes = Object.entries(res.param_changes || {})
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join(", ")
    const summary = changes ? `✓ ${changes}` : "✓ Applied"
    
    setCorrections(prev => [summary, ...prev].slice(0, 5))  // keep last 5
    props.onCorrection(text)
  } catch (e) {
    setCorrections(prev => ["⚠️ Backend not responding", ...prev].slice(0, 5))
  } finally {
    setIsProcessing(false)
  }
}
```

### Voice toggle

```tsx
function toggleListening() {
  if (isListening) {
    stopListeningRef.current?.()
    stopListeningRef.current = null
    setIsListening(false)
    return
  }
  
  const stop = createSpeechRecognizer(
    (result) => {
      setIsListening(false)
      stopListeningRef.current = null
      handleSendCorrection(result.transcript)
    },
    () => setIsListening(false),
    () => setIsListening(false)
  )
  stopListeningRef.current = stop
  setIsListening(true)
}
```

### Keyboard shortcut

```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey && e.code === "Space") {
      e.preventDefault()
      toggleListening()
    }
  }
  window.addEventListener("keydown", handleKeyDown)
  return () => window.removeEventListener("keydown", handleKeyDown)
}, [isListening])
```

### JSX

```tsx
<div className="flex flex-col gap-2">
  
  {/* Label */}
  <div className="flex items-center gap-2">
    <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">
      🎙️ Correction Console
    </span>
    <span className="text-xs text-gray-700">Ctrl+Space to toggle mic</span>
  </div>
  
  {/* Input row */}
  <div className="flex gap-2">
    <button
      onClick={toggleListening}
      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
        isListening ? "bg-red-600 scale-110 animate-pulse" : "bg-gray-800 hover:bg-gray-700"
      }`}
    >
      🎤
    </button>
    
    <input
      type="text"
      value={inputText}
      onChange={(e) => setInputText(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") handleSendCorrection(inputText) }}
      placeholder={isListening ? "Listening..." : 'e.g. "extend the reach, widen the grip"'}
      disabled={isListening || isProcessing}
      className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-blue-500 disabled:opacity-50"
    />
    
    <button
      onClick={() => handleSendCorrection(inputText)}
      disabled={!inputText.trim() || isProcessing}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-sm font-medium rounded-xl transition-colors"
    >
      {isProcessing ? "..." : "Apply"}
    </button>
  </div>
  
  {/* Correction log */}
  <div className="flex gap-2 flex-wrap">
    {corrections.map((c, i) => (
      <span key={i} className="text-xs text-gray-500 bg-gray-900 rounded-full px-2 py-0.5">
        {c}
      </span>
    ))}
  </div>
</div>
```

---

## Step 4: `frontend/components/ADIPartsPanel.tsx`

### Props

```tsx
interface ADIPartsPanelProps {
  bom: BOMItem[] | null
}
```

### Category color map

```tsx
const CATEGORY_COLORS: Record<string, string> = {
  "IMU": "bg-blue-950 text-blue-400 border-blue-800",
  "Motor Driver": "bg-green-950 text-green-400 border-green-800",
  "Power Management": "bg-yellow-950 text-yellow-400 border-yellow-800",
  "Signal Processor": "bg-purple-950 text-purple-400 border-purple-800",
  "Amplifier": "bg-pink-950 text-pink-400 border-pink-800",
}
const DEFAULT_COLOR = "bg-gray-900 text-gray-400 border-gray-700"
```

### JSX

```tsx
return (
  <div className="flex flex-col gap-3">
    
    {/* Header */}
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-gray-300">🔩 Analog Devices BOM</span>
      {bom && <span className="text-xs text-gray-600">{bom.length} parts</span>}
    </div>
    
    {/* Loading state */}
    {!bom && (
      <div className="space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="h-20 bg-gray-900 rounded-xl animate-pulse" />
        ))}
      </div>
    )}
    
    {/* BOM items */}
    {bom?.map((item) => {
      const colorClass = CATEGORY_COLORS[item.category] || DEFAULT_COLOR
      return (
        <div key={item.part_number} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colorClass}`}>
                {item.category}
              </span>
              <span className="font-mono font-bold text-white text-sm">{item.part_number}</span>
              <span className="text-gray-500 text-xs">×{item.quantity}</span>
            </div>
            <a
              href={item.datasheet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0"
            >
              Datasheet ↗
            </a>
          </div>
          <p className="text-gray-400 text-xs mb-1">{item.description}</p>
          <p className="text-gray-600 text-xs italic">{item.justification}</p>
        </div>
      )
    })}
  </div>
)
```

---

## Step 5: `frontend/components/DesignRationalePanel.tsx`

### Props

```tsx
interface DesignRationalePanelProps {
  explanations: Explanation[] | null
}
```

### JSX

```tsx
return (
  <div className="flex flex-col gap-3">
    
    {/* Header */}
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-gray-300">📋 Design Literacy</span>
      <span className="text-xs text-gray-600 bg-gray-900 px-2 py-0.5 rounded-full">
        design rationale
      </span>
    </div>
    
    {/* Loading state */}
    {!explanations && (
      <div className="space-y-2">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-14 bg-gray-900 rounded-xl animate-pulse" />
        ))}
      </div>
    )}
    
    {/* Explanation cards */}
    {explanations?.map((exp, i) => (
      <div
        key={i}
        className={`p-3 rounded-xl border border-gray-800 ${i % 2 === 0 ? "bg-gray-900" : "bg-gray-950"}`}
      >
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-white text-sm font-medium">{exp.component}</span>
          <span className="text-blue-400 text-sm font-mono">{exp.value}</span>
        </div>
        <p className="text-gray-500 text-xs leading-relaxed">{exp.reason}</p>
      </div>
    ))}
  </div>
)
```

---

## Step 6: `frontend/app/export/page.tsx`

### State

```tsx
const [bom, setBom] = useState<BOMItem[] | null>(null)
const [explanations, setExplanations] = useState<Explanation[] | null>(null)
const [copySuccess, setCopySuccess] = useState<boolean>(false)
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
```

### On mount — fetch both in parallel

```tsx
useEffect(() => {
  async function fetchExport() {
    const [bomRes, rationaleRes] = await Promise.all([
      getBOM(),
      getDesignRationale()
    ])
    setBom(bomRes.bom)
    setExplanations(rationaleRes.explanations)
  }
  fetchExport()
}, [])
```

### Copy BOM handler

```tsx
function copyBOM() {
  if (!bom) return
  navigator.clipboard.writeText(JSON.stringify(bom, null, 2))
  setCopySuccess(true)
  setTimeout(() => setCopySuccess(false), 2000)
}
```

### JSX

```tsx
<main className="min-h-screen p-6 md:p-10 bg-gray-950">
  
  {/* Header */}
  <div className="flex items-center justify-between mb-8">
    <div>
      <h1 className="text-2xl font-bold">Export</h1>
      <p className="text-gray-500 text-sm mt-1">Your robot design is ready</p>
    </div>
    
    {/* Export buttons */}
    <div className="flex gap-3">
      <a
        href={`${backendUrl}/api/export/stl`}
        download="forgebot_robot.stl"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
      >
        ⬇ Download STL
      </a>
      <button
        onClick={copyBOM}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl transition-colors"
      >
        {copySuccess ? "✓ Copied!" : "Copy BOM JSON"}
      </button>
      <button
        onClick={() => {
          navigator.clipboard.writeText(window.location.origin)
          alert("Demo link copied!")
        }}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl transition-colors"
      >
        Share Link
      </button>
    </div>
  </div>
  
  {/* Two-column layout */}
  <div className="grid md:grid-cols-2 gap-8">
    <DesignRationalePanel explanations={explanations} />
    <ADIPartsPanel bom={bom} />
  </div>
</main>
```

---

## Step 7: Global Polish

### Consistent nav pattern

Add a shared back navigation link to `/sim`, `/export` pages. Small top-left:

```tsx
<button onClick={() => router.back()} className="text-xs text-gray-700 hover:text-gray-500 mb-4 block">
  ← Back
</button>
```

### Sponsor footer — add to `app/layout.tsx`

Below the `{children}`, inside the body, add a global footer:

```tsx
<footer className="border-t border-gray-900 px-6 py-3 flex items-center justify-center gap-4 flex-wrap">
  <span className="text-xs text-gray-800">Milpitas Hacks 3</span>
  <span className="text-xs text-gray-800">·</span>
  <span className="text-xs text-gray-700">ASUS GPU</span>
  <span className="text-xs text-gray-700">·</span>
  <span className="text-xs text-gray-700">Omi</span>
  <span className="text-xs text-gray-700">·</span>
  <span className="text-xs text-gray-700">Analog Devices</span>
  <span className="text-xs text-gray-700">·</span>
  <span className="text-xs text-gray-700">Vercel</span>
  <span className="text-xs text-gray-700">·</span>
  <span className="text-xs text-gray-700">Design Rationale</span>
</footer>
```

### TypeScript: ensure `next.config.js` has no type errors

```js
/** @type {import('next').NextConfig} */
const nextConfig = {}
module.exports = nextConfig
```

### Final production build check

```bash
cd frontend
npm run build
```

Fix any TypeScript errors before calling this done. The build must complete clean.

### Vercel production redeploy

```bash
vercel --prod
```

Verify the production URL shows the full app working.

---

## Step 8: End-to-End Test (with Backend Running)

When Tanush says "Backend is ready at [tunnel URL]":

1. Update `frontend/.env.local`:
   ```
   NEXT_PUBLIC_BACKEND_URL=https://[tunnel-url]
   NEXT_PUBLIC_WS_URL=wss://[tunnel-url]
   ```

2. Restart dev server: `npm run dev`

3. Run the full demo flow:
   - `/` → click Begin → `/plan`
   - Talk through 5 questions → spec appears → Continue
   - `/capture` → QR shows → phone opens mobile page → upload .obj and video
   - `/sim` → sim loads → WebSocket connects → frames appear → speak correction → sim updates
   - `/export` → BOM and Design rationale appears → STL downloads

4. Fix any integration issues found (endpoint URL mismatches, response shape differences)

5. Update Vercel env vars with the tunnel URL and redeploy

Commit everything:
```bash
git add -A && git commit -m "feat(frontend): SimViewer, CorrectionConsole, ADIPartsPanel, DesignRationalePanel, export page — FRONTEND COMPLETE" && git push origin frontend
```

---

## Merge Instructions (Run After Tanush Finishes)

1. Both push final commits to your branches
2. On GitHub: open a PR from `frontend` into `backend` (or both into `main`)
3. Open Claude Code pointed at the merged repo
4. Say: **"Read ARCHITECTURE.md, TANUSH_3_BACKEND.md, and AYAN_3_FRONTEND.md. The backend branch and frontend branch have been merged. Identify any integration issues between them — endpoint URL mismatches, response format differences, WebSocket message format differences, import errors — and fix them all."**
5. Claude Code does a final integration pass
6. Run full end-to-end demo flow and verify it works
7. Final push to `main`

---

## ✅ Success Criteria — AYAN_3_FRONTEND is Done When:

- [ ] `/sim` page loads and WebSocket connects to backend
- [ ] Three.js canvas shows live JPEG frames from MuJoCo at ~20fps
- [ ] GPU utilization badge in top bar updates in real time
- [ ] Correction console: mic button toggles, voice correction sends, correction log updates
- [ ] Correction console: `Ctrl+Space` keyboard shortcut toggles listening
- [ ] After correction: canvas shows changed robot (if backend is running)
- [ ] `/export` page: BOM table shows ADI parts with category color badges and datasheet links
- [ ] `/export` page: Design Rationale panel shows design rationale for all parameters
- [ ] "Download STL" button triggers actual file download
- [ ] `npm run build` completes with zero TypeScript errors
- [ ] App deployed to Vercel and accessible at production URL
- [ ] Sponsor footer visible on all pages
- [ ] All changes committed and pushed to `frontend` branch
