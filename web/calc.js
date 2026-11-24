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

function tiaBtcSummary(dailyBars, livePrice, opts = {}) { // 汇总提阿非罗视频 7 大常用指标与盘面文字解读
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
  const rsiD = rsi(dailyBars.map(b => b.close));
  const rsi4 = opts.bars4h?.length >= 20 ? rsi(opts.bars4h.map(b => b.close)) : null;

  const items = [];

  // 1. 道氏结构 + 前高前低流动性 + 2B 假突破猎杀
  if (struct) {
    const activeSweep = struct4h?.recentSweep || struct.recentSweep;
    const sweepScope = struct4h?.recentSweep ? '4H' : '日线';
    const sweepTxt = activeSweep
      ? activeSweep.type === 'bull_sweep'
        ? `${sweepScope}出现向下假突破收回（刺破前低 ${fmt(activeSweep.level)} 后收回，扫多头止损）`
        : `${sweepScope}出现向上假突破回落（刺破前高 ${fmt(activeSweep.level)} 后跌回，扫空头止损）`
      : `近几根 K 线未见明显 2B 假突破；上方前高流动性 ${fmt(struct.abovePool.price)}（${diffPct(struct.abovePool.price)}），下方前低流动性 ${fmt(struct.belowPool.price)}（${diffPct(struct.belowPool.price)}）`;
    items.push({
      key: 'structure',
      title: '市场结构 & 流动性猎杀',
      badge: activeSweep ? (activeSweep.type === 'bull_sweep' ? '破底翻收回' : '假突破回落') : struct.label,
      tone: activeSweep ? (activeSweep.type === 'bull_sweep' ? 'bull' : 'bear') : struct.code === 'bull' ? 'bull' : struct.code === 'bear' ? 'bear' : 'neutral',
      value: `前高 ${fmt(struct.abovePool.price)} / 前低 ${fmt(struct.belowPool.price)}`,
      detail: `${struct.label}${struct4h ? ` · 4H ${struct4h.label}` : ''}。${sweepTxt}。`,
    });
  }

  // 2. 斐波那契 0.618–0.66 黄金口袋
  if (fib) {
    const inPocket = p >= fib.gpLow && p <= fib.gpHigh;
    let status, tone = 'neutral';
    if (fib.dir === 'up') {
      if (inPocket) { status = '正测试回调黄金口袋'; tone = 'warn'; }
      else if (p > fib.gpHigh) { status = '位于黄金口袋上方'; tone = 'bull'; }
      else { status = '跌破 0.66 深回调区'; tone = 'bear'; }
    } else {
      if (inPocket) { status = '正测试反弹黄金口袋'; tone = 'warn'; }
      else if (p > fib.gpHigh) { status = '已收复反弹 0.66'; tone = 'bull'; }
      else { status = '受制于反弹 0.618 下方'; tone = 'bear'; }
    }
    items.push({
      key: 'fib',
      title: '0.618–0.66 黄金口袋',
      badge: status,
      tone,
      value: `${fmt(fib.gpLow)} – ${fmt(fib.gpHigh)}`,
      detail: `按近 90 日${fib.dir === 'up' ? `低点 ${fmt(fib.swingLow.price)} → 高点 ${fmt(fib.swingHigh.price)} 回调` : `高点 ${fmt(fib.swingHigh.price)} → 低点 ${fmt(fib.swingLow.price)} 反弹`}测算：0.5 中轴 ${fmt(fib.fib500)}，0.786 位 ${fmt(fib.fib786)}，1.13 扩展位 ${fmt(fib.ext113)}。`,
    });
  }

  // 3. 筹码分布盘整区 POC / VAH / VAL
  if (vp) {
    let vpBadge, vpTone = 'neutral', vpNote;
    if (p > vp.vah) {
      vpBadge = '脱离价值区上沿 (VAH 上方)';
      vpTone = 'bull';
      vpNote = `站上 70% 筹码上沿 VAH，回踩 ${fmt(vp.vah)} 不破偏强；若跌回 VAH 内则防假突破回测 POC ${fmt(vp.poc)}。`;
    } else if (p < vp.val) {
      vpBadge = '跌出价值区下沿 (VAL 下方)';
      vpTone = 'bear';
      vpNote = `位于 70% 筹码下沿 VAL 下方；若迅速收回 ${fmt(vp.val)} 之上构成下沿假突破，第一目标常看 POC ${fmt(vp.poc)}。`;
    } else if (p >= vp.poc) {
      vpBadge = '盘整价值区上半区';
      vpNote = `处于 VAL–VAH 价值区内、控制点 POC 上方；上沿阻力 VAH ${fmt(vp.vah)}（${diffPct(vp.vah)}），中心磁吸位 POC ${fmt(vp.poc)}。`;
    } else {
      vpBadge = '盘整价值区下半区';
      vpNote = `处于 VAL–VAH 价值区内、控制点 POC 下方；中心磁吸位 POC ${fmt(vp.poc)}（${diffPct(vp.poc)}），下沿支撑 VAL ${fmt(vp.val)}。`;
    }
    items.push({
      key: 'vp',
      title: '盘整区筹码 POC / VAH / VAL',
      badge: vpBadge,
      tone: vpTone,
      value: `POC ${fmt(vp.poc)}`,
      detail: `VAH ${fmt(vp.vah)} · POC ${fmt(vp.poc)} · VAL ${fmt(vp.val)}（近 90 日 70% 成交密集区）。${vpNote}`,
    });
  }

  // 4. Vegas 维加斯隧道 (EMA 144/169)
  if (vegasD) {
    const dState = p > vegasD.top ? '上方' : p < vegasD.bot ? '下方' : '隧道内';
    const hState = vegas4h ? (p > vegas4h.top ? '上方' : p < vegas4h.bot ? '下方' : '隧道内') : null;
    const bothBull = p > vegasD.top && (!vegas4h || p > vegas4h.top);
    const bothBear = p < vegasD.bot && (!vegas4h || p < vegas4h.bot);
    items.push({
      key: 'vegas',
      title: 'Vegas 维加斯隧道 (144/169)',
      badge: bothBull ? '双周期隧道上方' : bothBear ? '双周期隧道下方' : `日线${dState}${hState ? ` · 4H${hState}` : ''}`,
      tone: bothBull ? 'bull' : bothBear ? 'bear' : 'warn',
      value: `日线 ${fmt(vegasD.bot)}–${fmt(vegasD.top)}`,
      detail: `日线 EMA144/169 位于 ${fmt(vegasD.bot)}–${fmt(vegasD.top)}（过滤线 EMA12 ${fmt(vegasD.ema12)}）` +
        (vegas4h ? `；4H 隧道位于 ${fmt(vegas4h.bot)}–${fmt(vegas4h.top)}` : '') +
        (vegasD.ema576 && vegasD.ema676 ? `；大级别 576/676 位于 ${fmt(Math.min(vegasD.ema576, vegasD.ema676))}–${fmt(Math.max(vegasD.ema576, vegasD.ema676))}。` : '。'),
    });
  }

  // 5. CME 期货缺口 & 日线 FVG 失衡区
  const cg = gaps.cmeNearest;
  const fg = gaps.fvgNearest;
  items.push({
    key: 'gaps',
    title: 'CME 期货缺口 & FVG 失衡区',
    badge: cg ? `${cg.dir === 'above' ? '上方' : '下方'}有未补 CME 缺口` : fg ? '存在日线 FVG' : '邻近无明显缺口',
    tone: cg ? 'warn' : 'neutral',
    value: cg ? `${fmt(cg.low)}–${fmt(cg.high)}` : fg ? `FVG ${fmt(fg.low)}–${fmt(fg.high)}` : '近期缺口已回补',
    detail: (cg ? `最近未回补 CME 期货缺口：${fmt(cg.low)}–${fmt(cg.high)}（${cg.time}，距现价 ${diffPct(cg.mid)}，具磁吸参考）。` : '近半年 CME 期货无邻近未补跳空缺口。') +
      (fg ? ` 最近未补日线${fg.type === 'bull' ? '多头' : '空头'} FVG：${fmt(fg.low)}–${fmt(fg.high)}（${fg.time}）。` : ''),
  });

  // 6. 周线 / 月线 / 年线开盘价锚点
  if (opens) {
    const aboveW = p >= opens.weeklyOpen, aboveM = p >= opens.monthlyOpen;
    items.push({
      key: 'opens',
      title: '周 / 月 / 年开盘价分水岭',
      badge: aboveW && aboveM ? '站稳周·月开盘上方' : !aboveW && !aboveM ? '位于周·月开盘下方' : aboveW ? '周线上涨 · 月线水下' : '月线上涨 · 本周回落',
      tone: aboveW && aboveM ? 'bull' : !aboveW && !aboveM ? 'bear' : 'neutral',
      value: `周开 ${fmt(opens.weeklyOpen)} (${diffPct(opens.weeklyOpen)})`,
      detail: `本周开盘 ${fmt(opens.weeklyOpen)}（${p >= opens.weeklyOpen ? '多头占优' : '偏弱压制'}），本月开盘 ${fmt(opens.monthlyOpen)}（${diffPct(opens.monthlyOpen)}），今年开盘 ${fmt(opens.yearlyOpen)}（${diffPct(opens.yearlyOpen)}）。`,
    });
  }

  // 7. RSI 背离与量能确认
  const activeDiv = (div4h && div4h.type !== 'none' ? { ...div4h, tf: '4H' } : null) || (divD && divD.type !== 'none' ? { ...divD, tf: '日线' } : null);
  const volAvg20 = sma(dailyBars.map(b => b.volume), 20).at(-2) || 1;
  const volRatio = dailyBars.at(-1).volume / volAvg20;
  items.push({
    key: 'momentum',
    title: '动量背离 & 量价配合',
    badge: activeDiv ? `${activeDiv.tf}${activeDiv.label}` : `日 RSI ${rsiD?.toFixed(0) ?? '--'}${rsi4 != null ? ` · 4H ${rsi4.toFixed(0)}` : ''}`,
    tone: activeDiv ? (activeDiv.type === 'bull_div' ? 'bull' : 'bear') : 'neutral',
    value: `RSI ${rsiD?.toFixed(1) ?? '--'} · 量比 ${volRatio.toFixed(2)}x`,
    detail: (activeDiv ? `${activeDiv.tf}${activeDiv.label}（${activeDiv.detail}）。` : `日线与 4H 近期未见明显 RSI 顶底背离${rsi4 != null ? `（4H RSI ${rsi4.toFixed(1)}）` : ''}。`) +
      ` 当日成交额约为前 20 日均量的 ${volRatio.toFixed(2)} 倍。`,
  });

  const headline = [
    struct ? `BTC 当前呈${struct.label}` : '',
    vp ? (p > vp.vah ? `脱离盘整价值区上沿 VAH (${fmt(vp.vah)})` : p < vp.val ? `位于价值区下沿 VAL (${fmt(vp.val)}) 下方` : `处于盘整价值区内（POC ${fmt(vp.poc)}）`) : '',
    vegasD ? `日线 Vegas 隧道${p > vegasD.top ? '上方托底' : p < vegasD.bot ? '下方承压' : '区间内测试'}` : '',
    fib ? `0.618–0.66 黄金口袋位于 ${fmt(fib.gpLow)}–${fmt(fib.gpHigh)}` : '',
    struct ? `上方留意前高 ${fmt(struct.abovePool.price)}、下方留意前低 ${fmt(struct.belowPool.price)} 的关键位反应` : '',
  ].filter(Boolean).join('，') + '。';

  return {
    price: p,
    headline,
    items,
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
