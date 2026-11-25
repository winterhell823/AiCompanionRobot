import json
import unittest
from http.server import ThreadingHTTPServer
from threading import Thread
from unittest.mock import Mock, patch
from urllib.request import Request, urlopen

import requests

from api_server import (
    ApiError,
    ApiHandler,
    ROBOT_URL,
    _camera_online,
    _assistant_weather,
    _elevenlabs_session,
    _normalize_move,
    _obstacle_points,
    _read_distance,
    _robot_request,
    _speak_robot,
)


class NormalizeMoveTests(unittest.TestCase):
    def test_normalizes_direction_and_default_speed(self):
        self.assertEqual(
            _normalize_move({"direction": "FORWARD"}),
            ("forward", 60),
        )

    def test_accepts_zero_speed_for_stop_handling(self):
        self.assertEqual(
            _normalize_move({"direction": "left", "speed": 0}),
            ("left", 0),
        )

    def test_rejects_invalid_direction_or_speed(self):
        with self.assertRaises(ApiError):
            _normalize_move({"direction": "diagonal"})
        with self.assertRaises(ApiError):
            _normalize_move({"direction": "forward", "speed": True})

    def test_maps_valid_distance_samples_to_forward_obstacle_dots(self):
        samples = [
            {"time": "10:00:00", "distance": 25},
            {"time": "10:00:01", "distance": 40},
            {"time": "10:00:02", "distance": None},
            {"time": "10:00:03", "distance": 999},
        ]
        self.assertEqual(
            _obstacle_points(samples),
            [{"x": 25, "y": 0}, {"x": 40, "y": 0}],
        )

    def test_rejects_no_echo_sentinel_as_a_distance(self):
        response = Mock()
        response.json.return_value = {"distanceCm": 999}
        with patch("api_server._robot_request", return_value=response):
            with self.assertRaises(ApiError):
                _read_distance(record=False)


class RobotRequestTests(unittest.TestCase):
    def test_missing_firmware_route_explains_firmware_update(self):
        response = Mock(status_code=404)
        response.raise_for_status.side_effect = requests.HTTPError(response=response)
        with patch("api_server.requests.get", return_value=response):
            with self.assertRaises(ApiError) as caught:
                _robot_request("/telemetry")

        self.assertEqual(caught.exception.status, 503)
        self.assertIn("upload", caught.exception.message)


class CameraStatusTests(unittest.TestCase):
    def test_uses_main_esp32_camera_status_relay(self):
        response = Mock(ok=True)
        response.json.return_value = {"connected": True}
        with patch("api_server.requests.get", return_value=response) as get:
            self.assertTrue(_camera_online())

        get.assert_called_once_with(f"{ROBOT_URL}/camera/status", timeout=1)


