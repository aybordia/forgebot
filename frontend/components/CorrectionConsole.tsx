"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { correctSim } from "@/lib/api"
import { createSpeechRecognizer, isSpeechSupported } from "@/lib/speech"

interface CorrectionConsoleProps {
  userId: string
}

export default function CorrectionConsole({ userId }: CorrectionConsoleProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [lastChanges, setLastChanges] = useState<Record<string, number> | null>(null)
  const [voiceReady, setVoiceReady] = useState(false)

  useEffect(() => {
    setVoiceReady(isSpeechSupported())
  }, [])

  async function handleSubmit() {
    const text = input.trim()
    if (!text || isLoading) return

    setIsLoading(true)
    setInput("")

    const res = await correctSim(text, userId)
    setLastChanges(res.param_changes as Record<string, number>)
    setIsLoading(false)
  }

  function toggleVoice() {
    if (isListening) return
    if (!isSpeechSupported()) return

    setIsListening(true)
    createSpeechRecognizer(
      (result) => {
        setInput(result.transcript)
        setIsListening(false)
      },
      () => setIsListening(false),
      () => setIsListening(false)
    )
  }

  const paramLabels: Record<string, string> = {
    arm_length_m: "Arm Length",
    gripper_width_m: "Gripper Width",
    link_radius_m: "Link Thickness",
  }

  return (
    <div className="glass rounded-2xl border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Correction Console</h3>
      </div>

      <div className="flex items-center gap-2">
        {voiceReady && (
          <button
            onClick={toggleVoice}
            className={`p-2.5 rounded-xl transition-all duration-200 ${
              isListening
                ? "bg-red-500/80 animate-pulse shadow-lg shadow-red-500/20"
                : "bg-white/5 hover:bg-white/10 border border-white/5"
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
            </svg>
          </button>
        )}

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder='e.g. "extend the reach and widen the grip"'
          disabled={isLoading}
          className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm outline-none
            focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30 disabled:opacity-40
            placeholder:text-gray-600 transition-all duration-200"
        />

        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-xs font-medium
            transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isLoading ? "..." : "Correct"}
        </button>
      </div>

      <AnimatePresence>
        {lastChanges && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-green-500/5 border border-green-500/10 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <p className="text-[10px] font-mono text-green-400 uppercase tracking-wider">Parameters Updated</p>
              </div>
              {Object.entries(lastChanges).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-gray-500">{paramLabels[key] || key}</span>
                  <span className="font-mono text-white">{typeof value === "number" ? value.toFixed(4) : value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
