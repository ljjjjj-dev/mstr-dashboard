import {
  DEFAULT_MAG_SHOWN,
  MAG7_LIST,
  MAG_BTC_ITEM,
  MAG_CN_LIST,
  MAG_EXTRA_LIST,
  MAG_LEAD_LIST,
  bjToday,
  createDefaultUserData,
  exportUserDataJson,
  importUserDataJson,
  loadUserData,
  saveUserDataNow,
  scheduleSaveUserData,
} from './store.js';
import { ChartManager, MA_KEYS, VIEWS } from './charts.js';

const {
  sma,
  rsi,
  macd,
  crossings,
  correlation,
  beta,
  toWeekly,
  to4Hour,
  sessionOf,
  extendedQuote,
  evalRule,
  backtestRule,
  maxDrawdown,
  planCheckup,
  qdiiStatus,
  tiaBtcSummary,
} = window;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n == null || Number.isNaN(n) ? '--' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money0 = (n) => (n == null || Number.isNaN(n) ? '--' : '$' + Math.round(Number(n)).toLocaleString('en-US'));
const heroMoneyHtml = (n) => {
  if (n == null || Number.isNaN(n)) return '--';
  const [whole, dec] = Number(n).toFixed(2).split('.');
  return `<span class="prefix">$</span>${Number(whole).toLocaleString('en-US')}<span class="dec">.${dec}</span>`;
};
const pct = (n) => (n == null || Number.isNaN(n) ? '--' : (n > 0 ? '+' : '') + Number(n).toFixed(1) + '%');
const dirClass = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const toNum = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '')));
const dateCn = (d) => String(d ?? '').replaceAll('-', '/');
const bj = (t, opts) => new Date(t * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, ...opts });
const hm = (t) => bj(t, { hour: '2-digit', minute: '2-digit' });
const countdown = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}小时${Math.floor((s % 3600) / 60)}分` : `${Math.max(1, Math.ceil(s / 60))}分钟`);

const TAB_TITLES = {
  overview: '今日总览',
  charts: 'K 线图解',
  valuation: '估值与持币',
  strategy: '持仓与计划',
  compare: '对比与定投',
  qdii: '场外 QDII',
};

const TERMS = {
  tia: '这里把价格行为看盘最常讲的几件事，翻译成了不学金融也能懂的白话：① 大方向与假突破（日线看几个月的大方向、4小时线看最近几天有没有冲高回落的假突破）；② 黄金关口 0.618–0.66（一波大涨或大跌回吐约三分之二的位置，最容易遇到买盘或卖压）；③ 成交最密区 POC（最近三个月大家换手最多的价格，像磁铁一样有吸引力）；④ 半年趋势带 Vegas、周线开盘价与期货周末跳空缺口。每张卡片都标明了是日线、周线还是 4 小时线。',
  range: '把过去一年（日线）最低价算 0 分、最高价算 100 分，看看今天在什么位置。分数低不代表一定便宜，还要结合大方向看。',
  ma: '均线就是过去多少天收盘价的平均成本。50 日均线代表近两个多月平均成本，200 日均线代表近一年平均成本。现价站在均线上方通常说明趋势较强，压在下方说明偏弱。',
  vola: '统计过去 60 个交易日（日线）平均每天上下晃动百分之几。MSTR 的脾气比普通股票大得多，心里先有个底，跌起来才不慌。',
  fear: '情绪指数（日线）0 分代表极度恐惧、100 分代表极度贪婪；美股 VIX 指数越高说明大家越紧张。情绪只代表气氛，极度恐惧不等于马上见底。',
  pershare: '公司手里的比特币总数 ÷ 总股数。只要这条线往上走，说明买一股对应的比特币在变多；往下走说明增发股票比买币更快。',
  qdii: '国内基金公司发行的海外指数基金，用人民币在支付宝、天天基金就能买，不用开美股账户。A 类适合拿一年以上，C 类适合拿几个月。',
  mag7: '把所有资产在同一起点归零，按日线比较这段时间谁涨得多、谁跌得多。“七姐妹”指苹果、微软、谷歌、亚马逊、英伟达、Meta 和特斯拉。',
  cost: '比特币 200 周均线（周线级别，约过去 4 年的平均价）常被视作牛熊长周期参考底线，但历史上极端行情也曾短暂跌破过。',
  dca: '假设不管涨跌，每个月第一个交易日收盘固定买一笔，用真实历史日线算算到现在平均成本是多少、赚了还是亏了。',
  rsi: '衡量最近 14 根 K 线买方和卖方谁力气更大（0–100 分）。日线看近几周，周线看近几个月；高于 70 算偏热，低于 30 算偏冷。',
  cross: '短期均线上穿长期均线叫金叉，下穿叫死叉，属于慢半拍的趋势确认信号。',
  vol: '今天（日线）成交量是前 20 天平均成交量的多少倍。放大说明今天买卖很活跃。',
  mnav: '微策略的核心资产就是比特币。官网溢价倍数（mNAV）看的是：买它的股票，比直接买它手里的比特币贵了多少。比如 1.20 倍就是贵了 20%（溢价），0.95 倍就是打了 95 折（折价）。',
};

const RULES = {
  priceBelow: { label: (v) => `价格跌到 ≤ ${money(Number(v))}` },
  priceAbove: { label: (v) => `价格涨到 ≥ ${money(Number(v))}` },
  drawdown: { label: (v) => `从高点回撤 ≥ ${v}%` },
  belowMa200: { label: (v) => `连续 ${v} 天低于 200 日线` },
  mnavBelow: { label: (v) => `官网溢价 ≤ ${Number(v).toFixed(2)} 倍` },
  mnavAbove: { label: (v) => `官网溢价 ≥ ${Number(v).toFixed(2)} 倍` },
  date: { label: (v) => `到达 ${dateCn(v)}` },
};

const MAG_ALL = [...MAG7_LIST, ...MAG_LEAD_LIST, ...MAG_EXTRA_LIST, MAG_BTC_ITEM, ...MAG_CN_LIST];
const MAG_BOLD = new Set(['MSTR', 'BMNR']);
const MAG_LOAD = [...MAG7_LIST, ...MAG_LEAD_LIST, ...MAG_CN_LIST].map((x) => x[0]).concat('BMNR', '^GSPC');

const S = {
  tab: 'overview',
  chartLayout: 'mstr',
  signalFilter: 'all',
  mstrView: 'day',
  mstrMonths: 6,
  mstrSub: 'off',
  showCross: true,
  showEarn: true,
  btcView: 'day',
  btcMonths: 6,
  btcShowCross: false,
  mnavMode: 'official',
  mnavMonths: 0,
  magMonths: 12,
  qdiiSearch: '',
  syncMode: 'file',

  userData: createDefaultUserData(),
  health: {},
  mstr: null,
  btc: null,
  btc4h: null,
  cme: null,
  tia: null,
  vix: null,
  qqq: null,
  intraday: null,
  session: null,
  ext: null,
  price: null,
  btcPrice: null,
  prevPrice: null,
  kpi: null,
  history: null,
  earn: null,
  mag: null,
  magAt: 0,
  magFailed: 0,
  qdii: null,
  qdiiAt: 0,
  qdiiFail: false,
  tried: false,
  fail: false,
  loadedAt: 0,
  refreshing: false,
};

const charts = new ChartManager();

let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 2400);
}

function updateSyncBadge(mode) {
  S.syncMode = mode;
  const dot = $('syncDot');
  const txt = $('syncText');
  if (!dot || !txt) return;
  dot.className = 'sync-dot ' + (mode === 'saving' ? 'saving' : mode === 'local' ? 'local' : '');
  txt.textContent = mode === 'saving' ? '正在保存…' : mode === 'local' ? '浏览器缓存' : '本机已自动保存';
}

function persistUserData(immediate = false) {
  updateSyncBadge('saving');
  if (immediate) {
    saveUserDataNow(S.userData).then((r) => updateSyncBadge(r.mode));
  } else {
    scheduleSaveUserData(S.userData, (mode) => updateSyncBadge(mode));
  }
}

let audio = null;
function enableAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch {}
}
function chime() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
    [
      [659.25, 0],
      [880, 0.16],
      [1318.5, 0.32],
    ].forEach(([freq, at]) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      const t = audio.currentTime + at;
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.7);
    });
  } catch {}
}
addEventListener('pointerdown', enableAudio, { passive: true });
addEventListener('keydown', enableAudio);

function applyTheme(theme) {
  S.userData.prefs.theme = theme === 'dark' ? 'dark' : 'light';
  const isDark = S.userData.prefs.theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', isDark ? '#000000' : '#F5F5F7');
  const icon = $('themeIcon');
  if (icon) {
    icon.innerHTML = isDark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  charts.applyThemeToAllCharts();
}

function applyPrivacyUI() {
  const p = !!S.userData.prefs.privacy;
  const btn = $('privacyBtn');
  const lbl = $('privacyLabel');
  const eye = $('privacyEyeIcon');
  if (btn) btn.classList.toggle('active-amber', p);
  if (lbl) lbl.textContent = p ? '隐私中' : '隐私';
  if (eye) {
    eye.innerHTML = p
      ? '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>'
      : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
  }
}

const maskUsd = (str) => (S.userData.prefs.privacy ? '••••' : str);
const maskShares = (str) => (S.userData.prefs.privacy ? '•• 股' : str);

function parseDaily(json) {
  const r = json.chart.result[0];
  const q = r.indicators.quote[0];
  const bars = [];
  r.timestamp.forEach((t, i) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((v) => v == null)) return;
    const time = new Date((t + r.meta.gmtoffset) * 1000).toISOString().slice(0, 10);
    bars.push({ time, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 });
  });
  return { meta: r.meta, bars };
}

function parse4Hour(json) {
  const r = json.chart.result[0];
  const q = r.indicators.quote[0];
  const bars1h = [];
  (r.timestamp || []).forEach((t, i) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((v) => v == null)) return;
    bars1h.push({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 });
  });
  return to4Hour(bars1h);
}

function parseIntraday(json) {
  const r = json.chart.result[0];
  const ts = r.timestamp || [];
  const c = r.indicators.quote[0].close || [];
  return {
    periods: r.meta.currentTradingPeriod,
    previousClose: r.meta.previousClose,
    points: ts.map((time, i) => ({ time, close: c[i] })).filter((x) => x.close != null),
  };
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url);
  return res.json();
}

function setChartLayout(layout) {
  S.chartLayout = layout;
  $('chartLayoutSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.clayout === layout));
  $('mstrChartSection').hidden = layout === 'btc';
  $('btcChartSection').hidden = layout === 'mstr';
  $('btcChartSection').style.marginTop = layout === 'dual' ? '20px' : '0';
  $('chartsDualWrap').classList.toggle('chart-split-dual', layout === 'dual');
}

function switchTab(tab) {
  if (!TAB_TITLES[tab]) return;
  S.tab = tab;
  $('pageTitle').textContent = TAB_TITLES[tab];
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#mobileNav button').forEach((b) => b.classList.toggle('primary', b.dataset.tab === tab));
  document.querySelectorAll('.view-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));

  charts.ensureChartsForTab(tab, chartCallbacks(), S.chartLayout, S.btcView === '4h');
  renderCurrentTabCharts();
  charts.resizeForTab(tab);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderCurrentTabCharts() {
  if (S.tab === 'charts') {
    if (S.chartLayout === 'mstr' || S.chartLayout === 'dual') charts.drawMstr(S, getChartState(), chartCallbacks(), false);
    if (S.chartLayout === 'btc' || S.chartLayout === 'dual') charts.drawBtc(S, getChartState(), chartCallbacks(), false);
  } else if (S.tab === 'valuation') {
    renderMnavBlock();
    renderPsBlock();
  } else if (S.tab === 'compare') {
    renderMag();
    renderDca();
  }
}

function getChartState() {
  return {
    mstrView: S.mstrView,
    mstrMonths: S.mstrMonths,
    mstrSub: S.mstrSub,
    showCross: S.showCross,
    showEarn: S.showEarn,
    btcView: S.btcView,
    btcMonths: S.btcMonths,
    btcShowCross: S.btcShowCross,
    maShow: S.userData.prefs.maShow,
    btcMaShow: S.userData.prefs.btcMaShow,
    tiaShow: S.userData.prefs.tiaShow,
    userData: S.userData,
    theme: S.userData.prefs.theme,
  };
}

function chartCallbacks() {
  return {
    onOhlc: (b, prev) => showOhlc('ohlc', b, prev, S.mstrView, false),
    onBtcOhlc: (b, prev) => showOhlc('bOhlc', b, prev, S.btcView, true),
  };
}

function showOhlc(id, b, prev, view, isBtc) {
  const el = $(id);
  if (!el || !b) return;
  const chg = (b.close / (prev || b.open) - 1) * 100;
  const tLabel =
    view === '4h'
      ? bj(b.time, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + '（4小时线）'
      : view === 'week'
      ? `${b.time} 当周（周线）`
      : `${b.time}（日线）`;
  const fmtP = isBtc ? money0 : money;
  const volStr = isBtc ? `成交额 $${(b.volume / 1e8).toFixed(1)}亿` : `成交 ${(b.volume / 1e6).toFixed(1)}百万股`;
  el.innerHTML = `<b>${tLabel}</b> · 开盘 <b>${fmtP(b.open)}</b> · 最高 <b>${fmtP(b.high)}</b> · 最低 <b>${fmtP(b.low)}</b> · 收盘 <b>${fmtP(b.close)}</b> <span class="${dirClass(chg)}">(${pct(chg)})</span> · ${volStr}`;
}

function renderBand() {
  const p = S.intraday?.periods;
  if (!p) return;
  const now = Date.now() / 1000;
  const start = p.pre.start;
  const span = p.post.end - start;
  const frac = (t) => ((t - start) / span) * 100;
  $('segPre').style.width = frac(p.pre.end) + '%';
  $('segReg').style.width = frac(p.regular.end) - frac(p.pre.end) + '%';
  $('segPost').style.width = 100 - frac(p.regular.end) + '%';
  const inside = now >= start && now <= p.post.end;
  $('now').hidden = !inside;
  if (inside) $('now').style.left = frac(now) + '%';
  $('bandLabels').innerHTML = [
    [0, `${hm(p.pre.start)}<em> 盘前</em>`],
    [frac(p.pre.end), `${hm(p.regular.start)}<em> 开盘</em>`],
    [frac(p.regular.end), `${hm(p.regular.end)}<em> 收盘</em>`],
    [100, `${hm(p.post.end)}<em> 盘后结束</em>`],
  ]
    .map(([x, t]) => `<span style="left:${x}%">${t}</span>`)
    .join('');
}

function renderStatus() {
  if (!S.session) return;
  const now = Date.now() / 1000;
  const p = S.intraday.periods;
  const tradeAge = now - S.mstr.meta.regularMarketTime;
  const chip = $('chip');
  if (S.fail) {
    chip.className = 'session-pill bad';
    chip.textContent = '连接中断';
  } else if (S.session.key === 'regular' && tradeAge > 600) {
    chip.className = 'session-pill bad';
    chip.textContent = '数据延迟';
  } else {
    chip.className = 'session-pill ' + S.session.cls;
    chip.textContent = S.session.label;
  }
  let next = '';
  if (S.session.key === 'wait' || S.session.key === 'pre') next = `距美股开盘 ${countdown(p.regular.start - now)} · `;
  else if (S.session.key === 'regular') next = `距美股收盘 ${countdown(p.regular.end - now)} · `;
  const ago = Math.round((Date.now() - S.loadedAt) / 1000);
  $('updated').textContent = S.fail ? '暂取不到最新行情，显示上次缓存' : `${next}${ago < 5 ? '刚刚更新' : ago + ' 秒前更新'}`;
}

function renderHeader() {
  const { bars, meta } = S.mstr;
  const closes = bars.map((b) => b.close);
  const price = meta.regularMarketPrice;
  const prev = S.intraday.previousClose ?? closes.at(-2);
  const chg = (price / prev - 1) * 100;

  const priceEl = $('price');
  priceEl.innerHTML = heroMoneyHtml(price);
  priceEl.className = 'hero-figure tabular ' + dirClass(chg);
  if (S.prevPrice != null && S.prevPrice !== price) {
    priceEl.classList.remove('flash');
    void priceEl.offsetWidth;
    priceEl.classList.add('flash');
  }
  S.prevPrice = price;

  const chgBadge = $('changeBadge');
  chgBadge.textContent = `${price >= prev ? '+' : ''}${(price - prev).toFixed(2)} (${pct(chg)})`;
  chgBadge.className = 'badge ' + (chg > 0 ? 'badge-up' : chg < 0 ? 'badge-down' : 'badge-neutral');

  $('priceLabel').textContent =
    (S.session.key === 'regular' ? '盘中实时 · ' : '最近收盘 · ') +
    bj(meta.regularMarketTime, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const e = S.ext;
  $('ext').hidden = !e;
  if (e) {
    $('ext').innerHTML = `${e.label} <b>${money(e.price)}</b> <span class="${dirClass(e.change)}">${pct(e.change)}</span>`;
  }

  $('sideMstrPrice').textContent = money(price);
  $('sideMstrChg').textContent = pct(chg);
  $('sideMstrChg').className = 'mini-quote-chg ' + dirClass(chg);

  const btcPrev = S.btc.bars.at(-2).close;
  const btcChg = (S.btcPrice / btcPrev - 1) * 100;
  $('sideBtcPrice').textContent = money0(S.btcPrice);
  $('sideBtcChg').textContent = pct(btcChg);
  $('sideBtcChg').className = 'mini-quote-chg ' + dirClass(btcChg);

  document.title = `${money(e ? e.price : price)} ${pct(e ? e.change : chg)} · MSTR 看盘`;
}

function renderTiaPanels() {
  if (!S.btc?.bars?.length) return;
  S.tia = tiaBtcSummary(S.btc.bars, S.btcPrice, {
    bars4h: S.btc4h || [],
    cmeBars: S.cme?.bars || [],
  });
  if (!S.tia) return;

  const btcPrev = S.btc.bars.at(-2)?.close || S.btcPrice;
  const btcChg = (S.btcPrice / btcPrev - 1) * 100;
  const ovBadge = $('tiaOvPrice');
  if (ovBadge) {
    ovBadge.textContent = `现价 ${money0(S.btcPrice)} (${pct(btcChg)})`;
  }

  const trackEl = $('tiaOvTrack');
  const nodesEl = $('tiaOvNodes');
  if (trackEl && nodesEl && S.tia.mapPoints?.length) {
    trackEl.innerHTML = S.tia.mapPoints
      .map((pt) => `<span class="price-map-dot ${pt.kind === 'current' ? 'current' : ''}" style="left:${pt.posPct.toFixed(1)}%" title="${esc(pt.label)} ${money0(pt.price)}"></span>`)
      .join('');
    nodesEl.innerHTML = S.tia.mapPoints
      .map(
        (pt) => `<div class="map-chip ${pt.kind === 'current' ? 'current' : ''}">
          <div class="map-chip-top"><span>${esc(pt.label)}</span><span>${esc(pt.tf)}</span></div>
          <div class="map-chip-price">${money0(pt.price)}</div>
          <div class="map-chip-diff">${esc(pt.diffText)}</div>
        </div>`
      )
      .join('');
  }

  const tfClassMap = { day: 'tf-day', week: 'tf-week', h4: 'tf-h4', live: 'tf-live' };
  const cardsHtml = S.tia.items
    .map((it) => {
      const tfPills = (it.tfs || [])
        .map((t) => `<span class="tf-pill ${tfClassMap[t.cls] || 'tf-day'}">${esc(t.label)}</span>`)
        .join('');
      return `<div class="tia-cell">
        <div class="tia-cell-head">
          <div class="tia-cell-title-group">
            <span class="tia-cell-title">${esc(it.title)}</span>
            ${tfPills}
          </div>
          <span class="tia-tone ${it.tone}">${esc(it.badge)}</span>
        </div>
        <div class="tia-cell-val tabular">${esc(it.value)}</div>
        <p class="tia-cell-desc">${esc(it.detail)}</p>
        ${it.term ? `<div class="tia-cell-term">${esc(it.term)}</div>` : ''}
      </div>`;
    })
    .join('');

  for (const [hId, gId] of [
    ['tiaOvHeadline', 'tiaOvGrid'],
    ['tiaChartHeadline', 'tiaChartGrid'],
  ]) {
    const hEl = $(hId);
    const gEl = $(gId);
    if (hEl) hEl.textContent = S.tia.headline;
    if (gEl) gEl.innerHTML = cardsHtml;
  }
}

function forceWords(r) {
  if (r >= 70) return ['买盘很热', '近期连涨较多，短线偏热'];
  if (r >= 55) return ['买方占优', '近期涨的力道比跌的大'];
  if (r > 45) return ['买卖均衡', '近期涨跌力道差不多'];
  if (r > 30) return ['卖方占优', '近期跌的力道比涨的大'];
  return ['买盘偏冷（超跌区）', '连跌后卖压较重，还没转强'];
}

function vixWords(v) {
  if (v >= 35) return '非常恐慌';
  if (v >= 25) return '偏紧张';
  if (v >= 15) return '正常范围';
  return '比较平静';
}

function renderReadoutAndOverview() {
  const { bars } = S.mstr;
  const closes = bars.map((b) => b.close);
  const price = S.price;
  const year = bars.slice(-252);
  const hi = Math.max(...year.map((b) => b.high));
  const lo = Math.min(...year.map((b) => b.low));
  const place = Math.min(100, Math.max(0, ((price - lo) / (hi - lo)) * 100));
  const ma50 = sma(closes, 50).at(-1);
  const ma100 = sma(closes, 100).at(-1);
  const ma200 = sma(closes, 200).at(-1);
  const d50 = (price / ma50 - 1) * 100;
  const d200 = (price / ma200 - 1) * 100;

  const r = rsi(closes);
  const rw = rsi(toWeekly(bars).map((b) => b.close));
  $('rsiV').innerHTML = `日 ${r.toFixed(0)} <span style="color:var(--text-muted)">/</span> 周 ${rw.toFixed(0)}`;
  $('rsiT').textContent = `50 分是平衡线；高于 70 偏热，低于 30 偏冷。`;

  const avgVol = sma(bars.map((b) => b.volume), 20).at(-2);
  const ratio = bars.at(-1).volume / avgVol;
  $('volV').textContent = ratio.toFixed(2) + ' 倍';
  $('volT').textContent = `今天成交量是过去 20 个交易日平均的 ${ratio.toFixed(2)} 倍${S.session.key === 'regular' ? '（盘中未走完）' : ''}。`;

  const btcBars = S.btc.bars;
  const byDate = new Map(btcBars.map((b) => [b.time, b.close]));
  const a = [];
  const b = [];
  const recent = bars.slice(-61);
  for (let i = 1; i < recent.length; i++) {
    const x = byDate.get(recent[i - 1].time);
    const y = byDate.get(recent[i].time);
    if (x && y) {
      a.push(recent[i].close / recent[i - 1].close - 1);
      b.push(y / x - 1);
    }
  }
  const c = correlation(a, b);
  const bt = beta(a, b);
  const pos = place < 33 ? '偏低位置' : place > 67 ? '偏高位置' : '中间位置';

  const cost = Number(S.userData.position.cost);
  const mRows = [
    { name: '一年最高', tf: '日线', price: hi },
    { name: '一年最低', tf: '日线', price: lo },
    { name: '50日均价', tf: '日线', price: ma50 },
    { name: '100日均价', tf: '日线', price: ma100 },
    { name: '200日均价', tf: '日线', price: ma200 },
  ];
  if (cost > 0) mRows.push({ name: '我的成本', tf: '持仓', price: cost });
  mRows.push({ name: '当前现价', tf: '实时', price, here: true });
  mRows.sort((x, y) => y.price - x.price);
  $('ladder').innerHTML = mRows
    .map((x) => `<li class="${x.here ? 'here' : ''}"><span><span class="ladder-tag">${x.tf}</span>${x.name}</span><span>${money(x.price)}${x.here ? '' : `<small>${pct((x.price / price - 1) * 100)}</small>`}</span></li>`)
    .join('');

  renderTiaPanels();

  const bCloses = btcBars.map((x) => x.close);
  const bRows = [
    { name: '200日均价', tf: '日线', price: sma(bCloses, 200).at(-1) },
    { name: '当前现价', tf: '实时', price: S.btcPrice, here: true },
  ];
  if (S.tia) {
    if (S.tia.struct?.abovePool?.price) bRows.push({ name: '前高压力位', tf: '日线', price: S.tia.struct.abovePool.price });
    if (S.tia.struct?.belowPool?.price) bRows.push({ name: '前低防守位', tf: '日线', price: S.tia.struct.belowPool.price });
    if (S.tia.vp) {
      bRows.push({ name: '成交最密区', tf: '日线', price: S.tia.vp.poc });
    }
    if (S.tia.fib) {
      bRows.push({ name: '黄金关口', tf: '日线', price: S.tia.fib.mid });
    }
    if (S.tia.vegasD) bRows.push({ name: '半年趋势带', tf: '日线', price: S.tia.vegasD.ema144 });
    if (S.tia.opens) bRows.push({ name: '本周开盘价', tf: '周线', price: S.tia.opens.weeklyOpen });
  }
  $('bLadder').innerHTML = bRows
    .filter((x) => x.price > 0)
    .sort((x, y) => y.price - x.price)
    .map((x) => `<li class="${x.here ? 'here' : ''}"><span><span class="ladder-tag">${x.tf}</span>${x.name}</span><span>${money0(x.price)}${x.here ? '' : `<small>${pct((x.price / S.btcPrice - 1) * 100)}</small>`}</span></li>`)
    .join('');

  const br = rsi(bCloses);
  const brw = rsi(toWeekly(btcBars).map((x) => x.close));
  const br4 = S.btc4h?.length >= 20 ? rsi(S.btc4h.map((x) => x.close)) : null;
  $('bRsiV').innerHTML = `日 ${br.toFixed(0)} <span style="color:var(--text-muted)">/</span> 周 ${brw.toFixed(0)}${br4 != null ? ` <span style="color:var(--text-muted)">/</span> 4H ${br4.toFixed(0)}` : ''}`;
  $('bRsiT').textContent = `50 分为多空平衡点；低于 30 偏冷，高于 70 偏热。`;
  const bVolRatio = btcBars.at(-1).volume / sma(btcBars.map((x) => x.volume), 20).at(-2);
  $('bVolV').textContent = bVolRatio.toFixed(2) + ' 倍';
  $('bVolT').textContent = `今天成交额约为前 20 天平均的 ${bVolRatio.toFixed(2)} 倍。`;

  $('qPlace').textContent = `${pos}（${place.toFixed(0)}分）`;
  $('qPlacePin').style.left = place + '%';
  $('qPlaceT').textContent = `一年最低 ${money(lo)}，最高 ${money(hi)}`;

  const both = d50 >= 0 && d200 >= 0;
  const none = d50 < 0 && d200 < 0;
  $('qTrend').textContent = both ? '上涨趋势中' : none ? '下跌趋势中' : '震荡拉锯中';
  $('qTrend').className = 'metric-value ' + (both ? 'up' : none ? 'down' : '');
  $('qTrendT').textContent = both
    ? `站在近两个月(${money(ma50)})和一年均价上方`
    : none
    ? `压在近两个月(${money(ma50)})和一年均价下方`
    : `卡在短期与长期均价之间，方向未明`;

  const [fw, fs] = forceWords(r);
  $('qForce').textContent = fw;
  $('qForce').className = 'metric-value ' + (r >= 55 ? 'up' : r <= 45 ? 'down' : '');
  $('qForceT').textContent = `日线 ${r.toFixed(0)} 分 · 周线 ${rw.toFixed(0)} 分（${fs}）`;

  const moves = closes.slice(-61).map((v, i, arr) => (i ? Math.abs(v / arr[i - 1] - 1) * 100 : null)).filter((v) => v != null);
  const meanMove = moves.reduce((s, v) => s + v, 0) / moves.length;
  $('qVola').textContent = `每天约 ±${meanMove.toFixed(1)}%`;
  $('qVolaT').textContent = `比特币涨跌 1%，它平均跟着动 ${bt.toFixed(1)}%`;

  $('sentence').textContent = `MSTR 目前处在近一年的${pos}（第 ${place.toFixed(0)} 分），日线${both ? '站在均价上方偏强' : none ? '仍在均价下方偏弱' : '多空拉锯'}，走势与比特币${c >= 0.6 ? '高度联动' : '有一定联动'}。`;

  renderMood();
  renderCompanyAndValuation();
  renderReview({ price, ma50, ma200, r, rw, ratio });
  renderPositionAndStress();
}

function renderMood() {
  const k = S.kpi?.btc;
  const fg = k?.fearGreedIndex;
  const vix = S.vix;
  const fearName = { 'Extreme Fear': '极度恐惧', Fear: '比较恐惧', Neutral: '情绪平和', Greed: '偏向贪婪', 'Extreme Greed': '极度贪婪' };
  const fgText = fg ? `${fearName[fg.classification] || fg.classification}（${fg.value}分）` : null;
  $('qFear').textContent = fgText || (vix ? `美股 VIX ${vix.meta.regularMarketPrice.toFixed(1)}` : '--');
  if (vix) {
    const v = vix.meta.regularMarketPrice;
    $('qFearT').textContent = `0 分最怕、100 分最贪；美股恐慌指数 ${v.toFixed(1)}（${vixWords(v)}）`;
  } else {
    $('qFearT').textContent = fg ? '0 分代表大家最害怕，100 分代表最狂热' : '正在读取情绪数据…';
  }

  if (k && k.ma200w) {
    const gap200 = (S.btcPrice / k.ma200w - 1) * 100;
    $('qCost').textContent = `${gap200 >= 0 ? '高于均价 ' : '低于均价 '}${Math.abs(gap200).toFixed(0)}%`;
    $('qCost').className = 'metric-value tabular ' + (gap200 >= 0 ? '' : 'down');
    $('qCostT').textContent = `4年周线均价 ${money0(k.ma200w)}，全网平均买币成本 ${money0(k.realizedPrice)}`;
  } else {
    $('qCost').textContent = '--';
    $('qCostT').textContent = '等待官网长期均价数据…';
  }
}

function renderReview({ price, ma50, ma200, r, rw, ratio }) {
  const bars = S.mstr.bars;
  const closes = bars.map((b) => b.close);
  const m = macd(closes);
  const bull = [];
  const bear = [];
  const flat = [];
  const add = (list, cls, title, text) => list.push({ cls, title, text });

  add(price >= ma200 ? bull : bear, price >= ma200 ? 'bull' : 'bear', `[日线] ${price >= ma200 ? '站上 200 日均价' : '低于 200 日均价'}`, `近一年平均成本 ${money(ma200)}`);
  add(price >= ma50 ? bull : bear, price >= ma50 ? 'bull' : 'bear', `[日线] ${price >= ma50 ? '站上 50 日均价' : '低于 50 日均价'}`, `近两月平均成本 ${money(ma50)}`);

  const maCross = crossings(sma(closes, 50), sma(closes, 200), bars);
  const lastMa = maCross.at(-1);
  if (lastMa) {
    add(
      lastMa.type === 'gold' ? bull : bear,
      lastMa.type === 'gold' ? 'bull' : 'bear',
      `[日线] 50/200 日均线${lastMa.type === 'gold' ? '金叉状态' : '死叉状态'}`,
      `上次交叉于 ${lastMa.time}`
    );
  }

  const line = m.line.at(-1);
  const sig = m.signal.at(-1);
  add(
    line >= sig ? bull : bear,
    line >= sig ? 'bull' : 'bear',
    `[日线] MACD 短期动能${line >= sig ? '偏强' : '偏弱'}`,
    line >= 0 ? '位于零轴上方' : '位于零轴下方'
  );

  const week = toWeekly(bars);
  const wm = macd(week.map((b) => b.close));
  add(
    wm.line.at(-1) >= wm.signal.at(-1) ? bull : bear,
    wm.line.at(-1) >= wm.signal.at(-1) ? 'bull' : 'bear',
    `[周线] MACD 中长期动能${wm.line.at(-1) >= wm.signal.at(-1) ? '偏强' : '偏弱'}`,
    '周线反映几个月级别大势'
  );

  const rsiState = (tfName, x) => {
    if (x >= 70) add(flat, 'flat', `[${tfName}] RSI ${x.toFixed(0)} 分（偏热）`, '连涨较多，追高需谨慎');
    else if (x <= 30) add(flat, 'flat', `[${tfName}] RSI ${x.toFixed(0)} 分（偏冷）`, '连跌较多，卖压偏重');
    else add(x >= 50 ? bull : bear, x >= 50 ? 'bull' : 'bear', `[${tfName}] RSI ${x.toFixed(0)} 分`, `${x >= 50 ? '买方' : '卖方'}力道占优`);
  };
  rsiState('日线', r);
  rsiState('周线', rw);

  const last = bars.at(-1);
  const isUp = last.close >= last.open;
  if (ratio >= 1.5) add(isUp ? bull : bear, isUp ? 'bull' : 'bear', `[日线] 放量${isUp ? '上涨' : '下跌'} (${ratio.toFixed(1)}倍)`, '成交明显比平时热闹');
  else add(flat, 'flat', `[日线] 成交量正常 (${ratio.toFixed(1)}倍)`, '接近过去 20 天平均水平');

  $('tallyBadge').innerHTML = `<span class="up">偏多 ${bull.length}</span> · <span class="down">偏空 ${bear.length}</span> · 中性 ${flat.length}`;
  const combined = [...bull, ...bear, ...flat].filter((x) => S.signalFilter === 'all' || x.cls === S.signalFilter);
  $('signals').innerHTML = combined.map((it) => `<div class="signal-item ${it.cls}"><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div>`).join('');

  const fwd = (i, n) => (i + n < closes.length ? pct((closes[i + n] / closes[i] - 1) * 100) : '未满');
  $('crossTable').innerHTML =
    '<thead><tr><th>交叉日期</th><th>信号（日线）</th><th>当天收盘</th><th>20天后</th><th>60天后</th><th>拿到今天</th></tr></thead><tbody>' +
    maCross
      .slice()
      .reverse()
      .map(
        (x) =>
          `<tr class="tr-hover"><td>${x.time}</td><td class="${x.type === 'gold' ? 'up' : 'down'}" style="font-weight:600">${x.type === 'gold' ? '金叉' : '死叉'}</td><td>${money(closes[x.i])}</td><td>${fwd(x.i, 20)}</td><td>${fwd(x.i, 60)}</td><td>${pct((price / closes[x.i] - 1) * 100)}</td></tr>`
      )
      .join('') +
    '</tbody>';
  $('crossNote').textContent = `过去 5 年（日线）一共只出现过 ${maCross.length} 次交叉，仅供参考。`;
}

function renderCompanyAndValuation() {
  const k = S.kpi?.btc;
  const m = S.kpi?.mstr;
  if (!k || !(toNum(k.mNav) > 0)) {
    if (S.kpi?.tried) {
      $('qMnav').textContent = '--';
      $('qMnavT').textContent = '官网暂未响应，稍后自动重试';
    }
    return;
  }

  const v = toNum(k.mNav);
  const ext = k.extendedSession;
  const premText = v > 1.005 ? `贵了 ${((v - 1) * 100).toFixed(0)}%（溢价）` : v < 0.995 ? `便宜 ${((1 - v) * 100).toFixed(0)}%（折价）` : '基本平价';
  const net = toNum(k.netBtcPerShareUsd);
  $('qMnav').textContent = `${v.toFixed(2)} 倍`;
  $('qMnavT').textContent = `${premText}${net > 0 ? `，每股扣债含币约 ${money(net)}` : ''}`;

  const held = toNum(k.btcHoldings);
  const bn = (millions) => (millions / 100).toFixed(0) + ' 亿美元';

  $('valKpiMnav').textContent = `${v.toFixed(2)} 倍`;
  $('valKpiMnavNote').textContent = `${premText}${ext?.mNav ? ` · 盘外 ${toNum(ext.mNav).toFixed(2)}倍` : ''}`;
  $('valKpiBtc').textContent = held.toLocaleString('en-US') + ' 枚';
  $('valKpiBtcShare').textContent = `占全球 2100 万枚上限的 ${toNum(k.pctOfBtcTotalSupply).toFixed(2)}%`;
  $('valKpiNetBps').textContent = (toNum(k.netSatsPerShare) / 1e8).toFixed(5) + ' 枚';
  $('valKpiGrossBps').textContent = `折合约 ${money(net)} / 股`;
  if (m) {
    $('valKpiMcap').textContent = bn(toNum(m.marketCap));
    $('valKpiDebt').textContent = `债务与优先股共 ${bn(toNum(m.debt) + toNum(m.pref))}`;
  }

  const rows = [
    ['公司持有比特币总数', held.toLocaleString('en-US') + ' 枚'],
    ['占比特币总上限比例', toNum(k.pctOfBtcTotalSupply).toFixed(2) + '%'],
    ['每股对应比特币（未扣债）', (toNum(k.satsPerShare) / 1e8).toFixed(5) + ' 枚 (' + money(toNum(k.btcPerShareUsd)) + ')'],
    ['扣掉债务后每股含币', (toNum(k.netSatsPerShare) / 1e8).toFixed(5) + ' 枚 (' + money(net) + ')'],
  ];
  if (m) rows.push(['公司股票总市值', bn(toNum(m.marketCap))], ['公司债务与优先股', bn(toNum(m.debt) + toNum(m.pref))]);
  $('facts').innerHTML = rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
}

function renderMnavBlock() {
  if (!S.history) return;
  charts.initMnav();
  const res = charts.drawMnav(S, S.mnavMode, S.mnavMonths);
  if (!res) return;
  const f2 = (n) => n.toFixed(2) + ' 倍';
  const row = (a, b) => `<div><dt>${a}</dt><dd>${b}</dd></div>`;
  const stat = (name, s) =>
    row(`${name}最高`, `${f2(s.hi[s.field])} (${dateCn(s.hi.date)})`) +
    row(`${name}最低`, `${f2(s.lo[s.field])} (${dateCn(s.lo.date)})`) +
    row(`${name}平均`, f2(s.avg));

  if (S.mnavMode === 'official') {
    $('mnavLegend').innerHTML = `
      <span class="legend-item"><span class="legend-line" style="background:var(--btc)"></span>官网现行算法（日线）</span>
      <span class="legend-item"><span class="legend-line" style="background:var(--ma-long)"></span>官网旧算法（企业价值 ÷ 持币价值）</span>`;
    const live = toNum(S.kpi?.btc?.mNav);
    const fallbackNow = S.history.find((r) => r.mNav != null)?.mNav || 0;
    $('mnavNow').textContent = (live > 0 ? live : fallbackNow).toFixed(2) + ' 倍';
    $('mnavSay').textContent = res.b ? `旧算法约 ${res.b.now.toFixed(2)} 倍（比过去 ${res.b.share.toFixed(0)}% 的日子高）` : '官网现行口径';
    $('mnavFacts').innerHTML =
      (res.a ? stat('现行', { ...res.a, field: 'mNav' }) : '') + (res.b ? stat('旧版', { ...res.b, field: 'mNavEntVal' }) : '');
    $('mnavNote').textContent = '虚线 1 倍代表股票价格正好等于它手里的净比特币价值；2026/07/23 官网调整过一次算法。';
  } else {
    $('mnavLegend').innerHTML = `<span class="legend-item"><span class="legend-line" style="background:var(--btc)"></span>简化口径：总市值 ÷ 持币总价值（日线）</span>`;
    $('mnavNow').textContent = res.s ? f2(res.s.now) : '--';
    $('mnavSay').textContent = res.s ? `比区间内 ${res.s.share.toFixed(0)}% 的日子高` : '';
    $('mnavFacts').innerHTML = res.s ? stat('', { ...res.s, field: 'simple' }) : '';
    $('mnavNote').textContent = '未扣除债务，仅用来回看 2020 年以来的大周期溢价冷热。';
  }
}

function renderPsBlock() {
  if (!S.history) return;
  charts.initPs();
  const h = charts.drawPs(S);
  if (!h) return;
  const n = (v) => v.toFixed(5) + ' 枚';
  const row = (a, b) => `<div><dt>${a}</dt><dd>${b}</dd></div>`;
  const m = (v) => (v / 1e8).toFixed(2) + ' 亿股';
  $('psNow').textContent = n(h.now.perShare);
  $('psSay').textContent = `相比 ${dateCn(h.peak.date)} 最高峰变动 ${pct(h.fromPeak)}`;
  $('psFacts').innerHTML =
    row('历史最高', `${n(h.peak.perShare)} (${dateCn(h.peak.date)})`) +
    row(`${dateCn(h.first.date)} 起点`, n(h.first.perShare)) +
    row('每股含币累计变化', pct(h.perShareChange)) +
    row('公司持币累计变化', pct(h.btcChange)) +
    row('总股数变化', `${pct(h.sharesChange)} (${m(h.first.shares)}→${m(h.now.shares)})`);
}

function renderEvents() {
  const bars = S.mstr?.bars;
  if (S.earn?.length && bars) {
    const latest = S.earn[0];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fiscal = months.indexOf(latest.fiscalQtrEnd.slice(0, 3));
    const nextName = months[(fiscal + 3) % 12];
    const last = S.earn.find((e) => e.fiscalQtrEnd.startsWith(nextName));
    const est = last ? `去年同季在 ${dateCn(last.date)} 公布。` : '';
    $('earnNext').innerHTML = `下次财报日期待公布（最近一次是 ${dateCn(latest.date)}）。${est}`;
    const fiscalCn = (s) => `${s.slice(-4)}年第${Math.floor(months.indexOf(s.slice(0, 3)) / 3) + 1}季`;
    $('earnTable').innerHTML =
      '<thead><tr><th>公布日期</th><th>财报季度</th><th>公布后次日涨跌</th></tr></thead><tbody>' +
      S.earn
        .map((e) => {
          const i = bars.findIndex((b) => b.time > e.date);
          const chg = i > 0 ? (bars[i].close / bars[i - 1].close - 1) * 100 : null;
          return `<tr class="tr-hover"><td>${dateCn(e.date)}</td><td>${fiscalCn(e.fiscalQtrEnd)}</td><td class="${chg == null ? '' : dirClass(chg)}" style="font-weight:600">${chg == null ? '未到' : pct(chg)}</td></tr>`;
        })
        .join('') +
      '</tbody>';
  } else if (S.tried) {
    $('earnNext').textContent = '暂未取到财报日期。';
  }

  if (S.history && S.btc) {
    const asc = [...S.history].reverse();
    const btcAt = new Map(S.btc.bars.map((b) => [b.time, b.close]));
    const changes = [];
    for (let i = 1; i < asc.length; i++) {
      const delta = Math.round(asc[i].btcHoldings - asc[i - 1].btcHoldings);
      if (delta) changes.push({ date: asc[i].date, delta, total: asc[i].btcHoldings });
    }
    const year = asc.at(-1).date.slice(0, 4);
    const first = asc.findIndex((r) => r.date.startsWith(year));
    const net = Math.round(asc.at(-1).btcHoldings - asc[Math.max(0, first - 1)].btcHoldings);
    $('ledgerNext').innerHTML = `${year} 年以来累计净${net >= 0 ? '增持' : '减少'} <b>${Math.abs(net).toLocaleString('en-US')}</b> 枚比特币（以下为最近 10 次变动）。`;
    $('ledgerTable').innerHTML =
      '<thead><tr><th>日期</th><th>动作</th><th>变动数量(枚)</th><th>当天币价</th><th>买后总持币(枚)</th></tr></thead><tbody>' +
      changes
        .slice(-10)
        .reverse()
        .map((c) => {
          const p = btcAt.get(c.date);
          return `<tr class="tr-hover"><td>${dateCn(c.date)}</td><td><span class="badge ${c.delta > 0 ? 'badge-up' : 'badge-down'}">${c.delta > 0 ? '买币增持' : '减少'}</span></td><td style="font-weight:600">${Math.abs(c.delta).toLocaleString('en-US')}</td><td>${p ? money0(p) : '--'}</td><td>${Math.round(c.total).toLocaleString('en-US')}</td></tr>`;
        })
        .join('') +
      '</tbody>';
  } else if (S.tried) {
    $('ledgerNext').textContent = '暂未取到持币变化记录。';
  }
}

function renderPositionAndStress() {
  const cost = Number(S.userData.position.cost);
  const qty = Number(S.userData.position.qty);
  const p = !!S.userData.prefs.privacy;

  if (!(cost > 0)) {
    $('plV').textContent = '--';
    $('plV').className = 'facts-big tabular';
    $('plT').textContent = '填入买入均价后，MSTR K 线图上会自动画出您的成本线。';
    $('heroPosVal').textContent = '未填成本价';
    $('heroPosVal').className = 'status-box-val tabular';
    $('heroPosSub').textContent = '点击填入买入均价与股数';
  } else if (S.price) {
    const pl = (S.price / cost - 1) * 100;
    const plAmt = qty > 0 ? (S.price >= cost ? '+' : '-') + money(Math.abs(S.price - cost) * qty) : '';
    $('plV').textContent = pct(pl);
    $('plV').className = 'facts-big tabular ' + dirClass(pl);
    $('plT').textContent =
      qty > 0
        ? `现价 ${money(S.price)} · 持有 ${p ? '•• 股' : qty + ' 股'} 账面浮盈亏 ${maskUsd(plAmt)}`
        : `现价 ${money(S.price)} · 买入均价 ${maskUsd(money(cost))}`;
    $('heroPosVal').innerHTML = `${pct(pl)} ${plAmt ? `<span style="font-size:12px;font-weight:500">${maskUsd(plAmt)}</span>` : ''}`;
    $('heroPosVal').className = 'status-box-val tabular ' + dirClass(pl);
    $('heroPosSub').textContent = `成本 ${maskUsd(money(cost))}${qty > 0 ? ` · ${maskShares(qty + ' 股')}` : ''}`;
  }

  const rules = S.userData.plan.rules || [];
  const firedCount = rules.filter((r) => r.firedAt).length;
  $('heroPlanTitle').textContent = rules.length ? `监控中 ${rules.length} 条规则` : '尚未设定规则';
  $('heroPlanDesc').textContent = firedCount
    ? `已触发 ${firedCount} 条提醒`
    : S.userData.plan.review
    ? `下次复盘：${dateCn(S.userData.plan.review)}`
    : '记录买入理由、到价提醒与复盘日';

  if (!S.mstr || !S.price) return;
  const value = qty > 0 ? qty * S.price : 10000;
  const worst = maxDrawdown(S.mstr.bars);
  const row = (a, b) => `<div><dt>${a}</dt><dd>${b}</dd></div>`;
  const usd = (n) => maskUsd('$' + Math.round(n).toLocaleString('en-US'));
  const costRow =
    cost > 0 && qty > 0
      ? row('距离回本', S.price >= cost ? `高于成本 ${((S.price / cost - 1) * 100).toFixed(1)}%` : `还需涨 ${((cost / S.price - 1) * 100).toFixed(1)}%`)
      : '';
  $('planStress').innerHTML =
    row(qty > 0 ? '当前持仓市值' : '假如持有 $10,000', usd(value)) +
    row('再跌 30% / 50%', `少 ${usd(value * 0.3)} / 少 ${usd(value * 0.5)}`) +
    costRow +
    row('近 5 年最惨跌过', `${worst.pct.toFixed(1)}% (${dateCn(worst.from)}–${dateCn(worst.to)})`);
  $('planStressNote').textContent = '跌去一半（-50%）需要翻倍（+100%）才能回本，切勿借钱或满仓。';
}

function ruleContext() {
  const bars = S.session?.key === 'regular' ? S.mstr.bars.slice(0, -1) : S.mstr.bars;
  const live = toNum(S.kpi?.btc?.mNav);
  return { price: S.price, bars, mnav: live > 0 ? live : null, today: bjToday() };
}

function ruleDistance(rule) {
  const v = Number(rule.value);
  const p = S.price;
  if (!p) return '';
  if (rule.type === 'priceBelow' || rule.type === 'priceAbove') return `离现价 ${pct((v / p - 1) * 100)}`;
  if (rule.type === 'mnavBelow' || rule.type === 'mnavAbove') {
    const m = toNum(S.kpi?.btc?.mNav);
    return m > 0 ? `当前 ${m.toFixed(2)} 倍` : '';
  }
  if (rule.type === 'drawdown' && S.mstr) {
    const seen = S.mstr.bars.filter((b) => b.time >= rule.created).map((b) => b.close);
    const peak = Math.max(p, ...seen);
    return `高点 ${money(peak)}，已回撤 ${Math.abs((p / peak - 1) * 100).toFixed(1)}%`;
  }
  return '';
}

function backText(r) {
  if (!r) return '暂无历史回看数据。';
  const fmt = (v) => (v == null ? '未满' : pct(v));
  const head = `从 ${dateCn(r.from)} 至今（日线收盘），一共触发过 <b>${r.events.length}</b> 次。`;
  if (!r.events.length) return head;
  const list = r.events
    .slice(-5)
    .reverse()
    .map((e) => `${dateCn(e.date)} (${money(e.close)})：20天后 ${fmt(e.after20)}，60天后 ${fmt(e.after60)}`)
    .join('<br>');
  return `${head}<br>${list}`;
}

function renderPlan() {
  const plan = S.userData.plan;
  if (document.activeElement !== $('planWhy')) $('planWhy').value = plan.why || '';
  $('planReview').value = plan.review || '';

  $('ruleTable').innerHTML = plan.rules.length
    ? '<thead><tr><th>状态</th><th>触发条件</th><th>我的打算</th><th>操作</th></tr></thead><tbody>' +
      plan.rules
        .map((r) => {
          const tested = r.showBack ? backtestRule(r, S.mstr?.bars || [], S.history || []) : null;
          const backRow = !r.showBack ? '' : `<tr><td colspan="4" class="wrap-cell"><div class="explain-box">${backText(tested)}</div></td></tr>`;
          return `<tr class="tr-hover">
            <td><span class="badge ${r.firedAt ? 'badge-btc' : 'badge-neutral'}">${r.firedAt ? '已到 ' + dateCn(r.firedAt) : '监控中'}</span></td>
            <td class="wrap-cell"><b>${esc(RULES[r.type].label(r.value))}</b><div style="font-size:11px;color:var(--text-tertiary)">${esc(ruleDistance(r))}</div></td>
            <td class="wrap-cell">${esc(r.note) || '<span class="warn">未写</span>'}</td>
            <td>
              ${r.type === 'date' ? '' : `<button type="button" class="pill-btn sm" data-act="back" data-id="${r.id}">${r.showBack ? '收起' : '历史回看'}</button>`}
              ${r.firedAt ? `<button type="button" class="pill-btn sm" data-act="rearm" data-id="${r.id}">重启用</button>` : ''}
              <button type="button" class="pill-btn sm danger" data-act="del" data-id="${r.id}">删除</button>
            </td>
          </tr>${backRow}`;
        })
        .join('') +
      '</tbody>'
    : '<tbody><tr><td class="wrap-cell" style="color:var(--text-tertiary)">还没有添加提醒规则，可点上方快捷按钮添加。</td></tr></tbody>';

  $('tradeTable').innerHTML = plan.trades.length
    ? '<thead><tr><th>日期</th><th>方向</th><th>股数</th><th>成交价</th><th>当时想法</th><th></th></tr></thead><tbody>' +
      plan.trades
        .map(
          (x) =>
            `<tr class="tr-hover"><td>${dateCn(x.date)}</td><td><span class="badge ${x.side === '买入' ? 'badge-up' : 'badge-down'}">${esc(x.side)}</span></td><td>${maskShares(x.shares + ' 股')}</td><td>${maskUsd(money(x.price))}</td><td class="wrap-cell">${esc(x.note)}</td><td><button type="button" class="pill-btn sm danger" data-trade="${x.id}">删除</button></td></tr>`
        )
        .join('') +
      '</tbody>'
    : '<tbody><tr><td class="wrap-cell" style="color:var(--text-tertiary)">还没有记过实盘买卖。</td></tr></tbody>';

  const closes = S.mstr?.bars.slice(-61).map((b) => b.close) || [];
  const moves = closes.slice(1).map((v, i) => Math.abs(v / closes[i] - 1) * 100);
  const move = moves.length ? moves.reduce((s, v) => s + v, 0) / moves.length : 0;
  $('planCheck').innerHTML = planCheckup(plan, move, S.price || 0)
    .map((c) => `<li class="${c.ok ? '' : 'miss'}"><b>${c.ok ? '✓' : '○'} ${c.text}</b>${c.ok ? '' : c.tip}</li>`)
    .join('');
}

function checkPlan() {
  if (!S.price || S.fail || !S.mstr) return;
  const plan = S.userData.plan;
  const ctx = ruleContext();
  const fired = [];
  for (const r of plan.rules) {
    if (r.firedAt || !evalRule(r, ctx)) continue;
    r.firedAt = ctx.today;
    fired.push(`${RULES[r.type].label(r.value)}（${r.note || '未写动作'}）`);
  }
  if (plan.review && ctx.today >= plan.review && plan.reviewFired !== plan.review) {
    plan.reviewFired = plan.review;
    fired.push('已到您设定的复盘日期');
  }
  if (!fired.length) return;
  persistUserData(true);
  const msg = '交易计划：' + fired.join('；') + (plan.why ? `。当初买入理由：${plan.why}` : '');
  $('bannerText').innerHTML = `<strong>计划提醒：</strong>${esc(msg)}`;
  $('banner').hidden = false;
  chime();
  fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) }).catch(() => {});
}

function buildMagPicksUI() {
  const shown = new Set(S.userData.prefs.magShown);
  const pick = ([sym, name, color]) =>
    `<label><input type="checkbox" data-sym="${sym}" ${shown.has(sym) ? 'checked' : ''}><i style="background:${color}"></i>${name}</label>`;
  $('magPicks').innerHTML = [
    ['美股七姐妹', MAG7_LIST],
    ['各行业龙头', MAG_LEAD_LIST],
    ['核心关注', MAG_EXTRA_LIST],
    ['加密与A股', [MAG_BTC_ITEM, ...MAG_CN_LIST]],
  ]
    .map(([title, list]) => `<div class="mag-row"><b>${title}</b><div class="mag-list">${list.map(pick).join('')}</div></div>`)
    .join('');
}

async function loadMag() {
  if (S.magAt && Date.now() - S.magAt < 600000) return;
  S.mag = S.mag || {};
  const got = await Promise.allSettled(MAG_LOAD.map((sym) => getJson('/api/chart?symbol=' + encodeURIComponent(sym))));
  got.forEach((g, i) => {
    if (g.status === 'fulfilled') S.mag[MAG_LOAD[i]] = parseDaily(g.value);
  });
  S.magFailed = got.filter((g) => g.status !== 'fulfilled').length;
  S.health.mag = S.magFailed === 0;
  S.magAt = Date.now();
}

function renderMag() {
  if (!S.mag || !S.mstr) return;
  if (S.tab === 'compare') charts.initMag();
  const shown = new Set(S.userData.prefs.magShown);
  const rows = charts.drawMag(S, S.magMonths, shown, MAG_LOAD);
  const names = Object.fromEntries(MAG_ALL.map(([s, n]) => [s, n]));
  const colorMap = Object.fromEntries(MAG_ALL.map(([s, , c]) => [s, c]));
  const codes = { '^GSPC': 'SPX', '000001.SS': '000001', '510300.SS': '510300' };
  const maxAbs = Math.max(...rows.map(([, l]) => Math.abs(l.change)), 10);

  $('magTable').innerHTML =
    '<thead><tr><th>标的</th><th>累计涨跌</th></tr></thead><tbody>' +
    rows
      .map(([sym, l]) => {
        const w = Math.min(100, Math.round((Math.abs(l.change) / maxAbs) * 100));
        const col = l.change >= 0 ? 'var(--up)' : 'var(--down)';
        return `<tr class="tr-hover">
          <td><span style="display:inline-flex;align-items:center;gap:6px"><i style="display:inline-block;width:7px;height:7px;border-radius:99px;background:${colorMap[sym] || 'var(--blue)'}"></i>${MAG_BOLD.has(sym) ? `<b>${names[sym]}</b>` : names[sym]} <span style="font-size:11px;color:var(--text-tertiary)">${codes[sym] || sym}</span></span></td>
          <td class="${dirClass(l.change)}" style="font-weight:600">${pct(l.change)}<span class="perf-bar-bg"><div class="perf-bar-fill" style="width:${w}%;background:${col}"></div></span></td>
        </tr>`;
      })
      .join('') +
    '</tbody>';
  $('magNote').textContent = S.magFailed ? `有 ${S.magFailed} 只标的暂未取到。` : '';
}

function renderDca() {
  if (!S.mstr || !S.btc) return;
  if (S.tab === 'compare') charts.initDca();
  const { dcaAsset, dcaYears, dcaAmount } = S.userData.prefs;
  const monthly = Number(dcaAmount);
  if (!(monthly > 0)) return;
  const res = charts.drawDca(S, dcaAsset, dcaYears, monthly);
  if (!res) return;
  const { r, last, isMstr } = res;
  const unit = isMstr ? '股' : '枚';
  $('dcaAvg').textContent = isMstr ? money(r.avg) : money0(r.avg);
  const vs = (last / r.avg - 1) * 100;
  $('dcaSay').textContent = `从 ${r.from} 起共投 ${r.count} 期，现价比定投均价 ${vs >= 0 ? '高 ' : '低 '}${Math.abs(vs).toFixed(1)}%`;
  const row = (a, b, cls = '') => `<div><dt>${a}</dt><dd class="${cls}">${b}</dd></div>`;
  const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
  $('dcaFacts').innerHTML =
    row('累计投入本金', usd(r.spent)) +
    row('累计攒下数量', `${r.units.toFixed(isMstr ? 2 : 5)} ${unit}`) +
    row('现在值多少钱', usd(r.value)) +
    row('账面赚亏', `${r.pl >= 0 ? '+' : '-'}${usd(Math.abs(r.value - r.spent))} (${pct(r.pl * 100)})`, dirClass(r.pl)) +
    row('途中最惨浮亏', r.worst < 0 ? `${pct(r.worst * 100)} (${r.worstTime})` : '全程没亏过', r.worst < 0 ? 'down' : '');
}

async function loadQdii() {
  if (S.qdiiAt && Date.now() - S.qdiiAt < 600000) return;
  try {
    S.qdii = await getJson('/api/qdii');
    S.qdiiFail = false;
  } catch {
    S.qdiiFail = true;
  }
  S.health.qdii = !S.qdiiFail;
  S.qdiiAt = Date.now();
}

function renderQdii() {
  if (!S.qdii) {
    if (S.qdiiFail) $('qdiiSay').textContent = '暂未取到场外基金状态。';
    return;
  }
  const { qdiiClass, qdiiFilter, qdiiIndex } = S.userData.prefs;
  const kw = S.qdiiSearch.trim().toLowerCase();

  const byClass = S.qdii.rows
    .map((r) => ({ ...r, st: qdiiStatus(r) }))
    .filter((r) => qdiiClass === 'all' || r.share_class === qdiiClass)
    .filter((r) => qdiiIndex === 'all' || r.index === qdiiIndex);

  const open = byClass.filter((r) => r.st.open);
  const big = open.filter((r) => r.st.limit >= 1000);
  const nCount = byClass.filter((r) => r.index === '纳指 100').length;
  const sCount = byClass.filter((r) => r.index === '标普 500').length;

  $('qdiiStatTotal').textContent = `${byClass.length} 只`;
  $('qdiiStatSplit').textContent = `纳指 ${nCount} 只 · 标普 ${sCount} 只`;
  $('qdiiStatOpen').textContent = `${open.length} 只`;
  $('qdiiStatBig').textContent = `${big.length} 只`;
  $('qdiiStatTracked').textContent = dateCn(S.qdii.tracked_from);

  const list = (qdiiFilter === 'open' ? open : byClass)
    .filter((r) => !kw || r.name.toLowerCase().includes(kw) || r.code.toLowerCase().includes(kw) || (r.company || '').toLowerCase().includes(kw))
    .sort((a, b) => b.st.limit - a.st.limit || a.name.localeCompare(b.name, 'zh'));

  $('qdiiSay').innerHTML = `共筛选出 <b>${byClass.length}</b> 只，目前能买的有 <b>${open.length}</b> 只，下方显示 <b>${list.length}</b> 条。`;

  const since = (r) => (r.since ? dateCn(r.since) : r.st.open ? `${dateCn(r.seen)} 前已开放` : '记录期内未变');
  const rate = (r) => {
    if (r.discounted_rate == null || r.discounted_rate === '') return '--';
    const s = String(r.discounted_rate).trim();
    return s.endsWith('%') ? s : `${s}%`;
  };
  $('qdiiTable').innerHTML =
    '<thead><tr><th>基金名称</th><th>代码</th><th>跟踪指数</th><th>买入费率</th><th>现在能买吗</th><th>状态变化日</th></tr></thead><tbody>' +
    (list.length
      ? list
          .map(
            (r) => `<tr class="tr-hover">
          <td class="wrap-cell"><b>${esc(r.name)}</b><span style="font-size:11px;color:var(--text-tertiary);margin-left:6px">${esc(r.company || '')}</span></td>
          <td><a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(r.code)} ↗</a></td>
          <td><span class="badge ${r.index === '纳指 100' ? 'badge-blue' : 'badge-neutral'}">${r.index}</span></td>
          <td>${rate(r)}</td>
          <td><span class="badge ${r.st.open ? (r.st.limit >= 1000 ? 'badge-down' : 'badge-btc') : 'badge-neutral'}">${r.st.label}</span></td>
          <td style="color:var(--text-secondary)">${since(r)}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:20px">没有符合筛选条件的基金</td></tr>') +
    '</tbody>';

  const t = S.qdii.stored_at ? new Date(S.qdii.stored_at * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '';
  $('qdiiNote').textContent = `整理自东方财富${t ? `（更新于 ${t}）` : ''}，实际限额以支付宝、天天基金等购买页面为准。`;
}