class AssistantIntegrationTests(unittest.TestCase):
    def test_weather_query_returns_live_current_conditions(self):
        geocoding = Mock()
        geocoding.json.return_value = {
            "results": [
                {"name": "Gurugram", "country": "India", "latitude": 28.46, "longitude": 77.03}
            ]
        }
        forecast = Mock()
        forecast.json.return_value = {
            "current": {
                "temperature_2m": 27.4,
                "apparent_temperature": 29.1,
                "relative_humidity_2m": 52,
                "wind_speed_10m": 8.2,
                "weather_code": 2,
            },
            "daily": {
                "temperature_2m_max": [31, 32, 30],
                "temperature_2m_min": [21, 22, 20],
                "precipitation_probability_max": [10, 15, 5],
                "weather_code": [2, 1, 0],
            },
        }
        with patch("api_server.requests.get", side_effect=[geocoding, forecast]) as get:
            result = _assistant_weather("What's the weather like?")

        self.assertIn("Current weather in Gurugram, India: partly cloudy", result["reply"])
        self.assertIn("27°C", result["reply"])
        self.assertIn("Today’s high is 31°C", result["reply"])
        self.assertEqual(result["source"], "open-meteo")
        self.assertEqual(get.call_count, 2)

    def test_weather_query_uses_named_city_for_tomorrow(self):
        geocoding = Mock()
        geocoding.json.return_value = {
            "results": [{"name": "Delhi", "country": "India", "latitude": 28.6, "longitude": 77.2}]
        }
        forecast = Mock()
        forecast.json.return_value = {
            "current": {},
            "daily": {
                "temperature_2m_max": [31, 33, 30],
                "temperature_2m_min": [21, 23, 20],
                "precipitation_probability_max": [10, 40, 5],
                "weather_code": [2, 61, 0],
            },
        }
        with patch("api_server.requests.get", side_effect=[geocoding, forecast]):
            result = _assistant_weather("Will it rain in Delhi tomorrow?")

        self.assertIn("Tomorrow in Delhi, India: light rain", result["reply"])
        self.assertIn("high near 33°C", result["reply"])
        self.assertIn("Rain chance is up to 40%", result["reply"])

    def test_weather_query_accepts_misspelled_city_first_question(self):
        geocoding = Mock()
        geocoding.json.return_value = {
            "results": [{"name": "Delhi", "country": "India", "latitude": 28.6, "longitude": 77.2}]
        }
        forecast = Mock()
        forecast.json.return_value = {
            "current": {
                "temperature_2m": 27,
                "apparent_temperature": 28,
                "relative_humidity_2m": 50,
                "wind_speed_10m": 6,
                "weather_code": 1,
            },
            "daily": {
                "temperature_2m_max": [31, 33, 30],
                "temperature_2m_min": [21, 23, 20],
                "precipitation_probability_max": [10, 40, 5],
                "weather_code": [1, 1, 0],
            },
        }
        with patch("api_server.requests.get", side_effect=[geocoding, forecast]) as get:
            result = _assistant_weather("whats delhi wheather")

        self.assertIn("Current weather in Delhi, India", result["reply"])
        self.assertEqual(get.call_args_list[0].kwargs["params"]["name"].lower(), "delhi")

    def test_weather_query_reports_unmatched_location(self):
        geocoding = Mock()
        geocoding.json.return_value = {"results": []}
        with patch("api_server.requests.get", return_value=geocoding):
            with self.assertRaises(ApiError) as caught:
                _assistant_weather("What is the weather in Nowhereville?")

        self.assertEqual(caught.exception.status, 404)

    def test_elevenlabs_session_requires_server_configuration(self):
        with patch("api_server.ELEVENLABS_API_KEY", ""), patch(
            "api_server.ELEVENLABS_AGENT_ID", ""
        ):
            with self.assertRaises(ApiError) as caught:
                _elevenlabs_session()

        self.assertEqual(caught.exception.status, 503)

    def test_elevenlabs_session_uses_server_key_and_returns_signed_url(self):
        response = Mock(ok=True, status_code=200)
        response.json.return_value = {"signed_url": "wss://example.test/session"}
        with patch("api_server.ELEVENLABS_API_KEY", "server-key"), patch(
            "api_server.ELEVENLABS_AGENT_ID", "agent-id"
        ), patch("api_server.requests.get", return_value=response) as get:
            result = _elevenlabs_session()

        self.assertEqual(result, {"signedUrl": "wss://example.test/session"})
        get.assert_called_once_with(
            "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
            params={"agent_id": "agent-id"},
            headers={"xi-api-key": "server-key"},
            timeout=10,
        )

    def test_speak_robot_proxies_text_to_local_voice_bridge(self):
        response = Mock(ok=True, status_code=200)
        response.json.return_value = {"success": True}
        with patch("api_server.requests.post", return_value=response) as post:
            self.assertEqual(_speak_robot("Hello"), {"success": True})

        post.assert_called_once_with(
            "http://127.0.0.1:8001/speak",
            json={"text": "Hello"},
            timeout=(2, 120),
        )

    def test_speak_robot_reports_unavailable_voice_bridge(self):
        with patch(
            "api_server.requests.post",
            side_effect=requests.ConnectionError("bridge is offline"),
        ):
            with self.assertRaises(ApiError) as caught:
                _speak_robot("Hello")

        self.assertEqual(caught.exception.status, 503)


class AssistantEndpointTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def _post(self, path, payload):
        request = Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return urlopen(request, timeout=2)

    def test_session_endpoint_returns_non_cacheable_signed_url(self):
        with patch(
            "api_server._elevenlabs_session",
            return_value={"signedUrl": "wss://example.test/session"},
        ):
            with self._post("/api/assistant/session", {}) as response:
                payload = json.loads(response.read())

        self.assertEqual(payload, {"signedUrl": "wss://example.test/session"})
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_speak_endpoint_uses_robot_voice_bridge(self):
        with patch("api_server._speak_robot", return_value={"success": True}) as speak:
            with self._post("/api/assistant/speak", {"text": "Hello"}) as response:
                payload = json.loads(response.read())

        self.assertEqual(payload, {"success": True})
        speak.assert_called_once_with("Hello")

    def test_weather_endpoint_returns_provider_result(self):
        result = {"reply": "Current weather in Delhi: clear skies.", "source": "open-meteo"}
        with patch("api_server._assistant_weather", return_value=result) as weather:
            with self._post(
                "/api/assistant/weather",
                {"message": "What is the weather in Delhi?"},
            ) as response:
                payload = json.loads(response.read())

        self.assertEqual(payload, result)
        weather.assert_called_once_with("What is the weather in Delhi?")


if __name__ == "__main__":
    unittest.main()
