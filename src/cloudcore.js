// Everything the app does through Apple's CloudKit PUBLIC database — the one route that still works on a Wi-Fi that only
// allows Apple services. Reads use the read-only API token (or the key); writes are signed with the server key the bot
// hands to a signed-in device (no Apple sign-in needed). No React Native imports: this file also runs under Node for tests.
//
// Records (all looked up by fixed name — a lookup answers in under a second):
//   state        status the bot keeps current: library version, PC online/busy, scan progress, handled requests
//   lib-<i>      the whole item list (gzip + base64), in parts
//   fc-<id>-<i>  attachment bytes · up-<id>-<i> finished work uploaded from the app   (480 KiB per record)
//   inbox        the app's requests: {ops:[{id,t,ts,...}]}   (turn in, upload, scan, mark done, want a file, push token)
import { gunzipSync, strFromU8 } from 'fflate';
import { base64ToBytes, signedHeaders } from './cksign.js'; // (.js spelled out so plain Node can import this file for tests)

const HOST = 'https://api.apple-cloudkit.com';
export const CHUNK_RAW = 491520; // 480 KiB, a multiple of 3: base64 pieces concatenate. Must match the bot and the PC.

let skewMs = 0; // this device's clock vs Apple's (a signed request is refused when the date is more than a few minutes off)

export const canRead = (cfg) => !!(cfg && cfg.container && (cfg.token || (cfg.keyId && cfg.d)));
export const canWrite = (cfg) => !!(cfg && cfg.container && cfg.keyId && cfg.d);

async function call(cfg, op, payload, { ms = 20000, signed = false } = {}) {
  const sub = `/database/1/${cfg.container}/${cfg.environment || 'development'}/public/${op}`;
  const body = JSON.stringify(payload);
  const useKey = signed || !cfg.token;
  if (useKey && !canWrite(cfg)) { const e = new Error('It will send as soon as the app has been on normal internet once'); e.code = 'NO_KEY'; throw e; }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  let res, text;
  try {
    res = await fetch(HOST + sub + (useKey ? '' : `?ckAPIToken=${encodeURIComponent(cfg.token)}`), {
      method: 'POST', body, signal: ctl.signal, headers: useKey ? signedHeaders(cfg, sub, body, skewMs) : { 'Content-Type': 'text/plain' },
    });
    text = await res.text();
  } finally { clearTimeout(timer); }
  try { // learn the clock difference from Apple's own Date header (not always exposed; that is fine)
    const d = res.headers && res.headers.get && res.headers.get('date');
    const t = d ? Date.parse(d) : NaN;
    if (!isNaN(t)) { const diff = t - Date.now(); skewMs = Math.abs(diff) > 20000 ? diff : 0; }
  } catch { /* ignore */ }
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: String(text).slice(0, 160) }; }
  if (!res.ok || data.serverErrorCode) {
    const e = new Error(data.reason || data.serverErrorCode || data.raw || `HTTP ${res.status}`);
    e.code = data.serverErrorCode || ''; e.status = res.status; e.retryAfter = Number(data.retryAfter) || 0;
    throw e;
  }
  return data;
}

const BUSY = /TRY_AGAIN_LATER|THROTTLED|ZONE_BUSY|INTERNAL_ERROR|SERVICE_UNAVAILABLE/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** call() with patience for CloudKit's "busy, try again" answers. Network failures are not retried here (the caller decides). */
async function callRetry(cfg, op, payload, opts = {}, tries = 4) {
  let last;
  for (let a = 0; a < tries; a++) {
    try { return await call(cfg, op, payload, opts); }
    catch (e) { last = e; if (!(BUSY.test(e.code || '') || e.status === 503 || e.status === 429)) throw e; }
    await sleep(Math.min(8000, Math.max((last.retryAfter || 0) * 1000, 600 * 2 ** a)));
  }
  throw last;
}

/** Looks records up by name. Missing ones come back as entries with a serverErrorCode (no throw). */
export async function ckLookup(cfg, names, ms = 20000) {
  return (await callRetry(cfg, 'records/lookup', { records: names.map((recordName) => ({ recordName })) }, { ms })).records || [];
}

async function ckModify(cfg, operations, ms = 30000) {
  return (await callRetry(cfg, 'records/modify', { operations }, { ms, signed: true })).records || [];
}

const jsonOf = (rec) => { try { return rec && rec.fields && rec.fields.json ? JSON.parse(rec.fields.json.value) : null; } catch { return null; } };

/** The small status record. Throws when iCloud cannot be reached; returns null when the bot has not published it yet. */
export async function readState(cfg, ms = 12000) {
  const [rec] = await ckLookup(cfg, ['state'], ms);
  return jsonOf(rec);
}

