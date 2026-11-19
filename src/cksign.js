// Signs CloudKit Web Services requests in plain JavaScript (ECDSA P-256 over SHA-256), so the app can WRITE to iCloud
// with no Apple sign-in and no native module. No React Native imports here: the same file runs under Node for tests.
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = (() => { const t = new Uint8Array(128).fill(255); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; return t; })();

export function bytesToBase64(u8) {
  let out = '';
  const n = u8.length;
  for (let i = 0; i < n; i += 3) {
    const a = u8[i], b = i + 1 < n ? u8[i + 1] : 0, c = i + 2 < n ? u8[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < n ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < n ? B64[c & 63] : '=');
  }
  return out;
}

export function base64ToBytes(s) {
  let len = s.length;
  while (len > 0 && s.charCodeAt(len - 1) === 61) len--; // strip '=' padding
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < len; i++) {
    const v = B64_REV[s.charCodeAt(i) & 127];
    if (v === 255) continue; // newline or other noise
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return o === out.length ? out : out.subarray(0, o);
}

export function utf8Bytes(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const s = unescape(encodeURIComponent(str)), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/**
 * Headers for a server-to-server CloudKit request. The signature covers  <date>:<base64 sha256(body)>:<subpath>.
 * cfg: { keyId, d }  (d = the key's private scalar as hex)   skewMs: how far this device's clock is off Apple's.
 */
export function signedHeaders(cfg, subpath, body, skewMs = 0) {
  const date = new Date(Date.now() + skewMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const bodyHash = bytesToBase64(sha256(utf8Bytes(body)));
  const digest = sha256(utf8Bytes(`${date}:${bodyHash}:${subpath}`));
  const sig = p256.sign(digest, cfg.d);
  return {
    'X-Apple-CloudKit-Request-KeyID': cfg.keyId,
    'X-Apple-CloudKit-Request-ISO8601Date': date,
    'X-Apple-CloudKit-Request-SignatureV1': bytesToBase64(sig.toDERRawBytes()),
    'Content-Type': 'text/plain',
  };
}
