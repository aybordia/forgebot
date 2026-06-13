"use client"

import { useEffect, useRef, useState } from "react"
import { connectSimSocket, type SimStatus } from "@/lib/websocket"

interface SimViewerProps {
  onStatusUpdate?: (status: SimStatus) => void
}

export default function SimViewer({ onStatusUpdate }: SimViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<SimStatus>({ fps: 0, step: 0, score: 0, gpu_util_pct: 0 })

  useEffect(() => {
    const cleanup = connectSimSocket({
      onFrame: (blob) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const img = new Image()
        const url = URL.createObjectURL(blob)
        img.onload = () => {
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)
          URL.revokeObjectURL(url)
        }
        img.src = url
      },
      onStatus: (s) => {
        setStatus(s)
        onStatusUpdate?.(s)
      },
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    })

    return cleanup
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
      <canvas
        ref={canvasRef}
        className="w-full aspect-video bg-gray-950"
      />

      {/* Connection badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
        <span className="text-xs text-gray-400">
          {connected ? "Live" : "Connecting..."}
        </span>
      </div>

      {/* FPS overlay */}
      <div className="absolute top-3 right-3 text-xs text-gray-400 font-mono">
        {status.fps > 0 ? `${status.fps.toFixed(0)} FPS` : "—"}
      </div>

      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-4 py-2 flex items-center justify-between text-xs text-gray-300">
        <span>Step {status.step.toLocaleString()}</span>
        <span>Score: {status.score.toFixed(3)}</span>
        <span className={status.gpu_util_pct > 0 ? "text-green-400" : "text-gray-500"}>
          GPU {status.gpu_util_pct > 0 ? `${status.gpu_util_pct.toFixed(0)}%` : "N/A"}
        </span>
      </div>

      {/* Placeholder when no frames */}
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80">
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-1">Simulation Preview</p>
            <p className="text-gray-600 text-xs">Waiting for backend connection...</p>
          </div>
        </div>
      )}
    </div>
  )
}
