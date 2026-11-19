// What the engine's raw state means in plain words: connection, the PC, a scan in progress, a turn-in on its way.
import { agoLabel, whenLabel } from './util';

const PC_ONLINE_MS = 3 * 60 * 1000;

export function connInfo(e, now = Date.now()) {
  const seen = (e.remote && e.remote.pc && e.remote.pc.seen) || 0;
  const pcAge = seen ? now - seen : Infinity;
  const pcOnline = pcAge < PC_ONLINE_MS;
  const mode = e.net.mode;
  return {
    mode, pcOnline, pcSeen: seen,
    label: mode === 'bot' ? 'Live' : mode === 'icloud' ? 'Live · iCloud' : mode === 'offline' ? 'Offline' : 'Connecting',
    tone: mode === 'bot' || mode === 'icloud' ? 'green' : mode === 'offline' ? 'red' : 'gray',
    detail: mode === 'bot' ? 'Connected straight to your bot' : mode === 'icloud' ? 'Connected through iCloud (this Wi-Fi blocks the bot)' : mode === 'offline' ? 'No connection — showing what is saved on this device' : 'Checking the connection…',
    pcLine: !seen ? 'Your PC has not checked in yet' : pcOnline ? `Your PC is on · seen ${agoLabel(seen, now)}` : `Your PC looks off · last seen ${agoLabel(seen, now)}`,
  };
}

/** The scan card's state: idle | sending | queued | running, with the line to show. */
export function scanView(e, now = Date.now()) {
  const sc = (e.remote && e.remote.scan) || {};
  const c = connInfo(e, now);
  const op = e.outbox.find((o) => o.t === 'scan');
  const offNote = c.pcOnline ? '' : ' Your PC looks off — it will scan as soon as it is back on.';
  if (op) {
    const sentSomewhere = !!op.cloud;
    return { phase: 'sending', busy: true, title: sentSomewhere ? 'Request sent' : 'Sending the request…',
      line: !e.canSend ? 'It will go out as soon as you are connected.' : sentSomewhere ? 'Waiting for your PC to pick it up.' + offNote : 'Reaching your PC…' };
  }
  if ((sc.req || 0) > (sc.start || 0)) return { phase: 'queued', busy: true, title: 'Your PC got the request', line: 'Starting the check…' + offNote };
  if ((sc.start || 0) > (sc.end || 0) && now - sc.start < 12 * 60 * 1000) {
    const mins = Math.floor((now - sc.start) / 60000);
    return { phase: 'running', busy: true, title: 'Checking Google Classroom…', line: (sc.note || 'Looking at your classes') + (mins >= 4 ? ' · taking longer than usual' : '') };
  }
  if (sc.end) {
    const what = sc.err ? sc.err : sc.sent ? `${sc.sent} new post${sc.sent === 1 ? '' : 's'} found` : 'Nothing new';
    return { phase: 'idle', busy: false, error: !!sc.err, fresh: now - sc.end < 3 * 60 * 1000 && !sc.err, found: sc.sent || 0, title: 'Check for new work', line: `Last checked ${whenLabel(sc.end)} · ${what}` };
  }
  return { phase: 'idle', busy: false, title: 'Check for new work', line: 'Ask your PC to look at Google Classroom right now.' };
}

/**
 * A turn-in's progress as three steps the user can follow:
 *   sent (the request left this device) -> picked up (the bot + PC have it) -> finished (Classroom says turned in).
 */
export function turninView(e, item) {
  const op = e.outbox.find((o) => o.t === 'turnin' && o.item === item.id && !o.cancel);
  const live = e.remote && e.remote.turn && e.remote.turn[item.id];
  const state = live ? live[0] : item.turnin;
  const note = live ? live[1] : item.turnin_note;
  const at = live ? live[2] : item.turnin_at;
  if (op) return { stage: op.cloud || e.net.mode === 'bot' ? 1 : 0, state: 'queued', note: !e.canSend ? 'Waiting for a connection' : op.cloud ? 'Sent through iCloud — waiting for your PC' : 'Sending…', at: op.ts, pending: true };
  if (state === 'queued') return { stage: 2, state, note: note || 'Your PC is handing it in', at };
  if (state === 'done') return { stage: 3, state, note: note || 'Turned in', at };
  if (state === 'failed' || state === 'unsupported') return { stage: 2, state, note: note || 'It could not be turned in', at, failed: true };
  return { stage: -1, state: '' };
}
