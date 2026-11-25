import json
import os
import re
import socket
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlsplit

import requests

from camera_service import CameraService
from config import env
from intent_router import route_intent, route_local_command


API_HOST = env("API_HOST", "127.0.0.1")
API_PORT = int(env("API_PORT", "8000"))
ROBOT_IP = env("ESP32_IP", "192.168.1.12")
ROBOT_URL = env("ESP32_URL", f"http://{ROBOT_IP}").rstrip("/")
CAMERA_URL = env(
    "ESP32_CAM_URL",
    f"http://{env('ESP32_CAM_IP', '192.168.1.10')}",
).rstrip("/")
CAMERA_PREVIEW_DURATION_MS = int(env("PREVIEW_DURATION_MS", "10000"))
OBSTACLE_THRESHOLD_CM = int(env("OBSTACLE_THRESHOLD_CM", "42"))
SENSOR_MAX_DISTANCE_CM = 200
MOVE_DURATION_MS = int(env("MOVE_DURATION_MS", "1000"))
PUBLIC_API_URL = env("API_PUBLIC_URL", f"http://localhost:{API_PORT}").rstrip("/")
VOICE_BRIDGE_URL = env("VOICE_BRIDGE_URL", "http://127.0.0.1:8001").rstrip("/")
WEATHER_DEFAULT_LOCATION = env("WEATHER_DEFAULT_LOCATION", "Gurugram")
ELEVENLABS_API_KEY = env("ELEVENLABS_API_KEY")
ELEVENLABS_AGENT_ID = env("ELEVENLABS_AGENT_ID")

if not 100 <= MOVE_DURATION_MS <= 5000:
    raise ValueError("MOVE_DURATION_MS must be between 100 and 5000")

ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
}

_distance_history = deque(maxlen=100)
_history_lock = Lock()
_mapping_lock = Lock()
_mapping_active = False
_brain_lock = Lock()
_brain = None

WEATHER_CODES = {
    0: "clear skies",
    1: "mostly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "freezing fog",
    51: "light drizzle",
    53: "drizzle",
    55: "heavy drizzle",
    56: "freezing drizzle",
    57: "heavy freezing drizzle",
    61: "light rain",
    63: "rain",
    65: "heavy rain",
    66: "light freezing rain",
    67: "heavy freezing rain",
    71: "light snow",
    73: "snow",
    75: "heavy snow",
    77: "snow grains",
    80: "light rain showers",
    81: "rain showers",
    82: "heavy rain showers",
    85: "light snow showers",
    86: "heavy snow showers",
    95: "thunderstorms",
    96: "thunderstorms with hail",
    99: "thunderstorms with heavy hail",
}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _robot_request(path, *, params=None, timeout=2):
    try:
        response = requests.get(
            f"{ROBOT_URL}{path}",
            params=params,
            timeout=timeout,
        )
        response.raise_for_status()
        return response
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            raise ApiError(
                503,
                "Robot firmware lacks this route; upload the current esp32_robot firmware.",
            ) from exc
        raise ApiError(502, "Robot controller request failed.") from exc
    except requests.RequestException as exc:
        raise ApiError(502, "Robot controller request failed.") from exc


def _is_reachable(base_url):
    parsed = urlsplit(base_url)
    if not parsed.hostname:
        return False
    try:
        with socket.create_connection((parsed.hostname, parsed.port or 80), timeout=1):
            return True
    except OSError:
        return False


def _camera_online():
    try:
        response = requests.get(f"{ROBOT_URL}/camera/status", timeout=1)
        if response.ok:
            try:
                status = response.json()
            except requests.JSONDecodeError:
                status = {}
            if isinstance(status, dict) and isinstance(status.get("connected"), bool):
                if status["connected"]:
                    return True
    except requests.RequestException:
        pass

    try:
        response = requests.get(f"{CAMERA_URL}/health", timeout=1)
        return response.ok
    except requests.RequestException:
        return False


