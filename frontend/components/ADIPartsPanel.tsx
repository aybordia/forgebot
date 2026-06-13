"use client"

import { type BOMItem } from "@/lib/api"

interface ADIPartsPanelProps {
  bom: BOMItem[]
}

export default function ADIPartsPanel({ bom }: ADIPartsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-blue-400">Analog Devices Bill of Materials</h2>
        <span className="text-xs text-gray-500">{bom.length} components</span>
      </div>

      {bom.map((item, i) => (
        <div
          key={`${item.part_number}-${i}`}
          className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-2"
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-blue-400 uppercase tracking-wide">
                {item.category}
              </span>
              <h3 className="text-sm font-semibold text-white mt-0.5">
                {item.part_number}
              </h3>
            </div>
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-lg">
              ×{item.quantity}
            </span>
          </div>

          <p className="text-xs text-gray-400">{item.description}</p>
          <p className="text-xs text-gray-300 italic">{item.justification}</p>

          <a
            href={item.datasheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-blue-400 hover:text-blue-300 underline mt-1"
          >
            Datasheet →
          </a>
        </div>
      ))}
    </div>
  )
}
