"use client"

import { motion } from "framer-motion"
import { type BOMItem } from "@/lib/api"

interface ADIPartsPanelProps {
  bom: BOMItem[]
}

export default function ADIPartsPanel({ bom }: ADIPartsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
          <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Analog Devices BOM</h2>
          <p className="text-[10px] text-gray-500 font-mono">{bom.length} components selected</p>
        </div>
      </div>

      {bom.map((item, i) => (
        <motion.div
          key={`${item.part_number}-${i}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="glass rounded-xl border border-white/5 p-4 space-y-2 hover:border-blue-500/20 transition-colors duration-200"
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-mono text-blue-400/70 uppercase tracking-wider">
                {item.category}
              </span>
              <h3 className="text-sm font-semibold text-white mt-0.5 font-mono">
                {item.part_number}
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-white/5 text-gray-400 px-2 py-1 rounded-lg border border-white/5">
              ×{item.quantity}
            </span>
          </div>

          <p className="text-xs text-gray-500">{item.description}</p>
          <p className="text-xs text-gray-400 italic leading-relaxed">{item.justification}</p>

          <a
            href={item.datasheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-blue-400/70 hover:text-blue-400 transition-colors font-mono"
          >
            Datasheet
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </motion.div>
      ))}
    </div>
  )
}
