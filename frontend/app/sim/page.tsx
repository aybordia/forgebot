"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { loadSim, stopSim } from "@/lib/api"
import SimViewer from "@/components/SimViewer"
import CorrectionConsole from "@/components/CorrectionConsole"
import NavBar from "@/components/NavBar"
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
    <>
      <NavBar />
      <main className="h-screen flex flex-col pt-14 bg-grid">
        <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Simulation</h1>
                <p className="text-xs text-gray-500">Physics sandbox preview</p>
              </div>

              {status && (
                <span className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border ${
                  status.gpu_util_pct > 0
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-white/5 text-gray-500 border-white/5"
                }`}>
                  {status.gpu_util_pct > 0 ? "GPU" : "CPU"}
                </span>
              )}
            </div>

            {simLoaded && (
              <button
                onClick={() => { stopSim(); setSimLoaded(false) }}
                className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20
                  rounded-lg text-xs font-medium text-red-400 transition-all duration-200"
              >
                Stop
              </button>
            )}
          </motion.div>

          {/* Sim viewer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="flex-1 min-h-0 mb-4"
          >
            <SimViewer onStatusUpdate={setStatus} />
          </motion.div>

          {/* Correction console */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <CorrectionConsole userId={userId} />
          </motion.div>
        </div>
      </main>
    </>
  )
}
