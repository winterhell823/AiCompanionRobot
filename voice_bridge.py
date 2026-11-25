import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


class VoiceBridgeServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, robot):
        self.robot = robot
        super().__init__(address, VoiceBridgeHandler)


class VoiceBridgeHandler(BaseHTTPRequestHandler):
    server: VoiceBridgeServer

    def do_GET(self):
        if urlsplit(self.path).path != "/health":
            self._send_json(404, {"message": "Not found."})
            return

        receiver = self.server.robot.receiver
        client = receiver.client
        connected = False
        if client is not None:
            try:
                client.getpeername()
                connected = True
            except OSError:
                pass

        self._send_json(
            200,
            {
                "audioConnected": connected,
                "greeted": self.server.robot.greeted,
            },
        )

    def do_POST(self):
        if urlsplit(self.path).path != "/speak":
            self._send_json(404, {"message": "Not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"message": "Content-Length must be an integer."})
            return
        if content_length <= 0 or content_length > 8192:
            self._send_json(413, {"message": "Request body must not exceed 8 KB."})
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"message": "Request body must be valid JSON."})
            return
        if not isinstance(payload, dict):
            self._send_json(400, {"message": "Request body must be a JSON object."})
            return

        text = payload.get("text")
        if not isinstance(text, str) or not text.strip():
            self._send_json(400, {"message": "text must be a non-empty string."})
            return
        if len(text) > 2000:
            self._send_json(413, {"message": "text must not exceed 2000 characters."})
            return

        try:
            self.server.robot.speak(text.strip())
        except Exception as exc:
            print(f"[VOICE_BRIDGE] Speaker playback failed: {exc}")
            self._send_json(502, {"message": "Robot speaker playback failed."})
            return
        self._send_json(200, {"success": True})

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
