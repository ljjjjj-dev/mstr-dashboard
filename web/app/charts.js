import { MAG7_LIST, MAG_BTC_ITEM, MAG_CN_LIST, MAG_EXTRA_LIST, MAG_LEAD_LIST } from './store.js';

const { LightweightCharts, sma, rsiSeries, macd, crossings, toWeekly, dcaSim, summarize, perShareHistory, rebaseSeries } = window;

export const VIEWS = {
  day: { short: 50, mid: 100, long: 200, name: '日' },
  week: { short: 10, mid: 20, long: 40, name: '周' },
};

export const MA_KEYS = [
  ['short', '--ma-short'],
  ['mid', '--ma-mid'],
  ['long', '--ma-long'],
];

const MAG_ALL = [...MAG7_LIST, ...MAG_LEAD_LIST, ...MAG_EXTRA_LIST, MAG_BTC_ITEM, ...MAG_CN_LIST];
const MAG_BOLD = new Set(['MSTR', 'BMNR']);

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function baseOptions(extra = {}) {
  return {
    autoSize: true,
    layout: {
      background: { color: 'transparent' },
      textColor: css('--text-tertiary'),
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
      fontSize: 11,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: css('--grid') },
      horzLines: { color: css('--grid') },
    },
    crosshair: {
      vertLine: { color: css('--text-muted'), labelBackgroundColor: css('--card-subtle') },
      horzLine: { color: css('--text-muted'), labelBackgroundColor: css('--card-subtle') },
    },
    rightPriceScale: { borderColor: css('--chart-line') },
    timeScale: { borderColor: css('--chart-line') },
    localization: { dateFormat: 'yyyy-MM-dd', locale: 'zh-CN' },
    ...extra,
  };
}

function linkRange(from, to, lock) {
  from.timeScale().subscribeVisibleLogicalRangeChange((r) => {
    if (!r || lock.syncing) return;
    lock.syncing = true;
    try {
      to.timeScale().setVisibleLogicalRange(r);
    } finally {
      lock.syncing = false;
    }
  });
}

export class ChartManager {
  constructor() {
    this.mstr = null;
    this.btc = null;
    this.mnav = null;
    this.ps = null;
    this.mag = null;
    this.dca = null;
    this.costLine = null;
    this.lastDrawKeys = {};
  }

  ensureChartsForTab(tab, callbacks, layoutMode) {
    if (tab === 'charts') {
      if (layoutMode === 'mstr' || layoutMode === 'dual') this.initMstr(callbacks);
      if (layoutMode === 'btc' || layoutMode === 'dual') this.initBtc(callbacks);
    } else if (tab === 'valuation') {
      this.initMnav();
      this.initPs();
    } else if (tab === 'compare') {
      this.initMag();
      this.initDca();
    }
  }

  resizeForTab(tab) {
    requestAnimationFrame(() => {
      const pairs = [];
      if (tab === 'charts') {
        if (this.mstr) pairs.push([this.mstr.chart, 'chart'], [this.mstr.sub, 'sub']);
        if (this.btc) pairs.push([this.btc.chart, 'bChart']);
      } else if (tab === 'valuation') {
        if (this.mnav) pairs.push([this.mnav.chart, 'mnavChart']);
        if (this.ps) pairs.push([this.ps.chart, 'psChart']);
      } else if (tab === 'compare') {
        if (this.mag) pairs.push([this.mag.chart, 'magChart']);
        if (this.dca) pairs.push([this.dca.chart, 'dcaChart']);
      }
      for (const [inst, id] of pairs) {
        const el = document.getElementById(id);
        if (el && el.clientWidth > 0 && el.clientHeight > 0) {
          inst.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        }
      }
      if (tab === 'charts' && this.mstr) {
        const r = this.mstr.chart.timeScale().getVisibleLogicalRange();
        if (r) this.mstr.sub.timeScale().setVisibleLogicalRange(r);
      }
    });
  }

