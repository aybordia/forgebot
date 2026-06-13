"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import dynamic from "next/dynamic"
import { loadSim, stopSim } from "@/lib/api"
import CorrectionConsole from "@/components/CorrectionConsole"
import NavBar from "@/components/NavBar"
import TwinUploader from "@/components/TwinUploader"
import { type SimStatus } from "@/lib/websocket"
import { type TwinSpec } from "@/components/SimScene3D"

const SimScene3D = dynamic(() => import("@/components/SimScene3D"), { ssr: false })

export default function SimPage() {
  const [simLoaded, setSimLoaded] = useState(false)
  const [status, setStatus] = useState<SimStatus | null>(null)
  const [twin, setTwin] = useState<TwinSpec | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
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

  function handleSpec(spec: TwinSpec, url: string) {
    setTwin(spec)
    setPhotoUrl(url)
  }

  function clearTwin() {
    setTwin(null)
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoUrl(null)
  }

  return (
    <>
      <NavBar />
      <main className="min-h-screen flex flex-col pt-14 bg-grid">
        <div className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full">
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
                <p className="text-xs text-gray-500">Physics sandbox preview {twin ? "· photo-matched" : ""}</p>
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

            <div className="flex items-center gap-2">
              {twin && (
                <button
                  onClick={clearTwin}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10
                    rounded-lg text-xs font-medium text-gray-300 transition-all duration-200"
                >
                  Reset twin
                </button>
              )}
              {simLoaded && (
                <button
                  onClick={() => { stopSim(); setSimLoaded(false) }}
                  className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20
                    rounded-lg text-xs font-medium text-red-400 transition-all duration-200"
                >
                  Stop
                </button>
              )}
            </div>
          </motion.div>

          {/* Twin uploader */}
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-4"
          >
            <TwinUploader onSpec={handleSpec} />
          </motion.div>

          {/* Side-by-side photo + twin (or twin alone) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="flex-1 min-h-[480px] mb-4 grid gap-4"
            style={{ gridTemplateColumns: twin && photoUrl ? "1fr 1fr" : "1fr" }}
          >
            <AnimatePresence>
              {twin && photoUrl && (
                <motion.div
                  key="photo"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="relative glass rounded-2xl overflow-hidden border border-white/5"
                >
                  <img
                    src={photoUrl}
                    alt="Source factory"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 flex items-center gap-2 glass border border-white/10 px-2 py-1 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span className="text-[10px] font-mono text-gray-300">SOURCE PHOTO</span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 glass border border-white/10 rounded-lg p-2 text-[10px] font-mono text-gray-400 grid grid-cols-3 gap-1">
                    <div>
                      <div className="text-gray-600">PALETTE</div>
                      <div className="flex gap-1 mt-0.5">
                        {twin.machine_colors.slice(0, 3).map((c, i) => (
                          <span key={i} className="w-3 h-3 rounded-sm border border-white/10" style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">ARMS</div>
                      <div className="text-white">{twin.arm_count}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">EXPOSURE</div>
                      <div className="text-white">{twin.exposure.toFixed(2)}</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <SimScene3D onStatusUpdate={setStatus} twin={twin} />
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
