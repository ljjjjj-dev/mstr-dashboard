const LS_USER_KEY = 'mstr_studio_user_data_v1';

export function bjToday() {
  return new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
}

export const MAG7_LIST = [
  ['AAPL', '苹果', '#8E8E93'],
  ['MSFT', '微软', '#0A84FF'],
  ['GOOGL', '谷歌', '#34A853'],
  ['AMZN', '亚马逊', '#FF9500'],
  ['NVDA', '英伟达', '#76B900'],
  ['META', 'Meta', '#5E5CE6'],
  ['TSLA', '特斯拉', '#E31937'],
];

export const MAG_EXTRA_LIST = [
  ['MSTR', '微策略', '#1D1D1F'],
  ['BMNR', 'BitMine', '#00A3A3'],
  ['QQQ', '纳指 100', '#007AFF'],
  ['^GSPC', '标普 500', '#188038'],
];

export const MAG_BTC_ITEM = ['BTC', '比特币', '#F7931A'];

export const MAG_CN_LIST = [
  ['000001.SS', '上证指数', '#C0392B'],
  ['510300.SS', '沪深 300', '#2C3E50'],
];

export const MAG_LEAD_LIST = [
  ['TSM', '台积电', '#B7791F'],
  ['AVGO', '博通', '#8E44AD'],
  ['MU', '美光', '#C0392B'],
  ['PLTR', 'Palantir', '#7F8C8D'],
  ['SPCX', 'SpaceX', '#1F2D3D'],
  ['COIN', 'Coinbase', '#2C6BED'],
  ['LLY', '礼来', '#D35400'],
  ['JPM', '摩根大通', '#2E86C1'],
  ['BRK-B', '伯克希尔', '#6C3483'],
  ['WMT', '沃尔玛', '#0E9F9A'],
  ['MCD', '麦当劳', '#E6A700'],
  ['KO', '可口可乐', '#E41E26'],
  ['XOM', '埃克森美孚', '#A04000'],
];

export const DEFAULT_MAG_SHOWN = [
  ...MAG7_LIST,
  ...MAG_EXTRA_LIST,
  MAG_BTC_ITEM,
].map((x) => x[0]);

export function createDefaultUserData() {
  return {
    version: 1,
    position: { cost: '', qty: '' },
    plan: { why: '', review: '', rules: [], trades: [], reviewFired: '' },
    prefs: {
      theme: 'light',
      privacy: false,
      maShow: { short: true, mid: true, long: true },
      magShown: [...DEFAULT_MAG_SHOWN],
      qdiiClass: 'A',
      qdiiFilter: 'open',
      qdiiIndex: 'all',
      dcaAsset: 'mstr',
      dcaYears: 3,
      dcaAmount: 500,
    },
  };
}

function mergeWithDefault(raw) {
  const def = createDefaultUserData();
  if (!raw || typeof raw !== 'object') return def;
  return {
    version: raw.version || 1,
    position: { ...def.position, ...(raw.position || {}) },
    plan: {
      ...def.plan,
      ...(raw.plan || {}),
      rules: Array.isArray(raw.plan?.rules) ? raw.plan.rules : [],
      trades: Array.isArray(raw.plan?.trades) ? raw.plan.trades : [],
    },
    prefs: {
      ...def.prefs,
      ...(raw.prefs || {}),
      maShow: { ...def.prefs.maShow, ...(raw.prefs?.maShow || {}) },
      magShown: Array.isArray(raw.prefs?.magShown) ? raw.prefs.magShown : def.prefs.magShown,
    },
  };
}

function readLegacyLocalStorage() {
  try {
    const rawCost = localStorage.getItem('cost');
    const rawQty = localStorage.getItem('qty');
    const rawPlan = localStorage.getItem('plan');
    if (!rawCost && !rawQty && !rawPlan) return null;
    const base = createDefaultUserData();
    if (rawCost) base.position.cost = JSON.parse(rawCost) ?? '';
    if (rawQty) base.position.qty = JSON.parse(rawQty) ?? '';
    if (rawPlan) base.plan = { ...base.plan, ...JSON.parse(rawPlan) };
    const ma = localStorage.getItem('maShow');
    if (ma) base.prefs.maShow = { ...base.prefs.maShow, ...JSON.parse(ma) };
    return mergeWithDefault(base);
  } catch {
    return null;
  }
}

export async function loadUserData() {
  try {
    const res = await fetch('/api/user-data', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && !json.empty) {
        const merged = mergeWithDefault(json);
        try { localStorage.setItem(LS_USER_KEY, JSON.stringify(merged)); } catch {}
        return { data: merged, source: 'file' };
      }
    }
  } catch {}

  try {
    const cached = localStorage.getItem(LS_USER_KEY);
    if (cached) {
      const merged = mergeWithDefault(JSON.parse(cached));
      const res = await saveUserDataNow(merged);
      return { data: merged, source: res.mode };
    }
  } catch {}

  const legacy = readLegacyLocalStorage();
  if (legacy) {
    const res = await saveUserDataNow(legacy);
    return { data: legacy, source: res.mode };
  }

  const def = createDefaultUserData();
  const res = await saveUserDataNow(def);
  return { data: def, source: res.mode };
}

export async function saveUserDataNow(data) {
  const payload = { ...data, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(LS_USER_KEY, JSON.stringify(payload)); } catch {}
  try {
    const res = await fetch('/api/user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, mode: 'file' };
  } catch {}
  return { ok: true, mode: 'local' };
}

let saveTimer = null;
export function scheduleSaveUserData(data, onDone) {
  try { localStorage.setItem(LS_USER_KEY, JSON.stringify(data)); } catch {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const res = await saveUserDataNow(data);
    onDone?.(res.mode);
  }, 260);
}

export function exportUserDataJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mstr-dashboard-backup-${bjToday()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importUserDataJson(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || (!parsed.position && !parsed.plan)) {
    throw new Error('备份 JSON 格式不匹配，请选择由本程序导出的备份文件');
  }
  return mergeWithDefault(parsed);
}
