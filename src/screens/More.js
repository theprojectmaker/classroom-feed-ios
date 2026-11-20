// Settings, the Connection page, the "what's new" sheet and the toast — drawn like Google Classroom's own settings (Google Sans,
// 22-point section headings, outlined white panels, Material switches and dialogs).
import React, { useContext, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { AppCtx } from '../ctx';
import { T, classTone } from '../theme';
import { Btn, Card, MIcon, Line, SectionTitle, Text, WorkRow, agoLabel, niceCourse, useNow } from '../ui';
import { PROBES, fmtBytes, runProbe } from '../lib';
import { connInfo } from '../conn';

const Row = ({ ok, title, sub, right }) => (
  <View style={s.row}>
    <MIcon n={ok === true ? 'check-circle' : ok === false ? 'close-circle' : 'circle-outline'} s={22} c={ok === true ? T.greenFill : ok === false ? T.red : '#C4C7C5'} />
    <View style={{ flex: 1, minWidth: 0 }}><Text style={s.rowTitle}>{title}</Text>{!!sub && <Text style={s.rowSub}>{sub}</Text>}</View>
    {right}
  </View>
);

/* ---------- More (settings) ---------- */
export function MoreScreen() {
  const e = useContext(AppCtx);
  const { cfg, onAuth, signOut, openConnection, openAdd, ota, push, notify } = e;
  const now = useNow(15000);
  const c = connInfo(e, now);
  const [name, setName] = useState(cfg.name || '');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [mode, setMode] = useState('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pushMsg, setPushMsg] = useState('');
  const [showSignIn, setShowSignIn] = useState(false);
  const go = async () => { setBusy(true); setErr(''); try { await onAuth(mode, name.trim(), password, invite.trim()); setPassword(''); } catch (x) { setErr(x.message || 'Could not reach the server. Sign in on normal Wi-Fi.'); } setBusy(false); };
  const testPush = async () => {
    setPushMsg('Sending…');
    // Not straight to the bot from here (school Wi-Fi)? Then the test goes the same way a turn-in does: through iCloud.
    if (e.net.mode !== 'bot' && e.canWriteCloud) { e.pushTestViaRequest(); setPushMsg('Asked through iCloud. It should pop up within about ten seconds (your PC has to be on).'); return; }
    try { const r = await e.api.pushTest(); setPushMsg(r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'} — it should pop up in a few seconds.` : 'No device is registered for notifications yet. Allow notifications, then open the app once on normal Wi-Fi.'); }
    catch { setPushMsg('No connection right now. Try again in a moment.'); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.wrap}>
          <SectionTitle title="Connection" style={{ marginTop: 8 }} />
          <Card>
            <Pressable onPress={openConnection} style={({ pressed }) => [s.linkRow, pressed && { backgroundColor: T.tonal }]}>
              <View style={[s.dot, { backgroundColor: c.tone === 'green' ? T.greenFill : c.tone === 'red' ? T.red : '#C4C7C5' }]} />
              <View style={{ flex: 1, minWidth: 0 }}><Text style={s.rowTitle}>{c.label}</Text><Text style={s.rowSub}>{c.detail}</Text><Text style={s.rowSub}>{c.pcLine}</Text></View>
              <MIcon n="chevron-right" s={24} c={T.faint} />
            </Pressable>
          </Card>

          <SectionTitle title="Account" />
          <Card style={{ padding: 16 }}>
            {cfg.token ? (<>
              <Text style={s.body}>Signed in as <Text style={{ fontWeight: '500' }}>{cfg.name || 'you'}</Text></Text>
              <Text style={s.rowSub}>Your classes, files and turn-ins stay in step on every device signed in to this account.</Text>
              <View style={{ marginTop: 12, alignItems: 'flex-start' }}><Btn small kind="outline" label="Sign out" onPress={signOut} /></View>
            </>) : e.canReadCloud && !showSignIn ? (<>
              {/* A copy with iCloud built in needs no account at all: say so instead of showing a form that cannot work at school. */}
              <Text style={s.body}>This device is ready. Nothing to sign in to.</Text>
              <Text style={s.rowSub}>Your classes, files and turn-ins travel through iCloud, which also works on the school Wi-Fi. Signing in only adds the faster direct connection on normal internet.</Text>
              <View style={{ marginTop: 12, alignItems: 'flex-start' }}><Btn small kind="outline" label="Sign in anyway" onPress={() => setShowSignIn(true)} /></View>
            </>) : (<>
              <Text style={s.body}>{mode === 'in' ? 'Sign in with the same name and password on every device.' : 'Create your account once, on your first device. You need the invite code.'}</Text>
              {e.canReadCloud && <Text style={[s.rowSub, { marginTop: 6 }]}>Your classes already show without signing in on this device.</Text>}
              <Text style={s.label}>Name</Text>
              <TextInput value={name} onChangeText={setName} autoCapitalize="none" autoCorrect={false} style={s.field} />
              <Text style={s.label}>Password</Text>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} style={s.field} />
              {mode === 'up' && (<><Text style={s.label}>Invite code</Text><TextInput value={invite} onChangeText={setInvite} autoCapitalize="none" autoCorrect={false} style={s.field} /></>)}
              {!!err && <Text style={{ color: T.red, marginTop: 10 }}>{err}</Text>}
              <View style={{ gap: 8, marginTop: 14 }}>
                <Btn label={mode === 'in' ? 'Sign in' : 'Create account'} loading={busy} onPress={go} disabled={!name.trim() || password.length < 6} />
                <Btn kind="ghost" label={mode === 'in' ? 'New here? Create an account' : 'I already have an account'} onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); }} />
              </View>
            </>)}
          </Card>

          <SectionTitle title="Notifications" />
          <Card style={{ padding: 16, gap: 12 }}>
            <Row ok={push.granted === null ? null : push.granted && !!push.token} title={push.granted === false ? 'Notifications are turned off' : push.token ? 'You get a notification for every new post' : 'Setting up notifications…'}
              sub={push.granted === false ? 'Turn them on for Classroom Feed in the Settings app.' : 'It is sent once the post and all its files have fully arrived, so it opens right away — also on school Wi-Fi.'} />
            <View style={{ alignItems: 'flex-start' }}><Btn small kind="soft" mi="bell-outline" label="Send me a test notification" onPress={testPush} /></View>
            {!!pushMsg && <Text style={s.rowSub}>{pushMsg}</Text>}
          </Card>

          <SectionTitle title="App" />
          <Card style={{ padding: 16, gap: 12 }}>
            <Text style={s.rowSub}>New versions arrive through the TestFlight app, which also works on the school Wi-Fi. Small fixes install by themselves on normal internet.{ota.id ? `\nInstalled update: ${String(ota.id).slice(0, 8)}` : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Btn small kind="soft" mi="cloud-download-outline" label={ota.checking ? 'Checking…' : ota.ready ? 'Restart to update' : 'Check for an update'} onPress={ota.ready ? ota.apply : ota.check} />
              <Btn small kind="soft" mi="plus" label="Add my own assignment" onPress={openAdd} />
            </View>
            {!!ota.note && <Text style={s.rowSub}>{ota.note}</Text>}
            <Pressable onPress={() => notify('Classroom Feed — made for you. Posts and files travel through iCloud so they reach the school Wi-Fi.')}><Text style={[s.rowSub, { color: T.faint }]}>Classroom Feed</Text></Pressable>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- Connection ---------- */
export function ConnectionScreen() {
  const e = useContext(AppCtx);
  const { cfg, net, remote, outbox, jobs } = e;
  const now = useNow(5000);
  const c = connInfo(e, now);
  const [test, setTest] = useState(null);
  const [res, setRes] = useState(null);
  const [running, setRunning] = useState(false);
  const runTest = async () => {
    setTest({ busy: true });
    try { const ms = await e.testLoop(); setTest({ ok: true, msg: `Worked — answered in ${(ms / 1000).toFixed(1)} s ${net.mode === 'bot' ? '(straight to the bot)' : '(through iCloud, then your PC)'}` }); }
    catch (x) { setTest({ ok: false, msg: net.mode === 'offline' ? 'No connection right now.' : !c.pcOnline && net.mode !== 'bot' ? 'No answer — your PC looks off. Over iCloud, requests are picked up by the PC.' : (x.message || 'No answer') }); }
  };
  const runProbes = async () => {
    setRunning(true); setRes({});
    await Promise.all(PROBES.map(async (p) => { const r = await runProbe(p, cfg); setRes((x) => ({ ...(x || {}), [p.name]: r })); }));
    setRunning(false);
  };
  const m = remote && remote.mirror;
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.wrap}>
          <Card style={{ padding: 16, gap: 14 }}>
            <Row ok={net.mode === 'bot' || net.mode === 'icloud' ? true : net.mode === 'offline' ? false : null} title={c.label} sub={c.detail} />
            <Line />
            <Row ok={cfg.icloudOnly ? null : net.bot} title="Straight to your bot" sub={cfg.icloudOnly ? 'Switched off (school mode)' : net.bot ? 'Reachable — the fast route' : net.bot === false ? 'Blocked on this network (normal at school)' : 'Not checked yet'} />
            <Row ok={net.cloud} title="Through iCloud — receiving" sub={net.cloud ? 'Posts, grades and files arrive this way at school' : e.canReadCloud ? (net.cloudErr || 'Not reachable right now') : 'Not in this copy of the app yet. Update Classroom Feed in TestFlight and it is switched on, with nothing to enter.'} />
            <Row ok={e.canWriteCloud ? true : null} title="Through iCloud — sending" sub={e.canWriteCloud ? 'Turn-ins, your files and Scan can be sent from school' : 'Not in this copy of the app yet. Update Classroom Feed in TestFlight and it is switched on, with nothing to enter.'} />
            <Row ok={c.pcKnown ? c.pcOnline : null} title="Your PC" sub={c.pcLine + (c.pcOnline && remote && remote.pc && remote.pc.busy ? ` · ${remote.pc.busy === 'scan' ? 'checking Classroom' : 'turning in'}` : '')} />
            {!!m && <Row ok={m.pending === 0} title="Files in iCloud" sub={m.pending === 0 ? 'Every file is copied' : `${m.pending} file${m.pending === 1 ? '' : 's'} still copying (${fmtBytes(m.bytes)})`} />}
          </Card>

          <SectionTitle title="Try it" />
          <Card style={{ padding: 16, gap: 12 }}>
            <Text style={s.rowSub}>Sends a harmless request the same way a turn-in travels and waits for the answer.</Text>
            <Btn mi="pulse" label={test && test.busy ? 'Waiting for the answer…' : 'Test the whole loop'} loading={!!(test && test.busy)} onPress={runTest} />
            {test && !test.busy && <Row ok={test.ok} title={test.msg} />}
            {(outbox.length > 0 || jobs.length > 0) && <Text style={s.rowSub}>{outbox.length} request{outbox.length === 1 ? '' : 's'} and {jobs.length} file{jobs.length === 1 ? '' : 's'} waiting to go out.</Text>}
          </Card>

          <SectionTitle title="School mode" />
          <Card style={{ padding: 16 }}>
            <View style={s.row}>
              <View style={{ flex: 1 }}><Text style={s.rowTitle}>Use iCloud only</Text><Text style={s.rowSub}>Makes the app behave exactly as it does on school Wi-Fi, so you can check at home that everything works there. Leave it off normally.</Text></View>
              <Switch value={!!cfg.icloudOnly} onValueChange={e.setSchoolMode} trackColor={{ true: T.brand, false: '#E3E3E3' }} thumbColor="#fff" />
            </View>
          </Card>

          <SectionTitle title="What this Wi-Fi lets through" />
          <Card style={{ padding: 16, gap: 12 }}>
            <View style={{ alignItems: 'flex-start' }}><Btn small kind="soft" mi="wifi" label={running ? 'Testing…' : 'Run the network test'} onPress={runProbes} disabled={running} /></View>
            {res && PROBES.map((p) => { const r = res[p.name]; return <Row key={p.name} ok={r ? r.ok : null} title={p.name} sub={!r ? 'testing…' : r.ok ? `reachable · ${r.ms} ms` : r.error} />; })}
            {res && !running && <Text selectable style={[s.rowSub, { marginTop: 4 }]}>{'Report: ' + PROBES.map((p) => `${p.name}=${res[p.name] && res[p.name].ok ? 'OK' : 'blocked'}`).join(', ')}</Text>}
          </Card>
          {remote && remote.ts ? <Text style={[s.rowSub, { textAlign: 'center', marginTop: 20 }]}>Status updated {agoLabel(remote.ts, now)}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- "N new" sheet + toast ---------- */
export function WhatsNew({ fresh, onClose, onOpen }) {
  const groups = [];
  fresh.forEach((i) => {
    const course = niceCourse(i.course);
    let g = groups.find((x) => x.course === course);
    if (!g) { g = { course, list: [] }; groups.push(g); }
    g.list.push(i);
  });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.sheetTitle}>{fresh.length} new from Google Classroom</Text>
          <ScrollView style={{ maxHeight: 440, marginTop: 6 }}>
            {groups.map((g) => (
              <View key={g.course} style={{ marginTop: 14 }}>
                <Text style={[s.sheetHead, { color: classTone(g.course).fg }]}>{g.course}</Text>
                <View>{g.list.map((i, k) => <WorkRow key={i.id} item={{ ...i, course: g.course }} last={k === g.list.length - 1} onPress={() => onOpen(i)} />)}</View>
              </View>
            ))}
          </ScrollView>
          <View style={s.sheetActions}><Btn kind="ghost" label="Got it" onPress={onClose} /></View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Notice({ text, bottom = 96 }) {
  if (!text) return null;
  return <View style={[s.notice, { bottom }]} pointerEvents="none"><Text style={s.noticeTxt}>{text}</Text></View>;
}

/** Thin strip shown when a newer version of the app has been downloaded in the background. */
export function UpdateStrip() {
  const { ota } = useContext(AppCtx);
  if (!ota.ready) return null;
  return (
    <Pressable onPress={ota.apply} style={s.strip}>
      <MIcon n="update" s={18} c="#fff" />
      <Text style={s.stripTxt}>A new version is ready — tap to restart</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { paddingBottom: 120 },
  wrap: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: T.ink },
  rowSub: { fontSize: 13, color: T.sub, marginTop: 2, lineHeight: 18 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  body: { fontSize: 15, lineHeight: 22, color: T.ink },
  label: { fontSize: 13, color: T.sub, marginTop: 16, marginBottom: 6, fontWeight: '500' },
  field: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#747775', borderRadius: 4, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: T.ink, fontFamily: 'GoogleSans_400Regular', outlineStyle: 'none' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 28, padding: 24, maxWidth: 540, width: '100%', alignSelf: 'center' },
  sheetTitle: { fontSize: 24, fontWeight: '400', color: T.ink, lineHeight: 32 },
  sheetHead: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  notice: { position: 'absolute', left: 16, right: 16, alignSelf: 'center', maxWidth: 560, backgroundColor: '#313033', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14 },
  noticeTxt: { color: '#F4EFF4', fontSize: 14, textAlign: 'left' },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: T.brand, paddingVertical: 10 },
  stripTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },
});
