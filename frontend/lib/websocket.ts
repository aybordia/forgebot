const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"

export interface SimStatus {
  fps: number
  step: number
  score: number
  gpu_util_pct: number
}

interface SimSocketCallbacks {
  onFrame: (blob: Blob) => void
  onStatus: (status: SimStatus) => void
  onConnect: () => void
  onDisconnect: () => void
}

/**
 * Connects to /ws/sim. Backend streams status as text JSON and frames as
 * binary (Blob). If the socket is unavailable, falls back to a mock status
 * timer so the UI stays useful. Returns a cleanup function.
 */
export function connectSimSocket(callbacks: SimSocketCallbacks): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let mockInterval: ReturnType<typeof setInterval> | null = null

  function connect() {
    if (closed) return

    try {
      ws = new WebSocket(`${WS_BASE}/ws/sim`)
      ws.binaryType = "blob"

      ws.onopen = () => {
        callbacks.onConnect()
        if (mockInterval) {
          clearInterval(mockInterval)
          mockInterval = null
        }
      }

      ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          callbacks.onFrame(event.data)
        } else {
          try {
            const status: SimStatus = JSON.parse(event.data)
            callbacks.onStatus(status)
          } catch {}
        }
      }

      ws.onclose = () => {
        callbacks.onDisconnect()
        if (!closed) {
          startMockFallback()
          setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws?.close()
      }
    } catch {
      startMockFallback()
      if (!closed) setTimeout(connect, 3000)
    }
  }

  function startMockFallback() {
    if (mockInterval || closed) return
    let mockStep = 0
    mockInterval = setInterval(() => {
      mockStep++
      callbacks.onStatus({
        fps: 0,
        step: mockStep,
        score: Math.min(0.95, 0.3 + 0.005 * mockStep),
        gpu_util_pct: 0,
      })
    }, 500)
  }

  connect()

  return () => {
    closed = true
    if (mockInterval) clearInterval(mockInterval)
    ws?.close()
  }
}
