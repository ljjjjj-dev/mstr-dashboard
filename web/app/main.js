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
  sessionOf,
  extendedQuote,
  evalRule,
  backtestRule,
  maxDrawdown,
  planCheckup,
  qdiiStatus,
} = window;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n == null || Number.isNaN(n) ? '--' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (n) => (n == null || Number.isNaN(n) ? '--' : (n > 0 ? '+' : '') + Number(n).toFixed(1) + '%');
const dirClass = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const toNum = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '')));
const dateCn = (d) => String(d ?? '').replaceAll('-', '/');
const bj = (t, opts) => new Date(t * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, ...opts });
const hm = (t) => bj(t, { hour: '2-digit', minute: '2-digit' });
const countdown = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分` : `${Math.max(1, Math.ceil(s / 60))} 分钟`);

const TAB_TITLES = {
  overview: '总览看板',
  charts: 'K 线行情',
  valuation: '估值与持币',
  strategy: '持仓与交易计划',
  compare: '对比与定投',
  qdii: '场外基金 QDII',
};

const TERMS = {
  range: '只看这一年价格的相对位置，就像考试排名。分数低可能是机会，也可能是公司或比特币确实变差了，所以它不能说明便宜还是贵。',
  ma: '平均价就是过去一段时间每天收盘价的平均数。现价高于平均价，说明比这段时间的平均水平强；低于就是弱。50 天看几个月，100 天看半年左右，200 天看一年左右。图上那三条线就是它们，专业叫法是“均线”。',
  vola: '这是把最近每天涨跌的幅度取平均。数字越大，账面上下越剧烈。MSTR 的波动通常比普通股票和比特币都大，持有前要想清楚自己能不能接受。',
  fear: '恐慌指标衡量的是大家的情绪。比特币情绪指数看币圈，0 最恐惧，100 最贪婪，数字由 Strategy 官网提供。VIX 看美股未来一个月的预期波动，大跌时往往飙升。恐慌时不一定是底部，恐慌可能持续很久甚至加深，所以它只能说明气氛，不能预测涨跌。',
  pershare: '公司持有的比特币除以股数，就是每一股对应多少比特币。公司买币会让它上升，增发股票会让它下降。所以只看“公司持币越来越多”不够，要看每股对应的有没有变多。如果增发时股价有足够溢价，增发后每股含币量也可能上升；下降也不一定代表公司变差，比如筹到的钱可能用在别处。这里没有扣除债务，所以不是净值。',
  qdii: 'A 类通常买入时收申购费，适合长期持有；C 类不收申购费，但按天收销售服务费，适合短期持有。同一只基金的 A 类和 C 类投资的东西一样，只是收费方式不同，开放和限额也可能不一样。场外 QDII 基金是国内基金公司发行、投资海外市场的基金，可以在支付宝等平台买，不用开美股账户。因为换汇额度有限，基金公司经常暂停申购或限制每天能买的金额，所以“能不能买、能买多少”会经常变化。这里只显示状态，不比较哪只更好。',
  mag7: '“美股七姐妹”通常指苹果、微软、谷歌母公司 Alphabet、亚马逊、英伟达、Meta 和特斯拉这七家大型科技公司，它们在纳斯达克和标普 500 里占比很高。“各行业龙头”里，台积电（芯片代工）、博通（网络和定制芯片）、美光（存储芯片）、Palantir（数据软件）、SpaceX（火箭和卫星互联网，2026 年 6 月才上市）、Coinbase（加密货币交易所）偏科技；礼来（医药）、摩根大通（银行）、伯克希尔（保险和投资）、沃尔玛（零售）、麦当劳（餐饮）、可口可乐（饮料）和埃克森美孚（能源）可以看看科技以外的行业表现。纳指 100 用 QQQ 代表，标普 500 是美国 500 家大公司组成的指数。上证指数包括上海交易所的全部股票，沪深 300 是沪深两市 300 家大公司，这里用跟踪它的 ETF 代表。BitMine（BMNR）是一家以持有以太坊为主的上市公司，和微策略持有比特币的模式类似。这里只比较涨跌幅，不代表公司好坏。',
  cost: '200 周平均价是比特币过去约 4 年的平均价，常被当作长期趋势线。全网平均持币成本（realized price）是所有比特币最后一次转移时价格的平均值，可以粗略理解为大家的平均成本。价格曾跌破过这两条线，它们不是不会被跌破的底部。',
  dca: '定投就是不管涨跌，每月投固定金额。价格低时买到的多，价格高时买到的少。定投均价是总投入除以买到的数量，也就是你平均花多少钱买到一股或一枚。这里只是用历史价格算账。定投能摊平买入价格，但不能保证赚钱，标的长期下跌时一样会亏。',
  rsi: '衡量最近 14 根 K 线上涨和下跌的相对力度，范围 0 到 100。日线看 14 天，周线看 14 周。常用 70 和 30 作为参考线，强势股可能长期停在高位，不能单独用来判断买卖。',
  cross: '短期均线上穿长期均线叫金叉，下穿叫死叉。均线是过去价格的平均，所以交叉总是滞后的，价格来回震荡时还会反复出现。',
  vol: '成交量是一天内成交的股数。放大说明这天比平时更活跃，常常伴随重要消息，但不能说明方向。',
  corr: '第一个数字是过去 60 个交易日的平均变动倍数，专业叫 Beta。比如 1.5 表示比特币涨 1% 时，MSTR 平均约涨 1.5%，跌的时候也一样。这是平均值，单日可能差很多，这个倍数也会随时间变化。相关系数看的是两者同步的程度，1 表示完全同向。',
  mnav: 'MSTR 的主要资产是比特币。mNAV 看的是股价比每股实际对应的比特币贵多少。按 Strategy 官网现在的说明：分子是股价，分母是每股对应的比特币美元价值，并且已扣除债务、优先股等优先权益（再加回公司持有的美元资产）。比如 1.10 倍，大致相当于花 1.10 美元买到净值 1 美元的比特币。大于 1 叫溢价，小于 1 叫折价。官网特别说明：它不等于传统意义上的净资产价值，而且 2026 年 7 月 23 日之前 mNAV 指的是另一种指标，前后不能直接比较。',
};

const RULES = {
  priceBelow: { label: (v) => `价格跌到或低于 ${money(Number(v))}` },
  priceAbove: { label: (v) => `价格涨到或高于 ${money(Number(v))}` },
  drawdown: { label: (v) => `从设定后的高点回撤 ${v}%` },
  belowMa200: { label: (v) => `连续 ${v} 个交易日收盘低于 200 日线` },
  mnavBelow: { label: (v) => `官网 mNAV 低于或等于 ${Number(v).toFixed(2)} 倍` },
  mnavAbove: { label: (v) => `官网 mNAV 高于或等于 ${Number(v).toFixed(2)} 倍` },
  date: { label: (v) => `到了 ${dateCn(v)}` },
};

const MAG_ALL = [...MAG7_LIST, ...MAG_LEAD_LIST, ...MAG_EXTRA_LIST, MAG_BTC_ITEM, ...MAG_CN_LIST];
const MAG_BOLD = new Set(['MSTR', 'BMNR']);
const MAG_LOAD = [...MAG7_LIST, ...MAG_LEAD_LIST, ...MAG_CN_LIST].map((x) => x[0]).concat('BMNR', '^GSPC');

const S = {
  tab: 'overview',
  chartLayout: 'mstr', // mstr | btc | dual
  signalFilter: 'all', // all | bull | bear | flat
  mstrView: 'day',
  mstrMonths: 6,
  mstrSub: 'off',
  showCross: true,
  showEarn: true,
  btcView: 'day',
  btcMonths: 6,
  btcShowCross: true,
  mnavMode: 'official',
  mnavMonths: 0,
  magMonths: 12,
  qdiiSearch: '',
  syncMode: 'file',

  userData: createDefaultUserData(),
  health: {},
  mstr: null,
  btc: null,
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

// --- Toast & Sync Indicator ---
let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 2600);
}

function updateSyncBadge(mode) {
  S.syncMode = mode;
  const dot = $('syncDot');
  const txt = $('syncText');
  if (!dot || !txt) return;
  dot.className = 'sync-dot ' + (mode === 'saving' ? 'saving' : mode === 'local' ? 'local' : '');
  txt.textContent = mode === 'saving' ? '正在同步本地 JSON...' : mode === 'local' ? '浏览器本地缓存' : '已同步至本地 JSON';
}

function persistUserData(immediate = false) {
  updateSyncBadge('saving');
  if (immediate) {
    saveUserDataNow(S.userData).then((r) => updateSyncBadge(r.mode));
  } else {
    scheduleSaveUserData(S.userData, (mode) => updateSyncBadge(mode));
  }
}

// --- Sound ---
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
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.75);
    });
  } catch {}
}
addEventListener('pointerdown', enableAudio, { passive: true });
addEventListener('keydown', enableAudio);

// --- Theme & Privacy ---
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

// --- Data Parsers ---
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

// --- View Switching ---
function switchTab(tab) {
  if (!TAB_TITLES[tab]) return;
  S.tab = tab;
  $('pageTitle').textContent = TAB_TITLES[tab];
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#mobileNav button').forEach((b) => b.classList.toggle('primary', b.dataset.tab === tab));
  document.querySelectorAll('.view-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));

  charts.ensureChartsForTab(tab, chartCallbacks(), S.chartLayout);
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
  const week = view === 'week';
  const span = week ? '这一周' : '这一天';
  const prevName = week ? '上一周' : '前一天';
  const red = b.close >= b.open;
  const volStr = isBtc ? `成交额 <b>${(b.volume / 1e8).toFixed(0)} 亿美元</b>` : `成交 <b>${(b.volume / 1e6).toFixed(1)} 百万股</b>`;
  el.innerHTML = `<b>${week ? b.time + ' 这周' : b.time}</b>：开盘 <b>${money(b.open)}</b>，最高 <b>${money(b.high)}</b>，最低 <b>${money(b.low)}</b>，收盘 <b>${money(b.close)}</b>，${volStr}。<br>${span}是<span class="${red ? 'up' : 'down'}">${red ? '红' : '绿'}色</span>，因为收盘${red ? '不低于' : '低于'}开盘；比${prevName}收盘<span class="${dirClass(chg)}">${chg >= 0 ? '涨' : '跌'} ${Math.abs(chg).toFixed(1)}%</span>。`;
}

// --- Band, Status & Header ---
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
    chip.textContent = '数据可能过期';
  } else {
    chip.className = 'session-pill ' + S.session.cls;
    chip.textContent = S.session.label;
  }
  let next = '';
  if (S.session.key === 'wait' || S.session.key === 'pre') next = `距开盘 ${countdown(p.regular.start - now)} · `;
  else if (S.session.key === 'regular') next = `距收盘 ${countdown(p.regular.end - now)} · `;
  const ago = Math.round((Date.now() - S.loadedAt) / 1000);
  $('updated').textContent = S.fail
    ? '暂取不到行情，提醒已暂停，当前展示上次缓存'
    : `${next}${ago < 5 ? '刚刚更新' : ago + ' 秒前更新'} · 每分钟自动刷新`;
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
  chgBadge.textContent = `${price >= prev ? '+' : ''}${(price - prev).toFixed(2)}  (${pct(chg)})`;
  chgBadge.className = 'badge ' + (chg > 0 ? 'badge-up' : chg < 0 ? 'badge-down' : 'badge-neutral');

  $('priceLabel').textContent =
    (S.session.key === 'regular' ? '盘中现价 · ' : '收盘价 · ') +
    bj(meta.regularMarketTime, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const e = S.ext;
  $('ext').hidden = !e;
  if (e) {
    $('ext').innerHTML = `${e.label} <b>${money(e.price)}</b> <span class="${dirClass(e.change)}">${pct(e.change)}</span> · ${hm(e.time)}`;
  }

  $('sideMstrPrice').textContent = money(price);
  $('sideMstrChg').textContent = pct(chg);
  $('sideMstrChg').className = 'mini-quote-chg ' + dirClass(chg);

  const btcPrev = S.btc.bars.at(-2).close;
  const btcChg = (S.btcPrice / btcPrev - 1) * 100;
  $('sideBtcPrice').textContent = '$' + Math.round(S.btcPrice).toLocaleString('en-US');
  $('sideBtcChg').textContent = pct(btcChg);
  $('sideBtcChg').className = 'mini-quote-chg ' + dirClass(btcChg);

  document.title = `${money(e ? e.price : price)} ${pct(e ? e.change : chg)} · MSTR 看盘`;
}

// --- Readout, Overview Questions, Signals & Hero Strip ---
function forceWords(r) {
  if (r >= 70) return ['上涨力量很强', '已经连涨了一段时间，常被认为偏热，但也可能继续强下去。'];
  if (r >= 55) return ['上涨力量占优', '最近涨的日子和幅度多于跌的。'];
  if (r > 45) return ['涨跌差不多', '最近买卖双方势均力敌。'];
  if (r > 30) return ['下跌力量占优', '最近跌的日子和幅度多于涨的，但还没到极端。'];
  return ['下跌力量很强', '已经连跌了一段时间，常被认为偏冷，但也可能继续弱下去。'];
}

function vixWords(v) {
  if (v >= 35) return ['恐慌', '美股波动预期很高。'];
  if (v >= 25) return ['紧张', '美股波动预期偏高。'];
  if (v >= 15) return ['正常', '美股波动预期处在常见范围。'];
  return ['平静', '美股波动预期偏低。'];
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
  const rsiLevel = (x) => (x >= 70 ? '高于 70' : x <= 30 ? '低于 30' : '在 30 到 70 之间');
  $('rsiV').innerHTML = `${r.toFixed(1)} <span style="color:var(--text-muted)">/</span> ${rw.toFixed(1)}`;
  $('rsiT').textContent = `日线${rsiLevel(r)}，看几周的强弱；周线${rsiLevel(rw)}，看几个月的强弱。本周未走完，周线数字还会变。`;

  const avgVol = sma(bars.map((b) => b.volume), 20).at(-2);
  const ratio = bars.at(-1).volume / avgVol;
  $('volV').textContent = ratio.toFixed(2) + ' 倍';
  $('volT').textContent = `${bars.at(-1).time} 成交量相对此前 20 日平均。` + (S.session.key === 'regular' ? '盘中还没走完，数字会偏小。' : '');

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
  const volWord = ratio >= 1.5 ? '成交量放大' : ratio <= 0.7 ? '成交量偏低' : '成交量正常';
  const pos = place < 33 ? '偏低' : place > 67 ? '偏高' : '中段';

  const cost = Number(S.userData.position.cost);
  const mRows = [
    { name: '一年最高', price: hi },
    { name: '一年最低', price: lo },
    { name: '50 日线', price: ma50 },
    { name: '100 日线', price: ma100 },
    { name: '200 日线', price: ma200 },
  ];
  if (cost > 0) mRows.push({ name: '我的成本', price: cost });
  mRows.push({ name: '现价', price, here: true });
  mRows.sort((x, y) => y.price - x.price);
  $('ladder').innerHTML = mRows
    .map((x) => `<li class="${x.here ? 'here' : ''}"><span>${x.name}</span><span>${money(x.price)}${x.here ? '' : `<small>${pct((x.price / price - 1) * 100)}</small>`}</span></li>`)
    .join('');

  const bCloses = btcBars.map((x) => x.close);
  const bYear = btcBars.slice(-365);
  const bRows = [
    { name: '一年最高', price: Math.max(...bYear.map((x) => x.high)) },
    { name: '一年最低', price: Math.min(...bYear.map((x) => x.low)) },
    { name: '50 日线', price: sma(bCloses, 50).at(-1) },
    { name: '100 日线', price: sma(bCloses, 100).at(-1) },
    { name: '200 日线', price: sma(bCloses, 200).at(-1) },
    { name: '现价', price: S.btcPrice, here: true },
  ].sort((x, y) => y.price - x.price);
  $('bLadder').innerHTML = bRows
    .map((x) => `<li class="${x.here ? 'here' : ''}"><span>${x.name}</span><span>${money(x.price)}${x.here ? '' : `<small>${pct((x.price / S.btcPrice - 1) * 100)}</small>`}</span></li>`)
    .join('');
  const br = rsi(bCloses);
  const brw = rsi(toWeekly(btcBars).map((x) => x.close));
  $('bRsiV').innerHTML = `${br.toFixed(1)} <span style="color:var(--text-muted)">/</span> ${brw.toFixed(1)}`;
  $('bRsiT').textContent = `日线${rsiLevel(br)}，看几周的强弱；周线${rsiLevel(brw)}，看几个月的强弱。`;
  const bVolRatio = btcBars.at(-1).volume / sma(btcBars.map((x) => x.volume), 20).at(-2);
  $('bVolV').textContent = bVolRatio.toFixed(2) + ' 倍';
  $('bVolT').textContent = `${btcBars.at(-1).time} 成交额相对前 20 日平均（UTC 未走完时偏小）。`;

  $('qPlace').textContent = `第 ${place.toFixed(0)} 分`;
  $('qPlacePin').style.left = place + '%';
  $('qLo').textContent = '最低 ' + money(lo);
  $('qHi').textContent = '最高 ' + money(hi);
  $('qPlaceT').textContent = `一年最低算 0 分、最高算 100 分，现在第 ${place.toFixed(0)} 分，处于${pos}。分数低不代表便宜。`;

  $('heroRange').textContent = `第 ${place.toFixed(0)} 分（${pos}）`;
  $('heroRangeSub').textContent = `区间 ${money(lo)} – ${money(hi)}`;

  const both = d50 >= 0 && d200 >= 0;
  const none = d50 < 0 && d200 < 0;
  $('qTrend').textContent = both ? '偏涨势' : none ? '偏跌势' : '方向不明';
  $('qTrend').className = 'q-val ' + (both ? 'up' : none ? 'down' : '');
  $('qTrendT').textContent = both ? '现价高于过去 50 天和 200 天平均价。' : none ? '现价低于过去 50 天和 200 天平均价。' : '现价高于一条均线、低于另一条，暂未形成单边。';
  $('qTrendS').textContent = `50 日 ${money(ma50)}（${d50 >= 0 ? '高' : '低'} ${Math.abs(d50).toFixed(1)}%），200 日 ${money(ma200)}（${d200 >= 0 ? '高' : '低'} ${Math.abs(d200).toFixed(1)}%）。`;

  const [fw, fs] = forceWords(r);
  $('qForce').textContent = fw;
  $('qForce').className = 'q-val ' + (r >= 55 ? 'up' : r <= 45 ? 'down' : '');
  $('qForceT').textContent = fs;
  $('qForceS').textContent = `来自 RSI(14) 指标，当前 ${r.toFixed(0)}（0–100，50 为平衡点）。`;

  const moves = closes.slice(-61).map((v, i, arr) => (i ? Math.abs(v / arr[i - 1] - 1) * 100 : null)).filter((v) => v != null);
  const meanMove = moves.reduce((s, v) => s + v, 0) / moves.length;
  $('qVola').textContent = `约 ±${meanMove.toFixed(1)}%`;
  $('qVolaT').textContent = `近 60 个交易日平均日波动 ${meanMove.toFixed(1)}%。若持仓 1 万美元，单日常见波动约 $${Math.round(meanMove * 100).toLocaleString('en-US')}。`;
  $('qVolaS').textContent = `近 60 日单日最大波动 ${Math.max(...moves).toFixed(1)}%。历史数字不代表上限。`;

  $('heroVola').textContent = `±${meanMove.toFixed(1)}% · ${bt.toFixed(1)}x`;
  $('heroVolaSub').textContent = `相关系数 ${c.toFixed(2)}（比特币 ±1%，MSTR 约 ±${bt.toFixed(1)}%）`;

  $('qBtc').innerHTML = `${money(S.btcPrice)} <span class="${dirClass(btcChg)}" style="font-size:15px">${pct(btcChg)}</span>`;
  $('qBtcT').textContent = `近 60 日比特币涨跌 1%，MSTR 平均同向变动 ${bt.toFixed(1)}%。两者${c >= 0.6 ? '高度同步' : c >= 0.3 ? '有一定同步' : '同步性偏弱'}（相关系数 ${c.toFixed(2)}）。`;

  $('heroBtc').innerHTML = `${money(S.btcPrice)} <span class="${dirClass(btcChg)}" style="font-size:13px">${pct(btcChg)}</span>`;

  const k = S.kpi?.btc;
  $('qBtcS').textContent = k ? `距历史最高 ${money(k.ath)} 回撤 ${Math.abs(k.drawdownFromAth).toFixed(1)}%。` : '';
  $('heroBtcSub').textContent = k ? `距历史高点 ${money(k.ath)} 低 ${Math.abs(k.drawdownFromAth).toFixed(1)}%` : '正在同步官网比特币 KPI…';

  $('sentence').textContent = `现价处于一年区间的${pos}（${place.toFixed(0)} 分），${both ? '高于' : none ? '低于' : '介于'} 50 日与 200 日平均价，近期${fw}，${volWord}，与比特币${c >= 0.6 ? '走势高度同步' : c >= 0.3 ? '有一定同步' : '不太同步'}。`;

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
  $('qFearT').textContent = fg ? `比特币市场情绪指数 ${fg.value}（0 最恐惧，100 最贪婪）。` : '暂时取不到比特币情绪指数。';
  if (vix) {
    const v = vix.meta.regularMarketPrice;
    const cls = vix.bars.map((x) => x.close);
    const share = (cls.filter((x) => x < v).length / cls.length) * 100;
    const [w, s] = vixWords(v);
    $('qFearS').textContent = `美股恐慌指数 VIX ${v.toFixed(1)}（${w}），${s}高于过去 5 年 ${share.toFixed(0)}% 的日子。`;
  } else {
    $('qFearS').textContent = '暂时取不到 VIX。';
  }
  if (k && k.ma200w) {
    const gap200 = (S.btcPrice / k.ma200w - 1) * 100;
    const gapReal = (S.btcPrice / k.realizedPrice - 1) * 100;
    $('qCost').textContent = `${gap200 >= 0 ? '高' : '低'} ${Math.abs(gap200).toFixed(0)}%`;
    $('qCostT').textContent = `现价比比特币 200 周均价 ${money(k.ma200w)} ${gap200 >= 0 ? '高' : '低'} ${Math.abs(gap200).toFixed(1)}%。`;
    $('qCostS').textContent = `比全网平均持币成本 ${money(k.realizedPrice)} ${gapReal >= 0 ? '高' : '低'} ${Math.abs(gapReal).toFixed(1)}%。`;
  } else {
    $('qCost').textContent = '--';
    $('qCostT').textContent = '暂时取不到官网长期成本数据。';
    $('qCostS').textContent = '';
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

  add(price >= ma200 ? bull : bear, price >= ma200 ? 'bull' : 'bear', price >= ma200 ? '价格在 200 日线上方' : '价格在 200 日线下方', `200 日线 ${money(ma200)}，反映长期趋势位置。`);
  add(price >= ma50 ? bull : bear, price >= ma50 ? 'bull' : 'bear', price >= ma50 ? '价格在 50 日线上方' : '价格在 50 日线下方', `50 日线 ${money(ma50)}，反映中期趋势位置。`);

  const maCross = crossings(sma(closes, 50), sma(closes, 200), bars);
  const lastMa = maCross.at(-1);
  if (lastMa) {
    add(
      lastMa.type === 'gold' ? bull : bear,
      lastMa.type === 'gold' ? 'bull' : 'bear',
      lastMa.type === 'gold' ? '50 日线在 200 日线上方（金叉状态）' : '50 日线在 200 日线下方（死叉状态）',
      `最近一次交叉发生于 ${lastMa.time}。`
    );
  }

  const line = m.line.at(-1);
  const sig = m.signal.at(-1);
  const macdCross = crossings(m.line, m.signal, bars).at(-1);
  add(
    line >= sig ? bull : bear,
    line >= sig ? 'bull' : 'bear',
    line >= sig ? '日线 MACD 在信号线上方' : '日线 MACD 在信号线下方',
    `最近一次 MACD ${macdCross?.type === 'gold' ? '金叉' : '死叉'}在 ${macdCross?.time || '--'}，${line >= 0 ? '零轴上方。' : '零轴下方。'}`
  );

  const week = toWeekly(bars);
  const wm = macd(week.map((b) => b.close));
  add(
    wm.line.at(-1) >= wm.signal.at(-1) ? bull : bear,
    wm.line.at(-1) >= wm.signal.at(-1) ? 'bull' : 'bear',
    wm.line.at(-1) >= wm.signal.at(-1) ? '周线 MACD 在信号线上方' : '周线 MACD 在信号线下方',
    '周线变化较慢，本周未收盘前仍可能波动。'
  );

  const rsiState = (name, x) => {
    if (x >= 70) add(flat, 'flat', `${name} RSI ${x.toFixed(1)}：高于 70`, '上涨动能偏强，常被视为偏热，方向暂不明确。');
    else if (x <= 30) add(flat, 'flat', `${name} RSI ${x.toFixed(1)}：低于 30`, '下跌动能偏强，常被视为偏冷，方向暂不明确。');
    else add(x >= 50 ? bull : bear, x >= 50 ? 'bull' : 'bear', `${name} RSI ${x.toFixed(1)}：${x >= 50 ? '高于' : '低于'} 50`, `未走极端，${x >= 50 ? '上涨' : '下跌'}力度占优。`);
  };
  rsiState('日线', r);
  rsiState('周线', rw);

  const last = bars.at(-1);
  const isUp = last.close >= last.open;
  if (ratio >= 1.5) add(isUp ? bull : bear, isUp ? 'bull' : 'bear', `放量${isUp ? '上涨' : '下跌'}（${ratio.toFixed(2)} 倍）`, `${last.time} 成交量明显高于前 20 日均量。`);
  else add(flat, 'flat', `成交量 ${ratio.toFixed(2)} 倍`, '交易活跃度处于常态，未见明显放量。');

  $('tallyBadge').innerHTML = `<span class="up">偏多 ${bull.length}</span> · <span class="down">偏空 ${bear.length}</span> · 中性 ${flat.length}`;
  const combined = [...bull, ...bear, ...flat].filter((x) => S.signalFilter === 'all' || x.cls === S.signalFilter);
  $('signals').innerHTML = combined.map((it) => `<div class="signal-item ${it.cls}"><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div>`).join('');

  const fwd = (i, n) => (i + n < closes.length ? pct((closes[i + n] / closes[i] - 1) * 100) : '未满');
  $('crossTable').innerHTML =
    '<thead><tr><th>日期</th><th>类型</th><th>当天收盘</th><th>之后 20 日</th><th>之后 60 日</th><th>至今</th></tr></thead><tbody>' +
    maCross
      .slice()
      .reverse()
      .map(
        (x) =>
          `<tr class="tr-hover"><td>${x.time}</td><td class="${x.type === 'gold' ? 'up' : 'down'}" style="font-weight:600">${x.type === 'gold' ? '金叉' : '死叉'}</td><td>${money(closes[x.i])}</td><td>${fwd(x.i, 20)}</td><td>${fwd(x.i, 60)}</td><td>${pct((price / closes[x.i] - 1) * 100)}</td></tr>`
      )
      .join('') +
    '</tbody>';
  $('crossNote').textContent = `过去 5 年共出现 ${maCross.length} 次交叉。样本较少，过去表现不能代表未来。`;
}

// --- Valuation, Company Facts, Earnings & Ledger ---
function renderCompanyAndValuation() {
  const k = S.kpi?.btc;
  const m = S.kpi?.mstr;
  if (!k || !(toNum(k.mNav) > 0)) {
    if (S.kpi?.tried) {
      $('qMnav').textContent = '--';
      $('qMnavT').textContent = '暂取不到官网数据，下一分钟将自动重试。';
      $('heroMnav').textContent = '--';
      $('heroMnavSub').textContent = '官网接口暂不可用';
    }
    return;
  }

  const v = toNum(k.mNav);
  const ext = k.extendedSession;
  const premText = v >= 1 ? `溢价 ${((v - 1) * 100).toFixed(0)}%` : `折价 ${((1 - v) * 100).toFixed(0)}%`;
  $('qMnav').textContent = v.toFixed(2) + ' 倍';
  $('qMnavT').textContent = `官网 mNAV 为 ${v.toFixed(2)} 倍（相对所持比特币净值${premText}）。`;
  const net = toNum(k.netBtcPerShareUsd);
  $('qMnavS').textContent =
    (net > 0 && S.price ? `买一股约 ${money(S.price)}，扣债后约对应 ${money(net)} 比特币。` : '') +
    (ext?.mNav ? `${ext.sessionType === 'Pre-Market' ? '盘前' : '盘后'}约 ${toNum(ext.mNav).toFixed(2)} 倍。` : '大于 1 为溢价，小于 1 为折价。');

  $('heroMnav').textContent = v.toFixed(2) + ' 倍';
  $('heroMnavSub').textContent = `相对净持币价值${premText}${ext?.mNav ? ` · 盘外 ${toNum(ext.mNav).toFixed(2)}x` : ''}`;

  const held = toNum(k.btcHoldings);
  const bn = (millions) => (millions / 100).toFixed(0) + ' 亿美元';

  $('valKpiMnav').textContent = v.toFixed(2) + ' 倍';
  $('valKpiMnavNote').textContent = `${premText}（官网现行口径）`;
  $('valKpiBtc').textContent = held.toLocaleString('en-US') + ' 枚';
  $('valKpiBtcShare').textContent = `占比特币总供应量 ${toNum(k.pctOfBtcTotalSupply).toFixed(2)}%`;
  $('valKpiNetBps').textContent = (toNum(k.netSatsPerShare) / 1e8).toFixed(5) + ' 枚';
  $('valKpiGrossBps').textContent = `约 ${money(net)} / 股（扣债后）`;
  if (m) {
    $('valKpiMcap').textContent = bn(toNum(m.marketCap));
    $('valKpiDebt').textContent = `债务与优先股合计 ${bn(toNum(m.debt) + toNum(m.pref))}`;
  }

  const rows = [
    ['持有比特币总量', held.toLocaleString('en-US') + ' 枚'],
    ['占比特币 2100 万总量', toNum(k.pctOfBtcTotalSupply).toFixed(2) + '%'],
    ['每股含币量（未扣债）', (toNum(k.satsPerShare) / 1e8).toFixed(5) + ' 枚（约 ' + money(toNum(k.btcPerShareUsd)) + '）'],
    ['扣除债务后每股含币', (toNum(k.netSatsPerShare) / 1e8).toFixed(5) + ' 枚（约 ' + money(net) + '）'],
  ];
  if (m) rows.push(['公司总市值', bn(toNum(m.marketCap))], ['债务与优先股', bn(toNum(m.debt) + toNum(m.pref))]);
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
    row(`${name}最高`, `${f2(s.hi[s.field])}（${dateCn(s.hi.date)}）`) +
    row(`${name}最低`, `${f2(s.lo[s.field])}（${dateCn(s.lo.date)}）`) +
    row(`${name}平均`, f2(s.avg));

  if (S.mnavMode === 'official') {
    $('mnavLegend').innerHTML = `
      <span class="legend-item"><span class="legend-line" style="background:var(--btc)"></span>现行算法（2026年6月起）</span>
      <span class="legend-item"><span class="legend-line" style="background:var(--ma-long)"></span>旧算法：企业价值 ÷ 持币价值（2025年起）</span>`;
    const live = toNum(S.kpi?.btc?.mNav);
    const fallbackNow = S.history.find((r) => r.mNav != null)?.mNav || 0;
    $('mnavNow').textContent = (live > 0 ? live : fallbackNow).toFixed(2) + ' 倍';
    $('mnavSay').textContent = res.b
      ? `官网现行算法数值。旧算法约 ${res.b.now.toFixed(2)} 倍，高于区间内 ${res.b.share.toFixed(0)}% 的日子。`
      : '官网现行算法数值。';
    $('mnavFacts').innerHTML =
      (res.a ? stat('现行', { ...res.a, field: 'mNav' }) : '') + (res.b ? stat('旧版', { ...res.b, field: 'mNavEntVal' }) : '');
    $('mnavNote').textContent = '2026年7月23日前后官网更改了 mNAV 口径（现行：股价 ÷ 扣债每股持币价值）；虚线 1 倍代表平价，低于 1 倍表示折价。';
  } else {
    $('mnavLegend').innerHTML = `<span class="legend-item"><span class="legend-line" style="background:var(--btc)"></span>市值 ÷ 持币价值（历史长周期参考）</span>`;
    $('mnavNow').textContent = res.s ? f2(res.s.now) : '--';
    $('mnavSay').textContent = res.s ? `简化算法（未算债务与优先股），高于区间内 ${res.s.share.toFixed(0)}% 的日子。` : '';
    $('mnavFacts').innerHTML = res.s ? stat('', { ...res.s, field: 'simple' }) : '';
    $('mnavNote').textContent = '简化口径未计入债务和优先股，与官网 mNAV 存在差异，仅用于观察 2020 年以来的长期溢价周期。';
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
  $('psSay').textContent = `自 ${dateCn(h.peak.date)} 峰值至今，公司持币 ${pct(h.btcFromPeak)}，股数 ${pct(h.sharesFromPeak)}，每股含币量 ${pct(h.fromPeak)}。${
    h.fromPeak < 0 ? '当股数增速快于买币增速时该值会回落。' : ''
  }`;
  $('psFacts').innerHTML =
    row('历史峰值', `${n(h.peak.perShare)}（${dateCn(h.peak.date)}）`) +
    row(`${dateCn(h.first.date)} 起点`, n(h.first.perShare)) +
    row('累计每股含币变化', pct(h.perShareChange)) +
    row('累计公司持币变化', pct(h.btcChange)) +
    row('累计股数变化', `${pct(h.sharesChange)}（${m(h.first.shares)} → ${m(h.now.shares)}）`);
}

function renderEvents() {
  const bars = S.mstr?.bars;
  if (S.earn?.length && bars) {
    const latest = S.earn[0];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fiscal = months.indexOf(latest.fiscalQtrEnd.slice(0, 3));
    const nextName = months[(fiscal + 3) % 12];
    const last = S.earn.find((e) => e.fiscalQtrEnd.startsWith(nextName));
    const est = last ? `去年同期于 ${dateCn(last.date)} 公布，可作参考。` : '';
    $('earnNext').innerHTML = `<b>下次财报：</b>Nasdaq 尚未公布排期。${est}最近一次为 ${dateCn(latest.date)}。`;
    const fiscalCn = (s) => `${s.slice(-4)} 年 ${months.indexOf(s.slice(0, 3)) + 1} 月底`;
    $('earnTable').innerHTML =
      '<thead><tr><th>公布日</th><th>季度截至</th><th>下一交易日涨跌</th></tr></thead><tbody>' +
      S.earn
        .map((e) => {
          const i = bars.findIndex((b) => b.time > e.date);
          const chg = i > 0 ? (bars[i].close / bars[i - 1].close - 1) * 100 : null;
          return `<tr class="tr-hover"><td>${dateCn(e.date)}</td><td>${fiscalCn(e.fiscalQtrEnd)}</td><td class="${chg == null ? '' : dirClass(chg)}" style="font-weight:600">${chg == null ? '未到' : pct(chg)}</td></tr>`;
        })
        .join('') +
      '</tbody>';
  } else if (S.tried) {
    $('earnNext').textContent = '暂时取不到财报日期，稍后自动重试。';
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
    const sells = changes.filter((c) => c.date.startsWith(year) && c.delta < 0).length;
    $('ledgerNext').innerHTML = `<b>${year} 年以来：</b>持币净${net >= 0 ? '增加' : '减少'} ${Math.abs(net).toLocaleString('en-US')} 枚${sells ? `（含 ${sells} 次持币减少）` : ''}。`;
    $('ledgerTable').innerHTML =
      '<thead><tr><th>日期</th><th>方向</th><th>变化枚数</th><th>当日币价</th><th>累计持币</th></tr></thead><tbody>' +
      changes
        .slice(-10)
        .reverse()
        .map((c) => {
          const p = btcAt.get(c.date);
          return `<tr class="tr-hover"><td>${dateCn(c.date)}</td><td><span class="badge ${c.delta > 0 ? 'badge-up' : 'badge-down'}">${c.delta > 0 ? '增持' : '减少'}</span></td><td style="font-weight:600">${Math.abs(c.delta).toLocaleString('en-US')}</td><td>${p ? money(p) : '--'}</td><td>${Math.round(c.total).toLocaleString('en-US')}</td></tr>`;
        })
        .join('') +
      '</tbody>';
  } else if (S.tried) {
    $('ledgerNext').textContent = '暂时取不到官网持币变化记录，稍后自动重试。';
  }
}

// --- Position, Stress Test & Custom Plan ---
function renderPositionAndStress() {
  const cost = Number(S.userData.position.cost);
  const qty = Number(S.userData.position.qty);
  const p = !!S.userData.prefs.privacy;

  if (!(cost > 0)) {
    $('plV').textContent = '--';
    $('plV').className = 'facts-big tabular';
    $('plT').textContent = '填入成本价后，K 线图上会出现一条成本参考虚线。';
    $('heroPosVal').textContent = '未填成本价';
    $('heroPosVal').className = 'status-box-val tabular';
    $('heroPosSub').textContent = '点此录入成本与股数，实时计算浮盈亏';
  } else if (S.price) {
    const pl = (S.price / cost - 1) * 100;
    const plAmt = qty > 0 ? (S.price >= cost ? '+' : '-') + money(Math.abs(S.price - cost) * qty) : '';
    $('plV').textContent = pct(pl);
    $('plV').className = 'facts-big tabular ' + dirClass(pl);
    $('plT').textContent =
      qty > 0
        ? `按现价 ${money(S.price)} 计算，持仓 ${p ? '•• 股' : qty + ' 股'} 账面盈亏 ${maskUsd(plAmt)}。`
        : `按现价 ${money(S.price)} 计算（成本 ${maskUsd(money(cost))}）。填入股数可看盈亏金额。`;
    $('heroPosVal').innerHTML = `${pct(pl)} ${plAmt ? `<span style="font-size:13px;font-weight:500">${maskUsd(plAmt)}</span>` : ''}`;
    $('heroPosVal').className = 'status-box-val tabular ' + dirClass(pl);
    $('heroPosSub').textContent = `成本 ${maskUsd(money(cost))}${qty > 0 ? ` · 持仓 ${maskShares(qty + ' 股')}` : ''}`;
  }

  if (!S.mstr || !S.price) return;
  const value = qty > 0 ? qty * S.price : 10000;
  const worst = maxDrawdown(S.mstr.bars);
  const row = (a, b) => `<div><dt>${a}</dt><dd>${b}</dd></div>`;
  const usd = (n) => maskUsd('$' + Math.round(n).toLocaleString('en-US'));
  const costRow =
    cost > 0 && qty > 0
      ? row('距回本差距', S.price >= cost ? `高于成本 ${((S.price / cost - 1) * 100).toFixed(1)}%` : `需涨 ${((cost / S.price - 1) * 100).toFixed(1)}% 回本`)
      : '';
  $('planStress').innerHTML =
    row(qty > 0 ? '我的持仓现值' : '假设持仓规模', usd(value)) +
    row('若从现价回撤 30%', `账面减少 ${usd((value * 30) / 100)}`) +
    row('若从现价回撤 50%', `账面减少 ${usd((value * 50) / 100)}`) +
    row('若从现价回撤 70%', `账面减少 ${usd((value * 70) / 100)}`) +
    costRow +
    row('过去 5 年最大回撤', `${worst.pct.toFixed(1)}%`);
  $('planStressNote').textContent = `最大回撤发生于 ${dateCn(worst.from)} 至 ${dateCn(worst.to)}。跌 50% 需要涨 100% 才能回本，切忌满仓赌单边。`;
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
    return m > 0 ? `现在 ${m.toFixed(2)} 倍` : '';
  }
  if (rule.type === 'drawdown' && S.mstr) {
    const seen = S.mstr.bars.filter((b) => b.time >= rule.created).map((b) => b.close);
    const peak = Math.max(p, ...seen);
    return `高点 ${money(peak)}，当前回撤 ${Math.abs((p / peak - 1) * 100).toFixed(1)}%`;
  }
  return '';
}

function backText(r) {
  if (!r) return '暂无可回看的历史数据。';
  const fmt = (v) => (v == null ? '未满' : pct(v));
  const head = `从 ${dateCn(r.from)} 至今（${r.days} 个交易日收盘），触发过 <b>${r.events.length}</b> 次。`;
  if (!r.events.length) return head + '未曾触发不代表以后不会。';
  const list = r.events
    .slice(-6)
    .reverse()
    .map((e) => `${dateCn(e.date)}（${money(e.close)}）：20 日后 ${fmt(e.after20)}，60 日后 ${fmt(e.after60)}`)
    .join('<br>');
  return `${head}${r.events.length > 6 ? '最近 6 次：' : ''}<br>${list}`;
}

function renderPlanOverview() {
  const plan = S.userData.plan;
  const total = plan.rules.length;
  const fired = plan.rules.filter((r) => r.firedAt).length;
  const titleEl = $('heroPlanTitle');
  const descEl = $('heroPlanDesc');
  if (!titleEl || !descEl) return;

  if (total === 0 && !plan.review) {
    titleEl.textContent = '尚未设定规则';
    titleEl.className = 'status-box-val';
    descEl.textContent = '写下买入理由、条件提醒与复盘日期，数据保存在本地';
  } else {
    titleEl.textContent = fired > 0 ? `已触发 ${fired} 条提醒（共 ${total} 条）` : `正在监控 ${total} 条规则`;
    titleEl.className = 'status-box-val ' + (fired > 0 ? 'warn' : '');
    const revText = plan.review ? `下次复盘 ${dateCn(plan.review)}` : '未设复盘日期';
    const tradeCount = plan.trades.length ? ` · 已记 ${plan.trades.length} 笔日志` : '';
    descEl.textContent = `${revText}${tradeCount}`;
  }
}

function renderPlan() {
  const plan = S.userData.plan;
  if (document.activeElement !== $('planWhy')) $('planWhy').value = plan.why || '';
  $('planReview').value = plan.review || '';

  $('ruleTable').innerHTML = plan.rules.length
    ? '<thead><tr><th>状态</th><th>条件</th><th>我打算</th><th>操作</th></tr></thead><tbody>' +
      plan.rules
        .map((r) => {
          const tested = r.showBack ? backtestRule(r, S.mstr?.bars || [], S.history || []) : null;
          const backRow = !r.showBack ? '' : `<tr><td colspan="4" class="wrap-cell"><div class="explain-box">${backText(tested)}</div></td></tr>`;
          return `<tr class="tr-hover">
            <td><span class="badge ${r.firedAt ? 'badge-btc' : 'badge-neutral'}">${r.firedAt ? '已触发 ' + dateCn(r.firedAt) : '监控中'}</span></td>
            <td class="wrap-cell"><b>${esc(RULES[r.type].label(r.value))}</b><div style="font-size:11.5px;color:var(--text-tertiary)">${esc(ruleDistance(r))}</div></td>
            <td class="wrap-cell">${esc(r.note) || '<span class="warn">未填说明</span>'}</td>
            <td>
              ${r.type === 'date' ? '' : `<button type="button" class="pill-btn sm" data-act="back" data-id="${r.id}">${r.showBack ? '收起' : '回看'}</button>`}
              ${r.firedAt ? `<button type="button" class="pill-btn sm" data-act="rearm" data-id="${r.id}">重启用</button>` : ''}
              <button type="button" class="pill-btn sm danger" data-act="del" data-id="${r.id}">移除</button>
            </td>
          </tr>${backRow}`;
        })
        .join('') +
      '</tbody>'
    : '<tbody><tr><td class="wrap-cell" style="color:var(--text-tertiary)">还没有自定义规则。可以点击上方常见条件快速添加。</td></tr></tbody>';

  $('tradeTable').innerHTML = plan.trades.length
    ? '<thead><tr><th>日期</th><th>方向</th><th>股数</th><th>成交价</th><th>原因</th><th></th></tr></thead><tbody>' +
      plan.trades
        .map(
          (x) =>
            `<tr class="tr-hover"><td>${dateCn(x.date)}</td><td><span class="badge ${x.side === '买入' ? 'badge-up' : 'badge-down'}">${esc(x.side)}</span></td><td>${maskShares(x.shares + ' 股')}</td><td>${maskUsd(money(x.price))}</td><td class="wrap-cell">${esc(x.note)}</td><td><button type="button" class="pill-btn sm danger" data-trade="${x.id}">移除</button></td></tr>`
        )
        .join('') +
      '</tbody>'
    : '<tbody><tr><td class="wrap-cell" style="color:var(--text-tertiary)">暂无实盘交易日志。</td></tr></tbody>';

  const closes = S.mstr?.bars.slice(-61).map((b) => b.close) || [];
  const moves = closes.slice(1).map((v, i) => Math.abs(v / closes[i] - 1) * 100);
  const move = moves.length ? moves.reduce((s, v) => s + v, 0) / moves.length : 0;
  $('planCheck').innerHTML = planCheckup(plan, move, S.price || 0)
    .map((c) => `<li class="${c.ok ? '' : 'miss'}"><b>${c.ok ? '✓' : '○'} ${c.text}</b>${c.ok ? '' : c.tip}</li>`)
    .join('');

  renderPlanOverview();
}

function checkPlan() {
  if (!S.price || S.fail || !S.mstr) return;
  const plan = S.userData.plan;
  const ctx = ruleContext();
  const fired = [];
  for (const r of plan.rules) {
    if (r.firedAt || !evalRule(r, ctx)) continue;
    r.firedAt = ctx.today;
    fired.push(`${RULES[r.type].label(r.value)}。打算：${r.note || '未写'}`);
  }
  if (plan.review && ctx.today >= plan.review && plan.reviewFired !== plan.review) {
    plan.reviewFired = plan.review;
    fired.push('已到你设定的复盘日期，请检视交易计划');
  }
  if (!fired.length) return;
  persistUserData(true);
  const msg = '交易计划：' + fired.join('；') + (plan.why ? `。当初买入理由：${plan.why}` : '');
  $('bannerText').innerHTML = `<strong>计划提醒：</strong>${esc(msg)}`;
  $('banner').hidden = false;
  chime();
  fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) }).catch(() => {});
}

// --- Compare & DCA ---
function buildMagPicksUI() {
  const shown = new Set(S.userData.prefs.magShown);
  const pick = ([sym, name, color]) =>
    `<label><input type="checkbox" data-sym="${sym}" ${shown.has(sym) ? 'checked' : ''}><i style="background:${color}"></i>${name}</label>`;
  $('magPicks').innerHTML = [
    ['七姐妹', MAG7_LIST],
    ['各行业龙头', MAG_LEAD_LIST],
    ['核心关注', MAG_EXTRA_LIST],
    ['加密与 A 股', [MAG_BTC_ITEM, ...MAG_CN_LIST]],
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
  $('magNote').textContent = S.magFailed ? `提示：有 ${S.magFailed} 只标的暂取不到，稍后自动重试。` : '';
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
  const name = isMstr ? 'MSTR' : '比特币';
  const unit = isMstr ? '股' : '枚';
  $('dcaAvg').textContent = money(r.avg);
  const vs = (last / r.avg - 1) * 100;
  $('dcaSay').textContent = `自 ${r.from} 起每月投 $${monthly.toLocaleString('en-US')}，${name} 均价 ${money(r.avg)}，现价 ${money(last)}（${vs >= 0 ? '高' : '低'} ${Math.abs(vs).toFixed(1)}%）。`;
  const row = (a, b, cls = '') => `<div><dt>${a}</dt><dd class="${cls}">${b}</dd></div>`;
  const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
  $('dcaFacts').innerHTML =
    row('累计投入本金', `${usd(r.spent)}（${r.count} 期）`) +
    row('累计买到数量', `${r.units.toFixed(isMstr ? 2 : 5)} ${unit}`) +
    row('当前资产价值', usd(r.value)) +
    row('账面盈亏', `${r.pl >= 0 ? '+' : '-'}${usd(Math.abs(r.value - r.spent))}（${pct(r.pl * 100)}）`, dirClass(r.pl)) +
    row('途中最深浮亏', r.worst < 0 ? `${pct(r.worst * 100)}（${r.worstTime}）` : '全程未浮亏', r.worst < 0 ? 'down' : '');
}

// --- QDII ---
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
    if (S.qdiiFail) $('qdiiSay').textContent = '暂时取不到场外基金数据，稍后会自动重试。';
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
  $('qdiiStatSplit').textContent = `纳指 100：${nCount} 只 · 标普 500：${sCount} 只`;
  $('qdiiStatOpen').textContent = `${open.length} 只`;
  $('qdiiStatBig').textContent = `${big.length} 只`;
  $('qdiiStatTracked').textContent = dateCn(S.qdii.tracked_from);

  const list = (qdiiFilter === 'open' ? open : byClass)
    .filter((r) => !kw || r.name.toLowerCase().includes(kw) || r.code.toLowerCase().includes(kw) || (r.company || '').toLowerCase().includes(kw))
    .sort((a, b) => b.st.limit - a.st.limit || a.name.localeCompare(b.name, 'zh'));

  $('qdiiSay').innerHTML = `当前筛选共 <b>${byClass.length}</b> 只，<b>可申购 ${open.length} 只</b>（单日 ≥ 1,000 元 ${big.length} 只）；显示 <b>${list.length}</b> 条。`;

  const since = (r) => (r.since ? dateCn(r.since) : r.st.open ? `${dateCn(r.seen)} 追踪前已开放` : '追踪期内未变');
  const rate = (r) => {
    if (r.discounted_rate == null || r.discounted_rate === '') return '--';
    const s = String(r.discounted_rate).trim();
    return s.endsWith('%') ? s : `${s}%`;
  };
  $('qdiiTable').innerHTML =
    '<thead><tr><th>基金名称</th><th>代码</th><th>跟踪指数</th><th>费率</th><th>申购状态</th><th>变化起始日期</th></tr></thead><tbody>' +
    (list.length
      ? list
          .map(
            (r) => `<tr class="tr-hover">
          <td class="wrap-cell"><b>${esc(r.name)}</b><div style="font-size:11.5px;color:var(--text-tertiary)">${esc(r.company || '')}</div></td>
          <td><a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(r.code)} ↗</a></td>
          <td><span class="badge ${r.index === '纳指 100' ? 'badge-blue' : 'badge-neutral'}">${r.index}</span></td>
          <td>${rate(r)}</td>
          <td><span class="badge ${r.st.open ? (r.st.limit >= 1000 ? 'badge-down' : 'badge-btc') : 'badge-neutral'}">${r.st.label}</span></td>
          <td style="color:var(--text-secondary)">${since(r)}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:24px">没有符合条件的场外基金</td></tr>') +
    '</tbody>';

  const t = S.qdii.stored_at ? new Date(S.qdii.stored_at * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '';
  $('qdiiNote').textContent = `数据整理自东方财富（GlobalAssetHistory${t ? ` · 更新于 ${t}` : ''}）。“变化起始日期”自 ${dateCn(S.qdii.tracked_from)} 起记录，具体每日额度以支付宝/基金公司实际页面为准。`;
}

