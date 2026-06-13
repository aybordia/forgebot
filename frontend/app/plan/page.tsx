"use client"

import { useRouter } from "next/navigation"
import PlanMode from "@/components/PlanMode"
import NavBar from "@/components/NavBar"
import { type RobotSpec } from "@/lib/api"

export default function PlanPage() {
  const router = useRouter()

  function handleSpecComplete(spec: RobotSpec) {
    localStorage.setItem("robot_spec", JSON.stringify(spec))
    setTimeout(() => {
      router.push("/sim")
    }, 2000)
  }

  return (
    <>
      <NavBar />
      <main className="h-screen flex flex-col pt-14 bg-grid">
        <PlanMode onSpecComplete={handleSpecComplete} />
      </main>
    </>
  )
}
