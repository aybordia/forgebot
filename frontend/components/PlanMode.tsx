"use client"

import { useEffect, useRef, useState } from "react"
import { planChat, getUserContext, type RobotSpec, type ChatResponse } from "@/lib/api"
import { createSpeechRecognizer, isSpeechSupported } from "@/lib/speech"
import { speakText, stopSpeaking } from "@/lib/elevenlabs"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface PlanModeProps {
  onSpecComplete: (spec: RobotSpec) => void
}

export default function PlanMode({ onSpecComplete }: PlanModeProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const [userId, setUserId] = useState("")
  const [completedSpec, setCompletedSpec] = useState<RobotSpec | null>(null)
  const [welcomeBack, setWelcomeBack] = useState("")

  const chatEndRef = useRef<HTMLDivElement>(null)
  const stopListeningRef = useRef<(() => void) | null>(null)

  // Initialize: load user_id, check context, get first question
  useEffect(() => {
    async function init() {
      let uid = localStorage.getItem("user_id") || `user_${Date.now()}`
      localStorage.setItem("user_id", uid)
      setUserId(uid)

      // Check Backboard context
      const ctx = await getUserContext(uid)
      if (ctx.has_history && ctx.summary) {
        setWelcomeBack(ctx.summary)
      }

      // Trigger first assistant question
      setIsLoading(true)
      const res = await planChat("", sessionId, uid)
      setMessages([{ role: "assistant", content: res.reply }])
      setIsLoading(false)
      speakText(res.reply)
    }
    init()
    return () => stopSpeaking()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend() {
    const text = inputText.trim()
    if (!text || isLoading) return

    setInputText("")
    setMessages(prev => [...prev, { role: "user", content: text }])
    setIsLoading(true)

    const res: ChatResponse = await planChat(text, sessionId, userId)

    setMessages(prev => [...prev, { role: "assistant", content: res.reply }])
    setIsLoading(false)
    speakText(res.reply)

    if (res.is_complete && res.robot_spec) {
      setCompletedSpec(res.robot_spec)
      onSpecComplete(res.robot_spec)
    }
  }

  function toggleListening() {
    if (isListening && stopListeningRef.current) {
      stopListeningRef.current()
      stopListeningRef.current = null
      setIsListening(false)
      return
    }

    if (!isSpeechSupported()) return

    setIsListening(true)
    const stop = createSpeechRecognizer(
      (result) => {
        setInputText(result.transcript)
        setIsListening(false)
        stopListeningRef.current = null
      },
      () => {
        setIsListening(false)
        stopListeningRef.current = null
      },
      () => {
        setIsListening(false)
        stopListeningRef.current = null
      }
    )
    stopListeningRef.current = stop
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-blue-400">PLAN MODE</span>
        </div>
        {isSpeechSupported() && (
          <span className="text-xs text-gray-500">Voice enabled</span>
        )}
      </div>

      {/* Welcome back banner */}
      {welcomeBack && (
        <div className="mx-4 mt-3 p-3 bg-blue-900/30 border border-blue-800 rounded-xl text-sm text-blue-300">
          {welcomeBack}
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`px-4 py-2.5 max-w-[75%] text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl ml-auto"
                  : "bg-gray-800 rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl mr-auto"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl px-4 py-3 mr-auto">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Completed spec card */}
      {completedSpec && (
        <div className="mx-4 mb-3 p-4 bg-green-900/30 border border-green-700 rounded-xl">
          <p className="text-green-400 font-semibold text-sm mb-2">Spec Locked</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300">
            <span>Task: <span className="text-white">{completedSpec.task}</span></span>
            <span>Payload: <span className="text-white">{completedSpec.payload_kg}kg</span></span>
            <span>Reach: <span className="text-white">{completedSpec.reach_cm}cm</span></span>
            <span>DOF: <span className="text-white">{completedSpec.dof}</span></span>
            <span>Gripper: <span className="text-white">{completedSpec.gripper_type}</span></span>
            <span>Mounted: <span className="text-white">{completedSpec.mounted ? "Yes" : "No"}</span></span>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-2">
        <button
          onClick={toggleListening}
          disabled={!!completedSpec}
          className={`p-2.5 rounded-xl transition-colors ${
            isListening
              ? "bg-red-600 animate-pulse"
              : "bg-gray-800 hover:bg-gray-700"
          } ${completedSpec ? "opacity-40 cursor-not-allowed" : ""}`}
          title={isListening ? "Stop listening" : "Start voice input"}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
          </svg>
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={completedSpec ? "Spec complete — continue to capture" : "Describe your robot..."}
          disabled={!!completedSpec}
          className="flex-1 bg-gray-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
        />

        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isLoading || !!completedSpec}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  )
}