// --- Sources Health ---
const SOURCES = [
  ['yahoo', 'Yahoo Finance', 'MSTR 与比特币 K 线行情', () => S.mstr && bj(S.mstr.meta.regularMarketTime, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 5],
  ['vix', 'Yahoo Finance', '美股恐慌指数 VIX', () => S.vix && bj(S.vix.meta.regularMarketTime, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 5],
  ['kpi', 'Strategy 官网', 'mNAV、持币数量与情绪指数', () => S.kpi?.mstr?.timeStamp, null],
  ['history', 'Strategy 官网', 'mNAV 历史与每股含币量变化', () => S.history?.[0]?.date, 5],
  ['earn', 'Nasdaq', '财报公布日期', () => S.earn?.[0]?.date, null],
  ['mag', 'Yahoo Finance', '七姐妹与多资产对比行情', () => S.mag?.AAPL?.bars.at(-1)?.time, 5],
  ['qdii', 'GlobalAssetHistory', '纳指/标普场外基金申购状态', () => S.qdii?.stored_at && bj(S.qdii.stored_at, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), 3],
];

function dayAge(key) {
  const t =
    key === 'yahoo'
      ? S.mstr?.meta.regularMarketTime * 1000
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
  $('sourceBrief').textContent = bad ? `${bad} 路数据异常` : allReady ? '7 路数据源正常' : '数据源读取中';

  $('sourceTable').innerHTML =
    '<thead><tr><th>来源</th><th>内容</th><th>数据日期</th><th>状态</th></tr></thead><tbody>' +
    SOURCES.map(([key, name, what, dateFn, limit]) => {
      const st = S.health[key];
      const age = dayAge(key);
      const old = limit && age != null && age > limit;
      const dStr = dateFn();
      const [word, badgeCls] =
        st === false
          ? [dStr ? '暂用上次缓存' : '取不到', 'badge-up']
          : st == null
          ? ['读取中', 'badge-neutral']
          : old
          ? ['可能非最新', 'badge-btc']
          : ['正常', 'badge-down'];
      return `<tr class="tr-hover"><td><b>${name}</b></td><td class="wrap-cell">${what}</td><td>${dStr || '--'}</td><td><span class="badge ${badgeCls}">${word}</span></td></tr>`;
    }).join('') +
    '</tbody>';
}

// --- MA Checkboxes Render ---
function renderMaPicks() {
  for (const [boxId, view] of [
    ['chips', S.mstrView],
    ['bChips', S.btcView],
  ]) {
    const box = $(boxId);
    if (!box) continue;
    const v = VIEWS[view];
    const unit = view === 'week' ? '周' : '天';
    box.querySelector('.cross-name').textContent = `金叉死叉（${v.short}/${v.long}${unit}线）`;
    box.querySelector('.ma-picks').innerHTML = MA_KEYS.map(
      ([k, color]) => `<label><input type="checkbox" data-ma="${k}" ${S.userData.prefs.maShow[k] ? 'checked' : ''}><i class="ma-swatch" style="background:var(${color})"></i>${v[k]}${unit}均线</label>`
    ).join('');
  }
}

// --- Rule Input Helper ---
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

// --- Main Render Coordinator ---
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

// --- Refresh Loop ---
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

    const [km, kb, vx, hs, er, qq] = await Promise.allSettled([
      getJson('/api/strategy/mstr'),
      getJson('/api/strategy/btc'),
      getJson('/api/chart?symbol=' + encodeURIComponent('^VIX')),
      getJson('/api/strategy/history'),
      getJson('/api/earnings'),
      getJson('/api/chart?symbol=QQQ'),
    ]);
    S.tried = true;
    S.health.vix = vx.status === 'fulfilled';
    S.health.history = hs.status === 'fulfilled';
    S.health.earn = er.status === 'fulfilled';
    S.health.kpi = km.status === 'fulfilled' && kb.status === 'fulfilled';
    if (hs.status === 'fulfilled') S.history = hs.value;
    if (qq.status === 'fulfilled') S.qqq = parseDaily(qq.value);
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
      $('sentence').textContent = '暂时取不到行情，请检查网络，页面每分钟会自动重试。';
      $('chip').className = 'session-pill bad';
      $('chip').textContent = '连接中断';
    }
  } finally {
    S.refreshing = false;
  }
}