def _read_distance(*, record=True):
    response = _robot_request("/telemetry")
    try:
        payload = response.json()
    except requests.JSONDecodeError as exc:
        raise ApiError(502, "Robot telemetry response was not valid JSON.") from exc

    distance = payload.get("distanceCm")
    if (
        not isinstance(distance, (int, float))
        or isinstance(distance, bool)
        or distance <= 0
        or distance >= SENSOR_MAX_DISTANCE_CM
    ):
        raise ApiError(503, "The robot has no recent distance sensor reading.")

    now = datetime.now().astimezone()
    reading = {
        "distanceCm": distance,
        "unit": "cm",
        "obstacleDetected": distance <= OBSTACLE_THRESHOLD_CM,
        "timestamp": now.isoformat(timespec="seconds"),
    }
    if record:
        with _history_lock:
            _distance_history.append({"time": now.strftime("%H:%M:%S"), "distance": distance})
    return reading


def _obstacle_points(samples):
    return [
        {"x": sample["distance"], "y": 0}
        for sample in samples
        if isinstance(sample.get("distance"), (int, float))
        and not isinstance(sample.get("distance"), bool)
        and sample["distance"] > 0
        and sample["distance"] < SENSOR_MAX_DISTANCE_CM
    ]


def _normalize_move(payload):
    direction = payload.get("direction")
    if not isinstance(direction, str):
        raise ApiError(400, "direction must be forward, backward, left, or right.")
    direction = direction.lower()
    if direction not in {"forward", "backward", "left", "right"}:
        raise ApiError(400, "direction must be forward, backward, left, or right.")

    speed = payload.get("speed", 60)
    if isinstance(speed, bool) or not isinstance(speed, int) or not 0 <= speed <= 100:
        raise ApiError(400, "speed must be an integer from 0 to 100.")
    return direction, speed


def _assistant_message(message):
    global _brain
    if not isinstance(message, str) or not message.strip():
        raise ApiError(400, "message must be a non-empty string.")

    routed = route_local_command(message)
    source = "local"
    if routed is None:
        if not os.getenv("GEMINI_API_KEY"):
            raise ApiError(503, "GEMINI_API_KEY is not configured.")
        with _brain_lock:
            if _brain is None:
                try:
                    from brain import ConversationManager

                    _brain = ConversationManager()
                except (RuntimeError, ValueError) as exc:
                    raise ApiError(503, "The AI assistant could not be initialized.") from exc
            routed = route_intent(_brain.think(message))
        source = "gemini"

    action = routed.get("action") or {}
    camera = CameraService(ROBOT_IP, CAMERA_PREVIEW_DURATION_MS)
    if action.get("type") == "CAPTURE_PHOTO" and not camera.capture():
        routed["response"] = "I could not capture a photo just now."
    elif action.get("type") == "SHOW_LIVE_CAMERA" and not camera.show_live():
        routed["response"] = "I could not open the live camera preview."

    return {"reply": routed["response"], "source": source}


