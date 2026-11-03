// 计算的预期值都是手算的，避免测试只是在重复代码本身。
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../web/calc.js');

const close = (actual, expected, digits = 6) => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} != ${expected}`);

test('sma：数据不足时为空，之后是移动平均', () => {
  assert.deepEqual(calc.sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
});

test('ema：用前 n 个的平均值起步', () => {
  assert.deepEqual(calc.ema([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('rsi：只涨为 100，只跌为 0，数据不足为空', () => {
  const up = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(calc.rsi(up), 100);
  close(calc.rsi([...up].reverse()), 0);
  assert.equal(calc.rsi([1, 2, 3]), null);
});

test('rsi：涨跌幅相等时为 50', () => {
  const zigzag = Array.from({ length: 15 }, (_, i) => (i % 2 ? 11 : 10));
  close(calc.rsi(zigzag), 50);
});

test('macd：价格不变时全为 0，上涨时快线在慢线上方', () => {
  const flat = calc.macd(Array(60).fill(100));
  assert.equal(flat.line.at(-1), 0);
  assert.equal(flat.hist.at(-1), 0);
  const rising = calc.macd(Array.from({ length: 60 }, (_, i) => 100 + i));
  assert.ok(rising.line.at(-1) > 0);
  assert.equal(rising.line[24], null);
});

test('crossings：能找出金叉和死叉', () => {
  const bars = [1, 2, 3, 4, 5].map(time => ({ time }));
  const found = calc.crossings([1, 2, 3, 2, 1], [2, 2, 2, 2, 2], bars);
  assert.deepEqual(found.map(c => [c.type, c.time]), [['gold', 3], ['dead', 5]]);
});

test('correlation：完全同向为 1，完全反向为 -1', () => {
  close(calc.correlation([1, 2, 3], [2, 4, 6]), 1);
  close(calc.correlation([1, 2, 3], [6, 4, 2]), -1);
});

test('beta：b 变动 1，a 变动 2 时为 2', () => {
  close(calc.beta([0.02, -0.04, 0.06], [0.01, -0.02, 0.03]), 2);
  close(calc.beta([-0.01, 0.02, -0.03], [0.01, -0.02, 0.03]), -1);
});

test('toWeekly：按周一分组，合并高低价和成交量', () => {
  const weeks = calc.toWeekly([
    { time: '2026-10-26', open: 1, high: 5, low: 1, close: 2, volume: 1 },
    { time: '2026-10-30', open: 2, high: 9, low: 0, close: 3, volume: 2 },
    { time: '2026-11-02', open: 4, high: 4, low: 4, close: 4, volume: 3 },
  ]);
  assert.deepEqual(weeks[0], { time: '2026-10-26', open: 1, high: 9, low: 0, close: 3, volume: 3 });
  assert.equal(weeks.length, 2);
});

const PERIODS = { pre: { start: 100, end: 200 }, regular: { start: 200, end: 300 }, post: { start: 300, end: 400 } };

test('sessionOf：边界时间归到正确的时段', () => {
  const keys = [50, 100, 199, 200, 299, 300, 399, 400].map(t => calc.sessionOf(t, PERIODS).key);
  assert.deepEqual(keys, ['wait', 'pre', 'pre', 'regular', 'regular', 'post', 'post', 'done']);
});

test('extendedQuote：只取当前时段的报价', () => {
  const points = [{ time: 150, close: 10 }, { time: 350, close: 12 }];
  const pre = calc.extendedQuote(calc.sessionOf(160, PERIODS), PERIODS, points.slice(0, 1), 8);
  assert.equal(pre.label, '盘前');
  close(pre.change, 25);
  assert.equal(calc.extendedQuote(calc.sessionOf(250, PERIODS), PERIODS, points, 8), null);
  assert.equal(calc.extendedQuote(calc.sessionOf(50, PERIODS), PERIODS, [], 8), null);
  assert.equal(calc.extendedQuote(calc.sessionOf(350, PERIODS), PERIODS, points, 8).price, 12);
});

test('dcaSim：每月买一次，算对均价、盈亏和最深亏损', () => {
  const bars = [
    { time: '2026-01-02', close: 10 },
    { time: '2026-01-05', close: 20 },
    { time: '2026-02-02', close: 5 },
    { time: '2026-03-02', close: 20 },
  ];
  const r = calc.dcaSim(bars, 100, 1, 20);
  assert.equal(r.count, 3);
  assert.equal(r.spent, 300);
  close(r.units, 35);
  close(r.avg, 300 / 35);
  close(r.value, 700);
  close(r.pl, 700 / 300 - 1);
  close(r.worst, -0.25);
  assert.equal(calc.dcaSim([], 100, 1, 20), null);
});

test('summarize：忽略空值，找出最高、最低和平均', () => {
  const rows = [{ date: 'c', v: 2 }, { date: 'b', v: null }, { date: 'a', v: 4 }, { date: 'z', v: 1 }];
  const s = calc.summarize(rows, 'v');
  assert.equal(s.now, 2);
  assert.equal(s.hi.date, 'a');
  assert.equal(s.lo.date, 'z');
  close(s.avg, 7 / 3);
  assert.equal(calc.summarize([{ date: 'a', v: null }], 'v'), null);
});

const seq = closes => closes.map((close, i) => ({ time: `2026-01-${String(i + 1).padStart(2, '0')}`, close }));

test('evalRule：价格、mNAV 和日期规则', () => {
  const ctx = { price: 100, bars: [], mnav: 1.2, today: '2026-11-02' };
  assert.equal(calc.evalRule({ type: 'priceAbove', value: 100 }, ctx), true);
  assert.equal(calc.evalRule({ type: 'priceBelow', value: 99 }, ctx), false);
  assert.equal(calc.evalRule({ type: 'mnavBelow', value: 1.2 }, ctx), true);
  assert.equal(calc.evalRule({ type: 'mnavAbove', value: 1 }, { ...ctx, mnav: null }), false);
  assert.equal(calc.evalRule({ type: 'date', value: '2026-11-02' }, ctx), true);
  assert.equal(calc.evalRule({ type: 'date', value: '2026-11-03' }, ctx), false);
});

test('evalRule：回撤只从规则创建之后的高点算', () => {
  const bars = [{ time: '2026-01-01', close: 200 }, { time: '2026-02-01', close: 100 }, { time: '2026-03-01', close: 90 }];
  const rule = { type: 'drawdown', value: 20, created: '2026-02-01' };
  assert.equal(calc.evalRule(rule, { price: 81, bars }), false);
  assert.equal(calc.evalRule(rule, { price: 80, bars }), true);
});

test('closesBelowAverage：连续低于 200 日线才算', () => {
  const up = Array.from({ length: 200 }, () => 100);
  assert.equal(calc.closesBelowAverage([...up, 50, 50, 50], 3), true);
  assert.equal(calc.closesBelowAverage([...up, 50, 500, 50], 3), false);
  assert.equal(calc.closesBelowAverage([50, 50], 2), false);
});

test('backtestRule：只记录从不满足变成满足的那天，并算后续涨跌', () => {
  const r = calc.backtestRule({ type: 'priceAbove', value: 10 }, seq([5, 11, 12, 5, 11]));
  assert.deepEqual(r.events.map(e => e.date), ['2026-01-02', '2026-01-05']);
  assert.equal(r.days, 5);
  assert.equal(r.events[0].after20, null);
  const long = calc.backtestRule({ type: 'priceBelow', value: 5 }, seq([10, 4, ...Array(24).fill(8)]));
  close(long.events[0].after20, 100);
  assert.equal(long.events[0].after60, null);
});

test('backtestRule：一开始就满足的不算触发，日期规则不回看', () => {
  assert.deepEqual(calc.backtestRule({ type: 'priceAbove', value: 1 }, seq([5, 6])).events, []);
  assert.equal(calc.backtestRule({ type: 'date', value: '2026-01-01' }, seq([5])), null);
});

test('backtestRule：回撤触发后重新计高点，不重复计数', () => {
  const r = calc.backtestRule({ type: 'drawdown', value: 50 }, seq([100, 50, 40, 30, 15]));
  assert.deepEqual(r.events.map(e => e.close), [50, 15]);
});

test('backtestRule：mNAV 规则只看有数据的日子', () => {
  const r = calc.backtestRule({ type: 'mnavBelow', value: 1 }, seq([5, 5, 5, 5]), [
    { date: '2026-01-02', mNav: 1.2 }, { date: '2026-01-03', mNav: 0.9 }, { date: '2026-01-04', mNav: null },
  ]);
  assert.equal(r.days, 2);
  assert.deepEqual(r.events.map(e => e.date), ['2026-01-03']);
});

test('maxDrawdown：找出最大跌幅和起止日', () => {
  const w = calc.maxDrawdown(seq([100, 50, 200, 40, 120]));
  close(w.pct, -80);
  assert.equal(w.from, '2026-01-03');
  assert.equal(w.to, '2026-01-04');
  assert.equal(calc.maxDrawdown(seq([1, 2, 3])).pct, 0);
});

test('planCheckup：能指出缺什么，也能发现太近的价格规则', () => {
  const none = calc.planCheckup({ rules: [] }, 4, 100);
  assert.equal(none.filter(c => c.ok).length, 1);
  const full = calc.planCheckup({ why: '长期看好', review: '2027-01-01', rules: [
    { type: 'priceBelow', value: 50, note: '减仓' }, { type: 'priceAbove', value: 200, note: '卖一部分' },
  ] }, 4, 100);
  assert.ok(full.every(c => c.ok));
  const tight = calc.planCheckup({ rules: [{ type: 'priceBelow', value: 95, note: 'x' }] }, 4, 100);
  assert.equal(tight.at(-1).ok, false);
});

test('perShareHistory：持币和股数都变时，算对每股含币量和变化', () => {
  const r = calc.perShareHistory([
    { date: 'c', satsPerShare: 150000, btcHoldings: 300 },
    { date: 'x', satsPerShare: null, btcHoldings: 300 },
    { date: 'b', satsPerShare: 200000, btcHoldings: 200 },
    { date: 'a', satsPerShare: 100000, btcHoldings: 100 },
  ]);
  assert.equal(r.asc.length, 3);
  close(r.now.perShare, 0.0015);
  close(r.first.shares, 100000);
  close(r.now.shares, 200000);
  close(r.perShareChange, 50);
  close(r.btcChange, 200);
  close(r.sharesChange, 100);
  assert.equal(r.peak.date, 'b');
  close(r.fromPeak, -25);
  close(r.sharesFromPeak, 100);
  assert.equal(calc.perShareHistory([{ date: 'a', btcHoldings: 1 }]), null);
});

test('rebaseSeries：从起点后的第一根 K 线算涨跌', () => {
  const bars = [{ time: '2026-01-01', close: 50 }, { time: '2026-01-05', close: 100 }, { time: '2026-01-06', close: 150 }];
  const r = calc.rebaseSeries(bars, '2026-01-02');
  assert.equal(r.from, '2026-01-05');
  assert.deepEqual(r.points.map(p => p.value), [0, 50]);
  close(r.change, 50);
  assert.equal(calc.rebaseSeries(bars, '2026-01-06'), null);
});

test('averageSeries：只平均大家都有数据的日子', () => {
  const a = { points: [{ time: '1', value: 0 }, { time: '2', value: 10 }, { time: '3', value: 20 }] };
  const b = { points: [{ time: '1', value: 0 }, { time: '3', value: -20 }] };
  const r = calc.averageSeries([a, null, b]);
  assert.deepEqual(r.points, [{ time: '1', value: 0 }, { time: '3', value: 0 }]);
  assert.equal(r.change, 0);
  assert.equal(calc.averageSeries([null]), null);
});

test('qdiiStatus：区分暂停、限额和不限额', () => {
  assert.deepEqual(calc.qdiiStatus({ buyable: false, purchase_status: '暂停申购' }), { label: '暂停申购', open: false, limit: 0 });
  assert.equal(calc.qdiiStatus({ buyable: true, purchase_status: '暂停大额申购' }).open, false);
  const small = calc.qdiiStatus({ buyable: true, purchase_status: '限大额(单日投资上限10元)', daily_limit: 10 });
  assert.equal(small.open, true);
  assert.equal(small.limit, 10);
  assert.equal(calc.qdiiStatus({ buyable: true, purchase_status: '开放申购', daily_limit: null }).limit, Infinity);
});
