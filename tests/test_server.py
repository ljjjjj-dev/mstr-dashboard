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


class QdiiTracking(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.file = Path(tempfile.mkdtemp()) / "status.json"

    def payload(self, status):
        return {"groups": {"nasdaq100": [{"code": "016453", "name": "南方纳斯达克100C", "purchase_status": status, "buyable": True, "extra": 1}]}}

    def test_first_sight_has_no_date_then_changes_are_dated(self):
        first = server.qdii_rows(self.payload("暂停申购"), self.file, "2026-11-03")
        self.assertIsNone(first["rows"][0]["since"])
        self.assertEqual(first["tracked_from"], "2026-11-03")
        self.assertNotIn("extra", first["rows"][0])
        same = server.qdii_rows(self.payload("暂停申购"), self.file, "2026-11-04")
        self.assertIsNone(same["rows"][0]["since"])
        opened = server.qdii_rows(self.payload("限大额(单日投资上限1000元)"), self.file, "2026-11-05")
        self.assertEqual(opened["rows"][0]["since"], "2026-11-05")
        later = server.qdii_rows(self.payload("限大额(单日投资上限1000元)"), self.file, "2026-11-09")
        self.assertEqual(later["rows"][0]["since"], "2026-11-05")
        self.assertEqual(later["tracked_from"], "2026-11-03")

    def test_sp500_funds_are_included_and_dated_from_first_sight(self):
        server.qdii_rows(self.payload("暂停申购"), self.file, "2026-11-03")
        data = self.payload("暂停申购")
        data["groups"]["sp500"] = [{"code": "008401", "name": "大成标普500等权重指数(QDII)C人民币", "purchase_status": "开放申购"}]
        rows = {r["code"]: r for r in server.qdii_rows(data, self.file, "2026-11-10")["rows"]}
        self.assertEqual((rows["016453"]["index"], rows["016453"]["seen"]), ("纳指 100", "2026-11-03"))
        self.assertEqual((rows["008401"]["index"], rows["008401"]["seen"]), ("标普 500", "2026-11-10"))
        self.assertIsNone(rows["008401"]["since"])

    def test_unreadable_status_file_starts_over(self):
        self.file.write_text("not json", encoding="utf-8")
        rows = server.qdii_rows(self.payload("开放申购"), self.file, "2026-11-03")["rows"]
        self.assertIsNone(rows[0]["since"])


class Safety(unittest.TestCase):
    def test_only_expected_files_are_served(self):
        self.assertEqual(set(server.STATIC), {"/", "/lightweight-charts.js", "/calc.js"})
        for name, _ in server.STATIC.values():
            self.assertTrue((server.ROOT / name).is_file(), name)

    def test_listens_on_this_computer_only(self):
        self.assertEqual(server.HOST, "127.0.0.1")

    def test_symbols_are_limited(self):
        self.assertEqual(set(server.SYMBOLS), {"MSTR", "BTC-USD", "^VIX", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BMNR", "MU", "TSM", "AVGO", "PLTR", "COIN", "SPCX", "LLY", "JPM", "BRK-B", "WMT", "MCD", "KO", "XOM", "^GSPC", "000001.SS", "510300.SS"})


if __name__ == "__main__":
    unittest.main()