def _assistant_weather(message):
    if not isinstance(message, str) or not message.strip():
        raise ApiError(400, "message must be a non-empty string.")
    if len(message) > 500:
        raise ApiError(413, "message must not exceed 500 characters.")

    location_match = re.search(
        r"\b(?:in|for|at|near)\s+([A-Za-z][A-Za-z0-9 .'-]{0,60}?)"
        r"(?=\s+(?:today|tomorrow|tonight|now|right now|this "
        r"(?:morning|afternoon|evening|week)|next week)\b|[?.!,;]|$)",
        message,
        re.IGNORECASE,
    )
    if not location_match:
        location_match = re.search(
            r"\b(?:what(?:'s|s| is)?|how(?:'s|s| is)?|tell me|give me|show me)?"
            r"\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 .'-]{0,60}?)\s+"
            r"(?:weather|wheather|wether|forecast|temperature)\b",
            message,
            re.IGNORECASE,
        )
    location = (
        location_match.group(1).strip(" .,-")
        if location_match
        else WEATHER_DEFAULT_LOCATION
    )
    if not location:
        location = WEATHER_DEFAULT_LOCATION

    geocoding = _open_meteo_json(
        "https://geocoding-api.open-meteo.com/v1/search",
        {"name": location, "count": 1, "language": "en", "format": "json"},
    )
    results = geocoding.get("results") if isinstance(geocoding, dict) else None
    if not isinstance(results, list) or not results or not isinstance(results[0], dict):
        raise ApiError(404, f"Could not find a weather location for '{location}'.")
    place = results[0]
    latitude = place.get("latitude")
    longitude = place.get("longitude")
    if (
        isinstance(latitude, bool)
        or not isinstance(latitude, (int, float))
        or isinstance(longitude, bool)
        or not isinstance(longitude, (int, float))
    ):
        raise ApiError(502, "Weather service returned invalid location data.")

    forecast = _open_meteo_json(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": latitude,
            "longitude": longitude,
            "current": (
                "temperature_2m,relative_humidity_2m,apparent_temperature,"
                "weather_code,wind_speed_10m"
            ),
            "daily": (
                "weather_code,temperature_2m_max,temperature_2m_min,"
                "precipitation_probability_max"
            ),
            "forecast_days": 3,
            "timezone": "auto",
        },
    )
    current = forecast.get("current") if isinstance(forecast, dict) else None
    daily = forecast.get("daily") if isinstance(forecast, dict) else None
    if not isinstance(current, dict) or not isinstance(daily, dict):
        raise ApiError(502, "Weather service returned incomplete forecast data.")

    name = place.get("name") or location
    country = place.get("country")
    place_label = f"{name}, {country}" if country else name
    is_tomorrow = "tomorrow" in message.lower()
    day_index = 1 if is_tomorrow else 0
    high = _weather_value_at(daily.get("temperature_2m_max"), day_index)
    low = _weather_value_at(daily.get("temperature_2m_min"), day_index)
    rain_chance = _weather_value_at(
        daily.get("precipitation_probability_max"), day_index
    )
    daily_code = _weather_value_at(daily.get("weather_code"), day_index)
    if high is None or low is None or daily_code is None:
        raise ApiError(502, "Weather service returned incomplete daily forecast data.")

    if is_tomorrow:
        reply = (
            f"Tomorrow in {place_label}: {_weather_description(daily_code)}, "
            f"high near {round(high)}°C and low near {round(low)}°C."
        )
    else:
        temperature = current.get("temperature_2m")
        apparent = current.get("apparent_temperature")
        humidity = current.get("relative_humidity_2m")
        wind = current.get("wind_speed_10m")
        code = current.get("weather_code")
        values = (temperature, apparent, humidity, wind, code)
        if any(
            isinstance(value, bool) or not isinstance(value, (int, float))
            for value in values
        ):
            raise ApiError(502, "Weather service returned incomplete current conditions.")
        reply = (
            f"Current weather in {place_label}: {_weather_description(code)}, "
            f"{round(temperature)}°C, feels like {round(apparent)}°C, "
            f"with {round(humidity)}% humidity and {round(wind)} km/h wind. "
            f"Today’s high is {round(high)}°C and low is {round(low)}°C."
        )
    if rain_chance is not None:
        if isinstance(rain_chance, bool) or not isinstance(rain_chance, (int, float)):
            raise ApiError(502, "Weather service returned invalid precipitation data.")
        reply += f" Rain chance is up to {round(rain_chance)}%."
    return {"reply": reply, "source": "open-meteo"}


def _open_meteo_json(url, params):
    try:
        response = requests.get(url, params=params, timeout=8)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise ApiError(502, "Weather service is unavailable.") from exc
    except requests.JSONDecodeError as exc:
        raise ApiError(502, "Weather service returned invalid data.") from exc
    if not isinstance(payload, dict):
        raise ApiError(502, "Weather service returned invalid data.")
    return payload


def _weather_value_at(values, index):
    if not isinstance(values, list) or len(values) <= index:
        return None
    value = values[index]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value


def _weather_description(code):
    if isinstance(code, bool) or not isinstance(code, (int, float)):
        raise ApiError(502, "Weather service returned an invalid condition code.")
    return WEATHER_CODES.get(int(code), "variable conditions")


