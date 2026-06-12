export type SpeechResult = {
  transcript: string
  confidence: number
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
}

export function createSpeechRecognizer(
  onResult: (result: SpeechResult) => void,
  onError?: (error: string) => void,
  onEnd?: () => void
): (() => void) | null {
  // Returns a stop() function, or null if not supported

  if (!isSpeechSupported()) {
    console.warn("Web Speech API not supported in this browser")
    return null
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  const recognition = new SpeechRecognition()
  recognition.continuous = false        // stop after first complete utterance
  recognition.interimResults = false    // final results only
  recognition.lang = "en-US"
  recognition.maxAlternatives = 1

  recognition.onresult = (event: any) => {
    const result = event.results[0][0]
    onResult({ transcript: result.transcript, confidence: result.confidence })
  }

  recognition.onerror = (event: any) => {
    if (onError) onError(event.error)
  }

  recognition.onend = () => {
    if (onEnd) onEnd()
  }

  recognition.start()

  // Return stop function
  return () => {
    try { recognition.stop() } catch (_) {}
  }
}
