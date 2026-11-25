import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from voice_bridge import VoiceBridgeServer


class FakeRobot:
    def __init__(self):
        self.greeted = True
        self.receiver = type("Receiver", (), {"client": None})()
        self.spoken = []

    def speak(self, text):
        self.spoken.append(text)
        return len(text)


class VoiceBridgeTests(unittest.TestCase):
    def setUp(self):
        self.robot = FakeRobot()
        self.server = VoiceBridgeServer(("127.0.0.1", 0), self.robot)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_speak_endpoint_uses_robot_speaker(self):
        request = Request(
            f"{self.base_url}/speak",
            data=json.dumps({"text": "Hello"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=2) as response:
            payload = json.loads(response.read())

        self.assertEqual(payload, {"success": True})
        self.assertEqual(self.robot.spoken, ["Hello"])

    def test_speak_endpoint_reports_playback_failure(self):
        def fail(_text):
            raise RuntimeError("offline")

        self.robot.speak = fail
        request = Request(
            f"{self.base_url}/speak",
            data=json.dumps({"text": "Hello"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with self.assertRaises(HTTPError) as caught:
            urlopen(request, timeout=2)

        self.assertEqual(caught.exception.code, 502)


if __name__ == "__main__":
    unittest.main()
