const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

// Toggle to force mock data everywhere (useful when backend is down)
const FORCE_MOCK = false

// ── Types ───────────────────────────────────────────────────────────────────

export interface RobotSpec {
  task: string
  payload_kg: number
  mounted: boolean
  reach_cm: number
  dof: number
  gripper_type: string
  notes: string
}

export interface ChatResponse {
  reply: string
  is_complete: boolean
  robot_spec: RobotSpec | null
}

export interface MotionParams {
  max_reach_cm: number
  avg_joint_angles_deg: number[]
  grip_aperture_cm: number
  motion_speed: string
  endpoint_height_cm: number
  reps_detected: number
}

export interface BOMItem {
  category: string
  part_number: string
  description: string
  justification: string
  quantity: number
  datasheet_url: string
}

export interface Explanation {
  component: string
  value: string
  reason: string
}

export interface SimStatus {
  fps: number
  step: number
  score: number
  gpu_util_pct: number
}

// ── Helper ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit, mockData?: T): Promise<T> {
  if (FORCE_MOCK && mockData !== undefined) return mockData
  try {
    const res = await fetch(`${BASE}${path}`, options)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`)
    return res.json()
  } catch (e) {
    if (mockData !== undefined) {
      console.warn(`[api] Backend unreachable for ${path} — using mock data`)
      return mockData
    }
    throw e
  }
}

// ── Session ─────────────────────────────────────────────────────────────────

export interface SessionResponse {
  session_id: string
  user_id: string
}

export async function getSession(): Promise<SessionResponse> {
  return apiFetch<SessionResponse>(
    "/api/session",
    undefined,
    { session_id: `session_${Date.now()}`, user_id: `user_${Date.now()}` }
  )
}

export async function getUserContext(userId: string): Promise<{ has_history: boolean; summary: string }> {
  return apiFetch(
    `/api/plan/context/${userId}`,
    undefined,
    { has_history: false, summary: "" }
  )
}

// ── Plan Mode ───────────────────────────────────────────────────────────────

const MOCK_QUESTIONS = [
  "What task should the robot perform?",
  "How heavy are the objects it needs to handle?",
  "Will the robot be fixed to a surface or freestanding?",
  "How far does it need to reach in centimeters?",
  "How many degrees of freedom — 3, 4, 5, or 6?",
]
let mockStep = 0

export async function planChat(message: string, sessionId: string, userId: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>(
    "/api/plan/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId, user_id: userId }),
    },
    (() => {
      const step = mockStep++
      if (step >= MOCK_QUESTIONS.length) {
        return {
          reply: "Your robot spec is ready!",
          is_complete: true,
          robot_spec: {
            task: "pick and place", payload_kg: 2.5, mounted: true,
            reach_cm: 100, dof: 4, gripper_type: "parallel",
            notes: "Warehouse box sorting from low shelf to table height"
          }
        }
      }
      return { reply: MOCK_QUESTIONS[step], is_complete: false, robot_spec: null }
    })()
  )
}

export async function omiWebhook(transcript: string, sessionId: string, userId: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>(
    "/api/omi-webhook",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, session_id: sessionId, user_id: userId }),
    },
    { reply: "How heavy are the objects it needs to handle?", is_complete: false, robot_spec: null }
  )
}

export async function resetPlanSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/plan/reset/${sessionId}`, { method: "DELETE" })
  } catch (_) {}
}

// ── Scan + Motion ────────────────────────────────────────────────────────────

export async function uploadEnvironmentMesh(file: File): Promise<{ status: string; mesh_bounds: object }> {
  const form = new FormData()
  form.append("file", file)
  return apiFetch(
    "/api/scan/upload",
    { method: "POST", body: form },
    { status: "loaded", mesh_bounds: { min: [-2, 0, -2], max: [2, 3, 2] } }
  )
}

export async function uploadMotionVideo(file: File): Promise<{ status: string; frames_analyzed: number; motion_params: MotionParams }> {
  const form = new FormData()
  form.append("file", file)
  return apiFetch(
    "/api/motion/upload",
    { method: "POST", body: form },
    {
      status: "processed",
      frames_analyzed: 120,
      motion_params: {
        max_reach_cm: 85, avg_joint_angles_deg: [45, 95, 65, 20],
        grip_aperture_cm: 7.5, motion_speed: "medium",
        endpoint_height_cm: 72, reps_detected: 3
      }
    }
  )
}

export async function getScanStatus(): Promise<{ loaded: boolean }> {
  return apiFetch("/api/scan/status", undefined, { loaded: false })
}

export async function getMotionStatus(): Promise<{ processed: boolean }> {
  return apiFetch("/api/motion/status", undefined, { processed: false })
}

// ── CAD + Sim ────────────────────────────────────────────────────────────────

export async function generateCAD(robotSpec: RobotSpec, motionParams: MotionParams): Promise<{ status: string; stl_url: string; params_used: object }> {
  return apiFetch(
    "/api/cad/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robot_spec: robotSpec, motion_params: motionParams }),
    },
    { status: "generated", stl_url: "/static/robot_current.stl", params_used: {} }
  )
}

export async function loadSim(): Promise<{ status: string }> {
  return apiFetch("/api/sim/load", { method: "POST" }, { status: "running" })
}

export async function correctSim(correction: string, userId: string): Promise<{ status: string; param_changes: object }> {
  return apiFetch(
    "/api/sim/correct",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correction, user_id: userId }),
    },
    { status: "updated", param_changes: { arm_length_m: 1.1 } }
  )
}

export async function stopSim(): Promise<void> {
  try { await fetch(`${BASE}/api/sim/stop`, { method: "POST" }) } catch (_) {}
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function getBOM(): Promise<{ bom: BOMItem[] }> {
  return apiFetch<{ bom: BOMItem[] }>(
    "/api/export/bom",
    undefined,
    {
      bom: [
        { category: "IMU", part_number: "ADIS16470", description: "10-DOF MEMS inertial sensor", justification: "Per-joint angle feedback for 4-DOF arm carrying 2.5kg", quantity: 4, datasheet_url: "https://www.analog.com/en/products/adis16470.html" },
        { category: "Motor Driver", part_number: "TMC2209", description: "Stepper motor driver with StealthChop2", justification: "Silent precise control of 4 stepper joints", quantity: 4, datasheet_url: "https://www.analog.com/en/products/tmc2209.html" },
        { category: "Power Management", part_number: "LTC3780", description: "Synchronous buck-boost DC/DC controller", justification: "Regulated 12V rail for motor drivers from battery input", quantity: 1, datasheet_url: "https://www.analog.com/en/products/ltc3780.html" },
      ]
    }
  )
}

export async function getRationale(): Promise<{ explanations: Explanation[] }> {
  return apiFetch<{ explanations: Explanation[] }>(
    "/api/export/rationale",
    undefined,
    {
      explanations: [
        { component: "Arm Length", value: "98cm", reason: "Motion capture peak wrist reach was 80cm. Added 10% clearance margin." },
        { component: "Gripper Width", value: "75mm", reason: "Grip aperture from video: 7.5cm average at object contact." },
        { component: "Link Thickness", value: "15mm radius", reason: "Scaled for 2.5kg payload with 2× safety factor." },
        { component: "Degrees of Freedom", value: "4-DOF", reason: "Matched to spec: 4 joints for full pick-and-place workspace." },
        { component: "Gripper Type", value: "Parallel", reason: "Parallel gripper selected for consistent grip on box geometry." },
      ]
    }
  )
}
