#!/usr/bin/env python3
"""MSTR 看盘的本地服务：提供页面、转发实时行情、保存个人配置与备份、发送 Mac 通知。只监听本机。"""
import json
import os
import shutil
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8765"))
ROOT = Path(__file__).resolve().parent
SYMBOLS = {
    "MSTR": "MSTR",
    "BTC-USD": "BTC-USD",
    "^VIX": "%5EVIX",
    "QQQ": "QQQ",
    "AAPL": "AAPL",
    "MSFT": "MSFT",
    "GOOGL": "GOOGL",
    "AMZN": "AMZN",
    "NVDA": "NVDA",
    "META": "META",
    "TSLA": "TSLA",
    "BMNR": "BMNR",
    "MU": "MU",
    "TSM": "TSM",
    "AVGO": "AVGO",
    "PLTR": "PLTR",
    "COIN": "COIN",
    "SPCX": "SPCX",
    "LLY": "LLY",
    "JPM": "JPM",
    "BRK-B": "BRK-B",
    "WMT": "WMT",
    "MCD": "MCD",
    "KO": "KO",
    "XOM": "XOM",
    "^GSPC": "%5EGSPC",
    "000001.SS": "000001.SS",
    "510300.SS": "510300.SS",
}
CACHE_SECONDS = 30
STRATEGY_CACHE_SECONDS = 120
STRATEGY_PATHS = {"/api/strategy/mstr": "mstrKpiData", "/api/strategy/btc": "bitcoinKpis"}
IDLE_EXIT_SECONDS = 12 * 3600  # 浏览器会暂停后台标签页，所以要等得足够久才能判定页面已关闭
STATIC = {
    "/": ("web/index.html", "text/html; charset=utf-8"),
    "/styles.css": ("web/styles.css", "text/css; charset=utf-8"),
    "/icon.svg": ("web/icon.svg", "image/svg+xml"),
    "/icon.png": ("web/icon.png", "image/png"),
    "/manifest.webmanifest": ("web/manifest.webmanifest", "application/manifest+json"),
    "/lightweight-charts.js": ("web/lightweight-charts.js", "text/javascript; charset=utf-8"),
    "/calc.js": ("web/calc.js", "text/javascript; charset=utf-8"),
    "/app/store.js": ("web/app/store.js", "text/javascript; charset=utf-8"),
    "/app/charts.js": ("web/app/charts.js", "text/javascript; charset=utf-8"),
    "/app/main.js": ("web/app/main.js", "text/javascript; charset=utf-8"),
}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

USER_DATA_FILE = ROOT / "data" / "user-data.json"
BACKUP_DIR = ROOT / "data" / "backups"
MAX_USER_DATA_BYTES = 524288

_cache = {}
_lock = threading.Lock()
_user_data_lock = threading.Lock()
# 用 monotonic 计时：Mac 睡眠时它不走，醒来后不会误以为页面已经关了很久
_last_request = time.monotonic()
# 走势对比一次要取二十多只股票，同时请求太多容易被 Yahoo 限流
_yahoo_slots = threading.BoundedSemaphore(6)


def exit_when_idle():
    while time.monotonic() - _last_request < IDLE_EXIT_SECONDS:
        time.sleep(15)
    os._exit(0)


def fetch_chart(symbol, query="range=5y&interval=1d"):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?{query}"
    with _lock:
        hit = _cache.get(url)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
    try:
        # curl 使用系统证书，避免 python.org 版 Python 缺证书的问题
        with _yahoo_slots:
            out = subprocess.run(
                ["/usr/bin/curl", "-fsS", "-m", "12", "--retry", "2", "--retry-all-errors", "--retry-delay", "1", "-A", UA, url],
                capture_output=True,
                timeout=45,
                check=True,
            ).stdout
        json.loads(out)
    except Exception:
        if hit:  # Yahoo 偶尔失败或限流时，继续用上一次的数据
            return hit[1]
        raise
    with _lock:
        _cache[url] = (time.time(), out)
    return out


def fetch_strategy(path):
    """Strategy 官网页面所用的公开数据，变化不快，放慢请求频率。"""
    url = f"https://api.strategy.com/btc/{path}"
    with _lock:
        hit = _cache.get(url)
        if hit and time.time() - hit[0] < STRATEGY_CACHE_SECONDS:
            return hit[1]
    try:
        out = subprocess.run(
            ["/usr/bin/curl", "-fsS", "-m", "12", "--retry", "1", "--retry-all-errors", "-A", UA, url],
            capture_output=True,
            timeout=30,
            check=True,
        ).stdout
        json.loads(out)
    except Exception:
        if hit:  # 官网暂时取不到时，继续用上一次的数据
            return hit[1]
        raise
    with _lock:
        _cache[url] = (time.time(), out)
    return out


