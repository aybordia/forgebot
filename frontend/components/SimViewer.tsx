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
    <div className="relative h-full glass rounded-2xl overflow-hidden border border-white/5">
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain bg-gray-950"
      />

      {/* Connection badge */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400 shadow-lg shadow-green-400/50" : "bg-yellow-400 animate-pulse"}`} />
        <span className="text-[10px] font-mono text-gray-500">
          {connected ? "LIVE" : "CONNECTING"}
        </span>
      </div>

      {/* FPS */}
      <div className="absolute top-4 right-4 text-[10px] font-mono text-gray-600">
        {status.fps > 0 ? `${status.fps.toFixed(0)} FPS` : "—"}
      </div>

      {/* Bottom status bar */}
      <div className="absolute bottom-0 left-0 right-0 glass border-t border-white/5 px-4 py-2.5 flex items-center justify-between">
        <span className="text-[10px] font-mono text-gray-500">
          STEP {status.step.toLocaleString()}
        </span>
        <div className="flex items-center gap-1">
          <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, status.score * 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-gray-400 ml-1">
            {status.score.toFixed(3)}
          </span>
        </div>
        <span className={`text-[10px] font-mono ${status.gpu_util_pct > 0 ? "text-green-400" : "text-gray-600"}`}>
          GPU {status.gpu_util_pct > 0 ? `${status.gpu_util_pct.toFixed(0)}%` : "N/A"}
        </span>
      </div>

      {/* Placeholder overlay */}
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/90">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-purple-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 mb-1">Simulation Preview</p>
            <p className="text-xs text-gray-600 font-mono">Connecting to backend...</p>
          </div>
        </div>
      )}
    </div>
  )
}
