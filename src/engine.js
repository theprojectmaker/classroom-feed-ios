// The app's engine: what is on the device, how it stays in step with the bot, and how requests get out.
//
// Two routes to the same data:
//   "bot"    — straight to the bot's own server. Fast; only works on normal internet.
//   "icloud" — through Apple's CloudKit. Works on the school Wi-Fi (Apple only). Reads the status + item list records,
//              downloads files from their chunk records, and SENDS requests by writing them into the "inbox" record.
// Every sync tries both at once and uses the bot when it answers, iCloud otherwise. Nothing the user does depends on
// which one is up: requests go into an outbox and leave by whichever route works.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { DEFAULTS, drop, guessMime, load, makeApi, save, uid } from './lib';
import * as cloud from './cloudcore';
import { downloadFile, fileExists, fileSize, readSliceBase64, removeLocal, saveFromCloud, saveLocal } from './files';
import { cancelReminders, scheduleReminders } from './remind';
import { niceCourse } from './util';
import { SEED } from './seed';

const BOT_UPLOAD_MAX = 23 * 1024 * 1024; // the bot stores files up to 24 MB; bigger ones always travel through iCloud
const DAY = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (e) => String((e && e.message) || e || 'failed').slice(0, 140);
const wire = ({ cloud: _c, ...op }) => op; // what leaves the device (local bookkeeping stripped)

/**
 * What the notification library would send to Expo's server to register this device — captured instead of sent.
 * On a Wi-Fi that only allows Apple that server cannot be reached, so the device could never get its notification
 * address; the bot (which can reach it) sends exactly this on the device's behalf. Returns null if it cannot be captured.
 */
