const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"

export interface SimStatus {
  fps: number
  step: number
  score: number
  gpu_util_pct: number
}

export interface WebSocketConfig {
  onFrame: (data: ArrayBuffer) => void
  onStatus: (status: SimStatus) => void
  onConnect: () => void
  onDisconnect: () => void
  onError?: (msg: string) => void
}

export function createSimWebSocket(config: WebSocketConfig): { close: () => void } {
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true
  let pingInterval: ReturnType<typeof setInterval> | null = null

  function connect() {
    ws = new WebSocket(`${WS_BASE}/ws/sim`)
    ws.binaryType = "arraybuffer"  // CRITICAL — must be set before onmessage fires

    ws.onopen = () => {
      config.onConnect()
      // Keep-alive ping every 10 seconds
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }))
        }
      }, 10000)
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        config.onFrame(event.data)
      } else {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type === "status") config.onStatus(msg as SimStatus)
          if (msg.type === "error" && config.onError) config.onError(msg.message)
        } catch (_) {}
      }
    }

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval)
      config.onDisconnect()
      if (shouldReconnect) {
        reconnectTimer = setTimeout(connect, 2000)
      }
    }

    ws.onerror = () => {
      ws?.close()  // triggers onclose → reconnect
    }
  }

  connect()

  return {
    close: () => {
      shouldReconnect = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingInterval) clearInterval(pingInterval)
      ws?.close()
    }
  }
}
