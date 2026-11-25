import os
import unittest
from unittest.mock import patch

from tts import ElevenLabsStreamer


class FakeReceiver:
    def __init__(self):
        self.chunks = []

    def send_pcm(self, chunk):
        self.chunks.append(chunk)


class ElevenLabsStreamerTests(unittest.TestCase):
    def test_speak_sends_streamed_pcm_to_robot_receiver(self):
        with patch.dict(
            os.environ,
            {"ELEVENLABS_API_KEY": "test-key", "ELEVEN_VOICE_ID": "test-voice"},
        ), patch("tts.ElevenLabs") as elevenlabs:
            elevenlabs.return_value.text_to_speech.convert.return_value = [
                b"\x01\x00",
                b"\x02\x00",
            ]
            streamer = ElevenLabsStreamer()
            receiver = FakeReceiver()
            streamer.set_receiver(receiver)

            with patch("tts.time.sleep") as sleep:
                byte_count = streamer.speak("Hello")

        self.assertEqual(byte_count, 4)
        self.assertEqual(receiver.chunks, [b"\x01\x00", b"\x02\x00"])
        sleep.assert_called_once_with(4 / 32000.0 + 0.25)

    def test_speak_fails_when_robot_audio_is_not_connected(self):
        with patch.dict(
            os.environ,
            {"ELEVENLABS_API_KEY": "test-key", "ELEVEN_VOICE_ID": "test-voice"},
        ), patch("tts.ElevenLabs"):
            streamer = ElevenLabsStreamer()

        with self.assertRaisesRegex(RuntimeError, "receiver is not connected"):
            streamer.speak("Hello")

    def test_speak_fails_when_elevenlabs_returns_no_audio(self):
        with patch.dict(
            os.environ,
            {"ELEVENLABS_API_KEY": "test-key", "ELEVEN_VOICE_ID": "test-voice"},
        ), patch("tts.ElevenLabs") as elevenlabs:
            elevenlabs.return_value.text_to_speech.convert.return_value = []
            streamer = ElevenLabsStreamer()
            streamer.set_receiver(FakeReceiver())

        with self.assertRaisesRegex(RuntimeError, "returned no speech audio"):
            streamer.speak("Hello")


if __name__ == "__main__":
    unittest.main()
