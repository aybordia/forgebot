"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export default function RobotArm3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100)
    camera.position.set(3, 2.5, 5)
    camera.lookAt(0, 0.8, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    const dir = new THREE.DirectionalLight(0xffffff, 1)
    dir.position.set(5, 5, 5)
    scene.add(dir)
    const blue = new THREE.DirectionalLight(0x3b82f6, 0.5)
    blue.position.set(-3, 3, -3)
    scene.add(blue)
    const point = new THREE.PointLight(0x60a5fa, 0.6, 10)
    point.position.set(0, 3, 0)
    scene.add(point)

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 })
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, metalness: 0.9, roughness: 0.1, emissive: 0x3b82f6, emissiveIntensity: 0.4 })
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.1 })
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.15 })

    // Base
    const baseGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.3, 32)
    const baseMesh = new THREE.Mesh(baseGeo, baseMat)
    baseMesh.position.y = 0.15
    scene.add(baseMesh)

    const ringGeo = new THREE.CylinderGeometry(0.35, 0.5, 0.1, 32)
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.8, roughness: 0.1, emissive: 0x3b82f6, emissiveIntensity: 0.3 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.y = 0.35
    scene.add(ring)

    // Pivots for animation
    const pivot0 = new THREE.Group()
    pivot0.position.y = 0.4
    scene.add(pivot0)

    // Joint 0
    const j0 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), jointMat)
    pivot0.add(j0)

    // Arm 1
    const arm1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.0, 8, 16), metalMat)
    arm1.position.y = 0.6
    pivot0.add(arm1)

    const pivot1 = new THREE.Group()
    pivot1.position.y = 1.1
    pivot0.add(pivot1)

    // Joint 1
    const j1 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), jointMat)
    pivot1.add(j1)

    // Arm 2
    const arm2Mat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.2 })
    const arm2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.8, 8, 16), arm2Mat)
    arm2.position.y = 0.45
    pivot1.add(arm2)

    const pivot2 = new THREE.Group()
    pivot2.position.y = 0.9
    pivot1.add(pivot2)

    // Joint 2
    const j2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), jointMat.clone())
    ;(j2.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6
    pivot2.add(j2)

    // Gripper fingers
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.06), gripMat)
    f1.position.set(0.08, 0.15, 0)
    f1.rotation.z = -0.3
    pivot2.add(f1)

    const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.06), gripMat)
    f2.position.set(-0.08, 0.15, 0)
    f2.rotation.z = 0.3
    pivot2.add(f2)

    // Particles
    const pCount = 60
    const pGeo = new THREE.BufferGeometry()
    const pPos = new Float32Array(pCount * 3)
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 8
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 8
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 8
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3))
    const pMat = new THREE.PointsMaterial({ size: 0.04, color: 0x3b82f6, transparent: true, opacity: 0.5 })
    const particles = new THREE.Points(pGeo, pMat)
    scene.add(particles)

    // Animation
    let animId: number
    function animate() {
      animId = requestAnimationFrame(animate)
      const t = performance.now() * 0.001

      pivot0.rotation.y = Math.sin(t * 0.3) * 0.5
      pivot0.rotation.z = Math.sin(t * 0.5) * 0.3 - 0.2
      pivot1.rotation.z = Math.sin(t * 0.7 + 1) * 0.4 + 0.3
      pivot2.rotation.z = Math.sin(t * 0.9 + 2) * 0.2

      particles.rotation.y = t * 0.02
      particles.rotation.x = Math.sin(t * 0.01) * 0.1

      // Float the whole scene
      scene.position.y = Math.sin(t * 0.4) * 0.08

      renderer.render(scene, camera)
    }
    animate()

    // Resize
    function onResize() {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", onResize)
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={containerRef} className="w-full h-full" />
}
