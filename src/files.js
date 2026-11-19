import { Platform, Linking } from 'react-native';
import { base64ToBytes, bytesToBase64 } from './cksign';
import { CHUNK_RAW, canRead, ckLookup } from './cloudcore';

const FS = () => require('expo-file-system/legacy');
const safeName = (name) => String(name || 'file').replace(/[^\w.\- ]+/g, '_');
const safeId = (id) => String(id).replace(/[^\w\-]+/g, '_');

/** iOS changes the app's folder path after an update, so a stored absolute path goes stale.
 *  This re-roots anything under ".../Documents/" onto the current folder (old saved paths heal too). */
export function resolveLocal(p) {
  if (!p || Platform.OS === 'web' || /^(data|blob|https?):/.test(p)) return p;
  const fs = FS();
  const m = String(p).match(/\/Documents\/(.*)$/);
  if (m) return fs.documentDirectory + m[1];
  if (!/^file:|^\//.test(p)) return fs.documentDirectory + p;
  return p;
}

export async function fileExists(p) {
  if (!p || Platform.OS === 'web') return !!p;
  try { return !!(await FS().getInfoAsync(resolveLocal(p))).exists; } catch { return false; }
}

async function attachmentsDir() {
  const fs = FS();
  const dir = fs.documentDirectory + 'attachments/';
  await fs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  return dir;
}

// File-system access only exists on device; on web we fall back to opening the URL.
export async function downloadFile(url, name, id) {
  if (Platform.OS === 'web') return url;
  const fs = FS();
  const dest = (await attachmentsDir()) + (id ? safeId(id) : Date.now()) + '-' + safeName(name);
  if (id && (await fs.getInfoAsync(dest)).exists) return dest;
  const r = await fs.downloadAsync(url, dest);
  if (r.status !== 200) { await fs.deleteAsync(dest, { idempotent: true }); const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.uri;
}

/** Copies a picked file into the app's own storage so it still opens (and uploads) later with no connection. */
export async function saveLocal(uri, name) {
  if (Platform.OS === 'web') return uri;
  const dest = (await attachmentsDir()) + Date.now() + '-' + safeName(name);
  await FS().copyAsync({ from: uri, to: dest });
  return dest;
}

/**
 * Downloads one file from its iCloud chunk records straight onto the device.
 * Big files are written piece by piece (never held in memory whole); if the piece-writer is not available, it falls
 * back to building the file in memory, which is fine for ordinary sizes.
 */
export async function saveFromCloud(cfg, file, onProgress) {
  if (!canRead(cfg)) { const e = new Error('This copy of the app can’t open files on this Wi-Fi. Update Classroom Feed in TestFlight.'); e.code = 'NO_KEY'; throw e; }
  const chunks = file.chunks || Math.max(1, Math.ceil((file.size || 0) / CHUNK_RAW));
  const prefix = file.p || `fc-${file.id}`;
  const group = async (i) => {
    const names = [];
    for (let j = i; j < Math.min(chunks, i + 3); j++) names.push(`${prefix}-${j}`);
    const recs = await ckLookup(cfg, names, 60000);
    return names.map((n) => {
      const r = recs.find((x) => x.recordName === n);
      if (!r || !r.fields || !r.fields.data) { const e = new Error('This file is not in iCloud yet'); e.code = 'NOT_IN_CLOUD'; throw e; }
      return r.fields.data.value;
    });
  };
  if (Platform.OS === 'web') {
    const parts = [];
    for (let i = 0; i < chunks; i += 3) { parts.push(...(await group(i))); if (onProgress) onProgress(Math.min(chunks, i + 3), chunks); }
    return `data:${file.mime || 'application/octet-stream'};base64,` + parts.join('');
  }
  const dest = (await attachmentsDir()) + safeId(file.id) + '-' + safeName(file.name);
  // Piece-by-piece writer (the newer expo-file-system File API). Any problem creating it just means "use the simple way".
  let handle = null, fileObj = null;
  if (chunks > 6) {
    try {
      const { File } = require('expo-file-system');
      fileObj = new File(dest);
      if (fileObj.exists) fileObj.delete();
      fileObj.create();
      handle = fileObj.open();
    } catch { handle = null; }
  }
  if (handle) {
    let wrote = true;
    try {
      for (let i = 0; i < chunks; i += 3) {
        const parts = await group(i);
        try { for (const p of parts) handle.writeBytes(base64ToBytes(p)); } catch { wrote = false; break; }
        if (onProgress) onProgress(Math.min(chunks, i + 3), chunks);
      }
    } finally { try { handle.close(); } catch {} }
    if (wrote) {
      const info = await FS().getInfoAsync(dest);
      if (info.exists && (!file.size || info.size === file.size)) return dest;
    }
    await FS().deleteAsync(dest, { idempotent: true }).catch(() => {});
  }
  const parts = [];
  for (let i = 0; i < chunks; i += 3) { parts.push(...(await group(i))); if (onProgress) onProgress(Math.min(chunks, i + 3), chunks); }
  await FS().writeAsStringAsync(dest, parts.join(''), { encoding: 'base64' });
  return dest;
}

/** One slice of a local file as base64 (for uploading it to iCloud in chunks). */
export async function readSliceBase64(uri, position, length) {
  if (Platform.OS === 'web') {
    const buf = new Uint8Array(await (await fetch(uri)).arrayBuffer());
    return bytesToBase64(buf.subarray(position, position + length));
  }
  return FS().readAsStringAsync(resolveLocal(uri), { encoding: 'base64', position, length });
}

export async function fileSize(path) {
  if (Platform.OS === 'web') { try { return (await (await fetch(path)).blob()).size; } catch { return 0; } }
  try { const info = await FS().getInfoAsync(resolveLocal(path)); return info.exists ? info.size || 0 : 0; } catch { return 0; }
}

export async function removeLocal(path) {
  if (Platform.OS === 'web' || !path) return;
  try { await FS().deleteAsync(resolveLocal(path), { idempotent: true }); } catch {}
}

/** Opens the share sheet for a saved file (Save to Files, AirDrop, open in another app…). */
export async function openFile(path) {
  if (Platform.OS === 'web') { Linking.openURL(path); return; }
  const Sharing = require('expo-sharing');
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(resolveLocal(path));
}
