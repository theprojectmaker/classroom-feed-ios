import { Platform, Linking } from 'react-native';

/** iOS changes the app's folder path after an update, so a stored absolute path goes stale.
 *  This re-roots anything under ".../Documents/" onto the current folder (old saved paths heal too). */
export function resolveLocal(p) {
  if (!p || Platform.OS === 'web' || /^data:/.test(p)) return p;
  const FS = require('expo-file-system/legacy');
  const m = String(p).match(/\/Documents\/(.*)$/);
  if (m) return FS.documentDirectory + m[1];
  if (!/^file:|^\//.test(p)) return FS.documentDirectory + p;
  return p;
}

export async function fileExists(p) {
  if (!p || Platform.OS === 'web') return !!p;
  try { return !!(await require('expo-file-system/legacy').getInfoAsync(resolveLocal(p))).exists; } catch { return false; }
}

// File-system access only exists on device; on web we fall back to opening the URL.
export async function downloadFile(url, name, id) {
  if (Platform.OS === 'web') { Linking.openURL(url); return url; }
  const FS = require('expo-file-system/legacy');
  const dir = FS.documentDirectory + 'attachments/';
  await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const safe = name.replace(/[^\w.\- ]+/g, '_');
  const dest = dir + (id ? String(id).replace(/[^\w\-]+/g, '_') : Date.now()) + '-' + safe;
  if (id && (await FS.getInfoAsync(dest)).exists) return dest;
  const r = await FS.downloadAsync(url, dest);
  if (r.status !== 200) { await FS.deleteAsync(dest, { idempotent: true }); throw new Error('HTTP ' + r.status); }
  return r.uri;
}

/** Copies a picked file into the app's own storage so it still opens with no connection. */
export async function saveLocal(uri, name) {
  if (Platform.OS === 'web') return uri;
  const FS = require('expo-file-system/legacy');
  const dir = FS.documentDirectory + 'attachments/';
  await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = dir + Date.now() + '-' + name.replace(/[^\w.\- ]+/g, '_');
  await FS.copyAsync({ from: uri, to: dest });
  return dest;
}

/** Saves a base64 string as a file in the app's storage (what comes back from iCloud). */
export async function saveBase64(b64, name, id) {
  if (Platform.OS === 'web') return 'data:application/octet-stream;base64,' + b64;
  const FS = require('expo-file-system/legacy');
  const dir = FS.documentDirectory + 'attachments/';
  await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = dir + (id ? String(id).replace(/[^\w\-]+/g, '_') : Date.now()) + '-' + name.replace(/[^\w.\- ]+/g, '_');
  await FS.writeAsStringAsync(dest, b64, { encoding: 'base64' });
  return dest;
}

export async function fileSize(path) {
  if (Platform.OS === 'web') return 0;
  try { const info = await require('expo-file-system/legacy').getInfoAsync(path); return info.exists ? info.size || 0 : 0; } catch { return 0; }
}

export async function removeLocal(path) {
  if (Platform.OS === 'web') return;
  try { await require('expo-file-system/legacy').deleteAsync(path, { idempotent: true }); } catch {}
}

export async function openFile(path) {
  if (Platform.OS === 'web') { Linking.openURL(path); return; }
  const Sharing = require('expo-sharing');
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(resolveLocal(path));
}
