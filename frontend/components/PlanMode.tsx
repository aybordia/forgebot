"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { planChat, getUserContext, type RobotSpec, type ChatResponse } from "@/lib/api"
import { createSpeechRecognizer, isSpeechSupported } from "@/lib/speech"

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
  const [voiceReady, setVoiceReady] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const stopListeningRef = useRef<(() => void) | null>(null)

  // Speech APIs only exist client-side — gate to avoid hydration mismatch
  useEffect(() => {
    setVoiceReady(isSpeechSupported())
  }, [])

  useEffect(() => {
    let uid = localStorage.getItem("user_id") || `user_${Date.now()}`
    localStorage.setItem("user_id", uid)
    setUserId(uid)

    // Show the opening question immediately — don't block on memory lookup
    setIsLoading(true)
    planChat("", sessionId, uid).then((res) => {
      setMessages([{ role: "assistant", content: res.reply }])
      setIsLoading(false)
    })

    // Load Backboard "welcome back" context in parallel (non-blocking)
    getUserContext(uid).then((ctx) => {
      if (ctx.has_history && ctx.summary) {
        setWelcomeBack(ctx.summary)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-white">Plan Mode</span>
            <p className="text-xs text-gray-500">Describe your robot arm</p>
          </div>
        </div>
        {voiceReady && (
          <span className="text-[10px] text-gray-600 font-mono uppercase tracking-wider">Voice enabled</span>
        )}
      </div>

      {/* Welcome back banner */}
      <AnimatePresence>
        {welcomeBack && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-6 mt-3"
          >
            <div className="p-3 glass rounded-xl border border-blue-500/20 text-sm text-blue-300">
              {welcomeBack}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`px-4 py-2.5 max-w-[75%] text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600/80 rounded-2xl rounded-tr-md ml-auto"
                    : "glass border border-white/5 rounded-2xl rounded-tl-md mr-auto"
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="glass border border-white/5 rounded-2xl rounded-tl-md px-4 py-3 mr-auto">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Completed spec card */}
      <AnimatePresence>
        {completedSpec && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="mx-6 mb-3"
          >
            <div className="p-4 glass rounded-2xl border border-green-500/20 glow-green">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <p className="text-green-400 font-semibold text-sm">Spec Locked</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <span className="text-gray-500">Task <span className="text-white ml-1">{completedSpec.task}</span></span>
                <span className="text-gray-500">Payload <span className="text-white ml-1">{completedSpec.payload_kg}kg</span></span>
                <span className="text-gray-500">Reach <span className="text-white ml-1">{completedSpec.reach_cm}cm</span></span>
                <span className="text-gray-500">DOF <span className="text-white ml-1">{completedSpec.dof}</span></span>
                <span className="text-gray-500">Gripper <span className="text-white ml-1">{completedSpec.gripper_type}</span></span>
                <span className="text-gray-500">Mounted <span className="text-white ml-1">{completedSpec.mounted ? "Yes" : "No"}</span></span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="px-6 py-4 border-t border-white/5 flex items-center gap-2">
        <button
          onClick={toggleListening}
          disabled={!!completedSpec}
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            isListening
              ? "bg-red-500/80 animate-pulse shadow-lg shadow-red-500/20"
              : "bg-white/5 hover:bg-white/10 border border-white/5"
          } ${completedSpec ? "opacity-30 cursor-not-allowed" : ""}`}
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
          placeholder={completedSpec ? "Spec complete — heading to simulation..." : "Describe your robot..."}
          disabled={!!completedSpec}
          className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm outline-none
            focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 disabled:opacity-30
            placeholder:text-gray-600 transition-all duration-200"
        />

        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isLoading || !!completedSpec}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium
            transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed glow-blue"
        >
          Send
        </button>
      </div>
    </div>
  )
}
