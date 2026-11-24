import json
import re


def route_local_command(text):
    normalized = text.lower().replace("don't", "dont")
    words = re.findall(r"[a-z0-9]+", normalized)
    action_words = {"click", "take", "capture", "snap"}
    photo_words = {"picture", "pictures", "photo", "photos", "pic", "pics"}
    negative_words = {"dont", "not", "never"}

    for index, word in enumerate(words):
        if word not in action_words:
            continue
        if any(token in negative_words for token in words[max(0, index - 4):index]):
            continue
        if photo_words.intersection(words[index + 1:index + 5]):
            return {
                "intent": "CAPTURE_PHOTO",
                "response": "Taking a picture.",
                "action": {"type": "CAPTURE_PHOTO"},
            }
    return None


def route_intent(payload):
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {"intent": "CONVERSATION", "response": payload, "action": None}

    if not isinstance(payload, dict):
        payload = {"intent": "CONVERSATION", "response": "I am ready.", "action": None}

    response = re.sub(r"\s+", " ", str(payload.get("response") or "").strip())
    if not response:
        response = "I am ready."

    if (
        payload.get("intent") == "CAPTURE_PHOTO"
        and isinstance(payload.get("action"), dict)
        and payload["action"].get("type") == "CAPTURE_PHOTO"
    ):
        return {"intent": "CAPTURE_PHOTO", "response": response, "action": {"type": "CAPTURE_PHOTO"}}
    if (
        payload.get("intent") == "SHOW_LIVE_CAMERA"
        and isinstance(payload.get("action"), dict)
        and payload["action"].get("type") == "SHOW_LIVE_CAMERA"
    ):
        return {"intent": "SHOW_LIVE_CAMERA", "response": response, "action": {"type": "SHOW_LIVE_CAMERA"}}
    return {"intent": "CONVERSATION", "response": response, "action": None}
