// One post: instructions, attachments, and "Your work" (add a file or photo, turn it in, follow it until Classroom has it).
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCtx } from '../ctx';
import { SIDEBAR, T, WIDE, classPair, hair } from '../theme';
import { Btn, Card, FileBadge, Header, Icon, Progress, RowIcon, WorkRow, hasUpdate, isOpen, isWork, cleanBody, parseThread, postedDetail, shortDue, whenLabel, workState } from '../ui';
import { fmtBytes } from '../lib';
import { fileExists, openFile, resolveLocal } from '../files';
import { turninView } from '../conn';
import { NotesCard, RichText, StepsCard } from '../extra';

const pct = (p) => (p && p.total ? Math.round(((p.done || 0) / p.total) * 100) : 0);

/** A file the teacher attached. Shows whether it is on the device, in iCloud, or still has to be fetched by the PC. */
function Attachment({ f, onPress, last }) {
  const e = useContext(AppCtx);
  const local = f.local || e.saved[f.id];
  const p = e.progress[f.id];
  const reachable = !!local || (e.net.mode === 'bot' && f.kv !== 0) || f.cloud || !!f.p;
  const asked = !!e.wanted[f.id];
  let state, tone = T.sub;
  if (local) { state = 'On this device'; tone = T.green; }
  else if (p && !p.error) state = `Getting it… ${pct(p)}%`;
  else if (reachable) state = 'Tap to open';
  else state = asked ? 'Asked your PC — it arrives shortly' : 'Not copied to iCloud yet';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.fileRow, !last && s.rowLine, pressed && { backgroundColor: T.soft }]}>
      <FileBadge name={f.name} />
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={2}>{f.name}</Text>
        <Text style={[s.fileSub, { color: tone }]} numberOfLines={1}>{fmtBytes(f.size)} · {state}</Text>
        {p && !p.error && <Progress value={pct(p) / 100} style={{ marginTop: 6 }} />}
      </View>
      {local ? <Icon n="checkmark-circle" s={22} c={T.green} />
        : p && !p.error ? <ActivityIndicator color={T.brand} />
          : reachable ? <Icon n="cloud-download-outline" s={22} c={T.brand} />
            : asked ? <Icon n="time-outline" s={22} c={T.faint} /> : <Btn small kind="soft" label="Get it" onPress={() => e.wantFile(f)} />}
    </Pressable>
  );
}