  initMstr({ onOhlc }) {
    if (this.mstr) return;
    const el = document.getElementById('chart');
    const subEl = document.getElementById('sub');
    if (!el || el.clientWidth === 0) return;

    const chart = LightweightCharts.createChart(
      el,
      baseOptions({
        rightPriceScale: { borderColor: css('--chart-line'), scaleMargins: { top: 0.09, bottom: 0.2 }, minimumWidth: 72 },
        localization: { dateFormat: 'yyyy-MM-dd', locale: 'zh-CN', priceFormatter: (v) => (v < 0 ? '' : v.toFixed(2)) },
      })
    );
    const candles = chart.addCandlestickSeries({
      upColor: css('--up'),
      downColor: css('--down'),
      borderVisible: false,
      wickUpColor: css('--up'),
      wickDownColor: css('--down'),
    });
    const lineOpts = { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const maShort = chart.addLineSeries({ ...lineOpts, color: css('--ma-short') });
    const maMid = chart.addLineSeries({ ...lineOpts, color: css('--ma-mid') });
    const maLong = chart.addLineSeries({ ...lineOpts, color: css('--ma-long') });
    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    const sub = LightweightCharts.createChart(
      subEl,
      baseOptions({
        rightPriceScale: { borderColor: css('--chart-line'), minimumWidth: 72 },
        timeScale: { visible: false },
      })
    );
    const subOpts = { priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false };
    const subHist = sub.addHistogramSeries({ ...subOpts, lastValueVisible: false });
    const subMacd = sub.addLineSeries({ ...subOpts, lineWidth: 1.5, color: css('--text'), title: 'MACD' });
    const subSignal = sub.addLineSeries({ ...subOpts, lineWidth: 1.5, color: css('--btc'), title: '信号' });
    const subRsi = sub.addLineSeries({ ...subOpts, lineWidth: 1.5, color: css('--ma-short'), title: 'RSI', visible: false });
    for (const price of [70, 30]) {
      subRsi.createPriceLine({
        price,
        color: css('--text-muted'),
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      });
    }

    const syncLock = { syncing: false };
    linkRange(chart, sub, syncLock);
    linkRange(sub, chart, syncLock);
    new ResizeObserver(() => {
      if (subEl.clientWidth > 0 && subEl.clientHeight > 0) {
        sub.applyOptions({ width: subEl.clientWidth, height: subEl.clientHeight });
        const r = chart.timeScale().getVisibleLogicalRange();
        if (r) sub.timeScale().setVisibleLogicalRange(r);
      }
    }).observe(subEl);

    this.mstr = { chart, candles, maShort, maMid, maLong, volume, sub, subHist, subMacd, subSignal, subRsi, prevCloses: new Map(), barMap: new Map() };
    chart.subscribeCrosshairMove((param) => {
      if (!this.mstr.barMap.size) return;
      const b = param.time ? this.mstr.barMap.get(param.time) : [...this.mstr.barMap.values()].at(-1);
      if (b) onOhlc?.(b, this.mstr.prevCloses.get(b.time));
    });
  }

  initBtc({ onBtcOhlc }) {
    if (this.btc) return;
    const el = document.getElementById('bChart');
    if (!el || el.clientWidth === 0) return;

    const chart = LightweightCharts.createChart(
      el,
      baseOptions({
        rightPriceScale: { borderColor: css('--chart-line'), scaleMargins: { top: 0.09, bottom: 0.2 }, minimumWidth: 72 },
        localization: { dateFormat: 'yyyy-MM-dd', locale: 'zh-CN', priceFormatter: (v) => (v < 0 ? '' : v.toFixed(0)) },
      })
    );
    const candles = chart.addCandlestickSeries({
      upColor: css('--up'),
      downColor: css('--down'),
      borderVisible: false,
      wickUpColor: css('--up'),
      wickDownColor: css('--down'),
    });
    const lineOpts = { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const ma = MA_KEYS.map(([, color]) => chart.addLineSeries({ ...lineOpts, color: css(color) }));
    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    this.btc = { chart, candles, ma, volume, prev: new Map(), map: new Map() };
    chart.subscribeCrosshairMove((param) => {
      if (!this.btc.map.size) return;
      const b = param.time ? this.btc.map.get(param.time) : [...this.btc.map.values()].at(-1);
      if (b) onBtcOhlc?.(b, this.btc.prev.get(b.time));
    });
  }

  initMnav() {
    if (this.mnav) return;
    const el = document.getElementById('mnavChart');
    if (!el || el.clientWidth === 0) return;
    const chart = LightweightCharts.createChart(
      el,
      baseOptions({
        rightPriceScale: { borderColor: css('--chart-line'), minimumWidth: 72 },
        localization: { dateFormat: 'yyyy-MM-dd', locale: 'zh-CN', priceFormatter: (v) => v.toFixed(2) },
      })
    );
    const main = chart.addLineSeries({ lineWidth: 2, color: css('--btc'), priceLineVisible: false });
    const second = chart.addLineSeries({ lineWidth: 2, color: css('--ma-long'), priceLineVisible: false });
    main.createPriceLine({
      price: 1,
      color: css('--text-muted'),
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: '1 倍',
    });
    this.mnav = { chart, main, second };
  }

  initPs() {
    if (this.ps) return;
    const el = document.getElementById('psChart');
    if (!el || el.clientWidth === 0) return;
    const chart = LightweightCharts.createChart(
      el,
      baseOptions({
        rightPriceScale: { borderColor: css('--chart-line'), minimumWidth: 72 },
        localization: { dateFormat: 'yyyy-MM-dd', locale: 'zh-CN', priceFormatter: (v) => v.toFixed(5) },
      })
    );
    const line = chart.addLineSeries({ lineWidth: 2, color: css('--btc'), priceLineVisible: false });
    this.ps = { chart, line };
  }

  initMag() {
    if (this.mag) return;
    const el = document.getElementById('magChart');
    if (!el || el.clientWidth === 0) return;
    const chart = LightweightCharts.createChart(
      el,
      baseOptions({
        rightPriceScale: { borderColor: css('--chart-line'), minimumWidth: 72 },
        localization: { dateFormat: 'yyyy-MM-dd', locale: 'zh-CN', priceFormatter: (v) => (v > 0 ? '+' : '') + v.toFixed(0) + '%' },
      })
    );
    const seriesMap = Object.fromEntries(
      MAG_ALL.map(([sym, , color]) => [
        sym,
        chart.addLineSeries({
          lineWidth: MAG_BOLD.has(sym) ? 3 : 2,
          color: sym === 'MSTR' ? css('--text') : sym === 'QQQ' ? css('--ma-long') : sym === 'BTC' ? css('--btc') : color,
          priceLineVisible: false,
          lastValueVisible: false,
        }),
      ])
    );
    this.mag = { chart, seriesMap };
  }

  initDca() {
    if (this.dca) return;
    const el = document.getElementById('dcaChart');
    if (!el || el.clientWidth === 0) return;
    const chart = LightweightCharts.createChart(
      el,
      baseOptions({ rightPriceScale: { borderColor: css('--chart-line'), minimumWidth: 72 } })
    );
    const priceLine = chart.addLineSeries({ lineWidth: 2, color: css('--text'), priceLineVisible: false, lastValueVisible: true });
    const avgLine = chart.addLineSeries({ lineWidth: 2, color: css('--btc'), priceLineVisible: false, lastValueVisible: true });
    this.dca = { chart, priceLine, avgLine };
  }

  applyThemeToAllCharts() {
    const common = {
      layout: { textColor: css('--text-tertiary'), background: { color: 'transparent' } },
      grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
      crosshair: {
        vertLine: { color: css('--text-muted'), labelBackgroundColor: css('--card-subtle') },
        horzLine: { color: css('--text-muted'), labelBackgroundColor: css('--card-subtle') },
      },
      rightPriceScale: { borderColor: css('--chart-line') },
      timeScale: { borderColor: css('--chart-line') },
    };

    const allCharts = [
      this.mstr?.chart,
      this.mstr?.sub,
      this.btc?.chart,
      this.mnav?.chart,
      this.ps?.chart,
      this.mag?.chart,
      this.dca?.chart,
    ].filter(Boolean);
    allCharts.forEach((c) => c.applyOptions(common));

    if (this.mstr) {
      this.mstr.candles.applyOptions({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down') });
      this.mstr.maShort.applyOptions({ color: css('--ma-short') });
      this.mstr.maMid.applyOptions({ color: css('--ma-mid') });
      this.mstr.maLong.applyOptions({ color: css('--ma-long') });
      this.mstr.subMacd.applyOptions({ color: css('--text') });
      this.mstr.subSignal.applyOptions({ color: css('--btc') });
      this.mstr.subRsi.applyOptions({ color: css('--ma-short') });
      this.lastDrawKeys.mstr = null;
    }
    if (this.btc) {
      this.btc.candles.applyOptions({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down') });
      MA_KEYS.forEach(([, col], i) => this.btc.ma[i].applyOptions({ color: css(col) }));
      this.lastDrawKeys.btc = null;
    }
    if (this.mnav) {
      this.mnav.main.applyOptions({ color: css('--btc') });
      this.mnav.second.applyOptions({ color: css('--ma-long') });
    }
    if (this.ps) this.ps.line.applyOptions({ color: css('--btc') });
    if (this.mag) {
      this.mag.seriesMap.MSTR?.applyOptions({ color: css('--text') });
      this.mag.seriesMap.QQQ?.applyOptions({ color: css('--ma-long') });
      this.mag.seriesMap.BTC?.applyOptions({ color: css('--btc') });
    }
    if (this.dca) {
      this.dca.priceLine.applyOptions({ color: css('--text') });
      this.dca.avgLine.applyOptions({ color: css('--btc') });
    }
  }

  drawMstr(S, state, callbacks, forceRange = false) {
    if (!this.mstr || !S.mstr) return;
    const bars = state.mstrView === 'week' ? toWeekly(S.mstr.bars) : S.mstr.bars;
    const last = bars.at(-1);
    const v = VIEWS[state.mstrView];
    const key = [state.mstrView, bars.length, last.close, last.volume, state.theme].join();

    if (key !== this.lastDrawKeys.mstr) {
      const closes = bars.map((b) => b.close);
      const line = (vals) => vals.map((value, i) => ({ time: bars[i].time, value })).filter((p) => p.value != null);
      this.mstr.candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      this.mstr.maShort.setData(line(sma(closes, v.short)));
      this.mstr.maMid.setData(line(sma(closes, v.mid)));
      this.mstr.maLong.setData(line(sma(closes, v.long)));
      this.mstr.volume.setData(
        bars.map((b) => ({ time: b.time, value: b.volume, color: (b.close >= b.open ? css('--up') : css('--down')) + '55' }))
      );
      this.mstr.prevCloses = new Map(bars.map((b, i) => [b.time, i ? bars[i - 1].close : b.open]));
      this.mstr.barMap = new Map(bars.map((b) => [b.time, b]));
      this.lastDrawKeys.mstr = key;
      callbacks?.onOhlc?.(last, this.mstr.prevCloses.get(last.time));

      const m = macd(closes);
      const r = rsiSeries(closes);
      const pts = (vals) => vals.map((value, i) => (value == null ? { time: bars[i].time } : { time: bars[i].time, value }));
      this.mstr.subMacd.setData(pts(m.line));
      this.mstr.subSignal.setData(pts(m.signal));
      this.mstr.subRsi.setData(pts(r));
      this.mstr.subHist.setData(
        m.hist.map((value, i) =>
          value == null ? { time: bars[i].time } : { time: bars[i].time, value, color: (value >= 0 ? css('--up') : css('--down')) + '99' }
        )
      );
      forceRange = true;
    }

    const isMacd = state.mstrSub === 'macd';
    const off = state.mstrSub === 'off';
    const subEl = document.getElementById('sub');
    const subNote = document.getElementById('subNote');
    if (subEl) subEl.hidden = off;
    if (subNote) {
      subNote.hidden = off;
      subNote.textContent = isMacd
        ? 'MACD 看短期和中期动能差距：白线在橙线上方说明短期动能强于中期；红绿柱是两者差值，信号存在滞后。'
        : 'RSI 看近期涨跌力度（0–100），虚线为 70 与 30 参考线；周 K 下对应周线 RSI。';
    }
    this.mstr.subHist.applyOptions({ visible: isMacd });
    this.mstr.subMacd.applyOptions({ visible: isMacd });
    this.mstr.subSignal.applyOptions({ visible: isMacd });
    this.mstr.subRsi.applyOptions({ visible: !isMacd });

    this.mstr.maShort.applyOptions({ visible: state.maShow.short });
    this.mstr.maMid.applyOptions({ visible: state.maShow.mid });
    this.mstr.maLong.applyOptions({ visible: state.maShow.long });

    const cost = Number(state.userData.position.cost);
    if (this.costLine) {
      this.mstr.candles.removePriceLine(this.costLine);
      this.costLine = null;
    }
    if (cost > 0) {
      this.costLine = this.mstr.candles.createPriceLine({
        price: cost,
        color: css('--cost'),
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '我的成本',
      });
    }

    const closes = bars.map((b) => b.close);
    const marks = [];
    if (state.showCross) {
      for (const c of crossings(sma(closes, v.short), sma(closes, v.long), bars)) {
        marks.push(
          c.type === 'gold'
            ? { time: c.time, position: 'belowBar', shape: 'arrowUp', color: css('--warn'), text: '金叉' }
            : { time: c.time, position: 'aboveBar', shape: 'arrowDown', color: css('--ma-long'), text: '死叉' }
        );
      }
    }
    if (state.showEarn) {
      for (const e of S.earn || []) {
        const bar = bars.filter((b) => b.time <= e.date).at(-1);
        if (bar) marks.push({ time: bar.time, position: 'aboveBar', shape: 'circle', color: css('--btc'), text: '财报' });
      }
    }
    marks.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    this.mstr.candles.setMarkers(marks);

    if (forceRange) {
      const from = new Date(last.time + 'T00:00:00Z');
      from.setUTCMonth(from.getUTCMonth() - state.mstrMonths);
      this.mstr.chart.timeScale().setVisibleRange({ from: from.toISOString().slice(0, 10), to: last.time });
      requestAnimationFrame(() => {
        const r = this.mstr.chart.timeScale().getVisibleLogicalRange();
        if (r) this.mstr.sub.timeScale().setVisibleLogicalRange(r);
      });
    }
  }

  drawBtc(S, state, callbacks, forceRange = false) {
    if (!this.btc || !S.btc) return;
    const bars = state.btcView === 'week' ? toWeekly(S.btc.bars) : S.btc.bars;
    const last = bars.at(-1);
    const v = VIEWS[state.btcView];
    const key = [state.btcView, bars.length, last.close, last.volume, state.theme].join();

    if (key !== this.lastDrawKeys.btc) {
      const closes = bars.map((b) => b.close);
      const line = (vals) => vals.map((value, i) => ({ time: bars[i].time, value })).filter((p) => p.value != null);
      this.btc.candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      MA_KEYS.forEach(([k], i) => this.btc.ma[i].setData(line(sma(closes, v[k]))));
      this.btc.volume.setData(
        bars.map((b) => ({ time: b.time, value: b.volume, color: (b.close >= b.open ? css('--up') : css('--down')) + '55' }))
      );
      this.btc.prev = new Map(bars.map((b, i) => [b.time, i ? bars[i - 1].close : b.open]));
      this.btc.map = new Map(bars.map((b) => [b.time, b]));
      this.lastDrawKeys.btc = key;
      callbacks?.onBtcOhlc?.(last, this.btc.prev.get(last.time));
      forceRange = true;
    }

    MA_KEYS.forEach(([k], i) => this.btc.ma[i].applyOptions({ visible: state.maShow[k] }));
    const crosses = state.btcShowCross ? crossings(sma(bars.map((b) => b.close), v.short), sma(bars.map((b) => b.close), v.long), bars) : [];
    this.btc.candles.setMarkers(
      crosses.map((c) =>
        c.type === 'gold'
          ? { time: c.time, position: 'belowBar', shape: 'arrowUp', color: css('--warn'), text: '金叉' }
          : { time: c.time, position: 'aboveBar', shape: 'arrowDown', color: css('--ma-long'), text: '死叉' }
      )
    );
    if (forceRange) {
      const from = new Date(last.time + 'T00:00:00Z');
      from.setUTCMonth(from.getUTCMonth() - state.btcMonths);
      this.btc.chart.timeScale().setVisibleRange({ from: from.toISOString().slice(0, 10), to: last.time });
    }
  }

  drawMnav(S, mode, months) {
    if (!this.mnav || !S.history) return null;
    const all = S.history;
    const cut = months
      ? (() => {
          const d = new Date(all[0].date + 'T00:00:00Z');
          d.setUTCMonth(d.getUTCMonth() - months);
          return d.toISOString().slice(0, 10);
        })()
      : '';
    const rows = all.filter((r) => r.date >= cut).map((r) => ({ ...r, simple: r.btcNav ? r.marketCap / r.btcNav : null }));
    const series = (f) => rows.filter((r) => r[f] != null).map((r) => ({ time: r.date, value: r[f] })).reverse();

    if (mode === 'official') {
      const sMain = series('mNav');
      this.mnav.main.setData(sMain);
      this.mnav.second.setData(series('mNavEntVal'));
      this.mnav.main.setMarkers(
        sMain.some((p) => p.time === '2026-07-23')
          ? [{ time: '2026-07-23', position: 'aboveBar', shape: 'arrowDown', color: css('--text'), text: '官网改定义' }]
          : []
      );
    } else {
      this.mnav.main.setData(series('simple'));
      this.mnav.second.setData([]);
      this.mnav.main.setMarkers([]);
    }
    const key = mode + ':' + months + ':' + all[0]?.date;
    if (key !== this.lastDrawKeys.mnav) {
      this.mnav.chart.timeScale().fitContent();
      this.lastDrawKeys.mnav = key;
    }
    return { rows, a: summarize(rows, 'mNav'), b: summarize(rows, 'mNavEntVal'), s: summarize(rows, 'simple') };
  }

  drawPs(S) {
    if (!this.ps || !S.history) return null;
    const h = perShareHistory(S.history);
    if (!h) return null;
    const key = h.asc.length + ':' + h.now.date;
    if (key !== this.lastDrawKeys.ps) {
      this.ps.line.setData(h.asc.map((x) => ({ time: x.date, value: x.perShare })));
      this.ps.chart.timeScale().fitContent();
      this.lastDrawKeys.ps = key;
    }
    return h;
  }

  drawMag(S, months, shownSet, magLoadList) {
    if (!this.mag || !S.mstr || !S.mag) return [];
    const last = S.mstr.bars.at(-1).time;
    const start = new Date(last + 'T00:00:00Z');
    start.setUTCMonth(start.getUTCMonth() - months);
    const from = start.toISOString().slice(0, 10);
    const lines = {};
    for (const sym of magLoadList) if (S.mag[sym]) lines[sym] = rebaseSeries(S.mag[sym].bars, from);
    lines.MSTR = rebaseSeries(S.mstr.bars, from);
    if (S.btc) lines.BTC = rebaseSeries(S.btc.bars, from);
    if (S.qqq) lines.QQQ = rebaseSeries(S.qqq.bars, from);

    for (const [sym, series] of Object.entries(this.mag.seriesMap)) {
      series.setData(shownSet.has(sym) && lines[sym] ? lines[sym].points : []);
    }
    const key = months + ':' + last + ':' + [...shownSet].sort().join(',');
    if (key !== this.lastDrawKeys.mag) {
      this.mag.chart.timeScale().fitContent();
      this.lastDrawKeys.mag = key;
    }
    return Object.entries(lines)
      .filter(([sym, l]) => l && shownSet.has(sym))
      .sort((a, b) => b[1].change - a[1].change);
  }

  drawDca(S, asset, years, monthly) {
    if (!this.dca || !S.mstr || !S.btc || !(monthly > 0)) return null;
    const isMstr = asset === 'mstr';
    const last = isMstr ? S.price : S.btcPrice;
    const r = dcaSim(isMstr ? S.mstr.bars : S.btc.bars, monthly, years, last);
    if (!r) return null;
    this.dca.priceLine.setData(r.series.map((p) => ({ time: p.time, value: p.price })));
    this.dca.avgLine.setData(r.series.map((p) => ({ time: p.time, value: p.avg })));
    const key = `${asset}:${years}:${r.series.length}`;
    if (key !== this.lastDrawKeys.dca) {
      this.dca.chart.timeScale().fitContent();
      this.lastDrawKeys.dca = key;
    }
    return { r, last, isMstr };
  }
}
