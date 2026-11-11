import { Platform, Linking } from 'react-native';

// File-system access only exists on device; on web we fall back to opening the URL.
export async function downloadFile(url, name) {
  if (Platform.OS === 'web') { Linking.openURL(url); return url; }
  const FS = require('expo-file-system/legacy');
  const dir = FS.documentDirectory + 'attachments/';
  await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const safe = name.replace(/[^\w.\- ]+/g, '_');
  const dest = dir + Date.now() + '-' + safe;
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
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
}
