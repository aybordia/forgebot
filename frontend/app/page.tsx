"use client"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Logo / Title */}
      <div className="text-center mb-12">
        <h1 className="text-7xl font-black tracking-tight text-blue-500 mb-4">
          FORGEBOT
        </h1>
        <p className="text-xl text-gray-400 font-light">
          It's Lovable for robots.
        </p>
        <p className="text-sm text-gray-600 mt-2">
          You see it. You fix it. You ship it.
        </p>
      </div>

      {/* CTA Button */}
      <button
        onClick={() => router.push("/plan")}
        className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold rounded-2xl transition-colors duration-200 shadow-lg shadow-blue-900/30"
      >
        Begin →
      </button>

      {/* Bottom branding */}
      <div className="absolute bottom-6 text-center">
        <p className="text-xs text-gray-700">
          Built for Milpitas Hacks 3 · 2026 · Roboscale
        </p>
        <p className="text-xs text-gray-700 mt-1">
          Powered by ASUS GPU · Omi · Analog Devices · Vercel · Backboard
        </p>
      </div>
    </main>
  )
}
