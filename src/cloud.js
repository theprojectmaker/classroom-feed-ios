// Reads the library from Apple's CloudKit PUBLIC database (read-only API token). On a Wi-Fi that only allows Apple services this is
// the route that still works: the bot mirrors the library there; the app falls back to it when the bot can't be reached.
import { timedFetch } from './lib';

const BASE = 'https://api.apple-cloudkit.com/database/1';
export const CHUNK_RAW = 491520; // must match the bot

const lookupUrl = (cfg) => `${BASE}/${cfg.container}/${cfg.environment || 'development'}/public/records/lookup?ckAPIToken=${encodeURIComponent(cfg.token)}`;

export async function ckLookup(cfg, names, ms = 20000) {
  const res = await timedFetch(lookupUrl(cfg), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ records: names.map((recordName) => ({ recordName })) }) }, ms);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.serverErrorCode) throw new Error(data.reason || data.serverErrorCode || `HTTP ${res.status}`);
  return data.records || [];
}

/** The whole item list (same fields the bot sends), or throws when iCloud has nothing yet. */
export async function cloudLibrary(cfg) {
  const [rec] = await ckLookup(cfg, ['meta']);
  if (!rec || rec.serverErrorCode || !rec.fields || !rec.fields.json) throw new Error('The iCloud copy is not published yet');
  return { items: JSON.parse(rec.fields.json.value), updatedAt: (rec.fields.updatedAt && rec.fields.updatedAt.value) || 0 };
}

/** Downloads one file from its chunk records and returns it as one base64 string. */
export async function cloudFileBase64(cfg, file) {
  const chunks = file.chunks || Math.max(1, Math.ceil((file.size || 0) / CHUNK_RAW));
  const parts = [];
  for (let i = 0; i < chunks; i += 3) {
    const names = [];
    for (let j = i; j < Math.min(chunks, i + 3); j++) names.push(`fc-${file.id}-${j}`);
    const byName = Object.fromEntries((await ckLookup(cfg, names, 60000)).map((r) => [r.recordName, r]));
    for (const n of names) {
      const r = byName[n];
      if (!r || !r.fields || !r.fields.data) throw new Error('This file is not in iCloud yet');
      parts.push(r.fields.data.value);
    }
  }
  return parts.join(''); // every chunk is a multiple of 3 bytes, so the base64 pieces simply concatenate
}
