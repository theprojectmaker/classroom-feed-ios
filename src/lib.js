import AsyncStorage from '@react-native-async-storage/async-storage';

export { C, courseColor } from './theme';

export const DEFAULTS = { server: 'https://classroom-bot.greatneck.workers.dev', token: '', name: '', icloudOnly: false };

export async function load(key, fallback) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
export async function save(key, value) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {}
}
export async function drop(key) {
  try { await AsyncStorage.removeItem(key); } catch {}
}

/** fetch with a hard timeout — on a bad link a hung request is worse than a failed one. */
export async function timedFetch(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

/** The bot's own API (reachable on open Wi-Fi; on the school Wi-Fi everything goes through iCloud instead). */
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
    base,
    /** Quick "can I reach the bot at all?" — any answer counts. */
    health: async (ms = 3500) => { try { return (await timedFetch(base + '/api/health', { cache: 'no-store' }, ms)).ok; } catch { return false; } },
    register: (name, password, invite) => call('/acct/register', { method: 'POST', body: JSON.stringify({ name, password, invite }) }),
    login: (name, password) => call('/acct/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
    items: (since = 0) => call(`/api/items?since=${since}`, {}, 30000),
    status: () => call('/api/status', {}, 12000),
    /** Requests (turn in, mark done, scan now, want a file, push token…). Returns {done:[ids]}. */
    ops: (ops) => call('/api/ops', { method: 'POST', body: JSON.stringify({ ops }) }, 20000),
    pushTest: () => call('/api/push-test', { method: 'POST', body: '{}' }, 20000),
    /** Uploads finished work straight to the bot (open Wi-Fi, files up to 24 MB). `id` keeps the file's id the same on every path. */
    upload: async (itemId, id, name, uri, mime) => {
      const blob = await (await fetch(uri)).blob();
      const res = await timedFetch(`${base}/api/upload?item=${encodeURIComponent(itemId)}&name=${encodeURIComponent(name)}&id=${encodeURIComponent(id)}`,
        { method: 'POST', body: blob, headers: { ...auth, 'Content-Type': mime || 'application/octet-stream' } }, 180000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
      return data;
    },
    fileUrl: (id) => `${base}/api/file/${id}?t=${encodeURIComponent(cfg.token || '')}`,
  };
}

// Hosts the network test tries. Any HTTP response at all means the host is reachable; only a
// network error / timeout means blocked.
export const PROBES = [
  { name: 'Your bot server', group: 'Bot', url: (cfg) => cfg.server.replace(/\/+$/, '') + '/api/health' },
  { name: 'Cloudflare', group: 'Internet', url: () => 'https://speed.cloudflare.com/__down?bytes=1' },
  { name: 'Google', group: 'Internet', url: () => 'https://www.google.com/generate_204' },
  { name: 'Apple (captive check)', group: 'Apple', url: () => 'https://captive.apple.com/hotspot-detect.html' },
  { name: 'apple.com', group: 'Apple', url: () => 'https://www.apple.com/' },
  { name: 'iCloud', group: 'Apple', url: () => 'https://www.icloud.com/' },
  { name: 'CloudKit API (what this app uses)', group: 'Apple', url: () => 'https://api.apple-cloudkit.com/' },
  { name: 'iCloud file storage', group: 'Apple', url: () => 'https://cvws.icloud-content.com/' },
  { name: 'Expo push + app updates', group: 'Push', url: () => 'https://exp.host/--/api/v2/push/getReceipts' },
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

export const fmtBytes = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' KB';
  return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
};
export const uid = (p = 'o') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const guessMime = (name = '') => {
  const e = (name.split('.').pop() || '').toLowerCase();
  return { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', gif: 'image/gif', txt: 'text/plain',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mp4: 'video/mp4', mov: 'video/quicktime', zip: 'application/zip' }[e] || 'application/octet-stream';
};
