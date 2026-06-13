"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { type SimStatus } from "@/lib/websocket"

export interface TwinSpec {
  machine_colors: string[]
  fence_color: string
  floor_color: string
  background_color: string
  exposure: number
  warmth: number
  arm_count: number
  has_conveyor: boolean
  edge_density: number
}

interface SimScene3DProps {
  onStatusUpdate?: (status: SimStatus) => void
  /** Multiplier applied to arm reach (driven by corrections). 1 = default. */
  armScale?: number
  /** When set, scene rebuilds to match this photo-derived spec. */
  twin?: TwinSpec | null
}

const DEFAULT_TWIN: TwinSpec = {
  machine_colors: ["#ff6a00", "#1565c0"],
  fence_color: "#f2b705",
  floor_color: "#232a34",
  background_color: "#141b24",
  exposure: 1.4,
  warmth: 0.0,
  arm_count: 5,
  has_conveyor: true,
  edge_density: 0.1,
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16)
}

// ── Industrial 6-axis robot arm builder ──────────────────────────────────────

interface Arm {
  root: THREE.Group
  j1: THREE.Group
  j2: THREE.Group
  j3: THREE.Group
  j4: THREE.Group
  j5: THREE.Group
  j6: THREE.Group
  weldLight: THREE.PointLight
  tip: THREE.Mesh
  phase: number
  working: boolean
}

function makeArm(paintHex: number, phase: number): Arm {
  const paint = new THREE.MeshStandardMaterial({ color: paintHex, metalness: 0.45, roughness: 0.35, envMapIntensity: 1.1 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.95, roughness: 0.28 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.8, roughness: 0.45 })
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.3, roughness: 0.8 })
  const warn = new THREE.MeshStandardMaterial({ color: 0xf2b705, metalness: 0.3, roughness: 0.5, emissive: new THREE.Color(0x3a2c00) })

  const shadowMeshes: THREE.Mesh[] = []
  function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = cast
    m.receiveShadow = true
    if (cast) shadowMeshes.push(m)
    return m
  }

  const root = new THREE.Group()

  // Pedestal / anchor plate
  const plate = mesh(new THREE.BoxGeometry(1.15, 0.16, 1.15), dark)
  plate.position.y = 0.08
  root.add(plate)
  const boltRing = mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 32), metal)
  boltRing.rotation.x = Math.PI / 2
  boltRing.position.y = 0.16
  root.add(boltRing)
  const column = mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 32), dark)
  column.position.y = 0.4
  root.add(column)
  // warning stripe
  const stripe = mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.08, 32), warn, false)
  stripe.position.y = 0.58
  root.add(stripe)

  // J1 turret (yaw)
  const j1 = new THREE.Group()
  j1.position.y = 0.62
  root.add(j1)
  const turret = mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.45, 24), paint)
  turret.position.y = 0.22
  j1.add(turret)
  const turretBox = mesh(new THREE.BoxGeometry(0.6, 0.4, 0.7), paint)
  turretBox.position.set(0, 0.35, 0)
  j1.add(turretBox)

  // J2 shoulder (pitch about Z)
  const j2 = new THREE.Group()
  j2.position.set(0, 0.45, 0)
  j1.add(j2)
  const shoulderCyl = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.62, 24), metal)
  shoulderCyl.rotation.x = Math.PI / 2
  j2.add(shoulderCyl)
  // upper arm beam
  const upper = mesh(new THREE.BoxGeometry(0.34, 1.3, 0.44), paint)
  upper.position.y = 0.68
  j2.add(upper)
  const upperRib = mesh(new THREE.BoxGeometry(0.4, 1.0, 0.12), metal)
  upperRib.position.set(0, 0.68, 0.26)
  j2.add(upperRib)
  // cable conduit
  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 0.1, 0.2),
    new THREE.Vector3(-0.28, 0.6, 0.28),
    new THREE.Vector3(-0.18, 1.2, 0.18),
  ])
  const cable = mesh(new THREE.TubeGeometry(cableCurve, 24, 0.05, 8), cableMat, false)
  j2.add(cable)

  // J3 elbow (pitch about Z)
  const j3 = new THREE.Group()
  j3.position.set(0, 1.34, 0)
  j2.add(j3)
  const elbowCyl = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.5, 24), metal)
  elbowCyl.rotation.x = Math.PI / 2
  j3.add(elbowCyl)
  const fore = mesh(new THREE.BoxGeometry(0.26, 1.05, 0.32), paint)
  fore.position.y = 0.52
  j3.add(fore)

  // J4 wrist roll (about Y)
  const j4 = new THREE.Group()
  j4.position.set(0, 1.05, 0)
  j3.add(j4)
  const wrist = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.34, 20), metal)
  wrist.position.y = 0.16
  j4.add(wrist)

  // J5 wrist bend (about Z)
  const j5 = new THREE.Group()
  j5.position.set(0, 0.32, 0)
  j4.add(j5)
  const wristBend = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 20), metal)
  wristBend.rotation.x = Math.PI / 2
  j5.add(wristBend)

  // J6 flange (about Y)
  const j6 = new THREE.Group()
  j6.position.set(0, 0.14, 0)
  j5.add(j6)
  const flange = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), metal)
  flange.position.y = 0.04
  j6.add(flange)

  // End effector — welding torch
  const torchBody = mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.3, 16), metal)
  torchBody.position.set(0.04, 0.2, 0)
  torchBody.rotation.z = -0.3
  j6.add(torchBody)
  const torchTip = mesh(new THREE.ConeGeometry(0.03, 0.1, 16), metal)
  torchTip.position.set(0.1, 0.35, 0)
  torchTip.rotation.z = -0.3
  j6.add(torchTip)

  const tipGlowMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x66ccff, emissiveIntensity: 3 })
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), tipGlowMat)
  tip.position.set(0.12, 0.4, 0)
  j6.add(tip)

  const weldLight = new THREE.PointLight(0x88ccff, 0, 2.5, 2)
  weldLight.position.copy(tip.position)
  j6.add(weldLight)

  return { root, j1, j2, j3, j4, j5, j6, weldLight, tip, phase, working: false }
}