/** A finished file you added. Shows it travelling (with a progress bar) and lets you take it off again. */
function MyFile({ item, f, locked, onPress }) {
  const e = useContext(AppCtx);
  const p = e.progress[f.id];
  const job = e.jobs.find((j) => j.up === f.id);
  const err = (job && job.error) || (p && p.error);
  let line, tone = T.sub;
  if (item.mine) line = 'On this device';
  else if (err) { line = e.net.mode === 'offline' ? 'Waiting for a connection' : `Not sent yet — ${err}`; tone = T.red; }
  else if (f.pending) line = p && p.total > 1 ? `Sending… ${pct(p)}%` : e.net.mode === 'offline' ? 'Waiting for a connection' : 'Sending…';
  else if (f.synced) { line = 'Sent'; tone = T.green; }
  else { line = 'Sent — your PC is receiving it'; tone = T.green; }
  return (
    <Pressable onPress={onPress} style={s.myFile}>
      <FileBadge name={f.name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
        <Text style={[s.fileSub, { color: tone }]} numberOfLines={2}>{fmtBytes(f.size)} · {line}</Text>
        {f.pending && !err && <Progress value={p && p.total > 1 ? pct(p) / 100 : 0.08} style={{ marginTop: 6 }} />}
      </View>
      {!!err && e.net.mode !== 'offline' && <Btn small kind="soft" label="Retry" onPress={() => e.retryWork(f.id)} />}
      {!locked && <Pressable onPress={() => e.removeWork(item, f)} hitSlop={10} style={s.xBtn}><Icon n="close" s={18} c={T.sub} /></Pressable>}
    </Pressable>
  );
}

/** Three steps so you can see a turn-in go through: sent -> your PC hands it in -> Classroom has it. */
function TurnInSteps({ tv }) {
  const steps = [['Request sent', 1], ['Your PC is handing it in', 2], ['Turned in on Google Classroom', 3]];
  return (
    <View style={{ gap: 9 }}>
      {steps.map(([label, n]) => {
        const done = tv.stage >= n && !(tv.failed && n === 2) && !(n === 2 && tv.stage === 2 && tv.state === 'queued');
        const active = !done && (tv.stage === n - 1 || (n === 2 && tv.stage === 2));
        return (
          <View key={n} style={s.step}>
            {done ? <Icon n="checkmark-circle" s={21} c={T.green} /> : active ? <ActivityIndicator size="small" color={T.brand} style={{ width: 21 }} /> : <Icon n="ellipse-outline" s={21} c={T.line} />}
            <Text style={[s.stepTxt, done && { color: T.ink }, active && { color: T.brand, fontWeight: '700' }]}>{label}</Text>
          </View>
        );
      })}
      {!!tv.note && <Text style={s.stepNote}>{tv.note}</Text>}
    </View>
  );
}

/** The private-comment thread with your teacher, and a box to add to it. What you write is posted by your PC. */
function PrivateComments({ item }) {
  const e = useContext(AppCtx);
  const [text, setText] = useState('');
  const thread = useMemo(() => parseThread(item.comments), [item.comments]);
  const shown = String(item.comments || '');
  // Comments written here that are not in the thread yet: still travelling, refused, or posted since the PC last read it.
  const mine = (item.mycomments || []).filter((c) => !(c.state === 'done' && shown.includes(String(c.text).split('\n')[0])));
  const lineFor = (c) => {
    const op = e.outbox.find((o) => o.id === c.id);
    if (c.state === 'failed') return { txt: `Not posted${c.note ? ' — ' + c.note : ''}`, tone: T.red };
    if (c.state === 'done') return { txt: 'Posted', tone: T.green };
    if (op && !op.cloud && e.net.mode !== 'bot') return { txt: e.net.mode === 'offline' ? 'Waiting for a connection' : 'Sending…', tone: T.sub };
    return { txt: 'Sent — your PC is posting it', tone: T.sub };
  };
  const send = () => { const t = text.trim(); if (!t) return; e.sendComment(item, t); setText(''); };
  return (
    <Card style={s.sideCard}>
      <View style={s.cardHead}><Icon n="person-outline" s={18} c={T.sub} /><Text style={s.cardTitle}>Private comments</Text></View>
      {thread.length === 0 && mine.length === 0 && <Text style={s.hint}>Only you and your teacher can see these.</Text>}
      {thread.map((c, k) => (
        <View key={k} style={s.cmt}>
          <View style={s.cmtAvatar}><Text style={s.cmtAvatarTxt}>{c.who.charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cmtWho}>{c.who}  <Text style={s.cmtWhen}>{c.when}</Text></Text>
            <Text style={s.cmtTxt}>{c.text}</Text>
          </View>
        </View>
      ))}
      {mine.map((c) => {
        const l = lineFor(c);
        return (
          <View key={c.id} style={s.cmt}>
            <View style={[s.cmtAvatar, { backgroundColor: T.brandSoft }]}><Icon n="person" s={15} c={T.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.cmtWho}>You  <Text style={[s.cmtWhen, { color: l.tone }]}>{l.txt}</Text></Text>
              <Text style={s.cmtTxt}>{c.text}</Text>
              {c.state === 'failed' && <Text onPress={() => e.sendComment(item, c.text)} style={s.cmtRetry}>Try again</Text>}
            </View>
          </View>
        );
      })}
      <View style={s.cmtInputRow}>
        <TextInput value={text} onChangeText={setText} placeholder="Add private comment…" placeholderTextColor={T.faint} multiline style={s.cmtInput} />
        <Pressable onPress={send} disabled={!text.trim()} hitSlop={8} style={({ pressed }) => [s.sendBtn, !text.trim() && { backgroundColor: T.soft }, pressed && { opacity: 0.6 }]}>
          <Icon n="arrow-up" s={19} c={text.trim() ? '#fff' : T.faint} />
        </Pressable>
      </View>
    </Card>
  );
}

export function ItemScreen({ id }) {
  const e = useContext(AppCtx);
  const { items, pop, openPreview, deleteItem, notify } = e;
  const [askEmpty, setAskEmpty] = useState(false);
  const [askResubmit, setAskResubmit] = useState(false);
  const { width } = useWindowDimensions();
  const item = items.find((i) => i.id === id);
  if (!item) return <View style={{ flex: 1 }}><Header title="Not found" onBack={pop} /></View>;
  const cw = width >= WIDE ? width - SIDEBAR : width;
  const two = cw >= 780; // big screen: instructions on the left, Your work + Private comments on the right — as Classroom does
  const pair = classPair(item.course);
  const work = isWork(item);
  const ws = workState(item);
  const files = item.files || [];
  const theirs = files.filter((f) => f.origin !== 'upload');
  const mine = files.filter((f) => f.origin === 'upload');
  const tv = turninView(e, item);
  const graded = ws === 'graded', turnedIn = ws === 'turnedin';
  const handedIn = turnedIn || graded;
  const queued = tv.state === 'queued';
  const canClassroom = work && !item.mine && !!item.url;
  const sending = mine.some((f) => f.pending);
  const cb = cleanBody(item.body); // the instructions without Classroom's own header lines, and the points if it had any
  const stateWord = queued ? 'Turning in…' : turnedIn ? 'Turned in' : graded ? 'Graded' : ws === 'late' ? 'Missing' : ws === 'done' ? 'Done' : 'Assigned';
  const stateColor = ws === 'late' ? T.red : turnedIn || graded || ws === 'done' ? T.sub : T.green;

  const addAssets = async (assets) => { for (const a of assets) await e.addWork(item, a); };
  const pickFile = async () => {
    try { const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true }); if (!r.canceled) await addAssets(r.assets); }
    catch { notify('Could not open the file picker.'); }
  };
  const photoAsset = (a, k) => ({ uri: a.uri, name: a.fileName || `Photo ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}${k ? '-' + (k + 1) : ''}.jpg`, size: a.fileSize, mimeType: a.mimeType || 'image/jpeg' });
  const pickPhotos = async () => {
    try { const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 12, quality: 0.85 }); if (!r.canceled) await addAssets(r.assets.map(photoAsset)); }
    catch { notify('Could not open your photos.'); }
  };
  const takePhoto = async () => {
    try {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { notify('Allow camera access for Classroom Feed in the Settings app first.'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!r.canceled) await addAssets(r.assets.map(photoAsset));
    } catch { notify('The camera is not available here.'); }
  };

  const failedBox = (title) => (
    <View style={[s.result, { backgroundColor: T.redSoft }]}>
      <Icon n="alert-circle" s={22} c={T.red} />
      <View style={{ flex: 1 }}><Text style={[s.resultTitle, { color: T.red }]}>{title}</Text><Text style={s.resultSub}>{tv.note}</Text></View>
    </View>
  );

  const yourWork = work && (
    <Card style={s.sideCard}>
      <View style={s.cardHead}>
        <Text style={[s.cardTitle, { fontSize: 20 }]}>Your work</Text>
        <Text style={[s.stateWord, { color: stateColor }]}>{stateWord}</Text>
      </View>
      {mine.length > 0 && <View style={{ gap: 8 }}>{mine.map((f) => <MyFile key={f.id} item={item} f={f} locked={queued || turnedIn} onPress={() => openPreview(f, files)} />)}</View>}

      {/* Graded work can still take a new file (Classroom lets you resubmit); work that is turned in and waiting cannot. */}
      {!turnedIn && !queued && (<>
        <Text style={s.addLabel}>Add or create</Text>
        <View style={s.addRow}>
          <Btn small kind="soft" icon="document-attach-outline" label="File" onPress={pickFile} style={{ flex: 1 }} />
          <Btn small kind="soft" icon="images-outline" label="Photos" onPress={pickPhotos} style={{ flex: 1 }} />
          {Platform.OS !== 'web' && <Btn small kind="soft" icon="camera-outline" label="Camera" onPress={takePhoto} style={{ flex: 1 }} />}
        </View>
      </>)}

      {canClassroom && (<>
        {queued ? (<>
          <TurnInSteps tv={tv} />
          <Btn kind="gray" small icon="close" label="Cancel the turn-in" onPress={() => e.cancelTurnIn(item)} />
        </>) : turnedIn || (tv.state === 'done' && !graded) ? (
          <View style={[s.result, { backgroundColor: T.greenSoft }]}>
            <Icon n="checkmark-circle" s={24} c={T.green} />
            <View style={{ flex: 1 }}>
              <Text style={[s.resultTitle, { color: T.green }]}>Turned in on Google Classroom</Text>
              {!!(tv.state === 'done' && tv.at) && <Text style={s.resultSub}>{tv.note && !/^turned in$/i.test(tv.note) ? tv.note + ' · ' : ''}{whenLabel(tv.at)}</Text>}
            </View>
          </View>
        ) : graded ? (<>
          {tv.failed && failedBox('Your file was not sent')}
          {/* Your teacher already graded it, so a normal turn-in has nothing to do. Handing work in again is a choice: say so, and ask first. */}
          {mine.length === 0 ? (
            <Text style={s.hint}>Your teacher already graded this one. To hand in new work for it anyway, add the file above.</Text>
          ) : askResubmit ? (
            <View style={{ gap: 10 }}>
              <Text style={s.hint}>This sends your file{mine.length > 1 ? 's' : ''} to your teacher and marks the work as turned in again on Google Classroom.</Text>
              <View style={s.addRow}>
                <Btn kind="gray" label="Not now" onPress={() => setAskResubmit(false)} style={{ flex: 1 }} />
                <Btn label="Yes, resubmit" onPress={() => { setAskResubmit(false); e.turnIn(item, { resubmit: true }); }} style={{ flex: 1.3 }} />
              </View>
            </View>
          ) : (<>
            <Text style={s.hint}>Your teacher already graded this one, so your file{mine.length > 1 ? 's have' : ' has'} not been sent. You can still hand it in again.</Text>
            <Btn label={sending ? 'Resubmit when sent' : 'Resubmit'} onPress={() => setAskResubmit(true)} />
          </>)}
        </>) : (<>
          {tv.failed && failedBox('It wasn’t turned in')}
          {mine.length > 0 ? (
            <Btn label={sending ? 'Turn in when sent' : 'Turn in'} onPress={() => e.turnIn(item)} />
          ) : askEmpty ? (
            <View style={{ gap: 10 }}>
              <Text style={s.hint}>This hands it in on Google Classroom with nothing attached. Your teacher sees it as turned in.</Text>
              <View style={s.addRow}>
                <Btn kind="gray" label="Not yet" onPress={() => setAskEmpty(false)} style={{ flex: 1 }} />
                <Btn label="Mark as done" onPress={() => { setAskEmpty(false); e.turnIn(item, { empty: true }); }} style={{ flex: 1.3 }} />
              </View>
            </View>
          ) : (
            <Btn kind="outline" label="Mark as done" onPress={() => setAskEmpty(true)} />
          )}
          <Text style={s.hint}>{mine.length ? `Your PC attaches your file${mine.length > 1 ? 's' : ''} and presses Turn in on Google Classroom for you. This works on school Wi-Fi too.` : 'Add your finished work above, then turn it in.'}</Text>
        </>)}
      </>)}

      {!handedIn && !queued && (
        <Pressable onPress={() => e.toggleSubmitted(item)} hitSlop={6} style={s.tick}>
          <Icon n={item.submitted ? 'checkbox' : 'square-outline'} s={20} c={item.submitted ? T.green : T.faint} />
          <Text style={s.tickTxt}>{item.submitted ? 'Ticked off on my list' : 'Tick off on my own list (doesn’t turn anything in)'}</Text>
        </Pressable>
      )}
    </Card>
  );
  const comments = canClassroom ? <PrivateComments item={item} /> : (!!item.comments && <Card style={s.sideCard}><Text style={s.cardTitle}>Private comments</Text><Text style={s.body}>{item.comments}</Text></Card>);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <Header title={item.course} pair={pair} onBack={pop} right={(
        <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <Pressable onPress={() => e.togglePin(item)} hitSlop={10} style={({ pressed }) => [s.hBtn, pressed && { opacity: 0.5 }]}><Icon n={item.starred ? 'pin' : 'pin-outline'} s={22} c="#fff" /></Pressable>
          {item.mine && <Pressable onPress={() => { deleteItem(item.id); pop(); }} hitSlop={10} style={s.hBtn}><Icon n="trash-outline" s={22} c="#fff" /></Pressable>}
        </View>
      )} />
      {/* the keyboard pushes the page up instead of covering the comment box */}
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View style={[s.wrap, two && s.wrapTwo]}>
          <View style={two ? { flex: 1, minWidth: 0 } : null}>
            <View style={s.headRow}>
              <RowIcon item={item} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{item.title}</Text>
                <Text style={s.meta}>{[postedDetail(item), cb.points, item.starred ? 'Pinned' : ''].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            {work && (
              <Card style={s.facts}>
                <View style={s.fact}><Text style={s.factL}>Due</Text><Text style={[s.factV, ws === 'late' && { color: T.red }]} numberOfLines={2}>{item.dueAt || item.due ? shortDue(item) : 'No due date'}</Text></View>
                <View style={s.factLine} />
                <View style={s.fact}><Text style={s.factL}>Status</Text><Text style={[s.factV, { color: stateColor === T.sub ? T.ink : stateColor }]} numberOfLines={1}>{stateWord}</Text></View>
                <View style={s.factLine} />
                <View style={s.fact}><Text style={s.factL}>Grade</Text><Text style={[s.factV, !item.grade && { color: T.faint }]} numberOfLines={1}>{item.grade || 'Not graded'}</Text></View>
              </Card>
            )}
            {hasUpdate(item) && (
              <View style={s.update}><Icon n="notifications" s={17} c={T.red} /><Text style={s.updateTxt}>Updated · {item.change_note || item.changeNote}</Text></View>
            )}

            <Card style={{ paddingVertical: 16, marginTop: 12 }}>
              {cb.text ? <RichText text={cb.text} /> : <Text style={s.none}>No instructions.</Text>}
            </Card>

            {theirs.length > 0 && (<>
              <Text style={s.blockTitle}>Attachments</Text>
              <Card>{theirs.map((f, k) => <Attachment key={f.id} f={f} last={k === theirs.length - 1} onPress={() => openPreview(f, files)} />)}</Card>
            </>)}

            {!two && yourWork}
            {!two && comments}

            <StepsCard item={item} />
            <NotesCard item={item} />
            {!!item.url && <View style={{ marginTop: 18 }}><Btn kind="ghost" icon="open-outline" label="Open in Google Classroom" onPress={() => Linking.openURL(item.url).catch(() => notify('That only opens on normal internet.'))} /></View>}
          </View>
          {two && <View style={s.side}>{yourWork}{comments}</View>}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- File preview ---------- */
export function Preview({ file, list = [], onSwitch, onClose }) {
  const e = useContext(AppCtx);
  const insets = useSafeAreaInsets();
  const [path, setPath] = useState(null);
  const [err, setErr] = useState(null);
  const [tries, setTries] = useState(0);
  const idx = Math.max(0, list.findIndex((f) => f.id === file.id));
  const p = e.progress[file.id];
  useEffect(() => {
    let on = true;
    setPath(null); setErr(null);
    (async () => {
      const cur = file.local || e.saved[file.id];
      if (cur && (await fileExists(cur))) { if (on) setPath(cur); return; }
      try { const got = await e.getFile(file); if (on) setPath(got); }
      catch (x) { if (on) setErr({ msg: String((x && x.message) || x), code: (x && x.code) || '' }); }
    })();
    return () => { on = false; };
  }, [file.id, tries]); // eslint-disable-line react-hooks/exhaustive-deps
  const local = path ? resolveLocal(path) : null;
  const uri = local && Platform.OS !== 'web' ? encodeURI(decodeURI(local)) : local;
  const dir = uri ? uri.slice(0, uri.lastIndexOf('/') + 1) : undefined;
  const missing = err && err.code === 'NOT_IN_CLOUD';
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
        <View style={s.previewBar}>
          <Pressable onPress={onClose} hitSlop={12} style={s.pBtn}><Icon n="close" s={24} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.fileName} numberOfLines={1}>{file.name}</Text>
            <Text style={s.fileSub} numberOfLines={1}>{fmtBytes(file.size)}{list.length > 1 ? ` · ${idx + 1} of ${list.length}` : ''}{path ? ' · on this device' : ''}</Text>
          </View>
          {list.length > 1 && (<>
            <Pressable onPress={() => list[idx - 1] && onSwitch(list[idx - 1])} disabled={idx === 0} hitSlop={8} style={s.pBtn}><Icon n="chevron-back" s={24} c={idx === 0 ? T.line : T.text} /></Pressable>
            <Pressable onPress={() => list[idx + 1] && onSwitch(list[idx + 1])} disabled={idx >= list.length - 1} hitSlop={8} style={s.pBtn}><Icon n="chevron-forward" s={24} c={idx >= list.length - 1 ? T.line : T.text} /></Pressable>
          </>)}
          {!!path && Platform.OS !== 'web' && <Btn small kind="soft" icon="share-outline" label="Share" onPress={() => openFile(path)} />}
        </View>
        {!path && !err && (
          <View style={s.center}>
            <ActivityIndicator size="large" color={T.brand} />
            <Text style={s.centerTitle}>Getting the file…</Text>
            {p && p.total > 1 && <><Progress value={pct(p) / 100} style={{ width: 220, marginTop: 6 }} /><Text style={s.fileSub}>{pct(p)}% · through iCloud</Text></>}
          </View>
        )}
        {!!err && (
          <View style={s.center}>
            <Icon n={missing ? 'cloud-offline-outline' : 'alert-circle-outline'} s={44} c={T.faint} />
            <Text style={s.centerTitle}>{missing ? 'This file hasn’t been copied to iCloud yet' : 'Couldn’t get the file'}</Text>
            <Text style={[s.fileSub, { textAlign: 'center', maxWidth: 340 }]}>{missing ? 'Ask your PC to send it — it usually arrives within a minute, as long as the PC is on.' : err.msg}</Text>
            {missing
              ? <Btn icon="paper-plane-outline" label={e.wanted[file.id] ? 'Asked — it’s on its way' : 'Ask my PC to send it'} disabled={!!e.wanted[file.id]} onPress={() => e.wantFile(file)} />
              : <Btn icon="refresh" label="Try again" onPress={() => setTries((n) => n + 1)} />}
            {missing && !!e.wanted[file.id] && <Btn kind="ghost" label="Check again" onPress={() => { e.refresh(); setTries((n) => n + 1); }} />}
          </View>
        )}
        {!!path && (Platform.OS === 'web'
          ? <View style={s.center}><Text style={s.centerTitle}>Previews open inside the installed app.</Text><Btn kind="soft" label="Open in the browser" onPress={() => Linking.openURL(path)} /></View>
          : <WebView source={{ uri }} originWhitelist={['*']} allowFileAccess allowFileAccessFromFileURLs allowUniversalAccessFromFileURLs allowingReadAccessToURL={dir} startInLoadingState
              renderLoading={() => <ActivityIndicator style={{ marginTop: 40 }} color={T.brand} />}
              renderError={() => <View style={s.center}><Text style={s.centerTitle}>This kind of file can’t be shown here</Text><Btn icon="share-outline" label="Open in another app" onPress={() => openFile(path)} /></View>} />)}
      </View>
    </Modal>
  );
}

