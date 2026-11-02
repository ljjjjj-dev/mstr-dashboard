#!/usr/bin/env python3
"""MSTR 看盘的本地服务：提供页面、转发 Yahoo 行情、发送 Mac 通知。只监听本机。"""
import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 8765
ROOT = Path(__file__).resolve().parent
SYMBOLS = {"MSTR": "MSTR", "BTC-USD": "BTC-USD", "^VIX": "%5EVIX"}
CACHE_SECONDS = 30
STRATEGY_CACHE_SECONDS = 120
STRATEGY_PATHS = {"/api/strategy/mstr": "mstrKpiData", "/api/strategy/btc": "bitcoinKpis"}
IDLE_EXIT_SECONDS = 12 * 3600  # 浏览器会暂停后台标签页，所以要等得足够久才能判定页面已关闭
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/lightweight-charts.js": ("lightweight-charts.js", "text/javascript; charset=utf-8"),
}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

_cache = {}
_lock = threading.Lock()
_last_request = time.time()


def exit_when_idle():
    while time.time() - _last_request < IDLE_EXIT_SECONDS:
        time.sleep(15)
    os._exit(0)


def fetch_chart(symbol, query="range=5y&interval=1d"):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?{query}"
    with _lock:
        hit = _cache.get(url)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
    # curl 使用系统证书，避免 python.org 版 Python 缺证书的问题
    out = subprocess.run(
        ["/usr/bin/curl", "-fsS", "-m", "12", "--retry", "2", "--retry-all-errors", "--retry-delay", "1", "-A", UA, url],
        capture_output=True, timeout=45, check=True,
    ).stdout
    json.loads(out)
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
            capture_output=True, timeout=30, check=True,
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
    args = ["/usr/bin/curl", "-fsS", "--compressed", "-m", "40", "-A", UA]
    for header in headers:
        args += ["-H", header]
    try:
        out = subprocess.run(args + [url], capture_output=True, timeout=60, check=True).stdout
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
    keep = ("mNav", "mNavEntVal", "marketCap", "btcNav", "btcHoldings", "price")
    return [{"date": row["date"][:10], **{k: row.get(k) for k in keep}} for row in rows]


def earnings_rows(data):
    return data["data"]["earningsSurpriseTable"]["rows"]


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
        _last_request = time.time()
        return self.headers.get("Host") in {f"{HOST}:{PORT}", f"localhost:{PORT}"}

    def do_GET(self):
        if not self.host_ok():
            return self.send_body(403, b"{}")
        parsed = urlparse(self.path)
        if parsed.path in STATIC:
            name, content_type = STATIC[parsed.path]
            return self.send_body(200, (ROOT / name).read_bytes(), content_type)
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
        if parsed.path == "/api/earnings":
            try:
                return self.send_body(200, cached_json(
                    "https://api.nasdaq.com/api/company/MSTR/earnings-surprise", 6 * 3600, earnings_rows,
                    ("Accept: application/json",)))
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
        # 只接受本页面发出的 JSON 请求，其他网站无法借此弹通知
        if not self.host_ok() or self.path != "/api/notify" or self.headers.get("Content-Type") != "application/json":
            return self.send_body(403, b"{}")
        length = min(int(self.headers.get("Content-Length") or 0), 2000)
        try:
            notify(str(json.loads(self.rfile.read(length))["message"]))
        except (ValueError, KeyError, TypeError):
            return self.send_body(400, b"{}")
        self.send_body(200, b"{}")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    threading.Thread(target=exit_when_idle, daemon=True).start()
    print(f"MSTR 看盘已启动：http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
