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

// --- 比特币结构与量价指标（提阿非罗常用盘面体系：纯客观计算，不产生买卖建议） ---
function to4Hour(bars1h) { // 按 UTC 00/04/08/12/16/20 点归并 1 小时 K 线为 4 小时 K 线
  if (!bars1h?.length) return [];
  const out = [];
  let bucket = null;
  for (const b of bars1h) {
    const k = Math.floor(Number(b.time) / 14400) * 14400;
    if (k !== bucket) {
      bucket = k;
      out.push({ time: k, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 });
    } else {
      const cur = out.at(-1);
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume || 0;
    }
  }
  return out;
}

function volumeProfile(bars, bins = 36, vaShare = 0.70) { // 盘整区筹码分布：POC 控制点 + 70% 价值区 VAH / VAL
  if (!bars?.length) return null;
  const minP = Math.min(...bars.map(b => b.low));
  const maxP = Math.max(...bars.map(b => b.high));
  if (!(maxP > minP)) return { poc: maxP, vah: maxP, val: minP, rangeHigh: maxP, rangeLow: minP };
  const step = (maxP - minP) / bins;
  const vols = new Array(bins).fill(0);
  let total = 0;
  for (const b of bars) {
    const w = b.volume > 0 ? b.volume : 1;
    const lo = Math.max(0, Math.min(bins - 1, Math.floor((b.low - minP) / step)));
    const hi = Math.max(0, Math.min(bins - 1, Math.floor((b.high - minP) / step)));
    const share = w / (hi - lo + 1);
    for (let k = lo; k <= hi; k++) vols[k] += share;
    total += w;
  }
  let pocIdx = 0;
  for (let i = 1; i < bins; i++) if (vols[i] > vols[pocIdx]) pocIdx = i;
  let left = pocIdx, right = pocIdx, acc = vols[pocIdx];
  const target = total * vaShare;
  while (acc < target && (left > 0 || right < bins - 1)) {
    const vL = left > 0 ? vols[left - 1] : -1;
    const vR = right < bins - 1 ? vols[right + 1] : -1;
    if (vR >= vL) { right++; acc += vols[right]; }
    else { left--; acc += vols[left]; }
  }
  return {
    poc: minP + (pocIdx + 0.5) * step,
    val: minP + left * step,
    vah: minP + (right + 1) * step,
    rangeHigh: maxP,
    rangeLow: minP,
  };
}

function fibGoldenPocket(bars, lookback = 90) { // 波段斐波那契与 0.618–0.66 黄金口袋 + 1.13 假突破位
  const part = (bars || []).slice(-lookback);
  if (part.length < 5) return null;
  let hiIdx = 0, loIdx = 0;
  part.forEach((b, i) => {
    if (b.high >= part[hiIdx].high) hiIdx = i;
    if (b.low <= part[loIdx].low) loIdx = i;
  });
  const hi = part[hiIdx], lo = part[loIdx], span = hi.high - lo.low;
  if (!(span > 0)) return null;
  if (loIdx <= hiIdx) {
    const at = r => hi.high - span * r;
    return {
      dir: 'up',
      swingLow: { price: lo.low, time: lo.time },
      swingHigh: { price: hi.high, time: hi.time },
      fib382: at(0.382),
      fib500: at(0.5),
      gp618: at(0.618),
      gp660: at(0.66),
      mid: (at(0.618) + at(0.66)) / 2,
      gpLow: at(0.66),
      gpHigh: at(0.618),
      fib786: at(0.786),
      ext113: lo.low + span * 1.13,
    };
  }
  const at = r => lo.low + span * r;
  return {
    dir: 'down',
    swingHigh: { price: hi.high, time: hi.time },
    swingLow: { price: lo.low, time: lo.time },
    fib382: at(0.382),
    fib500: at(0.5),
    gp618: at(0.618),
    gp660: at(0.66),
    mid: (at(0.618) + at(0.66)) / 2,
    gpLow: at(0.618),
    gpHigh: at(0.66),
    fib786: at(0.786),
    ext113: hi.high - span * 1.13,
  };
}

