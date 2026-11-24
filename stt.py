import socket
import threading
import time

import numpy as np
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000
SPEECH_THRESHOLD_RMS = 400
SPEECH_END_SILENCE_SECONDS = 0.8
SPEECH_PRE_ROLL_BYTES = int(SAMPLE_RATE * 0.3) * 2


class ESP32AudioReceiver:
    def __init__(self, host: str, port: int, on_transcript, on_connect=None, on_listening=None):
        self.host = host
        self.port = port
        self.on_transcript = on_transcript
        self.on_connect = on_connect
        self.on_listening = on_listening
        self.model = WhisperModel("small", device="cpu", compute_type="int8")
        self.client = None
        self.send_lock = threading.Lock()

    def start(self):
        threading.Thread(target=self._serve, daemon=True).start()

    def send_pcm(self, pcm: bytes) -> None:
        with self.send_lock:
            if not self.client:
                raise ConnectionError("ESP32 audio socket is not connected")
            try:
                self.client.sendall(pcm)
            except OSError:
                self.client = None
                raise

    def _serve(self):
        while True:
            client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            client.settimeout(4)
            try:
                client.connect((self.host, self.port))
                client.settimeout(None)
                self.client = client
                print(f"[STT] Connected to ESP32 audio at {self.host}:{self.port}")
                if self.on_connect:
                    self.on_connect()
                self._receive(client)
            except OSError as exc:
                print(f"[STT] ESP32 audio connection failed: {exc}")
            finally:
                with self.send_lock:
                    if self.client is client:
                        self.client = None
                client.close()
            time.sleep(2)

    def _receive(self, client):
        buffer = bytearray()
        speech = bytearray()
        pre_roll = bytearray()
        last_voice = time.monotonic()
        in_utterance = False

        while True:
            pcm = client.recv(2048)
            if not pcm:
                break
            buffer.extend(pcm)
            if len(buffer) < 1024:
                continue

            usable = len(buffer) - len(buffer) % 2
            samples = np.frombuffer(bytes(buffer[:usable]), dtype=np.int16)
            del buffer[:usable]
            rms = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2))) if samples.size else 0
            pcm = samples.tobytes()

            if rms > SPEECH_THRESHOLD_RMS:
                if not in_utterance and self.on_listening:
                    self.on_listening()
                if not in_utterance:
                    speech.extend(pre_roll)
                    pre_roll.clear()
                in_utterance = True
                speech.extend(pcm)
                last_voice = time.monotonic()
            elif in_utterance:
                speech.extend(pcm)
                if time.monotonic() - last_voice >= SPEECH_END_SILENCE_SECONDS:
                    self._transcribe(bytes(speech))
                    speech.clear()
                    in_utterance = False
            else:
                pre_roll.extend(pcm)
                if len(pre_roll) > SPEECH_PRE_ROLL_BYTES:
                    del pre_roll[:-SPEECH_PRE_ROLL_BYTES]

    def _transcribe(self, wav_pcm: bytes):
        if len(wav_pcm) < SAMPLE_RATE:
            return
        try:
            audio = np.frombuffer(wav_pcm, dtype=np.int16).astype(np.float32) / 32768.0
            segments, _ = self.model.transcribe(
                audio,
                language="en",
                beam_size=3,
                hotwords="click picture, take a picture, take a photo, capture a photo",
            )
            text = " ".join(segment.text.strip() for segment in segments).strip()
            if text:
                print(f"[STT] You said: {text}")
                self.on_transcript(text)
        except Exception as exc:
            print(f"[STT] Transcription failed: {exc}")
