"use client"

import { motion } from "framer-motion"
import { type Explanation } from "@/lib/api"

interface RationalePanelProps {
  explanations: Explanation[]
}

export default function RationalePanel({ explanations }: RationalePanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-6 h-6 rounded-lg bg-green-500/15 border border-green-500/20 flex items-center justify-center">
          <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Design Rationale</h2>
          <p className="text-[10px] text-gray-500 font-mono">{explanations.length} design decisions</p>
        </div>
      </div>

      {explanations.map((exp, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="glass rounded-xl border border-white/5 p-4 hover:border-green-500/20 transition-colors duration-200"
        >
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-medium text-white">{exp.component}</span>
            <span className="text-sm font-mono text-green-400">{exp.value}</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{exp.reason}</p>
        </motion.div>
      ))}
    </div>
  )
}