function vegasTunnel(closes) { // Vegas 维加斯隧道：EMA 144/169 + 过滤线 EMA 12 + 四倍周期 EMA 576/676
  if (!closes || closes.length < 169) return null;
  const s12 = ema(closes, 12), s144 = ema(closes, 144), s169 = ema(closes, 169);
  const e144 = s144.at(-1), e169 = s169.at(-1);
  if (e144 == null || e169 == null) return null;
  const e576 = closes.length >= 576 ? ema(closes, 576).at(-1) : null;
  const e676 = closes.length >= 676 ? ema(closes, 676).at(-1) : null;
  return {
    ema12: s12.at(-1),
    ema144: e144,
    ema169: e169,
    top: Math.max(e144, e169),
    bot: Math.min(e144, e169),
    ema576: e576,
    ema676: e676,
    series144: s144,
    series169: s169,
  };
}

function findPivots(bars, lr = 3) {
  const highs = [], lows = [];
  for (let i = lr; i < bars.length - lr; i++) {
    let isHi = true, isLo = true;
    for (let k = 1; k <= lr; k++) {
      if (bars[i].high < bars[i - k].high || bars[i].high <= bars[i + k].high) isHi = false;
      if (bars[i].low > bars[i - k].low || bars[i].low >= bars[i + k].low) isLo = false;
    }
    if (isHi) highs.push({ i, time: bars[i].time, price: bars[i].high });
    if (isLo) lows.push({ i, time: bars[i].time, price: bars[i].low });
  }
  return { highs, lows };
}

function swingLiquidityAnd2B(bars, price, lr = 3, recentWindow = 8) { // 道氏结构 + 前高前低流动性池 + 2B 假突破猎杀
  if (!bars || bars.length < lr * 2 + 3) return null;
  const pNow = price ?? bars.at(-1).close;
  const { highs, lows } = findPivots(bars, lr);
  const h2 = highs.at(-1), h1 = highs.at(-2), l2 = lows.at(-1), l1 = lows.at(-2);
  let code = 'range', label = '区间震荡结构';
  if (h1 && h2 && l1 && l2) {
    if (h2.price > h1.price && l2.price > l1.price) { code = 'bull'; label = '多头结构 (HH+HL)'; }
    else if (h2.price < h1.price && l2.price < l1.price) { code = 'bear'; label = '空头结构 (LH+LL)'; }
    else if (h2.price < h1.price && l2.price > l1.price) { code = 'converge'; label = '收敛整理 (LH+HL)'; }
  }

  const recentStart = Math.max(0, bars.length - 120);
  const unbrokenHighs = highs.filter(h => h.i >= recentStart && h.price > pNow && !bars.slice(h.i + 1).some(b => b.close > h.price));
  const unbrokenLows = lows.filter(l => l.i >= recentStart && l.price < pNow && !bars.slice(l.i + 1).some(b => b.close < l.price));
  const fallbackHi = Math.max(...bars.slice(-60).map(b => b.high));
  const fallbackLo = Math.min(...bars.slice(-60).map(b => b.low));
  const abovePool = unbrokenHighs.sort((a, b) => a.price - b.price)[0] || { price: fallbackHi, time: null };
  const belowPool = unbrokenLows.sort((a, b) => b.price - a.price)[0] || { price: fallbackLo, time: null };

  const sweeps = [];
  const scanFrom = Math.max(lr + 1, bars.length - 90);
  for (let k = scanFrom; k < bars.length; k++) {
    const bk = bars[k];
    const priorH = highs.filter(h => h.i <= k - lr && k - h.i <= 55 && !bars.slice(h.i + 1, k).some(x => x.close > h.price)).at(-1);
    if (priorH && bk.high > priorH.price && bk.close < priorH.price) {
      sweeps.push({ idx: k, time: bk.time, type: 'bear_sweep', level: priorH.price, refTime: priorH.time, wick: bk.high });
    }
    const priorL = lows.filter(l => l.i <= k - lr && k - l.i <= 55 && !bars.slice(l.i + 1, k).some(x => x.close < l.price)).at(-1);
    if (priorL && bk.low < priorL.price && bk.close > priorL.price) {
      sweeps.push({ idx: k, time: bk.time, type: 'bull_sweep', level: priorL.price, refTime: priorL.time, wick: bk.low });
    }
  }
  const recentSweep = sweeps.filter(s => s.idx >= bars.length - recentWindow).at(-1) || null;
  return { code, label, abovePool, belowPool, sweeps, recentSweep, lastHigh: h2 || null, lastLow: l2 || null };
}