const SOURCES = [
  ['yahoo', 'Yahoo Finance', 'MSTR 与比特币日线/周线', () => S.mstr && bj(S.mstr.meta.regularMarketTime, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 5],
  ['btcExtra', 'Yahoo Finance', '比特币 4小时线与期货周末缺口', () => S.cme?.bars?.at(-1)?.time, 5],
  ['vix', 'Yahoo Finance', '美股恐慌指数 VIX（日线）', () => S.vix && bj(S.vix.meta.regularMarketTime, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 5],
  ['kpi', 'Strategy 官网', '实时溢价 mNAV、持币数与情绪', () => S.kpi?.mstr?.timeStamp, null],
  ['history', 'Strategy 官网', 'mNAV 历史与每股含币日线', () => S.history?.[0]?.date, 5],
  ['earn', 'Nasdaq', 'MSTR 财报日期', () => S.earn?.[0]?.date, null],
  ['mag', 'Yahoo Finance', '七姐妹与多资产日线对比', () => S.mag?.AAPL?.bars.at(-1)?.time, 5],
  ['qdii', 'GlobalAssetHistory', '场外 QDII 每日申购状态', () => S.qdii?.stored_at && bj(S.qdii.stored_at, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 3],
];

function dayAge(key) {
  const t =
    key === 'yahoo'
      ? S.mstr?.meta.regularMarketTime * 1000
      : key === 'btcExtra' && S.cme?.bars?.length
      ? Date.parse(S.cme.bars.at(-1).time)
      : key === 'vix'
      ? S.vix?.meta.regularMarketTime * 1000
      : key === 'history' && S.history
      ? Date.parse(S.history[0].date)
      : key === 'mag' && S.mag?.AAPL
      ? Date.parse(S.mag.AAPL.bars.at(-1).time)
      : key === 'qdii' && S.qdii?.stored_at
      ? S.qdii.stored_at * 1000
      : null;
  return t ? (Date.now() - t) / 864e5 : null;
}

function renderSources() {
  const bad = SOURCES.filter(([key]) => S.health[key] === false).length;
  const allReady = SOURCES.every(([key]) => S.health[key] != null);
  $('sourceDot').className = 'sync-dot ' + (bad ? 'bad' : allReady ? '' : 'saving');
  $('sourceBrief').textContent = bad ? `${bad} 路异常` : allReady ? '8 路数据源正常' : '数据源读取中';

  $('sourceTable').innerHTML =
    '<thead><tr><th>来源</th><th>数据内容</th><th>最新时间</th><th>状态</th></tr></thead><tbody>' +
    SOURCES.map(([key, name, what, dateFn, limit]) => {
      const st = S.health[key];
      const age = dayAge(key);
      const old = limit && age != null && age > limit;
      const dStr = dateFn();
      const [word, badgeCls] =
        st === false
          ? [dStr ? '展示缓存' : '不可用', 'badge-up']
          : st == null
          ? ['读取中', 'badge-neutral']
          : old
          ? ['非最新', 'badge-btc']
          : ['正常', 'badge-down'];
      return `<tr class="tr-hover"><td><b>${name}</b></td><td class="wrap-cell">${what}</td><td>${dStr || '--'}</td><td><span class="badge ${badgeCls}">${word}</span></td></tr>`;
    }).join('') +
    '</tbody>';
}

function renderMaPicks() {
  for (const [boxId, view, showObj] of [
    ['chips', S.mstrView, S.userData.prefs.maShow],
    ['bChips', S.btcView, S.userData.prefs.btcMaShow],
  ]) {
    const box = $(boxId);
    if (!box) continue;
    const v = VIEWS[view];
    const unit = view === '4h' ? '根4H' : view === 'week' ? '周' : '日';
    box.querySelector('.cross-name').textContent = `金叉死叉(${v.short}/${v.long}${unit})`;
    box.querySelector('.ma-picks').innerHTML = MA_KEYS.map(
      ([k, color]) => `<label><input type="checkbox" data-ma="${k}" ${showObj[k] ? 'checked' : ''}><i class="ma-swatch" style="background:var(${color})"></i>${v[k]}${unit}均线</label>`
    ).join('');
  }

  const mBadge = $('mstrTfBadge');
  if (mBadge) {
    mBadge.textContent = S.mstrView === 'week' ? '周线' : '日线';
    mBadge.className = 'tf-pill ' + (S.mstrView === 'week' ? 'tf-week' : 'tf-day');
  }
  const bBadge = $('btcTfBadge');
  if (bBadge) {
    bBadge.textContent = S.btcView === '4h' ? '4小时线' : S.btcView === 'week' ? '周线' : '日线';
    bBadge.className = 'tf-pill ' + (S.btcView === '4h' ? 'tf-h4' : S.btcView === 'week' ? 'tf-week' : 'tf-day');
  }

  const bRanges = $('bRanges');
  const bHint = $('bViewHint');
  if (bRanges) bRanges.hidden = S.btcView === '4h';
  if (bHint) {
    bHint.textContent =
      S.btcView === '4h'
        ? '当前看 4 小时线（一根代表 4 小时，适合看近几天短线）'
        : S.btcView === 'week'
        ? '当前看周线（一根代表一周，适合看几个月到几年大势）'
        : '当前看日线（一根代表一天，最常用的看盘周期）';
  }
}

function setRuleInput() {
  const type = $('ruleType').value;
  const input = $('ruleValue');
  input.type = type === 'date' ? 'date' : 'number';
  input.step = type === 'belowMa200' ? '1' : 'any';
  input.min = type === 'belowMa200' ? '1' : type === 'date' ? '' : '0.01';
  if (type === 'drawdown') input.max = '99';
  else input.removeAttribute('max');
  input.value = '';
  input.placeholder = { priceBelow: '美元', priceAbove: '美元', drawdown: '%', belowMa200: '天数', mnavBelow: '倍', mnavAbove: '倍' }[type] || '';
}

function showAll() {
  renderBand();
  renderHeader();
  renderStatus();
  renderSources();
  renderReadoutAndOverview();
  renderEvents();
  checkPlan();
  renderPlan();
  renderQdii();
  renderCurrentTabCharts();
}

async function refresh() {
  if (S.refreshing) return;
  S.refreshing = true;
  try {
    const [m, b, i] = await Promise.all([
      getJson('/api/chart?symbol=MSTR'),
      getJson('/api/chart?symbol=BTC-USD'),
      getJson('/api/intraday').catch(() => null),
    ]);
    S.mstr = parseDaily(m);
    S.btc = parseDaily(b);
    if (i) S.intraday = parseIntraday(i);
    if (!S.intraday) throw new Error('intraday');
    S.price = S.mstr.meta.regularMarketPrice;
    S.btcPrice = S.btc.meta.regularMarketPrice;
    S.session = sessionOf(Date.now() / 1000, S.intraday.periods);
    S.ext = extendedQuote(S.session, S.intraday.periods, S.intraday.points, S.price);
    S.fail = false;
    S.loadedAt = Date.now();
    S.health.yahoo = true;
    showAll();

    const [km, kb, vx, hs, er, qq, b4, cme] = await Promise.allSettled([
      getJson('/api/strategy/mstr'),
      getJson('/api/strategy/btc'),
      getJson('/api/chart?symbol=' + encodeURIComponent('^VIX')),
      getJson('/api/strategy/history'),
      getJson('/api/earnings'),
      getJson('/api/chart?symbol=QQQ'),
      getJson('/api/btc-4h'),
      getJson('/api/chart?symbol=' + encodeURIComponent('BTC=F')),
    ]);
    S.tried = true;
    S.health.vix = vx.status === 'fulfilled';
    S.health.history = hs.status === 'fulfilled';
    S.health.earn = er.status === 'fulfilled';
    S.health.kpi = km.status === 'fulfilled' && kb.status === 'fulfilled';
    S.health.btcExtra = b4.status === 'fulfilled' && cme.status === 'fulfilled';

    if (hs.status === 'fulfilled') S.history = hs.value;
    if (qq.status === 'fulfilled') S.qqq = parseDaily(qq.value);
    if (b4.status === 'fulfilled') S.btc4h = parse4Hour(b4.value);
    if (cme.status === 'fulfilled') S.cme = parseDaily(cme.value);
    if (er.status === 'fulfilled') {
      S.earn = er.value.map((e) => {
        const [mo, d, y] = e.dateReported.split('/');
        return { ...e, date: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` };
      });
    }
    if (vx.status === 'fulfilled') S.vix = parseDaily(vx.value);
    S.kpi = {
      tried: true,
      mstr: km.status === 'fulfilled' ? km.value[0] : S.kpi?.mstr,
      btc: kb.status === 'fulfilled' ? kb.value.results : S.kpi?.btc,
    };

    await Promise.all([loadMag(), loadQdii()]);
    showAll();
  } catch {
    S.fail = true;
    S.health.yahoo = false;
    renderStatus();
    renderSources();
    if (!S.mstr) {
      $('sentence').textContent = '暂时取不到行情，请检查网络，每分钟会自动重试。';
      $('chip').className = 'session-pill bad';
      $('chip').textContent = '连接中断';
    }
  } finally {
    S.refreshing = false;
  }
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      switchTab(tabBtn.dataset.tab);
      return;
    }

    const helpBtn = e.target.closest('.q-help-btn');
    if (helpBtn) {
      const inMetric = helpBtn.closest('.metric-cell');
      const scope = inMetric ? inMetric.closest('.card') : helpBtn.closest('.readout-block, .card');
      const existing = scope?.querySelector(`.explain-box[data-term="${helpBtn.dataset.term}"]`);
      if (existing) {
        existing.remove();
        return;
      }
      scope?.querySelectorAll('.explain-box').forEach((x) => x.remove());
      const p = document.createElement('div');
      p.className = 'explain-box';
      p.dataset.term = helpBtn.dataset.term;
      p.textContent = TERMS[helpBtn.dataset.term] || '';
      const anchor = inMetric ? inMetric.closest('.metrics-strip') : helpBtn.closest('.readout-head, .card-header');
      anchor?.after(p);
      return;
    }

    if (!e.target.closest('.menu-wrap')) {
      $('dataMenuPop').hidden = true;
    }
  });

  $('jumpBtcChartBtn')?.addEventListener('click', () => {
    setChartLayout('btc');
    switchTab('charts');
  });

  $('refreshBtn').addEventListener('click', () => {
    refresh();
    showToast('正在刷新实时行情…');
  });

  $('privacyBtn').addEventListener('click', () => {
    S.userData.prefs.privacy = !S.userData.prefs.privacy;
    applyPrivacyUI();
    persistUserData();
    renderPositionAndStress();
    renderPlan();
    showToast(S.userData.prefs.privacy ? '已开启隐私打码' : '已显示持仓数字');
  });

  $('themeBtn').addEventListener('click', () => {
    const next = S.userData.prefs.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    persistUserData();
    if (S.mstr) renderCurrentTabCharts();
  });

  $('dataMenuBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('dataMenuPop').hidden = !$('dataMenuPop').hidden;
  });

  $('exportBackupBtn').addEventListener('click', () => {
    $('dataMenuPop').hidden = true;
    exportUserDataJson(S.userData);
    showToast('已导出 JSON 备份');
  });

  $('importBackupBtn').addEventListener('click', () => {
    $('dataMenuPop').hidden = true;
    $('importFileInput').click();
  });

  $('importFileInput').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const imported = await importUserDataJson(f);
      S.userData = imported;
      syncInputsFromUserData();
      applyTheme(S.userData.prefs.theme);
      applyPrivacyUI();
      persistUserData(true);
      showAll();
      showToast('已恢复备份配置');
    } catch (err) {
      showToast(err?.message || '导入失败');
    } finally {
      e.target.value = '';
    }
  });

  $('openSourceModal').addEventListener('click', () => { $('sourceModal').hidden = false; });
  $('menuSourceBtn').addEventListener('click', () => { $('dataMenuPop').hidden = true; $('sourceModal').hidden = false; });
  $('closeSourceModal').addEventListener('click', () => { $('sourceModal').hidden = true; });
  $('doneSourceModal').addEventListener('click', () => { $('sourceModal').hidden = true; });
  $('sourceModal').addEventListener('click', (e) => { if (e.target === $('sourceModal')) $('sourceModal').hidden = true; });
  $('bannerClose').addEventListener('click', () => { $('banner').hidden = true; });

  $('signalFilter').addEventListener('click', (e) => {
    const f = e.target.dataset.sfilter;
    if (!f) return;
    S.signalFilter = f;
    $('signalFilter').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    if (S.mstr && S.btc) renderReadoutAndOverview();
  });

  $('chartLayoutSeg').addEventListener('click', (e) => {
    const l = e.target.dataset.clayout;
    if (!l) return;
    setChartLayout(l);
    charts.ensureChartsForTab('charts', chartCallbacks(), l, S.btcView === '4h');
    renderCurrentTabCharts();
    charts.resizeForTab('charts');
  });

  $('views').addEventListener('click', (e) => {
    const v = e.target.dataset.view;
    if (!v) return;
    S.mstrView = v;
    $('views').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    renderMaPicks();
    charts.drawMstr(S, getChartState(), chartCallbacks(), true);
  });

  $('ranges').addEventListener('click', (e) => {
    const m = Number(e.target.dataset.m);
    if (!m) return;
    S.mstrMonths = m;
    $('ranges').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    charts.drawMstr(S, getChartState(), chartCallbacks(), true);
  });

  $('subs').addEventListener('click', (e) => {
    const s = e.target.dataset.sub;
    if (!s) return;
    S.mstrSub = s;
    $('subs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    charts.drawMstr(S, getChartState(), chartCallbacks(), false);
    charts.resizeForTab('charts');
  });

  $('bViews').addEventListener('click', (e) => {
    const v = e.target.dataset.view;
    if (!v) return;
    S.btcView = v;
    $('bViews').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    renderMaPicks();
    charts.drawBtc(S, getChartState(), chartCallbacks(), true);
  });

  $('bRanges').addEventListener('click', (e) => {
    const m = Number(e.target.dataset.m);
    if (!m) return;
    S.btcMonths = m;
    $('bRanges').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    charts.drawBtc(S, getChartState(), chartCallbacks(), true);
  });

  for (const boxId of ['chips', 'bChips']) {
    $(boxId).addEventListener('change', (e) => {
      const k = e.target.dataset.ma;
      if (k) {
        const targetMa = boxId === 'bChips' ? S.userData.prefs.btcMaShow : S.userData.prefs.maShow;
        targetMa[k] = e.target.checked;
        persistUserData();
        renderMaPicks();
        renderCurrentTabCharts();
        return;
      }
      const tk = e.target.dataset.tia;
      if (tk) {
        S.userData.prefs.tiaShow[tk] = e.target.checked;
        persistUserData();
        renderCurrentTabCharts();
        return;
      }
      if (e.target.id === 'showCross') S.showCross = e.target.checked;
      if (e.target.id === 'showEarn') S.showEarn = e.target.checked;
      if (e.target.id === 'bShowCross') S.btcShowCross = e.target.checked;
      renderCurrentTabCharts();
    });
  }

  $('mnavMode').addEventListener('click', (e) => {
    const mode = e.target.dataset.mode;
    if (!mode) return;
    S.mnavMode = mode;
    $('mnavMode').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    renderMnavBlock();
  });

  $('mnavRange').addEventListener('click', (e) => {
    const m = e.target.dataset.m;
    if (m == null) return;
    S.mnavMonths = Number(m);
    $('mnavRange').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    renderMnavBlock();
  });

  $('posForm').addEventListener('input', () => {
    S.userData.position.cost = $('cost').value;
    S.userData.position.qty = $('qty').value;
    persistUserData();
    if (S.mstr) {
      renderReadoutAndOverview();
      if (S.tab === 'charts') charts.drawMstr(S, getChartState(), chartCallbacks(), false);
    } else {
      renderPositionAndStress();
    }
  });
  $('posForm').addEventListener('submit', (e) => e.preventDefault());

  $('ruleType').addEventListener('change', setRuleInput);
  $('tmpl').addEventListener('click', (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    $('ruleType').value = t;
    setRuleInput();
    $('ruleNote').placeholder = e.target.dataset.n;
    $('ruleValue').focus();
  });

  $('ruleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    S.userData.plan.rules.push({
      id: String(Date.now()),
      type: $('ruleType').value,
      value: $('ruleValue').value,
      note: $('ruleNote').value.trim(),
      created: bjToday(),
    });
    $('ruleValue').value = '';
    $('ruleNote').value = '';
    $('ruleNote').placeholder = '触发后打算怎么做';
    persistUserData(true);
    checkPlan();
    renderPlan();
    renderPositionAndStress();
    showToast('已添加规则');
  });

  $('ruleTable').addEventListener('click', (e) => {
    const id = e.target.dataset.id;
    const act = e.target.dataset.act;
    if (!id) return;
    const r = S.userData.plan.rules.find((x) => x.id === id);
    if (!r) return;
    if (act === 'del') S.userData.plan.rules = S.userData.plan.rules.filter((x) => x.id !== id);
    if (act === 'rearm') r.firedAt = null;
    if (act === 'back') r.showBack = !r.showBack;
    persistUserData();
    renderPlan();
    renderPositionAndStress();
  });

  $('planWhy').addEventListener('input', () => {
    S.userData.plan.why = $('planWhy').value;
    persistUserData();
    renderPlan();
  });

  $('planReview').addEventListener('change', () => {
    S.userData.plan.review = $('planReview').value;
    persistUserData(true);
    checkPlan();
    renderPlan();
    renderPositionAndStress();
  });

  $('tradeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    S.userData.plan.trades.unshift({
      id: String(Date.now()),
      date: $('tradeDate').value,
      side: $('tradeSide').value,
      shares: Number($('tradeShares').value),
      price: Number($('tradePrice').value),
      note: $('tradeNote').value.trim(),
    });
    for (const id of ['tradeShares', 'tradePrice', 'tradeNote']) $(id).value = '';
    persistUserData(true);
    renderPlan();
    showToast('已记一笔');
  });

  $('tradeTable').addEventListener('click', (e) => {
    const id = e.target.dataset.trade;
    if (!id) return;
    S.userData.plan.trades = S.userData.plan.trades.filter((x) => x.id !== id);
    persistUserData();
    renderPlan();
  });

  $('magPicks').addEventListener('change', (e) => {
    const sym = e.target.dataset.sym;
    if (!sym) return;
    const set = new Set(S.userData.prefs.magShown);
    e.target.checked ? set.add(sym) : set.delete(sym);
    S.userData.prefs.magShown = [...set];
    persistUserData();
    renderMag();
  });

  $('magPreset').addEventListener('click', (e) => {
    const p = e.target.dataset.mpreset;
    if (!p) return;
    if (p === 'core') S.userData.prefs.magShown = ['MSTR', 'BTC', 'QQQ', '^GSPC'];
    else if (p === 'mag7') S.userData.prefs.magShown = [...DEFAULT_MAG_SHOWN];
    else if (p === 'all') S.userData.prefs.magShown = MAG_ALL.map((x) => x[0]);
    buildMagPicksUI();
    persistUserData();
    renderMag();
  });

  $('magRange').addEventListener('click', (e) => {
    const m = Number(e.target.dataset.m);
    if (!m) return;
    S.magMonths = m;
    $('magRange').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    renderMag();
  });

  $('dcaAsset').addEventListener('click', (e) => {
    const a = e.target.dataset.asset;
    if (!a) return;
    S.userData.prefs.dcaAsset = a;
    $('dcaAsset').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    persistUserData();
    renderDca();
  });

  $('dcaYears').addEventListener('click', (e) => {
    const y = Number(e.target.dataset.y);
    if (!y) return;
    S.userData.prefs.dcaYears = y;
    $('dcaYears').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    persistUserData();
    renderDca();
  });

  $('dcaForm').addEventListener('input', () => {
    S.userData.prefs.dcaAmount = Number($('dcaAmount').value) || 500;
    persistUserData();
    renderDca();
  });
  $('dcaForm').addEventListener('submit', (e) => e.preventDefault());

  $('qdiiClass').addEventListener('click', (e) => {
    const c = e.target.dataset.c;
    if (!c) return;
    S.userData.prefs.qdiiClass = c;
    $('qdiiClass').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    persistUserData();
    renderQdii();
  });

  $('qdiiFilter').addEventListener('click', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    S.userData.prefs.qdiiFilter = f;
    $('qdiiFilter').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    persistUserData();
    renderQdii();
  });

  $('qdiiIndex').addEventListener('click', (e) => {
    const idx = e.target.dataset.idx;
    if (!idx) return;
    S.userData.prefs.qdiiIndex = idx;
    $('qdiiIndex').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    persistUserData();
    renderQdii();
  });

  $('qdiiSearch').addEventListener('input', (e) => {
    S.qdiiSearch = e.target.value;
    renderQdii();
  });
}

function syncInputsFromUserData() {
  $('cost').value = S.userData.position.cost ?? '';
  $('qty').value = S.userData.position.qty ?? '';
  $('tradeDate').value = bjToday();
  $('planWhy').value = S.userData.plan.why || '';
  $('planReview').value = S.userData.plan.review || '';
  $('dcaAmount').value = S.userData.prefs.dcaAmount || 500;

  $('dcaAsset').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.asset === S.userData.prefs.dcaAsset));
  $('dcaYears').querySelectorAll('button').forEach((b) => b.classList.toggle('active', Number(b.dataset.y) === S.userData.prefs.dcaYears));
  $('qdiiClass').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.c === S.userData.prefs.qdiiClass));
  $('qdiiFilter').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.f === S.userData.prefs.qdiiFilter));
  $('qdiiIndex').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.idx === S.userData.prefs.qdiiIndex));

  const tiaShow = S.userData.prefs.tiaShow || {};
  $('bChips')?.querySelectorAll('input[data-tia]').forEach((inp) => {
    inp.checked = !!tiaShow[inp.dataset.tia];
  });

  buildMagPicksUI();
  renderMaPicks();
}

async function init() {
  setRuleInput();
  const { data, source } = await loadUserData();
  S.userData = data;
  updateSyncBadge(source === 'local' ? 'local' : 'file');
  applyTheme(S.userData.prefs.theme);
  applyPrivacyUI();
  syncInputsFromUserData();
  bindEvents();

  await refresh();
  setInterval(refresh, 60000);
  setInterval(() => {
    renderBand();
    renderStatus();
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - S.loadedAt > 30000) refresh();
  });
}

init();
