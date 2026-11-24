import time
import unittest

import numpy as np

from stt import ESP32AudioReceiver


class FakeAudioClient:
    def __init__(self, chunks):
        self.chunks = iter(chunks)

    def recv(self, _size):
        chunk = next(self.chunks, b"")
        if chunk:
            time.sleep(0.032)
        return chunk


class SpeechDetectionTests(unittest.TestCase):
    def test_buffers_quieter_speech_until_silence(self):
        quiet = np.zeros(512, dtype=np.int16).tobytes()
        samples = np.arange(512)
        speech = (600 * np.sin(2 * np.pi * 440 * samples / 16000)).astype(np.int16).tobytes()
        chunks = [quiet] * 10 + [speech] * 16 + [quiet] * 35

        receiver = ESP32AudioReceiver.__new__(ESP32AudioReceiver)
        listening_events = []
        utterances = []
        receiver.on_listening = lambda: listening_events.append(True)
        receiver._transcribe = utterances.append
        receiver._receive(FakeAudioClient(chunks))

        self.assertEqual(len(listening_events), 1)
        self.assertEqual(len(utterances), 1)
        self.assertGreaterEqual(len(utterances[0]), 16000)


if __name__ == "__main__":
    unittest.main()