// --- Event Bindings ---
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
      const scope = inMetric ? inMetric.closest('.hero-card, .card') : helpBtn.closest('.q-card, .readout-block, .card');
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
      const anchor = inMetric
        ? inMetric.closest('.metrics-strip')
        : helpBtn.closest('.q-top, .readout-head, .card-header');
      anchor?.after(p);
      return;
    }

    if (!e.target.closest('.menu-wrap')) {
      $('dataMenuPop').hidden = true;
    }
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
    showToast('已导出 JSON 备份文件');
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
      showToast('已成功导入并恢复持仓与规则');
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
    S.chartLayout = l;
    $('chartLayoutSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    $('mstrChartSection').hidden = l === 'btc';
    $('btcChartSection').hidden = l === 'mstr';
    $('btcChartSection').style.marginTop = l === 'dual' ? '20px' : '0';
    $('chartsDualWrap').classList.toggle('chart-split-dual', l === 'dual');
    charts.ensureChartsForTab('charts', chartCallbacks(), l);
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
        S.userData.prefs.maShow[k] = e.target.checked;
        persistUserData();
        renderMaPicks();
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
    $('ruleNote').placeholder = '我打算怎么做（自己写）';
    persistUserData(true);
    checkPlan();
    renderPlan();
    showToast('已添加交易规则');
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
    showToast('已记录交易日志');
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
