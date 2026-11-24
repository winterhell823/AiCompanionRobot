import requests


class CameraService:
    def __init__(self, esp32_ip: str, preview_ms: int = 10000):
        self.url = f"http://{esp32_ip}/capture"
        self.preview_url = f"http://{esp32_ip}/preview"
        self.preview_ms = preview_ms

    def capture(self) -> bool:
        try:
            response = requests.get(self.url, timeout=12)
            if response.status_code != 200:
                print(f"[CAMERA] Photo capture rejected: HTTP {response.status_code}")
                return False
            return True
        except requests.RequestException as exc:
            print(f"[CAMERA] ESP32 camera request failed: {exc}")
            return False

    def show_live(self) -> bool:
        try:
            response = requests.get(
                self.preview_url,
                params={"duration_ms": self.preview_ms},
                timeout=3,
            )
            return response.status_code == 200
        except requests.RequestException as exc:
            print(f"[CAMERA] ESP32 preview request failed: {exc}")
            return False
