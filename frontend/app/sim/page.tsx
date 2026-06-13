"use client"

import { useEffect, useState } from "react"
import { loadSim, stopSim } from "@/lib/api"
import SimViewer from "@/components/SimViewer"
import CorrectionConsole from "@/components/CorrectionConsole"
import { type SimStatus } from "@/lib/websocket"

export default function SimPage() {
  const [simLoaded, setSimLoaded] = useState(false)
  const [status, setStatus] = useState<SimStatus | null>(null)
  const [userId] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("user_id") || "default-user"
    }
    return "default-user"
  })

  useEffect(() => {
    async function start() {
      await loadSim()
      setSimLoaded(true)
    }
    start()
    return () => { stopSim() }
  }, [])

  return (
    <main className="h-screen flex flex-col p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Simulation</h1>
          {status && (
            <span className={`text-xs px-2 py-1 rounded-lg ${
              status.gpu_util_pct > 0
                ? "bg-green-900/50 text-green-400 border border-green-800"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}>
              {status.gpu_util_pct > 0 ? "GPU Accelerated" : "CPU Mode"}
            </span>
          )}
        </div>

        {simLoaded && (
          <button
            onClick={() => { stopSim(); setSimLoaded(false) }}
            className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 rounded-lg text-xs font-medium transition-colors"
          >
            Stop Sim
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 mb-4">
        <SimViewer onStatusUpdate={setStatus} />
      </div>

      <CorrectionConsole userId={userId} />
    </main>
  )
}
