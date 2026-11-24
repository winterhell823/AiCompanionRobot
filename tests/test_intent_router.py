import unittest

from intent_router import route_local_command


class LocalPhotoCommandTests(unittest.TestCase):
    def test_routes_common_photo_phrases(self):
        for phrase in (
            "click picture",
            "click the picture",
            "please click a photo",
            "take a picture",
            "take a photo",
            "snap a pic",
        ):
            with self.subTest(phrase=phrase):
                result = route_local_command(phrase)
                self.assertEqual(result["intent"], "CAPTURE_PHOTO")
                self.assertEqual(result["action"]["type"], "CAPTURE_PHOTO")

    def test_ignores_unrelated_and_negated_phrases(self):
        self.assertIsNone(route_local_command("tell me a joke"))
        self.assertIsNone(route_local_command("do not click the picture"))


if __name__ == "__main__":
    unittest.main()
