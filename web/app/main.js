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
const pct = (n) => (n == null || Number.isNaN(n) ? '--' : (n > 0 ? '+' : '') + Number(n).toFixed(1) + '%');
const dirClass = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const toNum = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '')));
const dateCn = (d) => String(d ?? '').replaceAll('-', '/');
const bj = (t, opts) => new Date(t * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, ...opts });
const hm = (t) => bj(t, { hour: '2-digit', minute: '2-digit' });
const countdown = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.max(1, Math.ceil(s / 60))}m`);

const TAB_TITLES = {
  overview: '总览看板',
  charts: 'K 线行情',
  valuation: '估值与持币',
  strategy: '持仓与计划',
  compare: '对比与定投',
  qdii: '场外 QDII',
};

const TERMS = {
  tia: '汇总提阿非罗视频常用 7 项看盘维度：① 道氏高低点结构与前高/前低止损流动性池、2B 假突破（插针刺破关键位后收回）；② 波段斐波那契 0.618–0.66 黄金口袋（高频回调支撑/反弹阻力共振带）；③ 盘整区筹码分布 POC（最大成交量磁吸位）与 70% 价值区上下沿 VAH / VAL；④ Vegas 维加斯隧道（日线与 4H 的 EMA 144/169 动态趋势带）；⑤ CME 比特币期货周末跳空未回补缺口与日线 FVG 失衡区；⑥ 周线/月线/年线开盘价多空分水岭；⑦ RSI(14) 摆动高低点顶底背离。所有文字仅作客观位置拆解，等待关键位价格行为确认，不构成买卖建议。',
  range: '近一年最高与最低之间的相对百分位（0 最低，100 最高）。位置低不等于便宜，需结合趋势综合观察。',
  ma: '过去 N 个交易日收盘价算术平均。50 日看中期，100 日看半年，200 日看长期趋势。',
  vola: '近 60 个交易日单日涨跌幅绝对值的均值；Beta 表示比特币每涨跌 1% 时 MSTR 的历史平均同向变动倍数。',
  fear: '币圈情绪指数（0 极度恐惧 – 100 极度贪婪，来自 Strategy 官网）与美股 VIX 恐慌指数。仅反映市场气氛，不预测拐点。',
  pershare: '公司持币总数 ÷ 调整后股数，衡量增发买币后每股实际含币量是在增厚还是稀释（未扣除债务）。',
  qdii: '国内公募发行的海外指数场外基金（A 类收申购费适合长拿，C 类按日计提服务费适合短持）。受外汇额度影响常限购或暂停。',
  mag7: '以选定区间起点收盘价归零，横向对比 MSTR 与美股七姐妹、各行业龙头、指数及比特币的累计涨跌幅。',
  cost: '200 周均价约为比特币过去 4 年均线；全网实现均价（Realized Price）为链上最后移动价格均值。历史上均曾短暂跌破。',
  dca: '假设每月首个交易日收盘固定投入相同美元金额，计算历史定投均价、当前盈亏与途中最大浮亏。',
  rsi: '14 周期相对强弱指数（0–100），70 以上偏热、30 以下偏冷，单边趋势中可长期钝化。',
  cross: '短期均线上穿长期均线为金叉，下穿为死叉，属于滞后趋势确认指标。',
  vol: '当日（或当周）成交量相对此前 20 周期均量的倍数，用于观察关键位置是否放量。',
  corr: '60 日相关系数越接近 1 代表与比特币越同向联动；Beta 为相对比特币的波动放大倍数。',
  mnav: 'Strategy 官网现行口径：股价 ÷ 扣除债务与优先股后的每股净持币美元价值。大于 1 为溢价，小于 1 为折价（2026/07/23 前后口径不同）。',
};

const RULES = {
  priceBelow: { label: (v) => `价格 ≤ ${money(Number(v))}` },
  priceAbove: { label: (v) => `价格 ≥ ${money(Number(v))}` },
  drawdown: { label: (v) => `高点回撤 ≥ ${v}%` },
  belowMa200: { label: (v) => `连续 ${v} 日低于 200 日线` },
  mnavBelow: { label: (v) => `官网 mNAV ≤ ${Number(v).toFixed(2)}x` },
  mnavAbove: { label: (v) => `官网 mNAV ≥ ${Number(v).toFixed(2)}x` },
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
  txt.textContent = mode === 'saving' ? '正在保存…' : mode === 'local' ? '浏览器缓存' : '本地已同步';
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
  if (metaTheme) metaTheme.setAttribute('content', isDark ? '#0B0B0D' : '#F5F5F7');
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
  $('btcChartSection').style.marginTop = layout === 'dual' ? '13px' : '0';
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
      ? bj(b.time, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' (4H)'
      : view === 'week'
      ? `${b.time} 周`
      : b.time;
  const fmtP = isBtc ? money0 : money;
  const volStr = isBtc ? `量 $${(b.volume / 1e8).toFixed(1)}亿` : `量 ${(b.volume / 1e6).toFixed(1)}M`;
  el.innerHTML = `<b>${tLabel}</b> · 开 <b>${fmtP(b.open)}</b> · 高 <b>${fmtP(b.high)}</b> · 低 <b>${fmtP(b.low)}</b> · 收 <b>${fmtP(b.close)}</b> <span class="${dirClass(chg)}">(${pct(chg)})</span> · ${volStr}`;
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
    [100, `${hm(p.post.end)}<em> 盘后完</em>`],
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
  if (S.session.key === 'wait' || S.session.key === 'pre') next = `距开盘 ${countdown(p.regular.start - now)} · `;
  else if (S.session.key === 'regular') next = `距收盘 ${countdown(p.regular.end - now)} · `;
  const ago = Math.round((Date.now() - S.loadedAt) / 1000);
  $('updated').textContent = S.fail ? '暂取不到行情，展示缓存' : `${next}${ago < 5 ? '刚刚更新' : ago + 's 前'}`;
}

function renderHeader() {
  const { bars, meta } = S.mstr;
  const closes = bars.map((b) => b.close);
  const price = meta.regularMarketPrice;
  const prev = S.intraday.previousClose ?? closes.at(-2);
  const chg = (price / prev - 1) * 100;

  const priceEl = $('price');
  priceEl.textContent = money(price);
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
    (S.session.key === 'regular' ? '盘中 · ' : '收盘 · ') +
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
    ovBadge.textContent = `BTC ${money0(S.btcPrice)} (${pct(btcChg)})`;
  }

  const cardsHtml = S.tia.items
    .map(
      (it) => `<div class="tia-item">
        <div class="tia-item-head">
          <span class="tia-item-title">${esc(it.title)}</span>
          <span class="tia-tone ${it.tone}">${esc(it.badge)}</span>
        </div>
        <div class="tia-item-val tabular">${esc(it.value)}</div>
        <div class="tia-item-desc">${esc(it.detail)}</div>
      </div>`
    )
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
  if (r >= 70) return ['多头偏热', `日 RSI ${r.toFixed(0)}（>70 强势区）`];
  if (r >= 55) return ['多头占优', `日 RSI ${r.toFixed(0)}（50 上方偏强）`];
  if (r > 45) return ['多空均衡', `日 RSI ${r.toFixed(0)}（围绕 50 震荡）`];
  if (r > 30) return ['空头占优', `日 RSI ${r.toFixed(0)}（50 下方偏弱）`];
  return ['超跌偏冷', `日 RSI ${r.toFixed(0)}（<30 弱势区）`];
}

function vixWords(v) {
  if (v >= 35) return '恐慌';
  if (v >= 25) return '偏紧';
  if (v >= 15) return '常态';
  return '平静';
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
  $('rsiV').innerHTML = `${r.toFixed(1)} <span style="color:var(--text-muted)">/</span> ${rw.toFixed(1)}`;
  $('rsiT').textContent = `日线 ${r.toFixed(1)} · 周线 ${rw.toFixed(1)}（30–70 为常态区间）。`;

  const avgVol = sma(bars.map((b) => b.volume), 20).at(-2);
  const ratio = bars.at(-1).volume / avgVol;
  $('volV').textContent = ratio.toFixed(2) + 'x';
  $('volT').textContent = `${bars.at(-1).time} 相对 20 日均量${S.session.key === 'regular' ? '（盘中未走完）' : ''}。`;

  const btcBars = S.btc.bars;
  const btcChg = (S.btcPrice / btcBars.at(-2).close - 1) * 100;
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
  const pos = place < 33 ? '偏低' : place > 67 ? '偏高' : '中段';

  const cost = Number(S.userData.position.cost);
  const mRows = [
    { name: '52周高', price: hi },
    { name: '52周低', price: lo },
    { name: '50日线', price: ma50 },
    { name: '100日线', price: ma100 },
    { name: '200日线', price: ma200 },
  ];
  if (cost > 0) mRows.push({ name: '我的成本', price: cost });
  mRows.push({ name: '现价', price, here: true });
  mRows.sort((x, y) => y.price - x.price);
  $('ladder').innerHTML = mRows
    .map((x) => `<li class="${x.here ? 'here' : ''}"><span>${x.name}</span><span>${money(x.price)}${x.here ? '' : `<small>${pct((x.price / price - 1) * 100)}</small>`}</span></li>`)
    .join('');

  renderTiaPanels();

  const bCloses = btcBars.map((x) => x.close);
  const bRows = [
    { name: '200日线', price: sma(bCloses, 200).at(-1) },
    { name: '现价', price: S.btcPrice, here: true },
  ];
  if (S.tia) {
    if (S.tia.struct?.abovePool?.price) bRows.push({ name: '前高流动性', price: S.tia.struct.abovePool.price });
    if (S.tia.struct?.belowPool?.price) bRows.push({ name: '前低流动性', price: S.tia.struct.belowPool.price });
    if (S.tia.vp) {
      bRows.push({ name: 'VAH 价值上沿', price: S.tia.vp.vah });
      bRows.push({ name: 'POC 控制点', price: S.tia.vp.poc });
      bRows.push({ name: 'VAL 价值下沿', price: S.tia.vp.val });
    }
    if (S.tia.fib) {
      bRows.push({ name: '0.618 回调/反弹', price: S.tia.fib.gp618 });
      bRows.push({ name: '0.66 黄金口袋', price: S.tia.fib.gp660 });
    }
    if (S.tia.vegasD) bRows.push({ name: '日 Vegas(144)', price: S.tia.vegasD.ema144 });
    if (S.tia.opens) bRows.push({ name: '本周开盘价', price: S.tia.opens.weeklyOpen });
  }
  $('bLadder').innerHTML = bRows
    .filter((x) => x.price > 0)
    .sort((x, y) => y.price - x.price)
    .map((x) => `<li class="${x.here ? 'here' : ''}"><span>${x.name}</span><span>${money0(x.price)}${x.here ? '' : `<small>${pct((x.price / S.btcPrice - 1) * 100)}</small>`}</span></li>`)
    .join('');

  const br = rsi(bCloses);
  const brw = rsi(toWeekly(btcBars).map((x) => x.close));
  const br4 = S.btc4h?.length >= 20 ? rsi(S.btc4h.map((x) => x.close)) : null;
  $('bRsiV').innerHTML = `${br.toFixed(1)} <span style="color:var(--text-muted)">/</span> ${brw.toFixed(1)}${br4 != null ? ` <span style="color:var(--text-muted)">/</span> ${br4.toFixed(1)}` : ''}`;
  $('bRsiT').textContent = `依次为日线 / 周线${br4 != null ? ' / 4H' : ''} RSI(14)。`;
  const bVolRatio = btcBars.at(-1).volume / sma(btcBars.map((x) => x.volume), 20).at(-2);
  $('bVolV').textContent = bVolRatio.toFixed(2) + 'x';
  $('bVolT').textContent = `${btcBars.at(-1).time} 相对 20 日均量。`;

  $('qPlace').textContent = `${place.toFixed(0)} 分（${pos}）`;
  $('qPlacePin').style.left = place + '%';
  $('qPlaceT').textContent = `${money(lo)} – ${money(hi)}`;

  const both = d50 >= 0 && d200 >= 0;
  const none = d50 < 0 && d200 < 0;
  $('qTrend').textContent = both ? '偏涨势' : none ? '偏跌势' : '均线交织';
  $('qTrend').className = 'ov-val ' + (both ? 'up' : none ? 'down' : '');
  $('qTrendT').textContent = `50D ${pct(d50)} · 200D ${pct(d200)}`;

  const [fw, fs] = forceWords(r);
  $('qForce').textContent = fw;
  $('qForce').className = 'ov-val ' + (r >= 55 ? 'up' : r <= 45 ? 'down' : '');
  $('qForceT').textContent = `${fs} · 周 ${rw.toFixed(0)}`;

  const moves = closes.slice(-61).map((v, i, arr) => (i ? Math.abs(v / arr[i - 1] - 1) * 100 : null)).filter((v) => v != null);
  const meanMove = moves.reduce((s, v) => s + v, 0) / moves.length;
  $('qVola').textContent = `±${meanMove.toFixed(1)}% · ${bt.toFixed(2)}x`;
  $('qVolaT').textContent = `60D 相关系数 ${c.toFixed(2)}`;

  $('qBtc').innerHTML = `${money0(S.btcPrice)} <span class="${dirClass(btcChg)}" style="font-size:12px">${pct(btcChg)}</span>`;
  const k = S.kpi?.btc;
  $('qBtcT').textContent = k ? `距 ATH ${money0(k.ath)} 回撤 ${Math.abs(k.drawdownFromAth).toFixed(1)}%` : `联动倍数 ${bt.toFixed(1)}x`;

  $('sentence').textContent = `现价居 52 周${pos}（${place.toFixed(0)} 分），${both ? '站上' : none ? '低于' : '介于'} 50/200 日均线，${fw}，量比 ${ratio.toFixed(2)}x，与 BTC 相关性 ${c.toFixed(2)}。`;

  renderMood();
  renderCompanyAndValuation();
  renderReview({ price, ma50, ma200, r, rw, ratio });
  renderPositionAndStress();
}

function renderMood() {
  const k = S.kpi?.btc;
  const fg = k?.fearGreedIndex;
  const vix = S.vix;
  const fearName = { 'Extreme Fear': '极度恐惧', Fear: '恐惧', Neutral: '中性', Greed: '贪婪', 'Extreme Greed': '极度贪婪' };
  const fgText = fg ? `${fearName[fg.classification] || fg.classification} ${fg.value}` : null;
  $('qFear').textContent = fgText || (vix ? `VIX ${vix.meta.regularMarketPrice.toFixed(1)}` : '--');
  if (vix) {
    const v = vix.meta.regularMarketPrice;
    $('qFearT').textContent = `美股 VIX ${v.toFixed(1)}（${vixWords(v)}）`;
  } else {
    $('qFearT').textContent = fg ? '来自官网币圈情绪指数' : '读取中…';
  }
  if (k && k.ma200w) {
    const gap200 = (S.btcPrice / k.ma200w - 1) * 100;
    const gapReal = (S.btcPrice / k.realizedPrice - 1) * 100;
    $('qCost').textContent = `${gap200 >= 0 ? '+' : '-'}${Math.abs(gap200).toFixed(0)}%`;
    $('qCostT').textContent = `200W ${money0(k.ma200w)} · 链上成本 ${pct(gapReal)}`;
  } else {
    $('qCost').textContent = '--';
    $('qCostT').textContent = '等待官网成本数据…';
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

  add(price >= ma200 ? bull : bear, price >= ma200 ? 'bull' : 'bear', price >= ma200 ? '站上 200 日线' : '低于 200 日线', `200D ${money(ma200)}`);
  add(price >= ma50 ? bull : bear, price >= ma50 ? 'bull' : 'bear', price >= ma50 ? '站上 50 日线' : '低于 50 日线', `50D ${money(ma50)}`);

  const maCross = crossings(sma(closes, 50), sma(closes, 200), bars);
  const lastMa = maCross.at(-1);
  if (lastMa) {
    add(
      lastMa.type === 'gold' ? bull : bear,
      lastMa.type === 'gold' ? 'bull' : 'bear',
      lastMa.type === 'gold' ? '50/200 日线金叉态' : '50/200 日线死叉态',
      `始于 ${lastMa.time}`
    );
  }

  const line = m.line.at(-1);
  const sig = m.signal.at(-1);
  const macdCross = crossings(m.line, m.signal, bars).at(-1);
  add(
    line >= sig ? bull : bear,
    line >= sig ? 'bull' : 'bear',
    line >= sig ? '日 MACD 多头排列' : '日 MACD 空头排列',
    `${macdCross?.time || '--'} 交叉 · ${line >= 0 ? '零轴上' : '零轴下'}`
  );

  const week = toWeekly(bars);
  const wm = macd(week.map((b) => b.close));
  add(
    wm.line.at(-1) >= wm.signal.at(-1) ? bull : bear,
    wm.line.at(-1) >= wm.signal.at(-1) ? 'bull' : 'bear',
    wm.line.at(-1) >= wm.signal.at(-1) ? '周 MACD 信号线上' : '周 MACD 信号线下',
    '中长期动能参考'
  );

  const rsiState = (name, x) => {
    if (x >= 70) add(flat, 'flat', `${name} RSI ${x.toFixed(1)} (>70)`, '短线偏热，注意钝化');
    else if (x <= 30) add(flat, 'flat', `${name} RSI ${x.toFixed(1)} (<30)`, '短线偏冷，注意弱势延续');
    else add(x >= 50 ? bull : bear, x >= 50 ? 'bull' : 'bear', `${name} RSI ${x.toFixed(1)}`, `${x >= 50 ? '多头' : '空头'}力度占优`);
  };
  rsiState('日', r);
  rsiState('周', rw);

  const last = bars.at(-1);
  const isUp = last.close >= last.open;
  if (ratio >= 1.5) add(isUp ? bull : bear, isUp ? 'bull' : 'bear', `放量${isUp ? '上涨' : '下跌'} (${ratio.toFixed(2)}x)`, '高于 20 日均量 1.5 倍以上');
  else add(flat, 'flat', `量比 ${ratio.toFixed(2)}x`, '成交量处常态水平');

  $('tallyBadge').innerHTML = `<span class="up">多 ${bull.length}</span> · <span class="down">空 ${bear.length}</span> · 中 ${flat.length}`;
  const combined = [...bull, ...bear, ...flat].filter((x) => S.signalFilter === 'all' || x.cls === S.signalFilter);
  $('signals').innerHTML = combined.map((it) => `<div class="signal-item ${it.cls}"><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div>`).join('');

  const fwd = (i, n) => (i + n < closes.length ? pct((closes[i + n] / closes[i] - 1) * 100) : '未满');
  $('crossTable').innerHTML =
    '<thead><tr><th>日期</th><th>类型</th><th>收盘</th><th>+20日</th><th>+60日</th><th>至今</th></tr></thead><tbody>' +
    maCross
      .slice()
      .reverse()
      .map(
        (x) =>
          `<tr class="tr-hover"><td>${x.time}</td><td class="${x.type === 'gold' ? 'up' : 'down'}" style="font-weight:600">${x.type === 'gold' ? '金叉' : '死叉'}</td><td>${money(closes[x.i])}</td><td>${fwd(x.i, 20)}</td><td>${fwd(x.i, 60)}</td><td>${pct((price / closes[x.i] - 1) * 100)}</td></tr>`
      )
      .join('') +
    '</tbody>';
  $('crossNote').textContent = `近 5 年共 ${maCross.length} 次交叉，历史样本仅供参考。`;
}

function renderCompanyAndValuation() {
  const k = S.kpi?.btc;
  const m = S.kpi?.mstr;
  if (!k || !(toNum(k.mNav) > 0)) {
    if (S.kpi?.tried) {
      $('qMnav').textContent = '--';
      $('qMnavT').textContent = '官网暂不可用';
    }
    return;
  }

  const v = toNum(k.mNav);
  const ext = k.extendedSession;
  const premText = v >= 1 ? `溢价 ${((v - 1) * 100).toFixed(0)}%` : `折价 ${((1 - v) * 100).toFixed(0)}%`;
  const net = toNum(k.netBtcPerShareUsd);
  $('qMnav').textContent = v.toFixed(2) + 'x';
  $('qMnavT').textContent = `${premText}${net > 0 ? ` · 净含币 ${money(net)}/股` : ''}`;

  const held = toNum(k.btcHoldings);
  const bn = (millions) => (millions / 100).toFixed(0) + ' 亿美元';

  $('valKpiMnav').textContent = v.toFixed(2) + 'x';
  $('valKpiMnavNote').textContent = `${premText}${ext?.mNav ? ` · 盘外 ${toNum(ext.mNav).toFixed(2)}x` : ''}`;
  $('valKpiBtc').textContent = held.toLocaleString('en-US') + ' 枚';
  $('valKpiBtcShare').textContent = `占总量 ${toNum(k.pctOfBtcTotalSupply).toFixed(2)}%`;
  $('valKpiNetBps').textContent = (toNum(k.netSatsPerShare) / 1e8).toFixed(5) + ' 枚';
  $('valKpiGrossBps').textContent = `约 ${money(net)} / 股`;
  if (m) {
    $('valKpiMcap').textContent = bn(toNum(m.marketCap));
    $('valKpiDebt').textContent = `债+优先股 ${bn(toNum(m.debt) + toNum(m.pref))}`;
  }

  const rows = [
    ['持有比特币总量', held.toLocaleString('en-US') + ' 枚'],
    ['占 2100 万上限', toNum(k.pctOfBtcTotalSupply).toFixed(2) + '%'],
    ['每股含币（未扣债）', (toNum(k.satsPerShare) / 1e8).toFixed(5) + ' 枚 (' + money(toNum(k.btcPerShareUsd)) + ')'],
    ['扣债后每股含币', (toNum(k.netSatsPerShare) / 1e8).toFixed(5) + ' 枚 (' + money(net) + ')'],
  ];
  if (m) rows.push(['公司总市值', bn(toNum(m.marketCap))], ['债务与优先股', bn(toNum(m.debt) + toNum(m.pref))]);
  $('facts').innerHTML = rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
}

function renderMnavBlock() {
  if (!S.history) return;
  charts.initMnav();
  const res = charts.drawMnav(S, S.mnavMode, S.mnavMonths);
  if (!res) return;
  const f2 = (n) => n.toFixed(2) + 'x';
  const row = (a, b) => `<div><dt>${a}</dt><dd>${b}</dd></div>`;
  const stat = (name, s) =>
    row(`${name}最高`, `${f2(s.hi[s.field])} (${dateCn(s.hi.date)})`) +
    row(`${name}最低`, `${f2(s.lo[s.field])} (${dateCn(s.lo.date)})`) +
    row(`${name}均值`, f2(s.avg));

  if (S.mnavMode === 'official') {
    $('mnavLegend').innerHTML = `
      <span class="legend-item"><span class="legend-line" style="background:var(--btc)"></span>现行算法</span>
      <span class="legend-item"><span class="legend-line" style="background:var(--ma-long)"></span>旧算法（EV ÷ 持币价值）</span>`;
    const live = toNum(S.kpi?.btc?.mNav);
    const fallbackNow = S.history.find((r) => r.mNav != null)?.mNav || 0;
    $('mnavNow').textContent = (live > 0 ? live : fallbackNow).toFixed(2) + 'x';
    $('mnavSay').textContent = res.b ? `旧算法约 ${res.b.now.toFixed(2)}x（高于区间 ${res.b.share.toFixed(0)}% 天数）` : '官网现行算法';
    $('mnavFacts').innerHTML =
      (res.a ? stat('现行', { ...res.a, field: 'mNav' }) : '') + (res.b ? stat('旧版', { ...res.b, field: 'mNavEntVal' }) : '');
    $('mnavNote').textContent = '2026/07/23 官网更新定义；虚线 1x 为平价。';
  } else {
    $('mnavLegend').innerHTML = `<span class="legend-item"><span class="legend-line" style="background:var(--btc)"></span>市值 ÷ 持币价值（未计债）</span>`;
    $('mnavNow').textContent = res.s ? f2(res.s.now) : '--';
    $('mnavSay').textContent = res.s ? `高于区间 ${res.s.share.toFixed(0)}% 天数` : '';
    $('mnavFacts').innerHTML = res.s ? stat('', { ...res.s, field: 'simple' }) : '';
    $('mnavNote').textContent = '2020 年起长周期简化参考，未计债务与优先股。';
  }
}

function renderPsBlock() {
  if (!S.history) return;
  charts.initPs();
  const h = charts.drawPs(S);
  if (!h) return;
  const n = (v) => v.toFixed(5) + ' 枚';
  const row = (a, b) => `<div><dt>${a}</dt><dd>${b}</dd></div>`;
  const m = (v) => (v / 1e8).toFixed(2) + ' 亿';
  $('psNow').textContent = n(h.now.perShare);
  $('psSay').textContent = `较峰值 (${dateCn(h.peak.date)}) 变动 ${pct(h.fromPeak)}`;
  $('psFacts').innerHTML =
    row('历史峰值', `${n(h.peak.perShare)} (${dateCn(h.peak.date)})`) +
    row(`${dateCn(h.first.date)} 起点`, n(h.first.perShare)) +
    row('累计每股含币', pct(h.perShareChange)) +
    row('累计持币总量', pct(h.btcChange)) +
    row('累计股数变化', `${pct(h.sharesChange)} (${m(h.first.shares)}→${m(h.now.shares)})`);
}

function renderEvents() {
  const bars = S.mstr?.bars;
  if (S.earn?.length && bars) {
    const latest = S.earn[0];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fiscal = months.indexOf(latest.fiscalQtrEnd.slice(0, 3));
    const nextName = months[(fiscal + 3) % 12];
    const last = S.earn.find((e) => e.fiscalQtrEnd.startsWith(nextName));
    const est = last ? `去年同期为 ${dateCn(last.date)}。` : '';
    $('earnNext').innerHTML = `下次财报待定（最近一次 ${dateCn(latest.date)}）。${est}`;
    const fiscalCn = (s) => `${s.slice(-4)}Q${Math.floor(months.indexOf(s.slice(0, 3)) / 3) + 1}`;
    $('earnTable').innerHTML =
      '<thead><tr><th>公布日</th><th>财季</th><th>次日涨跌</th></tr></thead><tbody>' +
      S.earn
        .map((e) => {
          const i = bars.findIndex((b) => b.time > e.date);
          const chg = i > 0 ? (bars[i].close / bars[i - 1].close - 1) * 100 : null;
          return `<tr class="tr-hover"><td>${dateCn(e.date)}</td><td>${fiscalCn(e.fiscalQtrEnd)}</td><td class="${chg == null ? '' : dirClass(chg)}" style="font-weight:600">${chg == null ? '未到' : pct(chg)}</td></tr>`;
        })
        .join('') +
      '</tbody>';
  } else if (S.tried) {
    $('earnNext').textContent = '暂未取到财报排期。';
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
    $('ledgerNext').innerHTML = `${year} 年至今净${net >= 0 ? '增持' : '减少'} <b>${Math.abs(net).toLocaleString('en-US')}</b> 枚（展示近 10 笔）。`;
    $('ledgerTable').innerHTML =
      '<thead><tr><th>日期</th><th>方向</th><th>变动(枚)</th><th>当日币价</th><th>累计持币</th></tr></thead><tbody>' +
      changes
        .slice(-10)
        .reverse()
        .map((c) => {
          const p = btcAt.get(c.date);
          return `<tr class="tr-hover"><td>${dateCn(c.date)}</td><td><span class="badge ${c.delta > 0 ? 'badge-up' : 'badge-down'}">${c.delta > 0 ? '增持' : '减少'}</span></td><td style="font-weight:600">${Math.abs(c.delta).toLocaleString('en-US')}</td><td>${p ? money0(p) : '--'}</td><td>${Math.round(c.total).toLocaleString('en-US')}</td></tr>`;
        })
        .join('') +
      '</tbody>';
  } else if (S.tried) {
    $('ledgerNext').textContent = '暂未取到持币变动记录。';
  }
}

function renderPositionAndStress() {
  const cost = Number(S.userData.position.cost);
  const qty = Number(S.userData.position.qty);
  const p = !!S.userData.prefs.privacy;

  if (!(cost > 0)) {
    $('plV').textContent = '--';
    $('plV').className = 'facts-big tabular';
    $('plT').textContent = '填入成本后，MSTR K 线自动显示成本虚线。';
    $('heroPosVal').textContent = '未填成本价';
    $('heroPosVal').className = 'status-box-val tabular';
    $('heroPosSub').textContent = '点击录入成本与股数';
  } else if (S.price) {
    const pl = (S.price / cost - 1) * 100;
    const plAmt = qty > 0 ? (S.price >= cost ? '+' : '-') + money(Math.abs(S.price - cost) * qty) : '';
    $('plV').textContent = pct(pl);
    $('plV').className = 'facts-big tabular ' + dirClass(pl);
    $('plT').textContent =
      qty > 0
        ? `现价 ${money(S.price)} · 持仓 ${p ? '•• 股' : qty + ' 股'} 浮盈亏 ${maskUsd(plAmt)}`
        : `现价 ${money(S.price)} · 成本 ${maskUsd(money(cost))}`;
    $('heroPosVal').innerHTML = `${pct(pl)} ${plAmt ? `<span style="font-size:11.5px;font-weight:500">${maskUsd(plAmt)}</span>` : ''}`;
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
    : '记录买入理由、条件提醒与复盘日';

  if (!S.mstr || !S.price) return;
  const value = qty > 0 ? qty * S.price : 10000;
  const worst = maxDrawdown(S.mstr.bars);
  const row = (a, b) => `<div><dt>${a}</dt><dd>${b}</dd></div>`;
  const usd = (n) => maskUsd('$' + Math.round(n).toLocaleString('en-US'));
  const costRow =
    cost > 0 && qty > 0
      ? row('回本所需', S.price >= cost ? `高于成本 ${((S.price / cost - 1) * 100).toFixed(1)}%` : `需涨 ${((cost / S.price - 1) * 100).toFixed(1)}%`)
      : '';
  $('planStress').innerHTML =
    row(qty > 0 ? '持仓现值' : '假设规模', usd(value)) +
    row('回撤 30% / 50% / 70%', `-${usd(value * 0.3)} / -${usd(value * 0.5)} / -${usd(value * 0.7)}`) +
    costRow +
    row('近 5 年最大回撤', `${worst.pct.toFixed(1)}% (${dateCn(worst.from)}–${dateCn(worst.to)})`);
  $('planStressNote').textContent = '跌 50% 需涨 100% 回本，请以损定量控制仓位。';
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
  if (rule.type === 'priceBelow' || rule.type === 'priceAbove') return `距现价 ${pct((v / p - 1) * 100)}`;
  if (rule.type === 'mnavBelow' || rule.type === 'mnavAbove') {
    const m = toNum(S.kpi?.btc?.mNav);
    return m > 0 ? `当前 ${m.toFixed(2)}x` : '';
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
  const head = `自 ${dateCn(r.from)} 起共触发 <b>${r.events.length}</b> 次。`;
  if (!r.events.length) return head;
  const list = r.events
    .slice(-5)
    .reverse()
    .map((e) => `${dateCn(e.date)} (${money(e.close)})：+20日 ${fmt(e.after20)}，+60日 ${fmt(e.after60)}`)
    .join('<br>');
  return `${head}<br>${list}`;
}

function renderPlan() {
  const plan = S.userData.plan;
  if (document.activeElement !== $('planWhy')) $('planWhy').value = plan.why || '';
  $('planReview').value = plan.review || '';

  $('ruleTable').innerHTML = plan.rules.length
    ? '<thead><tr><th>状态</th><th>条件</th><th>执行动作</th><th>操作</th></tr></thead><tbody>' +
      plan.rules
        .map((r) => {
          const tested = r.showBack ? backtestRule(r, S.mstr?.bars || [], S.history || []) : null;
          const backRow = !r.showBack ? '' : `<tr><td colspan="4" class="wrap-cell"><div class="explain-box">${backText(tested)}</div></td></tr>`;
          return `<tr class="tr-hover">
            <td><span class="badge ${r.firedAt ? 'badge-btc' : 'badge-neutral'}">${r.firedAt ? '已触发 ' + dateCn(r.firedAt) : '监控中'}</span></td>
            <td class="wrap-cell"><b>${esc(RULES[r.type].label(r.value))}</b><div style="font-size:11px;color:var(--text-tertiary)">${esc(ruleDistance(r))}</div></td>
            <td class="wrap-cell">${esc(r.note) || '<span class="warn">未填</span>'}</td>
            <td>
              ${r.type === 'date' ? '' : `<button type="button" class="pill-btn sm" data-act="back" data-id="${r.id}">${r.showBack ? '收起' : '回看'}</button>`}
              ${r.firedAt ? `<button type="button" class="pill-btn sm" data-act="rearm" data-id="${r.id}">重置</button>` : ''}
              <button type="button" class="pill-btn sm danger" data-act="del" data-id="${r.id}">删</button>
            </td>
          </tr>${backRow}`;
        })
        .join('') +
      '</tbody>'
    : '<tbody><tr><td class="wrap-cell" style="color:var(--text-tertiary)">暂无规则，可在上方快速添加。</td></tr></tbody>';

  $('tradeTable').innerHTML = plan.trades.length
    ? '<thead><tr><th>日期</th><th>方向</th><th>股数</th><th>价格</th><th>备注</th><th></th></tr></thead><tbody>' +
      plan.trades
        .map(
          (x) =>
            `<tr class="tr-hover"><td>${dateCn(x.date)}</td><td><span class="badge ${x.side === '买入' ? 'badge-up' : 'badge-down'}">${esc(x.side)}</span></td><td>${maskShares(x.shares + ' 股')}</td><td>${maskUsd(money(x.price))}</td><td class="wrap-cell">${esc(x.note)}</td><td><button type="button" class="pill-btn sm danger" data-trade="${x.id}">删</button></td></tr>`
        )
        .join('') +
      '</tbody>'
    : '<tbody><tr><td class="wrap-cell" style="color:var(--text-tertiary)">暂无交易记录。</td></tr></tbody>';

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
    fired.push(`${RULES[r.type].label(r.value)}（${r.note || '未填动作'}）`);
  }
  if (plan.review && ctx.today >= plan.review && plan.reviewFired !== plan.review) {
    plan.reviewFired = plan.review;
    fired.push('已到复盘日期');
  }
  if (!fired.length) return;
  persistUserData(true);
  const msg = '交易计划：' + fired.join('；') + (plan.why ? `。买入理由：${plan.why}` : '');
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
    ['七姐妹', MAG7_LIST],
    ['行业龙头', MAG_LEAD_LIST],
    ['核心关注', MAG_EXTRA_LIST],
    ['加密/A股', [MAG_BTC_ITEM, ...MAG_CN_LIST]],
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
    '<thead><tr><th>标的</th><th>涨跌幅</th></tr></thead><tbody>' +
    rows
      .map(([sym, l]) => {
        const w = Math.min(100, Math.round((Math.abs(l.change) / maxAbs) * 100));
        const col = l.change >= 0 ? 'var(--up)' : 'var(--down)';
        return `<tr class="tr-hover">
          <td><span style="display:inline-flex;align-items:center;gap:5px"><i style="display:inline-block;width:6.5px;height:6.5px;border-radius:99px;background:${colorMap[sym] || 'var(--blue)'}"></i>${MAG_BOLD.has(sym) ? `<b>${names[sym]}</b>` : names[sym]} <span style="font-size:10.5px;color:var(--text-tertiary)">${codes[sym] || sym}</span></span></td>
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
  $('dcaSay').textContent = `自 ${r.from} 起共 ${r.count} 期，现价较均价 ${pct(vs)}`;
  const row = (a, b, cls = '') => `<div><dt>${a}</dt><dd class="${cls}">${b}</dd></div>`;
  const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
  $('dcaFacts').innerHTML =
    row('累计本金', usd(r.spent)) +
    row('累计数量', `${r.units.toFixed(isMstr ? 2 : 5)} ${unit}`) +
    row('当前市值', usd(r.value)) +
    row('账面盈亏', `${r.pl >= 0 ? '+' : '-'}${usd(Math.abs(r.value - r.spent))} (${pct(r.pl * 100)})`, dirClass(r.pl)) +
    row('最大浮亏', r.worst < 0 ? `${pct(r.worst * 100)} (${r.worstTime})` : '无', r.worst < 0 ? 'down' : '');
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
  $('qdiiStatSplit').textContent = `纳指 ${nCount} · 标普 ${sCount}`;
  $('qdiiStatOpen').textContent = `${open.length} 只`;
  $('qdiiStatBig').textContent = `${big.length} 只`;
  $('qdiiStatTracked').textContent = dateCn(S.qdii.tracked_from);

  const list = (qdiiFilter === 'open' ? open : byClass)
    .filter((r) => !kw || r.name.toLowerCase().includes(kw) || r.code.toLowerCase().includes(kw) || (r.company || '').toLowerCase().includes(kw))
    .sort((a, b) => b.st.limit - a.st.limit || a.name.localeCompare(b.name, 'zh'));

  $('qdiiSay').innerHTML = `筛选 <b>${byClass.length}</b> 只，可买 <b>${open.length}</b> 只，当前显示 <b>${list.length}</b> 条。`;

  const since = (r) => (r.since ? dateCn(r.since) : r.st.open ? `${dateCn(r.seen)} 前已开` : '期内未变');
  const rate = (r) => {
    if (r.discounted_rate == null || r.discounted_rate === '') return '--';
    const s = String(r.discounted_rate).trim();
    return s.endsWith('%') ? s : `${s}%`;
  };
  $('qdiiTable').innerHTML =
    '<thead><tr><th>基金名称</th><th>代码</th><th>指数</th><th>费率</th><th>申购状态</th><th>变更日期</th></tr></thead><tbody>' +
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
      : '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:18px">无匹配基金</td></tr>') +
    '</tbody>';

  const t = S.qdii.stored_at ? new Date(S.qdii.stored_at * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '';
  $('qdiiNote').textContent = `整理自东方财富${t ? `（更新于 ${t}）` : ''}，实际限额以销售平台为准。`;
}