function unfilledGaps(cmeBars, spotBars, price) { // 未回补 CME 期货跳空缺口 & 日线 FVG 失衡区
  const pNow = price || spotBars?.at(-1)?.close || cmeBars?.at(-1)?.close || 0;
  const minGap = Math.max(80, pNow * 0.002);

  const cmeList = [];
  const cBars = (cmeBars || []).slice(-180);
  for (let i = 1; i < cBars.length; i++) {
    if (cBars[i].low > cBars[i - 1].high) {
      let low = cBars[i - 1].high, high = cBars[i].low;
      for (let j = i + 1; j < cBars.length; j++) high = Math.min(high, cBars[j].low);
      if (high - low >= minGap) cmeList.push({ dir: 'below', low, high, mid: (low + high) / 2, time: cBars[i].time });
    } else if (cBars[i].high < cBars[i - 1].low) {
      let low = cBars[i].high, high = cBars[i - 1].low;
      for (let j = i + 1; j < cBars.length; j++) low = Math.max(low, cBars[j].high);
      if (high - low >= minGap) cmeList.push({ dir: 'above', low, high, mid: (low + high) / 2, time: cBars[i].time });
    }
  }
  const dist = g => (pNow >= g.low && pNow <= g.high ? 0 : Math.min(Math.abs(pNow - g.low), Math.abs(pNow - g.high)));
  const cmeNearest = [...cmeList].sort((a, b) => dist(a) - dist(b))[0] || null;

  const fvgList = [];
  const sBars = (spotBars || []).slice(-90);
  for (let i = 2; i < sBars.length; i++) {
    if (sBars[i].low > sBars[i - 2].high) {
      let low = sBars[i - 2].high, high = sBars[i].low;
      for (let j = i + 1; j < sBars.length; j++) high = Math.min(high, sBars[j].low);
      if (high - low >= minGap) fvgList.push({ type: 'bull', low, high, mid: (low + high) / 2, time: sBars[i - 1].time });
    } else if (sBars[i].high < sBars[i - 2].low) {
      let low = sBars[i].high, high = sBars[i - 2].low;
      for (let j = i + 1; j < sBars.length; j++) low = Math.max(low, sBars[j].high);
      if (high - low >= minGap) fvgList.push({ type: 'bear', low, high, mid: (low + high) / 2, time: sBars[i - 1].time });
    }
  }
  const fvgNearest = [...fvgList].sort((a, b) => dist(a) - dist(b))[0] || null;
  return { cmeNearest, cmeCount: cmeList.length, fvgNearest, fvgCount: fvgList.length };
}

function keyOpens(dailyBars) { // 周线开盘价 (UTC 周一) / 月线开盘价 / 年线开盘价
  if (!dailyBars?.length) return null;
  const last = dailyBars.at(-1);
  const d = new Date(last.time + 'T00:00:00Z');
  const mondayIso = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  const ym = last.time.slice(0, 7), yr = last.time.slice(0, 4);
  const wBar = dailyBars.find(b => b.time >= mondayIso) || last;
  const mBar = dailyBars.find(b => b.time.startsWith(ym)) || last;
  const yBar = dailyBars.find(b => b.time.startsWith(yr)) || last;
  return {
    weeklyOpen: wBar.open,
    weeklyDate: wBar.time,
    monthlyOpen: mBar.open,
    monthlyDate: mBar.time,
    yearlyOpen: yBar.open,
    yearlyDate: yBar.time,
  };
}

function rsiDivergence(bars, lr = 3) { // 最近摆动高低点 RSI(14) 顶底背离检测
  if (!bars || bars.length < 30) return null;
  const closes = bars.map(b => b.close);
  const r = rsiSeries(closes, 14);
  const { highs, lows } = findPivots(bars, lr);
  const recentCut = bars.length - 18;
  const h2 = highs.at(-1), h1 = highs.at(-2);
  if (h1 && h2 && h2.i >= recentCut && r[h1.i] != null && r[h2.i] != null) {
    if (h2.price > h1.price && r[h2.i] <= r[h1.i] - 2 && r[h1.i] >= 58) {
      return { type: 'bear_div', label: '顶背离迹象', detail: `价格高点抬升而 RSI 由 ${r[h1.i].toFixed(0)} 降至 ${r[h2.i].toFixed(0)}`, time: h2.time };
    }
  }
  const l2 = lows.at(-1), l1 = lows.at(-2);
  if (l1 && l2 && l2.i >= recentCut && r[l1.i] != null && r[l2.i] != null) {
    if (l2.price < l1.price && r[l2.i] >= r[l1.i] + 2 && r[l1.i] <= 44) {
      return { type: 'bull_div', label: '底背离迹象', detail: `价格低点下移而 RSI 由 ${r[l1.i].toFixed(0)} 升至 ${r[l2.i].toFixed(0)}`, time: l2.time };
    }
  }
  return { type: 'none', label: '无明显背离', detail: `当前 RSI ${r.at(-1)?.toFixed(1) ?? '--'}`, time: null };
}