def cached_json(url, ttl, transform=None, headers=()):
    """取一个每天才更新的 JSON；取不到时继续用上一次的结果。"""
    with _lock:
        hit = _cache.get(url)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
    # 官网历史数据有 13MB，刚启动时和其他请求挤在一起，需要多等一会儿
    args = ["/usr/bin/curl", "-fsS", "--compressed", "-m", "90", "--retry", "1", "-A", UA]
    for header in headers:
        args += ["-H", header]
    try:
        out = subprocess.run(args + [url], capture_output=True, timeout=200, check=True).stdout
        data = json.loads(out)
        out = json.dumps(transform(data) if transform else data).encode()
    except Exception:
        if hit:
            return hit[1]
        raise
    with _lock:
        _cache[url] = (time.time(), out)
    return out


def history_rows(data):
    """官网时间序列有 13MB、包含几十个标的，这里只留 MSTR 需要的字段。"""
    rows = next(item["values"] for item in data if item["ticker"] == "MSTR")
    keep = ("mNav", "mNavEntVal", "marketCap", "btcNav", "btcHoldings", "price", "satsPerShare")
    return [{"date": row["date"][:10], **{k: row.get(k) for k in keep}} for row in rows]


QDII_URL = "https://qqq.tools24.uk/api/etf-market/qdii-funds"
QDII_STATUS_FILE = ROOT / "data" / "qdii-status.json"
QDII_GROUPS = {"nasdaq100": "纳指 100", "sp500": "标普 500"}
QDII_KEEP = (
    "code",
    "name",
    "company",
    "share_class",
    "purchase_status",
    "buyable",
    "daily_limit",
    "min_purchase",
    "discounted_rate",
    "source_url",
)


def qdii_rows(data, status_file=None, today=None):
    """只留纳指 100 和标普 500 基金，并在申购状态变化时记下日期。

    公开数据里没有“从哪天开始开放”，所以由本程序自己记录：第一次看到某只基金时
    不知道它之前的状态，since 记为 None，seen 记下第一次看到的日期；之后状态一变，就记下变化当天的日期。
    """
    path = Path(status_file or QDII_STATUS_FILE)
    today = today or time.strftime("%Y-%m-%d", time.gmtime(time.time() + 8 * 3600))
    try:
        saved = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        saved = {}
    tracked_from = saved.get("tracked_from") or today
    funds = saved.get("funds", {})
    rows = []
    for group, index in QDII_GROUPS.items():
        for item in data["groups"].get(group, []):
            row = {k: item.get(k) for k in QDII_KEEP}
            code, status = row["code"], row["purchase_status"] or ""
            old = funds.get(code)
            if old is None:
                funds[code] = {"status": status, "since": None, "seen": today}
            elif old["status"] != status:
                funds[code] = {**old, "status": status, "since": today}
            row.update(index=index, since=funds[code]["since"], seen=funds[code].get("seen") or tracked_from)
            rows.append(row)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"tracked_from": tracked_from, "funds": funds}, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"tracked_from": tracked_from, "stored_at": data.get("stored_at_epoch"), "rows": rows}


def earnings_rows(data):
    return data["data"]["earningsSurpriseTable"]["rows"]


def load_user_data(path=None):
    target = Path(path or USER_DATA_FILE)
    if not target.is_file():
        return None
    return target.read_bytes()


