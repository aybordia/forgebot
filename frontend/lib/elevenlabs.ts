const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
const VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"

let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (typeof window !== "undefined") {
    window.speechSynthesis?.cancel()
  }
}

export async function speakText(text: string): Promise<void> {
  // Stop anything currently playing
  stopSpeaking()

  // Try ElevenLabs first
  if (ELEVENLABS_API_KEY) {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      )

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        currentAudio = audio
        audio.play()
        audio.onended = () => {
          URL.revokeObjectURL(url)
          currentAudio = null
        }
        return
      }
    } catch (e) {
      console.warn("ElevenLabs TTS failed, using browser fallback:", e)
    }
  }

  // Fallback: browser speechSynthesis
  if (typeof window !== "undefined" && window.speechSynthesis) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0
    window.speechSynthesis.speak(utterance)
  }
}
