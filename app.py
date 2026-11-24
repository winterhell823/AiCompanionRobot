import os
import signal

from dotenv import load_dotenv

from conversation_manager import RobotConversation


def main():
    load_dotenv()
    esp32_ip = os.getenv("ESP32_IP", "192.168.1.12")
    audio_port = int(os.getenv("AUDIO_PORT", "5005"))

    robot = RobotConversation(esp32_ip, audio_port)
    robot.run()
    print(f"[BACKEND] Listening for ESP32 audio on port {audio_port}")
    signal.pause()


if __name__ == "__main__":
    main()