def save_user_data(payload, path=None, backup_dir=None, today=None):
    if not isinstance(payload, dict):
        raise ValueError("invalid_json_object")
    target = Path(path or USER_DATA_FILE)
    bdir = Path(backup_dir or BACKUP_DIR)
    today = today or time.strftime("%Y-%m-%d", time.gmtime(time.time() + 8 * 3600))
    target.parent.mkdir(parents=True, exist_ok=True)
    bdir.mkdir(parents=True, exist_ok=True)
    with _user_data_lock:
        if target.exists():
            backup_path = bdir / f"user-data-{today}.json"
            if not backup_path.exists():
                shutil.copy2(target, backup_path)
        tmp = target.with_name(target.name + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, target)
    return {"ok": True, "savedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def notify(message):
    message = message[:200]
    script = 'on run argv\ndisplay notification (item 1 of argv) with title "MSTR 看盘" sound name "Glass"\nend run'
    # 系统通知可能被专注模式或通知设置挡住，所以再弹一个窗口；不等待，免得卡住页面请求
    alert = 'on run argv\ndisplay alert "MSTR 看盘提醒" message (item 1 of argv) giving up after 300\nend run'
    try:
        subprocess.run(["/usr/bin/osascript", "-e", script, message], timeout=10, check=False)
        subprocess.Popen(["/usr/bin/osascript", "-e", alert, message], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:  # 非 Mac 系统没有 osascript，页面内的提示仍然有效
        pass


def is_json_content_type(header_value):
    if not header_value:
        return False
    return header_value.split(";")[0].strip().lower() == "application/json"


class Handler(BaseHTTPRequestHandler):
    def send_body(self, status, body, content_type="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def host_ok(self):
        global _last_request
        ok = self.headers.get("Host") in {f"{HOST}:{PORT}", f"localhost:{PORT}"}
        if ok:
            _last_request = time.monotonic()
        return ok

    def do_GET(self):
        if not self.host_ok():
            return self.send_body(403, b"{}")
        parsed = urlparse(self.path)
        if parsed.path in STATIC:
            name, content_type = STATIC[parsed.path]
            return self.send_body(200, (ROOT / name).read_bytes(), content_type)
        if parsed.path == "/api/user-data":
            body = load_user_data()
            if body is None:
                return self.send_body(200, b'{"empty":true}', "application/json; charset=utf-8")
            return self.send_body(200, body, "application/json; charset=utf-8")
        if parsed.path == "/api/chart":
            symbol = parse_qs(parsed.query).get("symbol", [""])[0]
            if symbol not in SYMBOLS:
                return self.send_body(400, b'{"error":"unknown symbol"}')
            try:
                return self.send_body(200, fetch_chart(SYMBOLS[symbol]))
            except Exception:
                return self.send_body(502, b'{"error":"upstream"}')
        if parsed.path == "/api/strategy/history":
            try:
                return self.send_body(200, cached_json("https://api.strategy.com/btc/timeSeries", 1800, history_rows))
            except Exception:
                return self.send_body(502, b'{"error":"upstream"}')
        if parsed.path == "/api/qdii":
            try:
                return self.send_body(200, cached_json(QDII_URL, 1800, qdii_rows))
            except Exception:
                return self.send_body(502, b'{"error":"upstream"}')
        if parsed.path == "/api/earnings":
            try:
                return self.send_body(
                    200,
                    cached_json(
                        "https://api.nasdaq.com/api/company/MSTR/earnings-surprise",
                        6 * 3600,
                        earnings_rows,
                        ("Accept: application/json",),
                    ),
                )
            except Exception:
                return self.send_body(502, b'{"error":"upstream"}')
        if parsed.path in STRATEGY_PATHS:
            try:
                return self.send_body(200, fetch_strategy(STRATEGY_PATHS[parsed.path]))
            except Exception:
                return self.send_body(502, b'{"error":"upstream"}')
        if parsed.path == "/api/intraday":
            try:
                return self.send_body(200, fetch_chart("MSTR", "range=1d&interval=1m&includePrePost=true"))
            except Exception:
                return self.send_body(502, b'{"error":"upstream"}')
        self.send_body(404, b"{}")

    def do_POST(self):
        if not self.host_ok() or not is_json_content_type(self.headers.get("Content-Type")):
            return self.send_body(403, b"{}")
        if self.path == "/api/user-data":
            try:
                raw_len = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return self.send_body(400, b'{"error":"invalid_length"}')
            if raw_len <= 0 or raw_len > MAX_USER_DATA_BYTES:
                return self.send_body(400, b'{"error":"payload_too_large"}')
            try:
                payload = json.loads(self.rfile.read(raw_len))
                result = save_user_data(payload)
                return self.send_body(200, json.dumps(result).encode("utf-8"))
            except (ValueError, TypeError, OSError) as exc:
                return self.send_body(400, json.dumps({"error": str(exc)}).encode("utf-8"))
        if self.path == "/api/notify":
            length = min(int(self.headers.get("Content-Length") or 0), 2000)
            try:
                notify(str(json.loads(self.rfile.read(length))["message"]))
            except (ValueError, KeyError, TypeError):
                return self.send_body(400, b"{}")
            return self.send_body(200, b"{}")
        return self.send_body(403, b"{}")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    threading.Thread(target=exit_when_idle, daemon=True).start()
    print(f"MSTR 看盘已启动：http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
