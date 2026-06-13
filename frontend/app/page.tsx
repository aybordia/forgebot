"use client"

import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { motion } from "framer-motion"

const RobotArm3D = dynamic(() => import("@/components/RobotArm3D"), { ssr: false })

const stages = [
  {
    title: "Plan",
    desc: "Describe your robot through conversation",
    href: "/plan",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    color: "blue",
  },
  {
    title: "Simulate",
    desc: "Watch your robot in a physics sandbox",
    href: "/sim",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "purple",
  },
  {
    title: "Export",
    desc: "BOM, rationale, and STL download",
    href: "/export",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    color: "green",
  },
]

const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400", glow: "hover:shadow-blue-500/20" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400", glow: "hover:shadow-purple-500/20" },
  green: { bg: "bg-green-500/10", border: "border-green-500/20", text: "text-green-400", glow: "hover:shadow-green-500/20" },
}

export default function Home() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-grid relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse-ring" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse-ring" style={{ animationDelay: "1.5s" }} />

      {/* Scan line */}
      <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent animate-scan pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
        {/* Left: Text content */}
        <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-mono text-blue-400/70 tracking-widest uppercase">Physical AI Platform</span>
            </div>

            <h1 className="text-6xl lg:text-8xl font-black tracking-tighter text-white mb-2 glow-text">
              FORGE
            </h1>
            <h1 className="text-6xl lg:text-8xl font-black tracking-tighter text-blue-500 mb-6 glow-text">
              BOT
            </h1>

            <p className="text-xl text-gray-400 font-light max-w-md mb-2">
              Design custom robot arms through conversation, simulation, and export.
            </p>
            <p className="text-sm text-gray-600 font-mono mb-10">
              speak it &rarr; see it &rarr; correct it &rarr; ship it
            </p>
          </motion.div>

          {/* Stage cards */}
          <motion.div
            className="flex flex-col sm:flex-row gap-3 mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          >
            {stages.map((stage, i) => {
              const c = colorMap[stage.color]
              return (
                <motion.button
                  key={stage.title}
                  onClick={() => router.push(stage.href)}
                  className={`group flex-1 p-4 rounded-2xl border ${c.border} ${c.bg} backdrop-blur-sm
                    hover:shadow-lg ${c.glow} transition-all duration-300 text-left`}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                >
                  <div className={`${c.text} mb-2`}>{stage.icon}</div>
                  <h3 className="text-sm font-semibold text-white mb-1">{stage.title}</h3>
                  <p className="text-xs text-gray-500">{stage.desc}</p>
                </motion.button>
              )
            })}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <button
              onClick={() => router.push("/plan")}
              className="group relative px-8 py-3.5 bg-blue-600 hover:bg-blue-500 rounded-2xl text-sm font-semibold
                transition-all duration-300 glow-blue hover:shadow-xl hover:shadow-blue-500/25"
            >
              <span className="relative z-10 flex items-center gap-2">
                Start Building
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>
          </motion.div>
        </div>

        {/* Right: 3D Robot */}
        <motion.div
          className="flex-1 min-h-[400px] lg:min-h-0"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease: "easeOut" }}
        >
          <RobotArm3D />
        </motion.div>
      </div>

      {/* Bottom bar */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 px-8 py-4 flex items-center justify-between border-t border-white/5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <p className="text-xs text-gray-700 font-mono">
          Milpitas Hacks 3 &middot; 2026
        </p>
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span>ASUS GPU</span>
          <span className="text-gray-800">&middot;</span>
          <span>Omi</span>
          <span className="text-gray-800">&middot;</span>
          <span>Analog Devices</span>
          <span className="text-gray-800">&middot;</span>
          <span>Backboard</span>
        </div>
      </motion.div>
    </main>
  )
}
