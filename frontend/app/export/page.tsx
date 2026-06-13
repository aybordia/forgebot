"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { getBOM, getRationale, type BOMItem, type Explanation } from "@/lib/api"
import ADIPartsPanel from "@/components/ADIPartsPanel"
import RationalePanel from "@/components/RationalePanel"
import NavBar from "@/components/NavBar"

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function ExportPage() {
  const [bom, setBom] = useState<BOMItem[]>([])
  const [explanations, setExplanations] = useState<Explanation[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const [bomRes, ratRes] = await Promise.all([getBOM(), getRationale()])
      setBom(bomRes.bom)
      setExplanations(ratRes.explanations)
      setLoading(false)
    }
    load()
  }, [])

  function handleCopyBOM() {
    navigator.clipboard.writeText(JSON.stringify(bom, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <>
        <NavBar />
        <main className="h-screen flex items-center justify-center pt-14 bg-grid">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <p className="text-gray-500 text-sm">Loading export data...</p>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <NavBar />
      <main className="min-h-screen pt-14 bg-grid">
        <div className="max-w-5xl mx-auto p-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-green-500/15 border border-green-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Export & Documentation</h1>
                <p className="text-xs text-gray-500">BOM, design rationale, and STL</p>
              </div>
            </div>

            <div className="flex gap-2">
              <a
                href={`${BASE}/api/export/stl`}
                download="robot_current.stl"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-medium
                  transition-all duration-200 glow-blue flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download STL
              </a>
              <button
                onClick={handleCopyBOM}
                className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10
                  rounded-xl text-xs font-medium transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                {copied ? "Copied!" : "Copy BOM"}
              </button>
            </div>
          </motion.div>

          {/* Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <ADIPartsPanel bom={bom} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <RationalePanel explanations={explanations} />
            </motion.div>
          </div>
        </div>
      </main>
    </>
  )
}
