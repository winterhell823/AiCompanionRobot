import os
import time

from elevenlabs.client import ElevenLabs


class ElevenLabsStreamer:
    def __init__(self):
        api_key = os.getenv("ELEVENLABS_API_KEY")
        if not api_key:
            raise RuntimeError("ELEVENLABS_API_KEY is not configured")
        self.eleven = ElevenLabs(api_key=api_key)
        self.voice_id = os.getenv("ELEVEN_VOICE_ID")
        if not self.voice_id:
            raise RuntimeError("ELEVEN_VOICE_ID is not configured")
        self.receiver = None

    def set_receiver(self, receiver):
        self.receiver = receiver

    def speak(self, text: str):
        if not text or not text.strip():
            return
        print(f"[TTS] Speaking: {text}")
        try:
            bytes_sent = 0
            stream = self.eleven.text_to_speech.convert(
                voice_id=self.voice_id,
                text=text,
                model_id="eleven_flash_v2_5",
                output_format="pcm_16000",
            )
            for chunk in stream:
                if chunk and self.receiver:
                    self.receiver.send_pcm(chunk)
                    bytes_sent += len(chunk)
            time.sleep(bytes_sent / 32000.0 + 0.25)
        except Exception as exc:
            print(f"[TTS] ElevenLabs TTS failed: {exc}")
