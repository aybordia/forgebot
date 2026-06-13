"use client"

import { useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { type TwinSpec } from "@/components/SimScene3D"

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

interface TwinUploaderProps {
  onSpec: (spec: TwinSpec, photoUrl: string) => void
}

export default function TwinUploader({ onSpec }: TwinUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.")
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Image must be under 25 MB.")
      return
    }
    setError(null)
    setLoading(true)

    try {
      const url = URL.createObjectURL(file)
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${BASE}/api/twin/analyze`, { method: "POST", body: form })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      onSpec(body.spec as TwinSpec, url)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Analysis failed: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`glass rounded-2xl border transition-all duration-200 px-4 py-3 flex items-center gap-3 ${
        dragging ? "border-blue-500/40 bg-blue-500/5" : "border-white/5"
      }`}
    >
      <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">Match a real factory</p>
        <p className="text-[11px] text-gray-500 truncate">
          Drop a 4K photo (or click to upload) — the twin rebuilds to mirror its colors, lighting, and layout.
        </p>
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-medium transition-all duration-200 disabled:opacity-40 glow-blue flex-shrink-0"
      >
        {loading ? "Analyzing..." : "Upload Photo"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ""
        }}
      />

      <AnimatePresence>
        {error && (
          <motion.span
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[11px] text-red-400 ml-2"
          >
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