def _elevenlabs_session():
    if not ELEVENLABS_API_KEY:
        raise ApiError(503, "ELEVENLABS_API_KEY is not configured.")
    if not ELEVENLABS_AGENT_ID:
        raise ApiError(503, "ELEVENLABS_AGENT_ID is not configured.")

    try:
        response = requests.get(
            "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
            params={"agent_id": ELEVENLABS_AGENT_ID},
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            timeout=10,
        )
    except requests.RequestException as exc:
        raise ApiError(502, "ElevenLabs conversation service request failed.") from exc

    if response.status_code in {401, 403}:
        raise ApiError(502, "ElevenLabs rejected the API key or agent access.")
    if response.status_code == 404:
        raise ApiError(503, "ElevenLabs agent was not found.")
    if not response.ok:
        raise ApiError(502, "ElevenLabs could not create a conversation session.")

    try:
        payload = response.json()
    except requests.JSONDecodeError as exc:
        raise ApiError(502, "ElevenLabs returned an invalid session response.") from exc
    signed_url = payload.get("signed_url") if isinstance(payload, dict) else None
    if not isinstance(signed_url, str) or not signed_url:
        raise ApiError(502, "ElevenLabs did not return a signed conversation URL.")
    return {"signedUrl": signed_url}


def _speak_robot(text):
    if not isinstance(text, str) or not text.strip():
        raise ApiError(400, "text must be a non-empty string.")
    if len(text) > 2000:
        raise ApiError(413, "text must not exceed 2000 characters.")

    try:
        response = requests.post(
            f"{VOICE_BRIDGE_URL}/speak",
            json={"text": text.strip()},
            timeout=(2, 120),
        )
    except requests.Timeout as exc:
        raise ApiError(504, "Robot speaker playback timed out.") from exc
    except requests.RequestException as exc:
        raise ApiError(503, "Robot voice service is unavailable.") from exc

    if response.status_code == 503:
        raise ApiError(503, "Robot voice service is unavailable.")
    if not response.ok:
        raise ApiError(502, "Robot speaker could not play the response.")
    try:
        payload = response.json()
    except requests.JSONDecodeError as exc:
        raise ApiError(502, "Robot voice service returned an invalid response.") from exc
    if not isinstance(payload, dict) or payload.get("success") is not True:
        raise ApiError(502, "Robot speaker did not confirm playback.")
    return {"success": True}


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "RobotBackend/1.0"

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        if self.headers.get("Origin") not in ALLOWED_ORIGINS:
            self._send_json(403, {"message": "Origin is not allowed."})
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        try:
            if path == "/health":
                self._send_json(200, {"status": "ok"})
            elif path == "/api/robot/status":
                self._robot_status()
            elif path == "/api/sensors/distance":
                self._send_json(200, _read_distance())
            elif path == "/api/sensors/history":
                _read_distance()
                with _history_lock:
                    history = list(_distance_history)
                self._send_json(200, history)
            elif path == "/api/camera/status":
                self._camera_status()
            elif path == "/api/camera/stream":
                online = _camera_online()
                self._send_json(
                    200,
                    {
                        "url": f"{PUBLIC_API_URL}/api/camera/frame",
                        "streamActive": online,
                        "type": "snapshot",
                    },
                )
            elif path == "/api/camera/frame":
                self._camera_frame()
            elif path == "/api/mapping/map":
                self._mapping_state()
            else:
                self._send_json(404, {"message": "Not found."})
        except ApiError as exc:
            self._send_json(exc.status, {"message": exc.message})

    def do_POST(self):
        origin = self.headers.get("Origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            self._send_json(403, {"message": "Origin is not allowed."})
            return

        path = urlsplit(self.path).path
        try:
            payload = self._read_json()
            if path == "/api/robot/move":
                self._move_robot(payload)
            elif path == "/api/robot/stop":
                response = _robot_request("/cmd", params={"c": "stop", "ms": 100})
                self._send_json(200, {"success": True, "message": response.text})
            elif path == "/api/assistant/chat":
                self._send_json(200, _assistant_message(payload.get("message")))
            elif path == "/api/assistant/weather":
                self._send_json(200, _assistant_weather(payload.get("message")))
            elif path == "/api/assistant/session":
                self._send_json(
                    200,
                    _elevenlabs_session(),
                    headers={"Cache-Control": "no-store"},
                )
            elif path == "/api/assistant/speak":
                self._send_json(200, _speak_robot(payload.get("text")))
            elif path == "/api/assistant/voice":
                result = _assistant_message(payload.get("text"))
                self._send_json(
                    200,
                    {"success": True, "message": "Transcript processed.", **result},
                )
            elif path == "/api/mapping/start":
                self._set_mapping_active(True)
            elif path == "/api/mapping/pause":
                self._set_mapping_active(False)
            elif path == "/api/mapping/reset":
                self._reset_mapping()
            else:
                self._send_json(404, {"message": "Not found."})
        except ApiError as exc:
            self._send_json(exc.status, {"message": exc.message})

    def _read_json(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ApiError(400, "Content-Length must be an integer.") from exc
        if content_length < 0 or content_length > 65536:
            raise ApiError(413, "Request body must not exceed 64 KB.")
        if content_length == 0:
            return {}
        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ApiError(400, "Request body must be valid JSON.") from exc
        if not isinstance(payload, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        return payload

    def _robot_status(self):
        robot_online = _is_reachable(ROBOT_URL)
        camera_online = _camera_online()
        components = [
            {
                "key": "esp32",
                "label": "ESP32 Controller",
                "connected": robot_online,
                "lastUpdate": "Just now",
                "icon": "Cpu",
                "value": "Connected" if robot_online else "Disconnected",
            },
            {
                "key": "cam",
                "label": "ESP32-CAM",
                "connected": camera_online,
                "lastUpdate": "Just now",
                "icon": "Camera",
                "value": "Connected" if camera_online else "Disconnected",
            },
        ]
        self._send_json(
            200,
            {"online": robot_online, "mode": "live", "components": components},
        )

    def _move_robot(self, payload):
        direction, speed = _normalize_move(payload)
        if speed == 0:
            response = _robot_request("/cmd", params={"c": "stop", "ms": 100})
            self._send_json(
                200,
                {"success": True, "direction": "stop", "speed": 0, "message": response.text},
            )
            return
        response = _robot_request(
            "/cmd",
            params={"c": direction, "ms": MOVE_DURATION_MS},
        )
        self._send_json(
            200,
            {
                "success": True,
                "direction": direction,
                "speed": speed,
                "durationMs": MOVE_DURATION_MS,
                "speedControlAvailable": False,
                "message": response.text,
            },
        )

    def _camera_status(self):
        online = _camera_online()
        self._send_json(
            200,
            {
                "connected": online,
                "streamActive": online,
                "resolution": "QQVGA",
                "objectDetectionEnabled": False,
                "status": "Camera connected" if online else "Camera disconnected",
            },
        )

    def _camera_frame(self):
        frame = self._fetch_jpeg(f"{ROBOT_URL}/frame")
        if frame is None:
            frame = self._fetch_jpeg(f"{CAMERA_URL}/capture")
        if frame is None:
            raise ApiError(502, "No JPEG frame is available from the ESP32 camera or robot relay.")

        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(frame)))
        self.end_headers()
        self.wfile.write(frame)

    @staticmethod
    def _fetch_jpeg(url):
        try:
            response = requests.get(url, timeout=5)
            response.raise_for_status()
        except requests.RequestException:
            return None
        if not response.headers.get("Content-Type", "").startswith("image/jpeg"):
            return None
        return response.content

    def _mapping_state(self):
        with _mapping_lock:
            active = _mapping_active
        reading = _read_distance(record=active)
        with _history_lock:
            samples = list(_distance_history)
        self._send_json(
            200,
            {
                "robotPosition": {"x": 0, "y": 0},
                "obstacles": _obstacle_points(samples),
                "boundarySegments": [],
                "sensorDistance": reading["distanceCm"],
                "scanAngle": 0,
                "active": active,
                "updatedAt": reading["timestamp"],
            },
        )

    def _set_mapping_active(self, active):
        global _mapping_active
        with _mapping_lock:
            _mapping_active = active
        state = "started" if active else "paused"
        self._send_json(
            200,
            {
                "success": True,
                "message": f"Mapping collection {state}; only the fixed forward sensor is available.",
            },
        )

    def _reset_mapping(self):
        global _mapping_active
        with _mapping_lock:
            _mapping_active = False
        with _history_lock:
            _distance_history.clear()
        self._send_json(200, {"success": True, "message": "Mapping history cleared."})

    def _send_json(self, status, payload, headers=None):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer((API_HOST, API_PORT), ApiHandler)
    print(f"[API] Listening at http://{API_HOST}:{API_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[API] Shutting down")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
