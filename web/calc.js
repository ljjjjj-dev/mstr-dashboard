// 不依赖页面的纯计算：页面和自动测试共用这一份。
function sma(values, n) {
  const out = []; let sum = 0;
  values.forEach((v, i) => { sum += v; if (i >= n) sum -= values[i - n]; out.push(i >= n - 1 ? sum / n : null); });
  return out;
}
function rsiSeries(closes, n = 14) { // Wilder smoothing
  const out = closes.map(() => null);
  if (closes.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) gain += d; else loss -= d; }
  gain /= n; loss /= n;
  const value = () => loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  out[n] = value();
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = value();
  }
  return out;
}
const rsi = (closes, n = 14) => rsiSeries(closes, n).at(-1);
function ema(values, n) { // seeded with the SMA of the first n valid values
  const out = values.map(() => null), k = 2 / (n + 1), start = values.findIndex(v => v != null);
  if (start < 0 || values.length < start + n) return out;
  let prev = values.slice(start, start + n).reduce((s, v) => s + v, 0) / n;
  out[start + n - 1] = prev;
  for (let i = start + n; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}
function macd(closes) {
  const fast = ema(closes, 12), slow = ema(closes, 26);
  const line = closes.map((_, i) => fast[i] != null && slow[i] != null ? fast[i] - slow[i] : null);
  const signal = ema(line, 9);
  return { line, signal, hist: line.map((v, i) => v != null && signal[i] != null ? v - signal[i] : null) };
}
function crossings(a, b, bars) { // gold: a moves above b; dead: a moves below b
  const out = [];
  for (let i = 1; i < a.length; i++) {
    if (a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) continue;
    const before = a[i - 1] - b[i - 1], now = a[i] - b[i];
    if (before <= 0 && now > 0) out.push({ i, time: bars[i].time, type: 'gold' });
    else if (before >= 0 && now < 0) out.push({ i, time: bars[i].time, type: 'dead' });
  }
  return out;
}
function correlation(a, b) {
  const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
  let ab = 0, aa = 0, bb = 0;
  a.forEach((x, i) => { ab += (x - ma) * (b[i] - mb); aa += (x - ma) ** 2; bb += (b[i] - mb) ** 2; });
  return ab / Math.sqrt(aa * bb);
}
function toWeekly(bars) { // one bar per Monday-based week, dated by its first trading day
  const weeks = []; let key = null;
  for (const b of bars) {
    const d = new Date(b.time + 'T00:00:00Z');
    const k = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
    if (k !== key) { key = k; weeks.push({ ...b }); continue; }
    const w = weeks.at(-1);
    w.high = Math.max(w.high, b.high); w.low = Math.min(w.low, b.low); w.close = b.close; w.volume += b.volume;
  }
  return weeks;
}
function sessionOf(now, p) {
  if (now < p.pre.start) return { key: 'wait', label: '休市', cls: 'closed' };
  if (now < p.pre.end) return { key: 'pre', label: '盘前交易', cls: 'ext' };
  if (now < p.regular.end) return { key: 'regular', label: '交易中', cls: 'live' };
  if (now < p.post.end) return { key: 'post', label: '盘后交易', cls: 'ext' };
  return { key: 'done', label: '休市', cls: 'closed' };
}
function extendedQuote(session, p, points, close) {
  const from = session.key === 'pre' ? p.pre.start : (session.key === 'post' || session.key === 'done') ? p.regular.end : null;
  if (from == null) return null;
  const last = points.filter(x => x.time >= from).at(-1);
  if (!last) return null;
  return { price: last.close, time: last.time, change: (last.close / close - 1) * 100, label: session.key === 'pre' ? '盘前' : '盘后' };
}
function beta(a, b) { // a 相对 b 的变动倍数：b 变动 1% 时，a 平均变动多少
  const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
  let ab = 0, bb = 0;
  a.forEach((x, i) => { ab += (x - ma) * (b[i] - mb); bb += (b[i] - mb) ** 2; });
  return ab / bb;
}
function dcaSim(bars, monthly, years, lastPrice) { // buys at the close of each month's first bar
  if (!bars.length) return null;
  const end = new Date(bars.at(-1).time + 'T00:00:00Z'); end.setUTCFullYear(end.getUTCFullYear() - years);
  const from = end.toISOString().slice(0, 10), series = [], buys = [];
  let month = null, units = 0, spent = 0, worst = 0, worstTime = null;
  for (const b of bars) {
    if (b.time < from) continue;
    const m = b.time.slice(0, 7);
    if (m !== month) { month = m; units += monthly / b.close; spent += monthly; buys.push(b.time); }
    const avg = spent / units, pl = b.close / avg - 1;
    if (pl < worst) { worst = pl; worstTime = b.time; }
    series.push({ time: b.time, price: b.close, avg });
  }
  if (!buys.length) return null;
  const avg = spent / units, value = units * lastPrice;
  return { from: buys[0], count: buys.length, spent, units, avg, value, pl: value / spent - 1, worst, worstTime, series };
}
function summarize(rows, field) { // rows are newest first, field holds a number on every kept row
  const vals = rows.filter(r => r[field] != null);
  if (!vals.length) return null;
  const hi = vals.reduce((a, b) => b[field] > a[field] ? b : a), lo = vals.reduce((a, b) => b[field] < a[field] ? b : a);
  const avg = vals.reduce((s, r) => s + r[field], 0) / vals.length, now = vals[0][field];
  return { now, hi, lo, avg, share: vals.filter(r => r[field] < now).length / vals.length * 100, from: vals.at(-1).date, count: vals.length };
}

// --- 交易计划：判断用户自己写的规则。这里不产生任何买卖建议。 ---
function closesBelowAverage(closes, days, n = 200) { // 最近 days 个收盘价是否都低于各自当天的 n 日均线
  if (!(days > 0)) return false;
  const avg = sma(closes, n);
  if (closes.length < days) return false;
  for (let i = closes.length - days; i < closes.length; i++) {
    if (avg[i] == null || closes[i] >= avg[i]) return false;
  }
  return true;
}
function evalRule(rule, ctx) { // ctx: price, bars（已收盘）, mnav, today
  const v = Number(rule.value);
  switch (rule.type) {
    case 'priceAbove': return ctx.price >= v;
    case 'priceBelow': return ctx.price <= v;
    case 'drawdown': {
      const seen = ctx.bars.filter(b => b.time >= rule.created).map(b => b.close);
      const peak = Math.max(ctx.price, ...seen);
      return ctx.price <= peak * (1 - v / 100);
    }
    case 'belowMa200': return closesBelowAverage(ctx.bars.map(b => b.close), v);
    case 'mnavAbove': return ctx.mnav != null && ctx.mnav >= v;
    case 'mnavBelow': return ctx.mnav != null && ctx.mnav <= v;
    case 'date': return ctx.today >= rule.value;
    default: return false;
  }
}
function backtestRule(rule, bars, mnavRows = []) { // 规则过去触发在哪些日子；只记录从“没满足”变成“满足”的那天
  if (rule.type === 'date') return null;
  const v = Number(rule.value), mnavAt = new Map(mnavRows.filter(r => r.mNav != null).map(r => [r.date, r.mNav]));
  const usesMnav = rule.type === 'mnavAbove' || rule.type === 'mnavBelow';
  const rows = usesMnav ? bars.filter(b => mnavAt.has(b.time)) : bars;
  const closes = rows.map(b => b.close), avg = rule.type === 'belowMa200' ? sma(closes, 200) : null;
  const events = [];
  let prev = null, peak = -Infinity, streak = 0;
  rows.forEach((b, i) => {
    let hit = false;
    if (rule.type === 'priceAbove') hit = b.close >= v;
    else if (rule.type === 'priceBelow') hit = b.close <= v;
    else if (rule.type === 'mnavAbove') hit = mnavAt.get(b.time) >= v;
    else if (rule.type === 'mnavBelow') hit = mnavAt.get(b.time) <= v;
    else if (rule.type === 'drawdown') { peak = Math.max(peak, b.close); hit = b.close <= peak * (1 - v / 100); }
    else if (rule.type === 'belowMa200') { streak = avg[i] != null && b.close < avg[i] ? streak + 1 : 0; hit = streak >= v; }
    if (hit && prev === false) {
      const after = n => i + n < rows.length ? (rows[i + n].close / b.close - 1) * 100 : null;
      events.push({ date: b.time, close: b.close, after20: after(20), after60: after(60) });
    }
    if (hit && rule.type === 'drawdown') peak = b.close; // 触发后重新计算高点，避免同一轮下跌反复计数
    prev = hit && rule.type === 'drawdown' ? false : hit;
  });
  return { events, from: rows[0]?.time ?? null, days: rows.length };
}
function maxDrawdown(bars) { // 收盘价从高点到之后低点的最大跌幅
  let peak = -Infinity, peakTime = null, worst = { pct: 0, from: null, to: null };
  for (const b of bars) {
    if (b.close > peak) { peak = b.close; peakTime = b.time; }
    const dd = (b.close / peak - 1) * 100;
    if (dd < worst.pct) worst = { pct: dd, from: peakTime, to: b.time };
  }
  return worst;
}
const isDownside = type => ['priceBelow', 'drawdown', 'belowMa200', 'mnavBelow'].includes(type);
function planCheckup(plan, dailyMovePct, price) { // 只检查计划写全没有，不评价规则好坏
  const rules = plan.rules || [], out = [];
  out.push({ ok: !!(plan.why || '').trim(), text: '写下了当初买入的理由', tip: '想不起理由时，很难判断该不该继续拿着。' });
  out.push({ ok: rules.some(r => isDownside(r.type)), text: '有下跌时的应对规则', tip: '大跌时最难冷静思考，最好提前写下。' });
  out.push({ ok: rules.some(r => !isDownside(r.type) && r.type !== 'date'), text: '有上涨时的应对规则', tip: '涨多了也容易舍不得或太兴奋。' });
  out.push({ ok: !!plan.review, text: '定了下次复盘日期', tip: '计划不是写完就不管，情况变了要回头看。' });
  out.push({ ok: rules.length > 0 && rules.every(r => (r.note || '').trim()), text: '每条规则都写了打算怎么做', tip: '触发时能看到自己当时的想法。' });
  const tight = rules.filter(r => r.type === 'priceBelow' && price > 0 && dailyMovePct > 0 && (price - Number(r.value)) / price * 100 > 0 && (price - Number(r.value)) / price * 100 < dailyMovePct * 2);
  out.push({ ok: tight.length === 0, text: '价格规则没有离现价太近', tip: '离现价不到两天平均波动的规则，可能被日常波动触发。' });
  return out;
}

function perShareHistory(rows) { // rows 从新到旧；每股含币量和隐含股数都由官网的 satsPerShare 换算
  const asc = rows.filter(r => r.satsPerShare > 0 && r.btcHoldings > 0).map(r => ({ date: r.date, perShare: r.satsPerShare / 1e8, btc: r.btcHoldings, shares: r.btcHoldings / (r.satsPerShare / 1e8) })).reverse();
  if (!asc.length) return null;
  const first = asc[0], now = asc.at(-1), peak = asc.reduce((a, b) => b.perShare > a.perShare ? b : a);
  const change = (a, b) => (b / a - 1) * 100;
  return { asc, first, now, peak, fromPeak: change(peak.perShare, now.perShare), perShareChange: change(first.perShare, now.perShare), btcChange: change(first.btc, now.btc), sharesChange: change(first.shares, now.shares), sharesFromPeak: change(peak.shares, now.shares), btcFromPeak: change(peak.btc, now.btc) };
}

function rebaseSeries(bars, from) { // 从 from 之后的第一根 K 线算起，每天相对起点的涨跌（%）
  const part = bars.filter(b => b.time >= from);
  if (part.length < 2) return null;
  const base = part[0].close, points = part.map(b => ({ time: b.time, value: (b.close / base - 1) * 100 }));
  return { from: part[0].time, points, change: points.at(-1).value };
}
function averageSeries(list) { // 等额买入、之后不调仓：只取所有标的都有数据的日子
  const maps = list.filter(Boolean).map(s => new Map(s.points.map(p => [p.time, p.value])));
  if (!maps.length) return null;
  const points = [...maps[0].keys()].filter(t => maps.every(m => m.has(t))).sort()
    .map(time => ({ time, value: maps.reduce((s, m) => s + m.get(time), 0) / maps.length }));
  return points.length ? { points, change: points.at(-1).value } : null;
}

function qdiiStatus(row) { // 把申购状态翻成一句话，并给出排序用的“能买多少”
  const text = row.purchase_status || '';
  if (!row.buyable || /暂停/.test(text)) return { label: '暂停申购', open: false, limit: 0 };
  if (row.daily_limit > 0) return { label: `开放，每天最多 ${row.daily_limit.toLocaleString('zh-CN')} 元`, open: true, limit: row.daily_limit };
  return { label: '开放，不限额', open: true, limit: Infinity };
}

if (typeof module !== 'undefined') {
  module.exports = { sma, rsiSeries, rsi, ema, macd, crossings, correlation, beta, toWeekly, sessionOf, extendedQuote, dcaSim, summarize, closesBelowAverage, evalRule, backtestRule, maxDrawdown, isDownside, planCheckup, perShareHistory, rebaseSeries, averageSeries, qdiiStatus };
}
