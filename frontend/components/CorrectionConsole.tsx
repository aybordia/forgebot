"use client"

import { useState } from "react"
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
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300">Correction Console</h3>

      <div className="flex items-center gap-2">
        {isSpeechSupported() && (
          <button
            onClick={toggleVoice}
            className={`p-2.5 rounded-xl transition-colors ${
              isListening ? "bg-red-600 animate-pulse" : "bg-gray-800 hover:bg-gray-700"
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
          placeholder="e.g. extend the reach and widen the grip"
          disabled={isLoading}
          className="flex-1 bg-gray-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
        />

        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? "..." : "Correct"}
        </button>
      </div>

      {lastChanges && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-1">
          <p className="text-xs text-green-400 font-medium mb-2">Parameters Updated</p>
          {Object.entries(lastChanges).map(([key, value]) => (
            <div key={key} className="flex justify-between text-xs">
              <span className="text-gray-400">{paramLabels[key] || key}</span>
              <span className="font-mono text-white">{typeof value === "number" ? value.toFixed(4) : value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
