"use client"

import { type Explanation } from "@/lib/api"

interface RationalePanelProps {
  explanations: Explanation[]
}

export default function RationalePanel({ explanations }: RationalePanelProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-green-400 mb-4">Design Rationale</h2>

      {explanations.map((exp, i) => (
        <div
          key={i}
          className="bg-gray-800/60 border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm font-semibold text-white">{exp.component}</span>
            <span className="text-sm font-mono text-green-400">{exp.value}</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{exp.reason}</p>
        </div>
      ))}
    </div>
  )
}