/** The whole item list for the version named in state.lib ({ver, parts}). */
export async function readLibrary(cfg, lib) {
  const parts = Math.max(1, (lib && lib.parts) || 1);
  let ver = 0;
  const pieces = new Array(parts);
  for (let i = 0; i < parts; i += 2) { // two parts (~1.4 MB) per request
    const names = [];
    for (let j = i; j < Math.min(parts, i + 2); j++) names.push(`lib-${j}`);
    const recs = await ckLookup(cfg, names, 45000);
    for (const n of names) {
      const r = recs.find((x) => x.recordName === n);
      if (!r || !r.fields || !r.fields.json) throw new Error('The iCloud copy is not published yet');
      const v = Number(r.fields.updatedAt && r.fields.updatedAt.value) || 0;
      if (ver && v !== ver) { const e = new Error('The iCloud copy is being rewritten'); e.code = 'TORN'; throw e; } // parts from two versions: try again shortly
      ver = v; pieces[Number(n.slice(4))] = r.fields.json.value;
    }
  }
  const items = JSON.parse(strFromU8(gunzipSync(base64ToBytes(pieces.join('')))));
  return { items, ver };
}

/** One file's bytes as a single base64 string, from its chunk records. onProgress(doneChunks, totalChunks). */
export async function readFileBase64(cfg, file, onProgress) {
  const chunks = file.chunks || Math.max(1, Math.ceil((file.size || 0) / CHUNK_RAW));
  const prefix = file.p || `fc-${file.id}`;
  const parts = new Array(chunks);
  for (let i = 0; i < chunks; i += 3) {
    const names = [];
    for (let j = i; j < Math.min(chunks, i + 3); j++) names.push(`${prefix}-${j}`);
    const recs = await ckLookup(cfg, names, 60000);
    for (const n of names) {
      const r = recs.find((x) => x.recordName === n);
      if (!r || !r.fields || !r.fields.data) { const e = new Error('This file is not in iCloud yet'); e.code = 'NOT_IN_CLOUD'; throw e; }
      parts[Number(n.slice(prefix.length + 1))] = r.fields.data.value;
    }
    if (onProgress) onProgress(Math.min(chunks, i + 3), chunks);
  }
  return parts.join(''); // every chunk but the last is a multiple of 3 bytes, so the base64 pieces simply join
}

/**
 * Adds requests to the app's request record. Two devices (iPad + iPhone) may write at once, so this is compare-and-swap
 * on the record's change tag: read, add, write back only if nobody wrote in between; otherwise read again and retry.
 * `handled` = request ids the bot has already acknowledged (state.ops) — those are dropped from the record to keep it small.
 */
export async function appendOps(cfg, ops, handled = []) {
  if (!ops.length) return true;
  const gone = new Set(handled);
  for (let attempt = 0; attempt < 6; attempt++) {
    const [rec] = await ckLookup(cfg, ['inbox']);
    const exists = !!(rec && rec.fields && rec.fields.json);
    const cur = exists ? ((jsonOf(rec) || {}).ops || []) : [];
    const now = Date.now();
    const keep = cur.filter((o) => o && o.id && !gone.has(o.id) && now - (o.ts || 0) < 3 * 86400000);
    const have = new Set(keep.map((o) => o.id));
    const next = [...keep, ...ops.filter((o) => !have.has(o.id))].slice(-80);
    const record = { recordType: 'LibraryMeta', recordName: 'inbox', fields: { json: { value: JSON.stringify({ ops: next }) }, updatedAt: { value: now, type: 'INT64' } } };
    if (exists) record.recordChangeTag = rec.recordChangeTag;
    const out = await ckModify(cfg, [{ operationType: exists ? 'update' : 'create', record }]);
    const r = out[0] || {};
    if (!r.serverErrorCode) return true;
    // Someone else wrote in between. CloudKit reports that as CONFLICT, or as TRY_AGAIN_LATER ("CAS failed") when the two
    // writes landed at the same instant: either way read the record again and add our requests to the newer copy.
    if (!/CONFLICT|EXISTS|ATOMIC|CHANGED|TRY_AGAIN_LATER|ZONE_BUSY/i.test(r.serverErrorCode)) { const e = new Error(r.reason || r.serverErrorCode); e.code = r.serverErrorCode; throw e; }
    await sleep(300 + Math.random() * 700 * (attempt + 1));
  }
  throw new Error('iCloud is busy — the request will be sent again shortly');
}

/** Writes one chunk of an upload (record `${prefix}-${idx}`). */
export async function writeChunk(cfg, prefix, idx, b64) {
  const op = { operationType: 'forceReplace', record: { recordType: 'FileChunk', recordName: `${prefix}-${idx}`, fields: { data: { value: b64 }, idx: { value: idx, type: 'INT64' } } } };
  let r = {};
  for (let attempt = 0; attempt < 4; attempt++) {
    r = (await ckModify(cfg, [op], 90000))[0] || {};
    if (!r.serverErrorCode) return true;
    if (!BUSY.test(r.serverErrorCode)) break; // a per-record "busy" answer is worth another try; anything else is not
    await sleep(700 * 2 ** attempt);
  }
  const e = new Error(r.reason || r.serverErrorCode); e.code = r.serverErrorCode; throw e;
}

/** Removes chunk records (after an upload was cancelled). Best effort. */
export async function deleteChunks(cfg, prefix, count) {
  const ops = Array.from({ length: count }, (_, i) => ({ operationType: 'forceDelete', record: { recordName: `${prefix}-${i}` } }));
  for (let i = 0; i < ops.length; i += 100) { try { await ckModify(cfg, ops.slice(i, i + 100)); } catch { /* best effort */ } }
}
