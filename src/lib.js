import AsyncStorage from '@react-native-async-storage/async-storage';

export const C = {
  blue: '#1a73e8', blueDark: '#1967d2', bg: '#f8f9fa', card: '#ffffff', line: '#dadce0',
  text: '#202124', sub: '#5f6368', green: '#1e8e3e', red: '#d93025', amber: '#f9ab00',
};
// Classroom-style course colours, picked by a stable hash of the course name.
const COURSE_COLORS = ['#1e8e3e', '#1a73e8', '#e37400', '#a142f4', '#d93025', '#129eaf', '#e52592', '#795548'];
export const courseColor = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COURSE_COLORS[h % COURSE_COLORS.length];
};

export const DEFAULTS = { server: 'https://classroom-bot.greatneck.workers.dev', token: '', name: '' };

export async function load(key, fallback) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
export async function save(key, value) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** fetch with a hard timeout — on a bad link a hung request is worse than a failed one. */
export async function timedFetch(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

export function makeApi(cfg) {
  const base = cfg.server.replace(/\/+$/, '');
  const auth = cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {};
  const call = async (path, opts = {}, ms = 20000) => {
    const res = await timedFetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) } }, ms);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
    return data;
  };
  return {
    register: (name, password, invite) => call('/acct/register', { method: 'POST', body: JSON.stringify({ name, password, invite }) }),
    login: (name, password) => call('/acct/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
    items: (since = 0) => call(`/api/items?since=${since}`),
    status: () => call('/api/status'),
    setSubmitted: (id, submitted) => call('/api/state', { method: 'POST', body: JSON.stringify({ id, submitted }) }),
    registerPush: (token) => call('/api/register-push', { method: 'POST', body: JSON.stringify({ token }) }),
    /** Uploads the finished file you made for an assignment; every signed-in device then gets it. */
    upload: async (itemId, name, uri, mime) => {
      const blob = await (await fetch(uri)).blob();
      const res = await timedFetch(`${base}/api/upload?item=${encodeURIComponent(itemId)}&name=${encodeURIComponent(name)}`,
        { method: 'POST', body: blob, headers: { ...auth, 'Content-Type': mime || 'application/octet-stream' } }, 120000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },
    fileUrl: (id) => `${base}/api/file/${id}?t=${encodeURIComponent(cfg.token || '')}`,
  };
}

// Hosts the network test tries. Any HTTP response at all means the host is reachable; only a
// network error / timeout means blocked.
export const PROBES = [
  { name: 'Your bot server', group: 'Bot', url: (cfg) => cfg.server.replace(/\/+$/, '') + '/api/health' },
  { name: 'Cloudflare (speed test)', group: 'Internet', url: () => 'https://speed.cloudflare.com/__down?bytes=1' },
  { name: 'Google', group: 'Internet', url: () => 'https://www.google.com/generate_204' },
  { name: 'Apple (captive check)', group: 'Apple', url: () => 'https://captive.apple.com/hotspot-detect.html' },
  { name: 'apple.com', group: 'Apple', url: () => 'https://www.apple.com/' },
  { name: 'iCloud', group: 'Apple', url: () => 'https://www.icloud.com/' },
  { name: 'iCloud gateway', group: 'Apple', url: () => 'https://gateway.icloud.com/' },
  { name: 'CloudKit API', group: 'Apple', url: () => 'https://api.apple-cloudkit.com/' },
  { name: 'Apple Weather data', group: 'Apple', url: () => 'https://weather-data.apple.com/' },
  { name: 'Expo push service', group: 'Push', url: () => 'https://exp.host/--/api/v2/push/getReceipts' },
];

export async function runProbe(probe, cfg) {
  const t0 = Date.now();
  try {
    const res = await timedFetch(probe.url(cfg), { method: 'GET', cache: 'no-store' }, 6000);
    return { ok: true, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'timed out' : 'blocked', ms: Date.now() - t0 };
  }
}

export const fmtDue = (s) => s || 'No due date';
export const sameDay = (ts, d = new Date()) => {
  const a = new Date(ts);
  return a.getFullYear() === d.getFullYear() && a.getMonth() === d.getMonth() && a.getDate() === d.getDate();
};
