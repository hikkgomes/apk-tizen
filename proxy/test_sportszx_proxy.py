import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("sportszx_proxy.py")
SPEC = importlib.util.spec_from_file_location("sportszx_proxy", MODULE_PATH)
PROXY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROXY)


class PlaylistRewriteTests(unittest.TestCase):
    def test_rewrites_segments_nested_playlists_and_keys(self):
        source = (
            '#EXTM3U\n'
            '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"\n'
            '#EXT-X-MAP:URI="init.mp4"\n'
            '#EXTINF:6,\n'
            'segments/one.ts?part=1\n'
            '#EXT-X-STREAM-INF:BANDWIDTH=1200000\n'
            '../high/index.m3u8\n'
        ).encode()
        result = PROXY.rewrite_playlist(
            source,
            "https://media.example/live/master/index.m3u8",
            "http://192.168.1.41:8099",
            "secret-token",
            "https://origin.example/",
            "TV Agent",
        ).decode()

        self.assertIn("url=https%3A%2F%2Fmedia.example%2Flive%2Fmaster%2Fkeys%2Fkey.bin", result)
        self.assertIn("url=https%3A%2F%2Fmedia.example%2Flive%2Fmaster%2Finit.mp4", result)
        self.assertIn("url=https%3A%2F%2Fmedia.example%2Flive%2Fmaster%2Fsegments%2Fone.ts%3Fpart%3D1", result)
        self.assertIn("url=https%3A%2F%2Fmedia.example%2Flive%2Fhigh%2Findex.m3u8", result)
        self.assertNotIn("secret-token", PROXY.ProxyHandler.log_message.__doc__ or "")

    def test_rejects_non_http_upstreams(self):
        with self.assertRaisesRegex(ValueError, "HTTP"):
            PROXY.validate_upstream_url("file:///etc/passwd")

    def test_parses_allowed_networks(self):
        networks = PROXY.parse_networks("192.168.1.0/24,127.0.0.0/8")
        self.assertEqual(str(networks[0]), "192.168.1.0/24")
        self.assertEqual(str(networks[1]), "127.0.0.0/8")


if __name__ == "__main__":
    unittest.main()
