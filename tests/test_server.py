import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.dont_write_bytecode = True

import server  # noqa: E402


class DataShapes(unittest.TestCase):
    def test_history_keeps_only_mstr_fields(self):
        data = [
            {"ticker": "AAPL", "values": [{"date": "2026-10-30T00:00:00", "price": 1}]},
            {"ticker": "MSTR", "values": [{"date": "2026-10-30T00:00:00", "price": 130.5, "mNav": 1.11, "satsPerShare": 187000, "extra": 9}]},
        ]
        rows = server.history_rows(data)
        self.assertEqual(rows[0]["date"], "2026-10-30")
        self.assertEqual(rows[0]["mNav"], 1.11)
        self.assertEqual(rows[0]["satsPerShare"], 187000)
        self.assertIsNone(rows[0]["btcNav"])
        self.assertNotIn("extra", rows[0])

    def test_history_without_mstr_fails_instead_of_returning_nothing(self):
        with self.assertRaises(StopIteration):
            server.history_rows([{"ticker": "AAPL", "values": []}])

    def test_earnings_rows(self):
        rows = [{"dateReported": "10/29/2026"}]
        self.assertEqual(server.earnings_rows({"data": {"earningsSurpriseTable": {"rows": rows}}}), rows)


class Safety(unittest.TestCase):
    def test_only_expected_files_are_served(self):
        self.assertEqual(set(server.STATIC), {"/", "/lightweight-charts.js", "/calc.js"})
        for name, _ in server.STATIC.values():
            self.assertTrue((server.ROOT / name).is_file(), name)

    def test_listens_on_this_computer_only(self):
        self.assertEqual(server.HOST, "127.0.0.1")

    def test_symbols_are_limited(self):
        self.assertEqual(set(server.SYMBOLS), {"MSTR", "BTC-USD", "^VIX"})


if __name__ == "__main__":
    unittest.main()
