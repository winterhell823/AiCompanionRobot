import json
import os

from google import genai
from google.genai import types


SYSTEM_PROMPT = """
You are the conversational brain for a physical companion robot.
Answer naturally in at most two short spoken sentences.
Classify each request as exactly one of CONVERSATION, CAPTURE_PHOTO, or SHOW_LIVE_CAMERA.
Return only valid JSON:
{"intent":"CONVERSATION","response":"...","action":null}
or
{"intent":"CAPTURE_PHOTO","response":"Sure, taking a picture.","action":{"type":"CAPTURE_PHOTO"}}
or
{"intent":"SHOW_LIVE_CAMERA","response":"Here is what I can see.","action":{"type":"SHOW_LIVE_CAMERA"}}
Use CAPTURE_PHOTO for a direct request to capture, take, or click one photo.
Use SHOW_LIVE_CAMERA for requests to open or view the live camera preview, or ask what is currently in front of the camera.
Never use hardware, shell, browser, or arbitrary application actions.
"""


class ConversationManager:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.client = genai.Client(api_key=api_key)
        self.chat = self._new_chat()

    def _new_chat(self):
        return self.client.chats.create(
            model=self.model,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.7,
                response_mime_type="application/json",
            ),
        )

    def think(self, text: str):
        try:
            reply = (self.chat.send_message(text).text or "").strip()
            return json.loads(reply)
        except Exception as exc:
            print(f"[BRAIN] Gemini error: {exc}")
            return {
                "intent": "CONVERSATION",
                "response": "I cannot reach my brain right now.",
                "action": None,
            }

    def reset(self):
        self.chat = self._new_chat()