function updateArm(arm: Arm, t: number, reach: number) {
  const p = arm.phase
  arm.j1.rotation.y = 0.6 * Math.sin(t * 0.35 + p)
  arm.j2.rotation.z = -0.25 + 0.3 * Math.sin(t * 0.5 + p)
  arm.j3.rotation.z = 0.7 + 0.45 * Math.sin(t * 0.6 + p * 1.3)
  arm.j4.rotation.y = Math.sin(t * 0.8 + p)
  arm.j5.rotation.z = 0.3 * Math.sin(t * 0.7 + p * 0.7)
  arm.j6.rotation.y = t * 1.5

  // "Welding" flicker when the elbow is extended (tool near work)
  const extended = Math.sin(t * 0.6 + p * 1.3)
  const isWorking = extended > 0.55
  const flick = isWorking ? 1.2 + 0.8 * Math.abs(Math.sin(t * 22)) : 0.0
  arm.weldLight.intensity = flick * 1.6
  ;(arm.tip.material as THREE.MeshStandardMaterial).emissiveIntensity = isWorking ? 2 + 3 * Math.abs(Math.sin(t * 22)) : 0.4

  // reach scaling (forearm + upper arm stretch via root scale on Y of upper segments)
  arm.j2.scale.y = reach
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SimScene3D({ onStatusUpdate, armScale = 1, twin }: SimScene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reachRef = useRef(armScale)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<SimStatus>({ fps: 0, step: 0, score: 0, gpu_util_pct: 0 })

  useEffect(() => { reachRef.current = armScale }, [armScale])

  // Stable JSON key to retrigger scene rebuild when twin changes
  const twinKey = twin ? JSON.stringify(twin) : "default"

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const spec: TwinSpec = twin ?? DEFAULT_TWIN

    const w = container.clientWidth
    const h = container.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = spec.exposure
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    const bgColor = hexToInt(spec.background_color)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bgColor)
    scene.fog = new THREE.Fog(bgColor, 20, 52)

    // Environment map for realistic reflections
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 200)
    // Position camera looking down the assembly row like the reference photo
    camera.position.set(-7.2, 2.8, 5.2)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(1.5, 1.8, 0)
    controls.minDistance = 4
    controls.maxDistance = 24
    controls.maxPolarAngle = Math.PI / 2.05
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x2a2f3a, 1.0))
    const key = new THREE.DirectionalLight(0xffffff, 3.4)
    key.position.set(8, 12, 6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 40
    key.shadow.camera.left = -14
    key.shadow.camera.right = 14
    key.shadow.camera.top = 14
    key.shadow.camera.bottom = -14
    key.shadow.bias = -0.0001
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x6ba8ff, 1.1)
    fill.position.set(-6, 5, -4)
    scene.add(fill)
    const rim = new THREE.SpotLight(0x88bbff, 120, 36, Math.PI / 4.5, 0.4, 1.5)
    rim.position.set(-4, 10, 8)
    scene.add(rim)

    // Add a touch of warmth from the source photo
    const warmthLight = new THREE.DirectionalLight(
      new THREE.Color(spec.warmth > 0 ? 0xffd9a8 : 0xa8c8ff),
      Math.abs(spec.warmth) * 0.6
    )
    warmthLight.position.set(4, 6, -2)
    scene.add(warmthLight)

    // ── Floor ──
    const floorMat = new THREE.MeshStandardMaterial({ color: hexToInt(spec.floor_color), metalness: 0.55, roughness: 0.5, envMapIntensity: 1.0 })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const grid = new THREE.GridHelper(60, 60, 0x1e3a5f, 0x14202f)
    ;(grid.material as THREE.Material).opacity = 0.35
    ;(grid.material as THREE.Material).transparent = true
    grid.position.y = 0.002
    scene.add(grid)

    // Painted floor lane markings (safety zone)
    const laneMat = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.6, metalness: 0.1 })
    for (const [x, z, rot, len] of [
      [-3.2, 0, 0, 9], [3.2, 0, 0, 9], [0, -4.6, Math.PI / 2, 6.5], [0, 4.6, Math.PI / 2, 6.5],
    ] as [number, number, number, number][]) {
      const lane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, len), laneMat)
      lane.position.set(x, 0.01, z)
      lane.rotation.y = rot
      lane.receiveShadow = true
      scene.add(lane)
    }

    // ── Safety fence (tubular railing — color from photo palette) ──
    const fenceMat = new THREE.MeshStandardMaterial({ color: hexToInt(spec.fence_color), metalness: 0.4, roughness: 0.5 })
    function fencePost(x: number, z: number) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 12), fenceMat)
      post.position.set(x, 0.6, z)
      post.castShadow = true
      scene.add(post)
    }
    function fenceRail(x1: number, z1: number, x2: number, z2: number, y: number) {
      const dx = x2 - x1, dz = z2 - z1
      const len = Math.hypot(dx, dz)
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 10), fenceMat)
      rail.position.set((x1 + x2) / 2, y, (z1 + z2) / 2)
      rail.rotation.z = Math.PI / 2
      rail.rotation.y = -Math.atan2(dz, dx)
      scene.add(rail)
    }
    // Straight rail in front of the arm row (parallel to z-axis at x = -0.5),
    // matching the photo's yellow safety railing along the line of machines.
    const railX = -0.4
    const railZStart = -6.5
    const railZEnd = 6.5
    const postCount = 13
    for (let i = 0; i < postCount; i++) {
      const z = railZStart + (railZEnd - railZStart) * (i / (postCount - 1))
      fencePost(railX, z)
    }
    // Three horizontal rails at different heights
    for (const y of [1.6, 1.05, 0.5]) {
      fenceRail(railX, railZStart, railX, railZEnd, y)
    }
    // Wire mesh panels between posts (vertical thin posts)
    const meshMat = new THREE.MeshStandardMaterial({ color: hexToInt(spec.fence_color), metalness: 0.4, roughness: 0.6 })
    for (let z = railZStart; z < railZEnd; z += 0.18) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 6), meshMat)
      wire.position.set(railX, 0.8, z)
      scene.add(wire)
    }

    // ── Robot arms in a tight assembly-line row (matches the photo) ──
    const arms: Arm[] = []
    const machineColors = spec.machine_colors.length > 0
      ? spec.machine_colors.map(hexToInt)
      : [0xff6a00, 0x1565c0]
    const pickColor = (i: number) => machineColors[i % machineColors.length]

    const armCount = Math.max(3, Math.min(7, Math.max(spec.arm_count, 6)))
    const rowZStart = -5.6
    const rowZEnd = 5.6
    const rowX = 1.6  // arms positioned behind the safety rail

    // Per-arm anchored workstation (small steel pedestal in front of each arm)
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x1a1d23, metalness: 0.85, roughness: 0.4 })
    const wpMat = new THREE.MeshStandardMaterial({ color: 0x6f7480, metalness: 0.7, roughness: 0.5 })
    const workpieces: THREE.Mesh[] = []

    for (let i = 0; i < armCount; i++) {
      const t = armCount === 1 ? 0.5 : i / (armCount - 1)
      const z = rowZStart + (rowZEnd - rowZStart) * t
      // Slightly stagger arm phase so they all move differently
      const phase = i * 0.9
      // All arms in the row share the dominant orange (most-frequent vibrant color)
      const a = makeArm(pickColor(0), phase)
      a.root.position.set(rowX, 0, z)
      a.root.rotation.y = -Math.PI / 2 // face the rail / camera side
      scene.add(a.root); arms.push(a)

      // Steel pedestal under each arm — anchors it visually
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0), pedestalMat)
      pedestal.position.set(rowX, 0.2, z)
      pedestal.castShadow = true; pedestal.receiveShadow = true
      scene.add(pedestal)

      // Front edge plate
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.1), pedestalMat)
      plate.position.set(rowX - 0.55, 0.42, z)
      scene.add(plate)

      // Small workpiece on a station in front of each arm
      const wp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), wpMat)
      wp.position.set(rowX - 0.85, 0.6, z)
      wp.castShadow = true; wp.receiveShadow = true
      scene.add(wp)
      workpieces.push(wp)
    }

    // Compatibility holder for the animation loop (no central turntable anymore)
    const turntable = new THREE.Group()
    const crates: THREE.Mesh[] = []

    // ── Overhead industrial ceiling: trusses + hanging lights ──
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.85, roughness: 0.45 })
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x2b2f37, metalness: 0.9, roughness: 0.4 })

    const ceilingY = 6.2
    // Two long main girders running along z, above the arm row
    for (const gx of [0.0, 3.2]) {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 14), trussMat)
      girder.position.set(gx, ceilingY, 0)
      girder.castShadow = true
      scene.add(girder)
      // Lower flange (I-beam look)
      const flange = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 14), trussMat)
      flange.position.set(gx, ceilingY - 0.2, 0)
      scene.add(flange)
    }
    // Cross beams every 2 units
    for (let z = -6; z <= 6; z += 2) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 0.25), beamMat)
      cross.position.set(1.6, ceilingY, z)
      cross.castShadow = true
      scene.add(cross)
    }

    // Vertical support columns from floor to ceiling at the row ends
    const colMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.9, roughness: 0.4 })
    for (const cz of [-6.4, 6.4]) {
      for (const cx of [-0.3, 3.4]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.25, ceilingY, 0.25), colMat)
        col.position.set(cx, ceilingY / 2, cz)
        col.castShadow = true
        scene.add(col)
      }
    }

    // Hanging industrial lights (with warm glow matching photo warmth)
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.9, roughness: 0.4 })
    const lampColorHex = spec.warmth > -0.05 ? 0xffe9c0 : 0xe0eaff
    const lampMat = new THREE.MeshStandardMaterial({
      color: lampColorHex, emissive: lampColorHex, emissiveIntensity: 1.4,
      metalness: 0.0, roughness: 0.3,
    })
    for (let z = -5; z <= 5; z += 2.5) {
      // Cable
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), beamMat)
      cable.position.set(1.6, ceilingY - 0.65, z)
      scene.add(cable)
      // Housing (industrial dome)
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.25, 18), housingMat)
      housing.position.set(1.6, ceilingY - 1.15, z)
      housing.castShadow = true
      scene.add(housing)
      // Glowing bulb
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), lampMat)
      bulb.position.set(1.6, ceilingY - 1.22, z)
      scene.add(bulb)
      // Subtle point light from each lamp
      const pLight = new THREE.PointLight(lampColorHex, 8, 9, 2)
      pLight.position.set(1.6, ceilingY - 1.4, z)
      scene.add(pLight)
    }

    // ── Back-wall industrial ducting / structure (depth + atmosphere) ──
    const ductMat = new THREE.MeshStandardMaterial({ color: 0x4a5060, metalness: 0.8, roughness: 0.5 })
    for (let z = -6; z <= 6; z += 3) {
      const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 5, 18), ductMat)
      duct.position.set(5.5, 2.5, z)
      duct.castShadow = true
      scene.add(duct)
    }
    // Back wall panel suggesting depth
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x252830, metalness: 0.4, roughness: 0.7 })
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), wallMat)
    wall.position.set(7, 4, 0)
    wall.rotation.y = -Math.PI / 2
    scene.add(wall)

    // ── Animation loop ──
    let raf = 0
    const clock = new THREE.Clock()
    let frames = 0
    let fpsAccum = 0
    let lastStatusPush = 0
    let step = 0

    function animate() {
      raf = requestAnimationFrame(animate)
      const dt = clock.getDelta()
      const t = clock.elapsedTime
      step++

      for (const arm of arms) updateArm(arm, t, reachRef.current)
      turntable.rotation.y = t * 0.25
      for (let i = 0; i < workpieces.length; i++) {
        workpieces[i].rotation.y = Math.sin(t * 0.6 + i * 0.5) * 0.15
        workpieces[i].position.y = 0.6 + Math.sin(t * 1.2 + i) * 0.02
      }
      for (const crate of crates) {
        crate.position.x += dt * 0.6
        if (crate.position.x > 3.2) crate.position.x = -3.2
      }

      controls.update()
      renderer.render(scene, camera)

      // FPS + status HUD (push ~4x/sec)
      frames++
      fpsAccum += dt
      if (t - lastStatusPush > 0.25) {
        const fps = frames / fpsAccum
        const score = Math.min(0.985, 0.62 + 0.36 * (0.5 + 0.5 * Math.sin(t * 0.3)))
        const gpu = 58 + 18 * (0.5 + 0.5 * Math.sin(t * 0.5))
        const s: SimStatus = { fps, step, score, gpu_util_pct: gpu }
        setStatus(s)
        onStatusUpdate?.(s)
        frames = 0; fpsAccum = 0; lastStatusPush = t
      }
    }
    setConnected(true)
    animate()

    function onResize() {
      if (!container) return
      const nw = container.clientWidth, nh = container.clientHeight
      if (nw === 0 || nh === 0) return
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    window.addEventListener("resize", onResize)

    // Also observe the container itself — Framer Motion mounts it at 0×0 and grows it
    const ro = new ResizeObserver(onResize)
    ro.observe(container)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
      ro.disconnect()
      controls.dispose()
      pmrem.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement)
    }
  }, [twinKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full glass rounded-2xl overflow-hidden border border-white/5">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Connection badge */}
      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400 shadow-lg shadow-green-400/50" : "bg-yellow-400 animate-pulse"}`} />
        <span className="text-[10px] font-mono text-gray-400">{connected ? (twin ? "DIGITAL TWIN · MATCHED TO PHOTO" : "DIGITAL TWIN · LIVE") : "INITIALIZING"}</span>
      </div>

      {/* FPS */}
      <div className="absolute top-4 right-4 text-[10px] font-mono text-gray-400 pointer-events-none">
        {status.fps > 0 ? `${status.fps.toFixed(0)} FPS` : "—"}
      </div>

      {/* drag hint */}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-600 pointer-events-none">
        drag to orbit · scroll to zoom
      </div>

      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0 glass border-t border-white/5 px-4 py-2.5 flex items-center justify-between pointer-events-none">
        <span className="text-[10px] font-mono text-gray-500">STEP {status.step.toLocaleString()}</span>
        <div className="flex items-center gap-1">
          <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, status.score * 100)}%` }} />
          </div>
          <span className="text-[10px] font-mono text-gray-400 ml-1">{status.score.toFixed(3)}</span>
        </div>
        <span className="text-[10px] font-mono text-green-400">GPU {status.gpu_util_pct.toFixed(0)}%</span>
      </div>
    </div>
  )
}
