import unittest
from unittest.mock import patch

from conversation_manager import RobotConversation


class RobotConversationTests(unittest.TestCase):
    def setUp(self):
        patchers = (
            patch("conversation_manager.ConversationManager"),
            patch("conversation_manager.CameraService"),
            patch("conversation_manager.ElevenLabsStreamer"),
            patch("conversation_manager.ESP32AudioReceiver"),
            patch("conversation_manager.requests.get"),
        )
        self.mocks = [item.start() for item in patchers]
        for item in reversed(patchers):
            self.addCleanup(item.stop)
        self.brain_class, self.camera_class, self.tts_class, _, _ = self.mocks
        self.robot = RobotConversation("127.0.0.1", 5005)

    def test_microphone_transcript_reply_is_sent_to_robot_speaker(self):
        self.robot.brain.think.return_value = {
            "intent": "CONVERSATION",
            "response": "Hello there.",
            "action": None,
        }

        self.robot.on_transcript("How are you?")

        self.robot.brain.think.assert_called_once_with("How are you?")
        self.robot.tts.speak.assert_called_once_with("Hello there.")

    def test_greeting_is_retried_after_speaker_failure(self):
        self.robot.tts.speak.side_effect = [RuntimeError("audio link failed"), 100]

        self.robot.on_connect()
        self.assertFalse(self.robot.greeted)

        self.robot.on_connect()
        self.assertTrue(self.robot.greeted)
        self.assertEqual(self.robot.tts.speak.call_count, 2)


if __name__ == "__main__":
    unittest.main()