function tiaBtcSummary(dailyBars, livePrice, opts = {}) { // 提阿非罗常用盘面体系：小白白话解读 + 明确周期标注 + 关键价位地图
  if (!dailyBars || dailyBars.length < 30) return null;
  const p = livePrice || dailyBars.at(-1).close;
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
  const diffPct = target => {
    const v = (target / p - 1) * 100;
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  };

  const struct = swingLiquidityAnd2B(dailyBars, p, 3, 8);
  const struct4h = opts.bars4h?.length >= 30 ? swingLiquidityAnd2B(opts.bars4h, p, 3, 8) : null;
  const fib = fibGoldenPocket(dailyBars, 90);
  const vp = volumeProfile(dailyBars.slice(-90), 36, 0.70);
  const vegasD = vegasTunnel(dailyBars.map(b => b.close));
  const vegas4h = opts.bars4h?.length >= 170 ? vegasTunnel(opts.bars4h.map(b => b.close)) : null;
  const gaps = unfilledGaps(opts.cmeBars || [], dailyBars, p);
  const opens = keyOpens(dailyBars);
  const divD = rsiDivergence(dailyBars, 3);
  const div4h = opts.bars4h?.length >= 35 ? rsiDivergence(opts.bars4h, 3) : null;

  const items = [];

  // 1. 大方向与真假突破（标注：日线 + 4小时线）
  if (struct) {
    const activeSweep = struct4h?.recentSweep || struct.recentSweep;
    const sweepScope = struct4h?.recentSweep ? '4小时线' : '日线';
    const dirTitle =
      struct.code === 'bull' ? '稳步往上走' :
      struct.code === 'bear' ? '还在往下走' :
      struct.code === 'converge' ? '波动收窄，快选方向' : '区间来回拉锯';
    const dirExplain =
      struct.code === 'bull' ? '日线每次回调的低点都在抬高，整体买盘占优。' :
      struct.code === 'bear' ? '日线每次反弹的高点都比前一次低，下跌趋势还没扭转。' :
      '日线在高低区间内来回震荡，暂时没有单边大方向。';
    const shortExplain = struct4h
      ? `短线（4小时线）目前${struct4h.code === 'bull' ? '小幅反弹向上' : struct4h.code === 'bear' ? '也在同步走弱' : '横盘整理'}。`
      : '';
    const sweepExplain = activeSweep
      ? activeSweep.type === 'bull_sweep'
        ? `${sweepScope}刚跌破前低 ${fmt(activeSweep.level)} 后又拉了回来（俗称「破底翻」，下方有买盘承接）。`
        : `${sweepScope}刚冲过前高 ${fmt(activeSweep.level)} 后又跌了回来（俗称「假突破」，追高容易被套）。`
      : `往下先看前低防守位 ${fmt(struct.belowPool.price)}（${diffPct(struct.belowPool.price)}），往上留意前高压力位 ${fmt(struct.abovePool.price)}（${diffPct(struct.abovePool.price)}）。`;

    const tfs = [{ label: '日线', cls: 'day' }];
    if (struct4h) tfs.push({ label: '4小时线', cls: 'h4' });

    items.push({
      key: 'structure',
      title: '大方向怎么走？',
      tfs,
      badge: activeSweep ? (activeSweep.type === 'bull_sweep' ? '刚现「破底翻」' : '刚现「假突破」') : (struct.code === 'bull' ? '买方占优' : struct.code === 'bear' ? '卖方占优' : '多空拉锯'),
      tone: activeSweep ? (activeSweep.type === 'bull_sweep' ? 'bull' : 'bear') : struct.code === 'bull' ? 'bull' : struct.code === 'bear' ? 'bear' : 'neutral',
      value: dirTitle,
      detail: `${dirExplain}${shortExplain}${sweepExplain}`,
      term: '对应概念：道氏高低点结构 · 2B 假突破',
    });
  }

  // 2. 反弹/回调的黄金关口（标注：日线 · 近3月波段）
  if (fib) {
    const inPocket = p >= fib.gpLow && p <= fib.gpHigh;
    const midGp = (fib.gpLow + fib.gpHigh) / 2;
    let status, tone = 'neutral', explain;
    if (fib.dir === 'up') {
      if (inPocket) { status = '正考验黄金支撑'; tone = 'warn'; }
      else if (p > fib.gpHigh) { status = '稳在黄金支撑上方'; tone = 'bull'; }
      else { status = '已跌破黄金支撑'; tone = 'bear'; }
      explain = `这波日线从 ${fmt(fib.swingLow.price)} 涨到 ${fmt(fib.swingHigh.price)} 后，回吐约三分之二涨幅的支撑带就在这里（距现价 ${diffPct(midGp)}），通常是买盘容易接力的位置。`;
    } else {
      if (inPocket) { status = '正撞上黄金压力'; tone = 'warn'; }
      else if (p > fib.gpHigh) { status = '已越过黄金压力'; tone = 'bull'; }
      else { status = '还在黄金压力下方'; tone = 'bear'; }
      explain = `这波日线从 ${fmt(fib.swingHigh.price)} 跌到 ${fmt(fib.swingLow.price)} 后，往上修复约三分之二跌幅的位置就在这里（距现价 ${diffPct(midGp)}），套牢盘常在此处卖出，是反弹最关键的一道坎。`;
    }
    items.push({
      key: 'fib',
      title: fib.dir === 'up' ? '往下回调哪儿有支撑？' : '往上反弹哪儿容易卡住？',
      tfs: [{ label: '日线 · 近3月波段', cls: 'day' }],
      badge: status,
      tone,
      value: `${fmt(fib.gpLow)} – ${fmt(fib.gpHigh)}`,
      detail: explain,
      term: '对应概念：斐波那契 0.618–0.66 黄金口袋',
    });
  }

  // 3. 大家买卖最集中的价格（标注：日线 · 近3月筹码）
  if (vp) {
    let vpBadge, vpTone = 'neutral', vpNote;
    if (p > vp.vah) {
      vpBadge = '站上密集区上方';
      vpTone = 'bull';
      vpNote = `现价已站到大多数人的换手成本区（${fmt(vp.val)}–${fmt(vp.vah)}）上方，回踩不跌回 ${fmt(vp.vah)} 就算强势。`;
    } else if (p < vp.val) {
      vpBadge = '跌在密集区下方';
      vpTone = 'bear';
      vpNote = `过去三个月 70% 的成交都在 ${fmt(vp.val)}–${fmt(vp.vah)}。现价跌出了这片区域，往上涨回时容易遇到解套卖盘。`;
    } else {
      vpBadge = '正在密集区换手';
      vpNote = `过去三个月 70% 的成交都在 ${fmt(vp.val)}–${fmt(vp.vah)}，现价就在里面震荡，中心价 ${fmt(vp.poc)} 像磁铁一样容易反复吸引价格靠近。`;
    }
    items.push({
      key: 'vp',
      title: '大家成交最集中的价格在哪？',
      tfs: [{ label: '日线 · 近3月筹码', cls: 'day' }],
      badge: vpBadge,
      tone: vpTone,
      value: `${fmt(vp.poc)} 附近`,
      detail: vpNote,
      term: '对应概念：筹码密集控制点 POC 与价值区',
    });
  }

  // 4. 长短期成本线与周末缺口（标注：日线 + 周线 + 期货日线）
  if (vegasD && opens) {
    const cg = gaps.cmeNearest;
    const aboveD = p > vegasD.top, belowD = p < vegasD.bot;
    const aboveW = p >= opens.weeklyOpen;
    const activeDiv = (div4h && div4h.type !== 'none' ? { ...div4h, tf: '4小时线' } : null) || (divD && divD.type !== 'none' ? { ...divD, tf: '日线' } : null);

    const tfs = [
      { label: '日线', cls: 'day' },
      { label: '周线', cls: 'week' },
    ];
    if (cg) tfs.push({ label: '期货日线', cls: 'h4' });

    items.push({
      key: 'levels',
      title: '均价分界线 & 周末跳空缺口',
      tfs,
      badge: aboveD && aboveW ? '站稳均价上方' : belowD && !aboveW ? '压在均价下方' : '长短分界交织',
      tone: aboveD && aboveW ? 'bull' : belowD && !aboveW ? 'bear' : 'warn',
      value: `半年线 ${fmt(vegasD.bot)} · 周开盘 ${fmt(opens.weeklyOpen)}`,
      detail:
        `日线半年趋势带在 ${fmt(vegasD.bot)}（现价在它${aboveD ? '上方，中长期偏强' : belowD ? '下方，中长期偏弱' : '附近争夺'}）` +
        (vegas4h ? `，4小时线趋势带在 ${fmt(vegas4h.bot)}；` : `；`) +
        `周线本周开盘价 ${fmt(opens.weeklyOpen)}（${aboveW ? '本周买方占优' : '本周卖方占优'}）。` +
        (cg ? `另外期货日线在 ${fmt(cg.low)}–${fmt(cg.high)} 留有周末未补缺口（距现价 ${diffPct(cg.mid)}），常有回补引力。` : '') +
        (activeDiv ? `${activeDiv.tf}出现${activeDiv.type === 'bull_div' ? '跌势放缓（底背离）' : '涨势放缓（顶背离）'}迹象。` : ''),
      term: '对应概念：Vegas 隧道 · 周线开盘价 · CME 缺口',
    });
  }

  // 生成一目了然的「关键价位尺」节点（从低到高排序）
  const rawPoints = [
    struct?.belowPool?.price ? { label: '前低防守', tf: '日线', price: struct.belowPool.price, kind: 'support' } : null,
    gaps?.cmeNearest ? { label: '周末缺口', tf: '期货日线', price: gaps.cmeNearest.mid, kind: 'gap' } : null,
    { label: '当前现价', tf: '实时', price: p, kind: 'current' },
    opens?.weeklyOpen ? { label: '本周开盘', tf: '周线', price: opens.weeklyOpen, kind: 'week' } : null,
    vegasD ? { label: '半年趋势带', tf: '日线', price: vegasD.ema144, kind: 'vegas' } : null,
    fib ? { label: fib.dir === 'up' ? '黄金支撑' : '黄金关口', tf: '日线', price: (fib.gpLow + fib.gpHigh) / 2, kind: 'fib' } : null,
    vp ? { label: '成交最密区', tf: '日线', price: vp.poc, kind: 'vp' } : null,
    struct?.abovePool?.price ? { label: '前高压力', tf: '日线', price: struct.abovePool.price, kind: 'resist' } : null,
  ].filter(x => x && x.price > 0).sort((a, b) => a.price - b.price);

  const minMap = rawPoints[0]?.price || p * 0.9;
  const maxMap = rawPoints.at(-1)?.price || p * 1.1;
  const spanMap = Math.max(1, maxMap - minMap);
  const mapPoints = rawPoints.map(pt => ({
    ...pt,
    posPct: Math.min(98, Math.max(2, ((pt.price - minMap) / spanMap) * 96 + 2)),
    diffText: pt.kind === 'current' ? '当前位置' : diffPct(pt.price),
  }));

  // 一句话白话总结
  const dirWord = struct?.code === 'bull' ? '大方向往上走（日线）' : struct?.code === 'bear' ? '大方向还在往下走（日线）' : '大方向在区间里拉锯（日线）';
  const supportWord = struct?.belowPool?.price ? `下方最近的防守位在 ${fmt(struct.belowPool.price)}` : '';
  const resistWord = fib ? `${fib.dir === 'up' ? '回调重点看' : '往上反弹的关键大坎在'} ${fmt(fib.gpLow)}–${fmt(fib.gpHigh)}（黄金区间）` : '';
  const headline = [dirWord, `现价 ${fmt(p)}`, supportWord, resistWord].filter(Boolean).join('，') + '。';

  return {
    price: p,
    headline,
    items,
    mapPoints,
    struct,
    struct4h,
    fib,
    vp,
    vegasD,
    vegas4h,
    gaps,
    opens,
    divD,
    div4h,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    sma, rsiSeries, rsi, ema, macd, crossings, correlation, beta, toWeekly, sessionOf, extendedQuote, dcaSim, summarize,
    closesBelowAverage, evalRule, backtestRule, maxDrawdown, isDownside, planCheckup, perShareHistory, rebaseSeries, averageSeries, qdiiStatus,
    to4Hour, volumeProfile, fibGoldenPocket, vegasTunnel, findPivots, swingLiquidityAnd2B, unfilledGaps, keyOpens, rsiDivergence, tiaBtcSummary,
  };
}