/** A file shared into the app from another app (e.g. your notes app): pick the assignment it belongs to. */
export function AttachPicker({ incoming, items, onPick, onClose }) {
  const insets = useSafeAreaInsets();
  const list = items.filter(isOpen).sort((a, b) => (a.dueAt || 9e15) - (b.dueAt || 9e15));
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
        <Header title="Which assignment is this for?" subtitle={incoming.name} onBack={onClose} />
        <FlatList data={list} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={[s.none, { textAlign: 'center', marginTop: 40 }]}>No open assignments to attach it to.</Text>}
          renderItem={({ item }) => <View style={s.pickRow}><WorkRow item={item} showCourse last onPress={() => onPick(item)} /></View>} />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { paddingBottom: 120 },
  wrap: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 18 },
  wrapTwo: { maxWidth: 1180, flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  side: { width: 360 },
  sideCard: { padding: 16, gap: 12, marginTop: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: T.ink, letterSpacing: -0.3 },
  stateWord: { fontSize: 15, fontWeight: '600' },
  addLabel: { fontSize: 13, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.2, marginBottom: -4 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  facts: { flexDirection: 'row', marginTop: 16, paddingVertical: 12 },
  fact: { flex: 1, paddingHorizontal: 14, gap: 3 },
  factLine: { width: hair, backgroundColor: T.line },
  factL: { fontSize: 12.5, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.2 },
  factV: { fontSize: 16, fontWeight: '600', color: T.ink, letterSpacing: -0.2 },
  blockTitle: { fontSize: 13, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.2, marginTop: 22, marginBottom: 7, marginLeft: 16 },
  cmt: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cmtAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  cmtAvatarTxt: { fontSize: 13.5, fontWeight: '700', color: T.sub },
  cmtWho: { fontSize: 14, fontWeight: '600', color: T.ink },
  cmtWhen: { fontSize: 12.5, fontWeight: '400', color: T.sub },
  cmtTxt: { fontSize: 15.5, color: T.text, lineHeight: 21, marginTop: 1 },
  cmtRetry: { fontSize: 14, color: T.brand, fontWeight: '500', marginTop: 4 },
  cmtInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
  cmtInput: { flex: 1, minHeight: 38, maxHeight: 120, borderRadius: 19, backgroundColor: T.soft, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 16, color: T.ink, outlineStyle: 'none' },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  hBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: T.ink, letterSpacing: -0.3, lineHeight: 31 },
  meta: { fontSize: 14, color: T.sub, marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  update: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: T.redSoft },
  updateTxt: { flex: 1, color: T.red, fontWeight: '600', fontSize: 14.5 },
  none: { fontSize: 15, color: T.sub, paddingHorizontal: 16 },
  body: { fontSize: 15.5, lineHeight: 23, color: T.text },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowLine: { borderBottomWidth: hair, borderBottomColor: T.line },
  fileName: { fontSize: 15.5, color: T.ink, fontWeight: '500', letterSpacing: -0.2 },
  fileSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  myFile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: T.bg },
  xBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  addRow: { flexDirection: 'row', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepTxt: { fontSize: 15, color: T.faint, fontWeight: '500' },
  stepNote: { fontSize: 13, color: T.sub, marginLeft: 31 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  resultTitle: { fontSize: 15.5, fontWeight: '600' },
  resultSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  hint: { fontSize: 13.5, color: T.sub, lineHeight: 19 },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 2 },
  tickTxt: { fontSize: 13.5, color: T.sub, flex: 1 },
  previewBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: hair, borderBottomColor: T.line },
  pBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  centerTitle: { fontSize: 17, fontWeight: '700', color: T.ink, textAlign: 'center' },
  pickRow: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
});
