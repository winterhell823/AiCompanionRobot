import os

import requests

from brain import ConversationManager
from camera_service import CameraService
from intent_router import route_intent, route_local_command
from stt import ESP32AudioReceiver
from tts import ElevenLabsStreamer


class RobotConversation:
    def __init__(self, esp32_ip: str, audio_port: int):
        self.esp32_ip = esp32_ip
        self.brain = ConversationManager()
        self.camera = CameraService(
            esp32_ip,
            int(os.getenv("PREVIEW_DURATION_MS", "10000")),
        )
        self.tts = ElevenLabsStreamer()
        self.receiver = ESP32AudioReceiver(esp32_ip, audio_port, self.on_transcript, self.on_connect, self.on_listening)
        self.tts.set_receiver(self.receiver)
        self.greeted = False

    def _set_face(self, face: str, talk: bool = False) -> None:
        try:
            requests.get(
                f"http://{self.esp32_ip}/face",
                params={"s": face, "talk": int(talk)},
                timeout=1,
            )
        except requests.RequestException as exc:
            print(f"[DISPLAY] ESP32 face update failed: {exc}")

    def on_listening(self) -> None:
        self._set_face("listening")

    def on_connect(self) -> None:
        if not self.greeted:
            self.greeted = True
            self._set_face("speaking", talk=True)
            self.tts.speak("Hi! How are you? I am your AI robot, here to assist you.")
        self._set_face("listening")

    def on_transcript(self, text: str) -> None:
        if not text:
            return
        self._set_face("thinking")
        if text.lower().strip(" .!?") in {"exit", "quit", "shut down"}:
            self.tts.speak("Goodbye!")
            return

        routed = route_local_command(text)
        if routed is None:
            result = self.brain.think(text)
            routed = route_intent(result)
        if routed["intent"] == "CAPTURE_PHOTO":
            if not self.camera.capture():
                routed["response"] = "I could not capture a photo just now."
        elif routed["intent"] == "SHOW_LIVE_CAMERA":
            if not self.camera.show_live():
                routed["response"] = "I could not open the live camera preview."
        self._set_face("speaking", talk=True)
        self.tts.speak(routed["response"])
        self._set_face("listening")

    def run(self) -> None:
        self.receiver.start()
