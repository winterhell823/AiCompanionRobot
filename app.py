import os
import signal
import threading

from dotenv import load_dotenv

from conversation_manager import RobotConversation
from voice_bridge import VoiceBridgeServer


def main():
    load_dotenv()
    esp32_ip = os.getenv("ESP32_IP", "192.168.1.12")
    audio_port = int(os.getenv("AUDIO_PORT", "5005"))

    robot = RobotConversation(esp32_ip, audio_port)
    bridge_port = int(os.getenv("VOICE_BRIDGE_PORT", "8001"))
    voice_bridge = VoiceBridgeServer(("127.0.0.1", bridge_port), robot)
    threading.Thread(target=voice_bridge.serve_forever, daemon=True).start()
    robot.run()
    print(f"[BACKEND] Listening for ESP32 audio on port {audio_port}")
    print(f"[VOICE_BRIDGE] Listening at http://127.0.0.1:{bridge_port}")
    try:
        signal.pause()
    except KeyboardInterrupt:
        print("\n[BACKEND] Shutting down")
    finally:
        voice_bridge.shutdown()
        voice_bridge.server_close()


if __name__ == "__main__":
    main()