async function captureExpoRegistration() {
  const real = global.fetch;
  let body = null;
  global.fetch = (url, init) => {
    if (String((url && url.url) || url).includes('push/getExpoPushToken')) { body = init && init.body ? String(init.body) : null; return Promise.reject(new Error('kept for the bot')); }
    return real(url, init);
  };
  try { await Promise.race([Notifications.getExpoPushTokenAsync(), sleep(15000)]); } catch { /* expected: the request was kept */ } finally { global.fetch = real; }
  try { const j = JSON.parse(body); return j && j.deviceToken && j.deviceId ? j : null; } catch { return null; }
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export function useEngine({ onOpenItem }) {
  const [ready, setReady] = useState(false);
  const [cfg, setCfgState] = useState(DEFAULTS);
  const [ck, setCkState] = useState(null);
  const [items, setItemsState] = useState([]);
  const [saved, setSavedState] = useState({});
  const [remote, setRemoteState] = useState(null);
  const [net, setNetState] = useState({ mode: 'unknown', bot: null, cloud: null, at: 0 });
  const [outbox, setOutboxState] = useState([]);
  const [jobs, setJobsState] = useState([]);
  const [progress, setProgress] = useState({});
  const [fresh, setFresh] = useState([]);
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [wanted, setWantedState] = useState({});
  const [push, setPush] = useState({ token: '', granted: null });

  // The refs hold the truth (so background work never sees stale values); the state mirrors them for the screen.
  const r = useRef({ ready: false, cfg: DEFAULTS, ck: null, items: [], saved: {}, remote: null, net: { mode: 'unknown' }, outbox: [], jobs: [], wanted: {} }).current;
  const apiRef = useRef(makeApi(DEFAULTS));
  const openItemRef = useRef(onOpenItem); openItemRef.current = onOpenItem;
  const lastSync = useRef(0), botLibVer = useRef(0), cloudLibVer = useRef(0), lastFull = useRef(0), lastTick = useRef(0);
  const hotUntil = useRef(0), botSeen = useRef({ ok: null, at: 0 }), sendFailAt = useRef(0);
  const syncing = useRef(false), again = useRef(false), jobRunning = useRef(false), autoSaving = useRef(false);
  const noticeTimer = useRef(null);
  const devId = useRef(''), helloAt = useRef(0), errs = useRef([]), errDirty = useRef(false), pushRef = useRef({ granted: null, token: false });
  /** Remembers the last few things that went wrong, so this device's own report (sayHello) can show them. */
  const noteErr = (where, e) => { errs.current = [...errs.current.slice(-5), { w: where, m: msg(e), at: Date.now() }]; errDirty.current = true; };

  const setCfg = (c) => { r.cfg = c; apiRef.current = makeApi(c); setCfgState(c); save('cfg2', c); };
  const setCk = (k) => { const next = k ? { container: k.container, environment: k.environment, token: k.token || '', keyId: k.keyId || (r.ck && r.ck.keyId) || '', d: k.d || (r.ck && r.ck.d) || '' } : null; r.ck = next; setCkState(next); if (next) save('ck3', next); else drop('ck3'); };
  const setItems = (fn) => { const next = typeof fn === 'function' ? fn(r.items) : fn; r.items = next; setItemsState(next); save('items', next); return next; };
  const setSaved = (fn) => { const next = typeof fn === 'function' ? fn(r.saved) : fn; r.saved = next; setSavedState(next); save('saved', next); };
  const setRemote = (v) => { r.remote = v; setRemoteState(v); save('remote', v); };
  const setNet = (v) => { r.net = v; setNetState(v); };
  const setOutbox = (fn) => { const next = typeof fn === 'function' ? fn(r.outbox) : fn; r.outbox = next; setOutboxState(next); save('outbox', next); };
  const setJobs = (fn) => { const next = typeof fn === 'function' ? fn(r.jobs) : fn; r.jobs = next; setJobsState(next); save('jobs', next); };
  const setWanted = (fn) => { const next = typeof fn === 'function' ? fn(r.wanted) : fn; r.wanted = next; setWantedState(next); save('wanted', next); };
  const setProg = (id, v) => setProgress((p) => { const n = { ...p }; if (v) n[id] = v; else delete n[id]; return n; });
  const hot = (ms = 3 * 60 * 1000) => { hotUntil.current = Math.max(hotUntil.current, Date.now() + ms); };

  const notify = useCallback((text, ms = 3200) => {
    setNotice(text); clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), ms);
  }, []);

  /* ---------- load what is on the device ---------- */
  useEffect(() => { (async () => {
    const c = { ...DEFAULTS, ...(await load('cfg2', DEFAULTS)) };
    r.cfg = c; apiRef.current = makeApi(c); setCfgState(c);
    let k = (await load('ck3', null)) || (await load('ck', null)); // 'ck' = the read-only details an older build cached
    // Nothing stored yet (or only the read-only part)? Start from the details built into this copy of the app, so there is
    // never a "set up first" step: it can receive AND send through iCloud from the very first launch.
    if (!(k && k.container && k.d) && SEED) { try { const sd = JSON.parse(SEED); if (sd && sd.container) k = { ...(k || {}), ...sd }; } catch { /* no built-in details in this copy */ } }
    if (k && k.container) { r.ck = { container: k.container, environment: k.environment, token: k.token || '', keyId: k.keyId || '', d: k.d || '' }; setCkState(r.ck); save('ck3', r.ck); }
    let its = (await load('items', [])).map((i) => ({ ...i, course: niceCourse(i.course) }));
    r.saved = await load('saved', {}); setSavedState(r.saved);
    r.remote = await load('remote', null); setRemoteState(r.remote);
    r.outbox = await load('outbox', []); r.jobs = await load('jobs', []);
    r.wanted = await load('wanted', {}); setWantedState(r.wanted);
    lastSync.current = await load('lastSync', 0); cloudLibVer.current = await load('cloudLibVer', 0);
    devId.current = (await load('dev', '')) || uid('d'); save('dev', devId.current);
    // Changes an older build had queued (its own format): carry them over so nothing the user did is lost.
    const old = await load('queue', []);
    for (const q of Array.isArray(old) ? old : []) {
      if (q.type === 'state') r.outbox.push({ id: uid(), ts: Date.now(), t: 'state', item: q.id, submitted: !!q.submitted });
      else if (q.type === 'turnin') r.outbox.push({ id: uid(), ts: Date.now(), t: 'turnin', item: q.id, cancel: !!q.cancel });
      else if (q.type === 'upload' && q.uri) {
        const up = uid('u'), size = await fileSize(q.uri);
        if (size) {
          r.jobs.push({ up, itemId: q.itemId, name: q.name, mime: q.mime || guessMime(q.name), size, uri: q.uri, chunks: Math.max(1, Math.ceil(size / cloud.CHUNK_RAW)), next: 0 });
          its = its.map((i) => (i.id === q.itemId ? { ...i, files: (i.files || []).map((f) => (f.id === q.fileId ? { ...f, id: up, size } : f)) } : i));
        }
      }
    }
    if (old && old.length) { await drop('queue'); save('outbox', r.outbox); save('jobs', r.jobs); save('items', its); }
    r.items = its; setItemsState(its); setOutboxState(r.outbox); setJobsState(r.jobs);
    r.ready = true; setReady(true);
  })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- merging what arrives ---------- */
  // Never throws away what only this device has: notes, steps, stars, local copies of files, changes still on their way out.
  const merge = useCallback((incoming, full) => setItems((cur) => {
    const map = new Map(cur.map((i) => [i.id, i]));
    const waiting = (t, id) => r.outbox.some((o) => o.t === t && o.item === id);
    const seen = new Set();
    for (const raw of incoming) {
      const i = { ...raw, course: niceCourse(raw.course), submitted: !!raw.submitted };
      seen.add(i.id);
      const old = map.get(i.id);
      if (!old) { map.set(i.id, { ...i, files: (i.files || []).map((f) => ({ ...f, synced: true })) }); continue; }
      const mineById = new Map((old.files || []).map((f) => [f.id, f]));
      const serverIds = new Set((i.files || []).map((f) => f.id));
      const files = [
        ...(i.files || []).map((f) => ({ ...f, synced: true, local: (mineById.get(f.id) || {}).local })),
        // files only this device knows: uploads still travelling, and local copies the server never listed
        ...(old.files || []).filter((f) => !serverIds.has(f.id) && (f.pending || (f.local && !f.synced))),
      ];
      map.set(i.id, {
        ...old, ...i, files, dueAt: typeof i.dueAt === 'number' ? i.dueAt : old.dueAt || 0, // the bot's word on the due time is final (an older copy may hold a wrong one)
        // private comments written here that the bot has not heard of yet stay visible until it has
        mycomments: [...(i.mycomments || []), ...(old.mycomments || []).filter((c) => c.state === 'sending' && r.outbox.some((o) => o.id === c.id) && !(i.mycomments || []).some((x) => x.id === c.id))],
        submitted: waiting('state', i.id) ? old.submitted : i.submitted,
        ...(waiting('turnin', i.id) ? { turnin: old.turnin, turnin_note: old.turnin_note, turnin_at: old.turnin_at } : {}),
      });
    }
    // A full list is everything the bot has: a post missing from it was deleted (your own additions always stay).
    if (full && incoming.length) for (const [id, it] of map) if (!seen.has(id) && !it.mine) map.delete(id);
    return [...map.values()].sort((a, b) => (b.posted_at || b.created_at || 0) - (a.posted_at || a.created_at || 0));
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyIncoming = useCallback((got, full, quiet) => {
    if (!got || !got.length) return;
    const known = new Set(r.items.map((i) => i.id));
    const brandNew = got.filter((i) => !known.has(i.id) && i.kind !== 'email');
    // The "N new" sheet is for news. A big batch at once is this device catching up (first sync of a new version), not news.
    if (!quiet && known.size && brandNew.length && brandNew.length <= 25) setFresh((f) => { const have = new Set(f.map((x) => x.id)); return [...f, ...brandNew.filter((x) => !have.has(x.id))].slice(0, 40); });
    merge(got, full);
    got.forEach((it) => { if (it.dueAt && !it.submitted) scheduleReminders(it); else if (it.submitted) cancelReminders(it); });
  }, [merge]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateItem = useCallback((id, patch) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onSaved = useCallback((id, path) => setSaved((x) => ({ ...x, [id]: path })), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- requests going out ---------- */
  const ackOps = (ids) => {
    if (!ids || !ids.length || !r.outbox.length) return;
    const done = new Set(ids);
    if (r.outbox.some((o) => done.has(o.id))) setOutbox((cur) => cur.filter((o) => !done.has(o.id)));
  };

  const sendOp = useCallback((op) => {
    const full = { id: uid(), ts: Date.now(), ...op };
    setOutbox((cur) => [...cur, full]);
    hot(); setTimeout(() => sync(), 30);
    return full.id;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * This device's own short report — what it is and what it can see — sent like any other request, so it also arrives
   * over iCloud from the school Wi-Fi. It is how a problem on a device can be found without anyone reading things off
   * the screen. At most every 30 minutes (sooner right after something went wrong). Also makes the first signature
   * ahead of time, so the first real turn-in is not the slow one.
   */
  const sayHello = () => {
    const since = Date.now() - helloAt.current;
    if (!(r.net.mode === 'bot' || cloud.canWrite(r.ck))) return; // no way to send it from here: don't leave it waiting
    if (since < (errDirty.current ? 2 * 60 * 1000 : 30 * 60 * 1000) || r.outbox.some((o) => o.t === 'hello')) return;
    helloAt.current = Date.now(); errDirty.current = false;
    setTimeout(() => {
      let sign = -1;
      try { sign = cloud.warmUp(r.ck); } catch (e) { sign = -2; noteErr('sign', e); }
      const op = {
        id: uid(), ts: Date.now(), t: 'hello', dev: devId.current, name: r.cfg.name || '', os: `${Platform.OS} ${Platform.Version || ''}`.trim(), pad: !!Platform.isPad,
        upd: String(Updates.updateId || 'built-in').slice(0, 8), embedded: !!Updates.isEmbeddedLaunch, rt: String(Updates.runtimeVersion || ''), seeded: !!SEED,
        signedIn: !!r.cfg.token, read: cloud.canRead(r.ck), write: cloud.canWrite(r.ck), mode: r.net.mode, bot: r.net.bot, cloudOk: r.net.cloud, cloudErr: r.net.cloudErr || '',
        items: r.items.length, files: r.items.reduce((n, i) => n + (i.files || []).length, 0), saved: Object.keys(r.saved).length, waiting: r.outbox.length, jobs: r.jobs.length,
        push: pushRef.current, sign, errs: errs.current,
      };
      setOutbox((cur) => [...cur.filter((o) => o.t !== 'hello'), op]);
    }, 1500);
  };

  /* ---------- the two routes ---------- */
  const probeBot = async (force) => {
    const c = r.cfg;
    if (c.icloudOnly || !c.token) return false;
    const b = botSeen.current, age = Date.now() - b.at;
    if (!force && b.ok === true && age < 20000) return true;
    if (!force && b.ok === false && age < 60000) return false; // it was blocked a moment ago: don't wait on it again yet
    const ok = await apiRef.current.health(b.ok === false ? 2500 : 3500);
    botSeen.current = { ok, at: Date.now() };
    return ok;
  };

  const viaBot = async (full) => {
    const api = apiRef.current;
    if (r.outbox.length) { const res = await api.ops(r.outbox.map(wire)); ackOps(res.done || []); }
    const st = await api.status();
    if (st.ck) setCk({ ...st.ck, ...(st.ckw || {}) });
    setRemote({ lib: st.lib || null, scan: st.scan || {}, pc: st.pc || { seen: st.pcSeen || 0, busy: '' }, lastNew: st.lastNew || 0, ts: Date.now(), via: 'bot' });
    const ver = (st.lib && st.lib.ver) || 0;
    if (full || ver !== botLibVer.current) {
      const res = await api.items(lastSync.current);
      const got = res.items || [];
      applyIncoming(got, false);
      lastSync.current = got.reduce((m, i) => Math.max(m, i.updated_at || 0), lastSync.current); save('lastSync', lastSync.current);
      botLibVer.current = ver;
    }
  };

  const viaCloud = async (state, full) => {
    if (!state) return;
    const k = r.ck;
    setRemote({ ...state, via: 'icloud' });
    ackOps(state.ops || []);
    const unsent = r.outbox.filter((o) => !o.cloud);
    if (unsent.length && cloud.canWrite(k) && Date.now() - sendFailAt.current > 8000) { // after a failed send, wait a little before the next try
      try {
        await cloud.appendOps(k, unsent.map(wire), state.ops || []);
        const ids = new Set(unsent.map((o) => o.id)), now = Date.now();
        setOutbox((cur) => cur.map((o) => (ids.has(o.id) ? { ...o, cloud: now } : o)));
      } catch (e) { sendFailAt.current = Date.now(); noteErr('send', e); }
    }
    if (state.lib && state.lib.ver && (state.lib.ver !== cloudLibVer.current || (full && !r.items.length))) {
      try {
        const lib = await cloud.readLibrary(k, state.lib);
        applyIncoming(lib.items, true);
        cloudLibVer.current = state.lib.ver; save('cloudLibVer', state.lib.ver);
      } catch (e) { if (e.code !== 'TORN') noteErr('list', e); /* the list was being rewritten, or the connection dropped: the next pass reads it */ }
    }
  };

  const sync = useCallback(async (opts = {}) => {
    if (!r.ready || (!r.cfg.token && !cloud.canRead(r.ck))) return;
    if (syncing.current) { again.current = true; return; }
    syncing.current = true; lastTick.current = Date.now();
    if (opts.manual) setRefreshing(true);
    try {
      // Requests nobody picked up for three days are given up on (and a turn-in says so instead of waiting forever).
      const stale = r.outbox.filter((o) => Date.now() - (o.ts || 0) > 3 * DAY);
      if (stale.length) {
        setOutbox((cur) => cur.filter((o) => !stale.includes(o)));
        stale.filter((o) => o.t === 'turnin' && !o.cancel).forEach((o) => updateItem(o.item, { turnin: 'failed', turnin_note: 'This request never reached your PC. Try again.' }));
      }
      const k = r.ck;
      const stP = cloud.canRead(k) ? cloud.readState(k).then((s) => ({ ok: true, s }), (e) => ({ ok: false, e })) : Promise.resolve({ ok: false, e: new Error('not set up') });
      const probe = probeBot(!!opts.manual);
      // A blocked bot must not hold iCloud up (at school its check only ends by timing out): once iCloud has answered, the
      // bot gets one more second, then this pass goes through iCloud. Its late answer still counts for the next pass.
      const botOk = await Promise.race([probe, stP.then((x) => (x.ok ? sleep(1000).then(() => false) : probe))]);
      const st = await stP;
      const full = !!(opts.manual || opts.full) || Date.now() - lastFull.current > 30000;
      let mode = 'offline';
      if (botOk) {
        try { await viaBot(full); mode = 'bot'; }
        catch (e) {
          if (e.status === 401) { setCfg({ ...r.cfg, token: '' }); notify('Please sign in again.'); }
          botSeen.current = { ok: false, at: Date.now() };
        }
      }
      if (mode !== 'bot' && st.ok) { mode = 'icloud'; try { await viaCloud(st.s, full); } catch { /* sending failed: the outbox keeps it for the next pass */ } }
      if (full && mode !== 'offline') lastFull.current = Date.now();
      setNet({ mode, bot: botOk, cloud: st.ok, cloudErr: st.ok ? '' : msg(st.e), at: Date.now() });
      if (mode !== 'offline') sayHello();
      runJobs();
      if (full && mode !== 'offline') autoSave(mode);
    } finally {
      syncing.current = false; setRefreshing(false);
      if (again.current) { again.current = false; setTimeout(() => sync(), 60); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- files coming in ---------- */
  /** Makes sure a file is on the device and returns its path. Bot when reachable, else its chunk records in iCloud. */
  const getFile = useCallback(async (file) => {
    const cur = file.local || r.saved[file.id];
    if (cur && (await fileExists(cur))) return cur;
    setProg(file.id, { kind: 'down', done: 0, total: 1 });
    try {
      let path = null;
      if (r.net.mode === 'bot' && file.kv !== 0) {
        try { path = await downloadFile(apiRef.current.fileUrl(file.id), file.name, file.id); }
        catch (e) { if (!(file.cloud || file.p)) throw e; }
      }
      if (!path) {
        if (!(file.cloud || file.p)) { const e = new Error('This file is not in iCloud yet'); e.code = 'NOT_IN_CLOUD'; throw e; }
        path = await saveFromCloud(r.ck, file, (d, t) => setProg(file.id, { kind: 'down', done: d, total: t }));
      }
      if (Platform.OS !== 'web') onSaved(file.id, path);
      setProg(file.id, null);
      return path;
    } catch (e) { if (e.code !== 'NOT_IN_CLOUD') noteErr('file', e); setProg(file.id, { kind: 'down', error: msg(e), code: e.code || '' }); throw e; }
  }, [onSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Copies attachments onto the device ahead of time so they open instantly (and offline). Over iCloud only recent, normal-sized ones. */
  const autoSave = async (mode) => {
    if (Platform.OS === 'web' || autoSaving.current) return;
    autoSaving.current = true;
    try {
      for (const it of r.items) {
        const recent = Date.now() - (it.posted_at || it.created_at || 0) < 45 * DAY;
        for (const f of it.files || []) {
          if (f.pending || f.local || r.saved[f.id] || String(f.id).startsWith('local-')) continue;
          // Over iCloud: recent files of normal size, plus anything you asked the PC for. Straight from the bot: everything it holds.
          if (mode === 'icloud' ? !(f.cloud && ((recent && (f.size || 0) < 40 * 1024 * 1024) || r.wanted[f.id])) : (f.kv === 0 && !f.cloud)) continue;
          try { await getFile(f); } catch (e) { if (e.code !== 'NOT_IN_CLOUD' && e.status !== 404 && e.status !== 409) return; setProg(f.id, null); }
          if (r.net.mode !== mode) return;
        }
      }
    } finally { autoSaving.current = false; }
  };

  /** Asks the PC to put a file into iCloud (one that is not there yet). */
  const wantFile = useCallback((file) => {
    if (r.wanted[file.id]) return;
    setWanted((w) => ({ ...w, [file.id]: Date.now() }));
    sendOp({ t: 'want', file: file.id });
    notify('Asked your PC to send this file. It appears here when it arrives.');
  }, [sendOp, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- finished work going out ---------- */
  const patchJob = (up, patch) => setJobs((cur) => cur.map((j) => (j.up === up ? { ...j, ...patch } : j)));

  const runJob = async (job) => {
    const done = (id) => {
      setJobs((cur) => cur.filter((j) => j.up !== job.up));
      setItems((cur) => cur.map((i) => (i.id === job.itemId ? { ...i, files: (i.files || []).map((f) => (f.id === job.up ? { ...f, id, pending: false, sent: true } : f)) } : i)));
      if (id !== job.up) setOutbox((cur) => cur.map((o) => (o.t === 'turnin' && Array.isArray(o.files) && o.files.includes(job.up) ? { ...o, files: o.files.map((x) => (x === job.up ? id : x)), cloud: 0 } : o)));
      setProg(job.up, null);
    };
    if (r.net.mode === 'bot' && job.size <= BOT_UPLOAD_MAX && !job.next) {
      setProg(job.up, { kind: 'up', done: 0, total: 1 });
      const res = await apiRef.current.upload(job.itemId, job.up, job.name, job.uri, job.mime);
      done(res.id || job.up);
      return;
    }
    const k = r.ck;
    if (!cloud.canWrite(k)) { const e = new Error('it goes out once Classroom Feed is updated in TestFlight'); e.code = 'NO_KEY'; throw e; }
    for (let i = job.next || 0; i < job.chunks; i++) {
      if (!r.jobs.some((j) => j.up === job.up)) return; // the user removed the file meanwhile
      const b64 = await readSliceBase64(job.uri, i * cloud.CHUNK_RAW, cloud.CHUNK_RAW);
      await cloud.writeChunk(k, `up-${job.up}`, i, b64);
      patchJob(job.up, { next: i + 1, error: '', tries: 0 });
      setProg(job.up, { kind: 'up', done: i + 1, total: job.chunks });
    }
    sendOp({ t: 'upload', item: job.itemId, up: job.up, name: job.name, mime: job.mime, size: job.size, chunks: job.chunks });
    done(job.up);
  };

  const runJobs = async () => {
    if (jobRunning.current || r.net.mode === 'offline' || r.net.mode === 'unknown') return;
    jobRunning.current = true;
    try {
      for (;;) {
        const job = r.jobs.find((j) => !(j.error && ((j.tries || 0) >= 8 || Date.now() - (j.errorAt || 0) < 20000)));
        if (!job) break;
        try { await runJob(job); }
        catch (e) {
          noteErr('upload', e);
          patchJob(job.up, { error: msg(e), errorAt: Date.now(), tries: (job.tries || 0) + 1 });
          setProg(job.up, { kind: 'up', done: job.next || 0, total: job.chunks, error: msg(e) });
          if (e.code === 'NO_KEY' || e.name === 'AbortError' || /network|fetch/i.test(msg(e))) break; // no point trying the next one right now
        }
      }
    } finally { jobRunning.current = false; }
  };

  /** Adds a finished file to an assignment: shown at once, sent by whichever route works. The same file is never added twice. */
  const addWork = useCallback(async (item, asset) => {
    const cur = r.items.find((i) => i.id === item.id) || item;
    let name = String(asset.name || 'work').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 110) || 'work';
    // A file that comes back from this app's own storage (you opened an attachment, wrote on it, sent it back) is called
    // "<its id>-<a stripped-down name>": give it its real name again, so your teacher does not see a string of letters.
    const own = name.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|u[a-z0-9]{10,})-(.+)$/i);
    if (own) { const orig = (cur.files || []).find((f) => f.id === own[1]) || r.items.flatMap((i) => i.files || []).find((f) => f.id === own[1]); name = (orig && orig.name) || own[2]; }
    const local = await saveLocal(asset.uri, name);
    const size = asset.size || (await fileSize(local));
    if ((cur.files || []).some((f) => f.origin === 'upload' && f.name === name && (!f.size || !size || f.size === size))) {
      await removeLocal(local); notify(`“${name}” is already added to this assignment.`); return null;
    }
    const up = uid('u');
    const file = { id: up, name, size, mime: asset.mimeType || guessMime(name), local, origin: 'upload', pending: !cur.mine };
    setItems((c) => c.map((i) => (i.id === item.id ? { ...i, files: [...(i.files || []), file] } : i)));
    if (cur.mine) return up; // your own assignment: the file just stays on this device
    setJobs((c) => [...c, { up, itemId: item.id, name, mime: file.mime, size, uri: local, chunks: Math.max(1, Math.ceil(size / cloud.CHUNK_RAW)), next: 0 }]);
    setProg(up, { kind: 'up', done: 0, total: Math.max(1, Math.ceil(size / cloud.CHUNK_RAW)) });
    hot(); setTimeout(() => sync(), 30);
    return up;
  }, [notify]); // eslint-disable-line react-hooks/exhaustive-deps

  const retryWork = useCallback((fileId) => { patchJob(fileId, { error: '', tries: 0, errorAt: 0 }); setProg(fileId, { kind: 'up', done: 0, total: 1 }); hot(); setTimeout(() => sync(), 30); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const removeWork = useCallback((item, file) => {
    const job = r.jobs.find((j) => j.up === file.id);
    setJobs((c) => c.filter((j) => j.up !== file.id));
    setItems((c) => c.map((i) => (i.id === item.id ? { ...i, files: (i.files || []).filter((f) => f.id !== file.id) } : i)));
    setProg(file.id, null);
    if (file.local) removeLocal(file.local);
    if (item.mine) return;
    if (job) { if (job.next && cloud.canWrite(r.ck)) cloud.deleteChunks(r.ck, `up-${file.id}`, job.next).catch(() => {}); }
    else sendOp({ t: 'unupload', file: file.id });
  }, [sendOp]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- turning in, marking done, scanning ---------- */
  /** Real Google Classroom turn-in. The PC does it (it has the signed-in browser) and reports back. `empty` = hand in with no file ("Mark as done"). */
  const turnIn = useCallback((item, { empty = false, resubmit = false } = {}) => {
    const cur = r.items.find((i) => i.id === item.id) || item;
    const files = (cur.files || []).filter((f) => f.origin === 'upload').map((f) => f.id);
    if (cur.mine || !cur.url) { notify('This item can’t be turned in on Classroom.'); return; }
    if (!files.length && !empty) { notify('Add your finished file first.'); return; }
    updateItem(cur.id, { turnin: 'queued', turnin_note: 'Sending the request…', turnin_at: Date.now() });
    // resubmit = "hand it in again although Classroom already shows it as graded" (only ever sent when the user chose that)
    sendOp({ t: 'turnin', item: cur.id, files, empty: !files.length && !!empty, ...(resubmit ? { resubmit: true } : {}) });
    hot(6 * 60 * 1000);
  }, [sendOp, notify, updateItem]);

  const cancelTurnIn = useCallback((item) => {
    const unsent = r.outbox.find((o) => o.t === 'turnin' && o.item === item.id && !o.cancel && !o.cloud);
    updateItem(item.id, { turnin: '', turnin_note: '' });
    if (unsent && r.net.mode !== 'bot') { setOutbox((cur) => cur.filter((o) => o !== unsent)); return; } // it never left this device
    sendOp({ t: 'turnin', item: item.id, cancel: true });
  }, [sendOp, updateItem]); // eslint-disable-line react-hooks/exhaustive-deps

  /** "Done" on your own list (silences reminders, shared with your other devices). Not a Classroom turn-in. */
  const toggleSubmitted = useCallback((item) => {
    const updated = { ...item, submitted: !item.submitted };
    updateItem(item.id, { submitted: updated.submitted });
    if (updated.submitted) cancelReminders(updated); else scheduleReminders(updated);
    if (item.mine) return;
    setOutbox((cur) => cur.filter((o) => !(o.t === 'state' && o.item === item.id && !o.cloud)));
    sendOp({ t: 'state', item: item.id, submitted: updated.submitted });
  }, [sendOp, updateItem]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Asks the PC to look at Google Classroom right now. Progress arrives in remote.scan. */
  const scanNow = useCallback(() => { hot(7 * 60 * 1000); return sendOp({ t: 'scan' }); }, [sendOp]);

  /** A private comment for the teacher: shown at once, posted on the assignment in Google Classroom by your PC. */
  const sendComment = useCallback((item, text) => {
    const t = String(text || '').trim().slice(0, 2000);
    if (!t || item.mine || !item.url) return;
    const id = sendOp({ t: 'comment', item: item.id, text: t });
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, mycomments: [...(i.mycomments || []), { id, text: t, at: Date.now(), state: 'sending', note: '' }] } : i)));
  }, [sendOp]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Pin / unpin a post. Pinned posts sit at the top of Classes. (Kept on this device.) */
  const togglePin = useCallback((item) => {
    updateItem(item.id, { starred: !item.starred });
    notify(item.starred ? 'Unpinned' : 'Pinned — it stays at the top of Classes');
  }, [updateItem, notify]);

  /** "Send me a test notification" as a request, so it also works where the bot cannot be reached directly. */
  const pushTestViaRequest = useCallback(() => sendOp({ t: 'pushtest' }), [sendOp]);

  /** Sends a do-nothing request and times how long the whole loop takes to answer. */
  const testLoop = useCallback(async () => {
    const id = sendOp({ t: 'ping' }), t0 = Date.now();
    hot(2 * 60 * 1000);
    for (;;) {
      await sleep(700);
      if (!r.outbox.some((o) => o.id === id)) return Date.now() - t0;
      if (Date.now() - t0 > 90000) { setOutbox((cur) => cur.filter((o) => o.id !== id)); throw new Error('No answer within 90 seconds'); }
    }
  }, [sendOp]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- your own items (live on this device only) ---------- */
  const addItem = useCallback((d) => {
    const now = Date.now();
    const it = { id: 'mine-' + now, kind: d.kind === 'material' ? 'material' : 'assignment', course: niceCourse(d.course), title: d.title, body: d.body || '', due: '', dueAt: d.dueAt || 0, posted_at: now, created_at: now, updated_at: now, mine: true, submitted: false, files: [], url: '' };
    setItems((cur) => [it, ...cur]);
    if (it.dueAt) scheduleReminders(it);
    return it;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const deleteItem = useCallback((id) => setItems((cur) => cur.filter((i) => i.id !== id)), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- account ---------- */
  const onAuth = useCallback(async (mode, name, password, invite) => {
    const open = makeApi({ ...r.cfg, token: '' });
    const res = mode === 'up' ? await open.register(name, password, invite) : await open.login(name, password);
    if (res.ck) setCk({ ...res.ck, ...(res.ckw || {}) });
    setCfg({ ...r.cfg, token: res.token, name: res.name });
    botSeen.current = { ok: true, at: Date.now() };
    setTimeout(() => sync({ manual: true }), 60);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const signOut = useCallback(() => { setCfg({ ...r.cfg, token: '' }); setCk(null); setNet({ mode: 'unknown', bot: null, cloud: null, at: 0 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setSchoolMode = useCallback((on) => { setCfg({ ...r.cfg, icloudOnly: !!on }); botSeen.current = { ok: null, at: 0 }; setTimeout(() => sync({ manual: true }), 60); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- timers, foreground, notifications ---------- */
  useEffect(() => {
    if (!ready) return undefined;
    sync({ full: true });
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') sync({ full: true }); });
    // A quick heartbeat: every 3 s while something is in motion (a request waiting, a scan running, an upload), every 30 s otherwise.
    const t = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      // A request that has already reached iCloud is only waiting for the PC: after two minutes stop checking every few
      // seconds for it (the normal 30-second check still picks its answer up).
      const waiting = r.outbox.some((o) => !o.cloud || Date.now() - o.cloud < 2 * 60 * 1000);
      const busy = Date.now() < hotUntil.current || waiting || r.jobs.some((j) => !j.error);
      if (busy || Date.now() - lastTick.current > 10000) sync(); // every 10 s while the app is open: new work shows up almost as it lands
    }, 3000);
    return () => { clearInterval(t); sub.remove(); };
  }, [ready, sync]);

  // Notifications: permission, this device's token, and telling the bot about it. No sign-in needed (a copy of the app
  // with iCloud built in registers through iCloud). Getting the token itself needs normal internet once per device.
  const canRegister = !!cfg.token || cloud.canWrite(ck);
  useEffect(() => {
    if (!ready || !canRegister || Platform.OS === 'web') return;
    (async () => {
      try {
        const p = await Notifications.requestPermissionsAsync();
        let token = await load('pushToken', '');
        if (p.granted) {
          // (given 8 seconds: on the school Wi-Fi this request does not fail, it just hangs)
          try { token = (await Promise.race([Notifications.getExpoPushTokenAsync(), sleep(8000).then(() => { throw new Error('no answer'); })])).data || token; save('pushToken', token); }
          catch { /* that server is blocked here: keep the token we already had */ }
        }
        // Never had a token and Expo's server is out of reach (a device that only ever sees the school Wi-Fi): let the bot
        // register it. Done once per device address (Apple hands out a new one after a reinstall).
        let relayed = await load('pushRelay', '');
        if (p.granted && !token && cloud.canWrite(r.ck)) {
          try {
            const reg = await captureExpoRegistration();
            if (reg && reg.deviceToken !== relayed) { sendOp({ t: 'pushreg', body: reg }); relayed = reg.deviceToken; save('pushRelay', relayed); }
            else if (!reg) noteErr('pushreg', new Error('could not read this device’s notification address'));
          } catch (e) { noteErr('pushreg', e); }
        }
        setPush({ token: token || (relayed ? 'through-icloud' : ''), granted: !!p.granted }); pushRef.current = { granted: !!p.granted, token: !!token, relayed: !!relayed };
        if (p.granted && token && (await load('pushReg', '')) !== token) { sendOp({ t: 'push', token }); save('pushReg', token); }
      } catch (e) { noteErr('push', e); /* notifications stay off */ }
    })();
  }, [ready, canRegister, net.mode === 'bot']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const take = (n) => { const d = n && n.request && n.request.content && n.request.content.data; return d && d.item && d.item.id ? d.item : null; };
    const a = Notifications.addNotificationReceivedListener((n) => { const it = take(n); if (it) applyIncoming([it], false, true); hot(60000); sync({ full: true }); });
    const open = async (resp) => {
      const it = take(resp && resp.notification);
      const nid = resp && resp.notification && resp.notification.request && resp.notification.request.identifier;
      if (!it || !nid || (await load('lastNotif', '')) === nid) return;
      save('lastNotif', nid);
      applyIncoming([it], false, true);
      if (openItemRef.current) openItemRef.current(it.id);
      sync({ full: true });
    };
    const b = Notifications.addNotificationResponseReceivedListener(open);
    try { const last = Notifications.getLastNotificationResponseAsync && Notifications.getLastNotificationResponseAsync(); if (last && last.then) last.then((resp) => { if (resp) open(resp); }).catch(() => {}); } catch { /* not available: tapping still works through the listener */ }
    return () => { try { a.remove(); b.remove(); } catch { /* already gone */ } };
  }, [applyIncoming, sync]);

  return useMemo(() => ({
    ready, cfg, ck, items, saved, remote, net, outbox, jobs, progress, fresh, notice, refreshing, wanted, push,
    api: apiRef.current, canSend: net.mode === 'bot' || cloud.canWrite(ck), canWriteCloud: cloud.canWrite(ck), canReadCloud: cloud.canRead(ck),
    notify, sync, refresh: () => sync({ manual: true }), setFresh, updateItem, onSaved, getFile, wantFile,
    addWork, retryWork, removeWork, turnIn, cancelTurnIn, toggleSubmitted, scanNow, pushTestViaRequest, sendComment, togglePin, testLoop, addItem, deleteItem,
    onAuth, signOut, setSchoolMode, applyIncoming,
  }), [ready, cfg, ck, items, saved, remote, net, outbox, jobs, progress, fresh, notice, refreshing, wanted, push,
    notify, sync, updateItem, onSaved, getFile, wantFile, addWork, retryWork, removeWork, turnIn, cancelTurnIn, toggleSubmitted, scanNow, pushTestViaRequest, sendComment, togglePin, testLoop, addItem, deleteItem, onAuth, signOut, setSchoolMode, applyIncoming]);
}
