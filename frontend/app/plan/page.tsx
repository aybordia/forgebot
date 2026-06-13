"use client"

import { useRouter } from "next/navigation"
import PlanMode from "@/components/PlanMode"
import { type RobotSpec } from "@/lib/api"

export default function PlanPage() {
  const router = useRouter()

  function handleSpecComplete(spec: RobotSpec) {
    localStorage.setItem("robot_spec", JSON.stringify(spec))
    setTimeout(() => {
      router.push("/capture")
    }, 2000)
  }

  return (
    <main className="h-screen flex flex-col">
      <PlanMode onSpecComplete={handleSpecComplete} />
    </main>
  )
}
