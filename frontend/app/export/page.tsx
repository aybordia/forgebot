"use client"

import { useEffect, useState } from "react"
import { getBOM, getRationale, type BOMItem, type Explanation } from "@/lib/api"
import ADIPartsPanel from "@/components/ADIPartsPanel"
import RationalePanel from "@/components/RationalePanel"

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
      <main className="h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Loading export data...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Export & Documentation</h1>
        <div className="flex gap-3">
          <a
            href={`${BASE}/api/export/stl`}
            download="robot_current.stl"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors"
          >
            Download STL
          </a>
          <button
            onClick={handleCopyBOM}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-medium transition-colors"
          >
            {copied ? "Copied!" : "Copy BOM"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ADIPartsPanel bom={bom} />
        <RationalePanel explanations={explanations} />
      </div>
    </main>
  )
}