const SOURCES = [
  ['yahoo', 'Yahoo Finance', 'MSTR 与 BTC 日线/周线', () => S.mstr && bj(S.mstr.meta.regularMarketTime, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 5],
  ['btcExtra', 'Yahoo Finance', 'BTC 4H K 线与 CME 期货缺口', () => S.cme?.bars?.at(-1)?.time, 5],
  ['vix', 'Yahoo Finance', '美股恐慌指数 VIX', () => S.vix && bj(S.vix.meta.regularMarketTime, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 5],
  ['kpi', 'Strategy 官网', 'mNAV、持币量与情绪指数', () => S.kpi?.mstr?.timeStamp, null],
  ['history', 'Strategy 官网', 'mNAV 历史与每股含币序列', () => S.history?.[0]?.date, 5],
  ['earn', 'Nasdaq', 'MSTR 财报日期', () => S.earn?.[0]?.date, null],
  ['mag', 'Yahoo Finance', '多资产横向对比', () => S.mag?.AAPL?.bars.at(-1)?.time, 5],
  ['qdii', 'GlobalAssetHistory', '场外 QDII 申购状态', () => S.qdii?.stored_at && bj(S.qdii.stored_at, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 3],
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
    '<thead><tr><th>来源</th><th>内容</th><th>数据时间</th><th>状态</th></tr></thead><tbody>' +
    SOURCES.map(([key, name, what, dateFn, limit]) => {
      const st = S.health[key];
      const age = dayAge(key);
      const old = limit && age != null && age > limit;
      const dStr = dateFn();
      const [word, badgeCls] =
        st === false
          ? [dStr ? '缓存回退' : '不可用', 'badge-up']
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
    const unit = view === '4h' ? '根' : view === 'week' ? '周' : '日';
    box.querySelector('.cross-name').textContent = `金叉死叉(${v.short}/${v.long})`;
    box.querySelector('.ma-picks').innerHTML = MA_KEYS.map(
      ([k, color]) => `<label><input type="checkbox" data-ma="${k}" ${showObj[k] ? 'checked' : ''}><i class="ma-swatch" style="background:var(${color})"></i>MA${v[k]}${unit === '周' ? 'W' : ''}</label>`
    ).join('');
  }
  const bRanges = $('bRanges');
  const bHint = $('bViewHint');
  if (bRanges) bRanges.hidden = S.btcView === '4h';
  if (bHint) {
    bHint.textContent =
      S.btcView === '4h'
        ? '近 60 天 UTC 4 小时 K 线 · 叠加 4H Vegas 与波段关键位'
        : S.btcView === 'week'
        ? 'UTC 周一归并周 K · 叠加周线关键位'
        : 'UTC 0 点日线 · 提阿非罗常用指标已接入';
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
      $('sentence').textContent = '暂时取不到行情，请检查网络，每分钟自动重试。';
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
      const scope = helpBtn.closest('.ov-cell, .readout-block, .card');
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
      const anchor = helpBtn.closest('.ov-top, .readout-head, .card-header');
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
    showToast('已记录交易');
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
