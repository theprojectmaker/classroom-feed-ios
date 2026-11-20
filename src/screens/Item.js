// One post, drawn like Google Classroom's assignment page: a tonal icon and a big title, the teacher and when it was posted,
// the instructions and attachments on the left, and a "Your work" panel + "Private comments" panel on the right (below on a phone).
// Add a file or photo, turn it in, and follow it until Classroom has it.
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCtx } from '../ctx';
import { T } from '../theme';
import { Avatar, Btn, FileBadge, Header, IconBtn, MIcon, Progress, RowIcon, Text, WorkRow, cleanBody, hasUpdate, isOpen, isWork, niceName, parseQuestion, parseThread, postedDetail, realName, shortDue, useLayoutWidth, useNow, whenLabel, workState } from '../ui';
import { fmtBytes } from '../lib';
import { fileExists, openFile, resolveLocal } from '../files';
import { connInfo, turninView } from '../conn';
import { NotesCard, RichText, StepsCard } from '../extra';

const pct = (p) => (p && p.total ? Math.round(((p.done || 0) / p.total) * 100) : 0);
const TWO = 780; // from this width up the page has two columns, as Classroom does

/** The class's teacher, for "Add comment to …": the name from the People page, else whoever posted this. */
function teacherFor(e, item) {
  const cid = (String(item.url || '').match(/\/c\/([^/]+)/) || [])[1] || '';
  const roster = e.remote && e.remote.people && cid && e.remote.people[cid];
  if (roster && roster.t && roster.t.length) return niceName(roster.t[0]);
  return realName(item.author) ? niceName(item.author) : '';
}

/** A file the teacher attached, as an outlined card. Shows whether it is on the device, in iCloud, or still has to be fetched by the PC. */
function Attachment({ f, onPress, style }) {
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
    <Pressable onPress={onPress} style={({ pressed }) => [s.attach, style, pressed && { backgroundColor: T.tonal }]}>
      <FileBadge name={f.name} size={56} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.fileName} numberOfLines={2}>{f.name}</Text>
        <Text style={[s.fileSub, { color: tone }]} numberOfLines={1}>{fmtBytes(f.size)} · {state}</Text>
        {p && !p.error && <Progress value={pct(p) / 100} style={{ marginTop: 6 }} />}
      </View>
      {local ? <MIcon n="check-circle" s={22} c={T.greenFill} />
        : p && !p.error ? <ActivityIndicator color={T.brand} />
          : reachable ? <MIcon n="cloud-download-outline" s={22} c={T.brand} />
            : asked ? <MIcon n="clock-outline" s={22} c={T.faint} /> : <Btn small kind="soft" label="Get it" onPress={() => e.wantFile(f)} />}
    </Pressable>
  );
}

/** A finished file you added, as a white card inside "Your work". Shows it travelling (with a progress bar) and lets you take it off again. */
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
        <Text style={[s.fileSub, { color: tone }]} numberOfLines={2}>{fmtBytes(f.size)} · {line}</Text>
        {f.pending && !err && <Progress value={p && p.total > 1 ? pct(p) / 100 : 0.08} style={{ marginTop: 6 }} />}
      </View>
      {!!err && e.net.mode !== 'offline' && <Btn small kind="soft" label="Retry" onPress={() => e.retryWork(f.id)} />}
      {!locked && <IconBtn mi="close" size={20} onPress={() => e.removeWork(item, f)} style={s.xBtn} />}
    </Pressable>
  );
}

/** Three steps so you can see a turn-in go through: sent -> your PC hands it in -> Classroom has it. */
function TurnInSteps({ tv }) {
  const steps = [['Request sent', 1], ['Your PC is handing it in', 2], ['Turned in on Google Classroom', 3]];
  return (
    <View style={{ gap: 10 }}>
      {steps.map(([label, n]) => {
        const done = tv.stage >= n && !(tv.failed && n === 2) && !(n === 2 && tv.stage === 2 && tv.state === 'queued');
        const active = !done && (tv.stage === n - 1 || (n === 2 && tv.stage === 2));
        return (
          <View key={n} style={s.step}>
            {done ? <MIcon n="check-circle" s={22} c={T.greenFill} /> : active ? <ActivityIndicator size="small" color={T.brand} style={{ width: 22 }} /> : <MIcon n="circle-outline" s={22} c="#C4C7C5" />}
            <Text style={[s.stepTxt, done && { color: T.ink }, active && { color: T.brand, fontWeight: '500' }]}>{label}</Text>
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
  const [open, setOpen] = useState(false);
  const thread = useMemo(() => parseThread(item.comments), [item.comments]);
  const shown = String(item.comments || '');
  const teacher = teacherFor(e, item);
  // Comments written here that are not in the thread yet: still travelling, refused, or posted since the PC last read it.
  const mine = (item.mycomments || []).filter((c) => !(c.state === 'done' && shown.includes(String(c.text).split('\n')[0])));
  const lineFor = (c) => {
    const op = e.outbox.find((o) => o.id === c.id);
    if (c.state === 'failed') return { txt: `Not posted${c.note ? ' — ' + c.note : ''}`, tone: T.red };
    if (c.state === 'done') return { txt: 'Posted', tone: T.green };
    if (op && !op.cloud && e.net.mode !== 'bot') return { txt: e.net.mode === 'offline' ? 'Waiting for a connection' : 'Sending…', tone: T.sub };
    return { txt: 'Sent — your PC is posting it', tone: T.sub };
  };
  const send = () => { const t = text.trim(); if (!t) return; e.sendComment(item, t); setText(''); setOpen(false); };
  return (
    <View style={s.panel}>
      <View style={s.panelHead}><MIcon n="account-outline" s={24} c={T.ink} /><Text style={s.panelTitle}>Private comments</Text></View>
      {thread.map((c, k) => (
        <View key={k} style={s.cmt}>
          <Avatar name={c.who} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.cmtWho}>{c.who}  <Text style={s.cmtWhen}>{c.when}</Text></Text>
            <Text style={s.cmtTxt}>{c.text}</Text>
          </View>
        </View>
      ))}
      {mine.map((c) => {
        const l = lineFor(c);
        return (
          <View key={c.id} style={s.cmt}>
            <Avatar name="You" size={32} color={T.brand} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.cmtWho}>You  <Text style={[s.cmtWhen, { color: l.tone }]}>{l.txt}</Text></Text>
              <Text style={s.cmtTxt}>{c.text}</Text>
              {c.state === 'failed' && <Text onPress={() => e.sendComment(item, c.text)} style={s.cmtRetry}>Try again</Text>}
            </View>
          </View>
        );
      })}
      {open ? (
        <View style={s.cmtBox}>
          <TextInput value={text} onChangeText={setText} autoFocus placeholder={teacher ? `Add comment to ${teacher}…` : 'Add private comment…'} placeholderTextColor={T.faint} multiline style={s.cmtInput} />
          <View style={s.cmtActions}>
            <Btn small kind="ghost" label="Cancel" onPress={() => { setOpen(false); setText(''); }} />
            <Btn small label="Post" disabled={!text.trim()} onPress={send} />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [s.linkRow, pressed && { backgroundColor: '#D3E3FD55' }]}>
          <MIcon n="comment-text-outline" s={20} c={T.brand} />
          <Text style={s.linkTxt} numberOfLines={1}>{teacher ? `Add comment to ${teacher}` : 'Add private comment'}</Text>
        </Pressable>
      )}
      {thread.length === 0 && mine.length === 0 && !open && <Text style={s.hint}>Only you and your teacher can see these.</Text>}
    </View>
  );
}

export function ItemScreen({ id }) {
  const e = useContext(AppCtx);
  const { items, pop, openPreview, deleteItem, notify } = e;
  const [askEmpty, setAskEmpty] = useState(false);
  const [askResubmit, setAskResubmit] = useState(false);
  const { width } = useWindowDimensions();
  const [cw, onPageLayout] = useLayoutWidth(width - (e.sideW || 0)); // corrected by onLayout once the page is drawn
  const item = items.find((i) => i.id === id);
  const now = useNow(10000);
  const [draft, setDraft] = useState(() => (item && item.answer) || ''); // the answer being typed to a question (a Do Now)
  useEffect(() => {
    if (!item || draft === (item.answer || '')) return undefined;
    const t = setTimeout(() => e.updateItem(id, { answer: draft }), 400);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center' }}><Text style={[s.none, { textAlign: 'center' }]}>This post is not here any more.</Text><View style={{ alignItems: 'center', marginTop: 16 }}><Btn kind="outline" label="Go back" onPress={pop} /></View></View>;
  const two = cw >= TWO; // big screen: instructions on the left, Your work + Private comments on the right — as Classroom does
  const work = isWork(item);
  const ws = workState(item);
  const files = item.files || [];
  const theirs = files.filter((f) => f.origin !== 'upload');
  const mine = files.filter((f) => f.origin === 'upload');
  const tv = turninView(e, item);
  const excused = ws === 'excused'; // your teacher let you off: nothing to hand in (Classroom still allows handing work in)
  const graded = ws === 'graded' || excused, turnedIn = ws === 'turnedin';
  const handedIn = turnedIn || graded;
  const queued = tv.state === 'queued';
  const canClassroom = work && !item.mine && !!item.url;
  const sending = mine.some((f) => f.pending);
  const pcInfo = connInfo(e, now); // is the PC that types the answer into Classroom on?
  const q = parseQuestion(item.body); // a question with a typed answer (a Do Now)?
  const isQ = canClassroom && q.is;
  const dueLocked = isQ && q.closed && !!item.dueAt && item.dueAt < now && !turnedIn && !graded; // late answers are refused and the due time has passed
  const editable = isQ && !turnedIn && !graded && !queued && tv.state !== 'done' && !dueLocked;
  const minsLeft = item.dueAt ? Math.ceil((item.dueAt - now) / 60000) : 0;
  const cb = cleanBody(item.body); // the instructions without Classroom's own header lines, and the points if it had any
  const stateWord = queued ? 'Turning in…' : turnedIn ? (/late/i.test(item.status || '') ? 'Turned in late' : 'Turned in') : excused ? 'Excused' : graded ? 'Graded' : ws === 'late' ? 'Missing' : ws === 'done' ? 'Done' : 'Assigned';
  const stateColor = ws === 'late' ? T.red : turnedIn || graded ? T.green : T.ink;
  const author = realName(item.author) ? niceName(item.author) : '';
  const line1 = [author, postedDetail(item)].filter(Boolean).join('  •  ');
  const pts = item.points ? item.points + (item.points === '1' ? ' point' : ' points') : cb.points; // what it is worth, read from Classroom's own header (older posts: from the text)
  const line2 = [item.topic, pts].filter(Boolean).join('  •  ');
  const due = work ? (item.dueAt || item.due ? 'Due ' + shortDue(item) : 'No due date') : '';

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
  // "+ Add or create": Classroom opens a little menu (Link / File / Google Drive…). Ours: File, Photos, Camera.
  const addMenu = () => e.openMenu([
    { label: 'File', mi: 'paperclip', onPress: pickFile },
    { label: 'Photos', mi: 'image-outline', onPress: pickPhotos },
    ...(Platform.OS !== 'web' ? [{ label: 'Camera', mi: 'camera-outline', onPress: takePhoto }] : []),
  ]);
  const moreMenu = () => e.openMenu([
    { label: item.starred ? 'Unpin' : 'Pin to the top of Home', mi: item.starred ? 'pin-off-outline' : 'pin-outline', onPress: () => e.togglePin(item) },
    ...(item.url ? [{ label: 'Open in Google Classroom', mi: 'open-in-new', onPress: () => Linking.openURL(item.url).catch(() => notify('That only opens on normal internet.')) }] : []),
    ...(item.mine ? [{ label: 'Delete', mi: 'delete-outline', onPress: () => { deleteItem(item.id); pop(); } }] : []),
  ]);

  const failedBox = (title) => (
    <View style={[s.result, { backgroundColor: T.redSoft }]}>
      <MIcon n="alert-circle" s={22} c={T.red} />
      <View style={{ flex: 1 }}><Text style={[s.resultTitle, { color: T.red }]}>{title}</Text><Text style={s.resultSub}>{tv.note}</Text></View>
    </View>
  );

  const yourWork = work && (
    <View style={s.panel}>
      <View style={s.panelHead}>
        <Text style={s.panelBig}>Your work</Text>
        <Text style={[s.stateWord, { color: stateColor }]}>{stateWord}</Text>
      </View>
      {!!item.grade && (
        <View style={s.gradeRow}><Text style={s.gradeL}>Grade</Text><Text style={s.gradeV}>{item.grade}</Text></View>
      )}
      {mine.length > 0 && <View style={{ gap: 8 }}>{mine.map((f) => <MyFile key={f.id} item={item} f={f} locked={queued || turnedIn} onPress={() => openPreview(f, files)} />)}</View>}

      {/* Graded work can still take a new file (Classroom lets you resubmit); work that is turned in and waiting cannot. */}
      {mine.length > 0 && !turnedIn && !queued && <View style={s.divider} />}
      {!turnedIn && !queued && !isQ && <Btn kind="outline" mi="plus" label="Add or create" onPress={addMenu} />}

      {canClassroom && (<>
        {queued ? (<>
          <TurnInSteps tv={tv} />
          <Btn kind="gray" small icon="close" label="Cancel the turn-in" onPress={() => e.cancelTurnIn(item)} />
        </>) : turnedIn || (tv.state === 'done' && !graded) ? (
          <View style={[s.result, { backgroundColor: T.greenSoft }]}>
            <MIcon n="check-circle" s={24} c={T.green} />
            <View style={{ flex: 1 }}>
              <Text style={[s.resultTitle, { color: T.green }]}>Turned in on Google Classroom</Text>
              {!!(tv.state === 'done' && tv.at) && <Text style={s.resultSub}>{tv.note && !/^turned in$/i.test(tv.note) ? tv.note + ' · ' : ''}{whenLabel(tv.at)}</Text>}
            </View>
          </View>
        ) : graded ? (<>
          {tv.failed && failedBox('Your file was not sent')}
          {/* Your teacher already graded it, so a normal turn-in has nothing to do. Handing work in again is a choice: say so, and ask first. */}
          {isQ ? (
            <Text style={s.hint}>{excused ? 'Your teacher excused this one.' : 'Your teacher already graded this one.'}</Text>
          ) : mine.length === 0 ? (
            <Text style={s.hint}>{excused ? 'Your teacher excused this one, so there is nothing you have to hand in. To hand in work for it anyway, add the file above.' : 'Your teacher already graded this one. To hand in new work for it anyway, add the file above.'}</Text>
          ) : askResubmit ? (
            <View style={{ gap: 10 }}>
              <Text style={s.hint}>This sends your file{mine.length > 1 ? 's' : ''} to your teacher and marks the work as turned in again on Google Classroom.</Text>
              <View style={s.addRow}>
                <Btn kind="outline" label="Not now" onPress={() => setAskResubmit(false)} style={{ flex: 1 }} />
                <Btn label="Yes, resubmit" onPress={() => { setAskResubmit(false); e.turnIn(item, { resubmit: true }); }} style={{ flex: 1.3 }} />
              </View>
            </View>
          ) : (<>
            <Text style={s.hint}>Your teacher already {excused ? 'excused' : 'graded'} this one, so your file{mine.length > 1 ? 's have' : ' has'} not been sent. You can still hand it in.</Text>
            <Btn label={sending ? 'Resubmit when sent' : 'Resubmit'} onPress={() => setAskResubmit(true)} />
          </>)}
        </>) : (<>
          {tv.failed && failedBox('It wasn’t turned in')}
          {isQ ? (dueLocked ? (
            <Text style={s.hint}>Classroom closed this one when the due time passed.</Text>
          ) : (<>
            <Btn mi="send" label="Turn in" disabled={!draft.trim()} onPress={() => e.turnIn(item, { answer: draft })} />
            <Text style={s.hint}>Your PC types the answer into Classroom and turns it in, usually within a few seconds. This works on school Wi-Fi too.</Text>
            {pcInfo.pcKnown && !pcInfo.pcOnline && <Text style={[s.hint, { color: T.amber, fontWeight: '500' }]}>Your PC looks offline: the answer goes in once it is back. If this one closes soon, turn it in on Google Classroom yourself.</Text>}
          </>)) : mine.length > 0 ? (
            <Btn label={sending ? 'Turn in when sent' : 'Turn in'} onPress={() => e.turnIn(item)} />
          ) : askEmpty ? (
            <View style={{ gap: 10 }}>
              <Text style={s.hint}>This hands it in on Google Classroom with nothing attached. Your teacher sees it as turned in.</Text>
              <View style={s.addRow}>
                <Btn kind="outline" label="Not yet" onPress={() => setAskEmpty(false)} style={{ flex: 1 }} />
                <Btn label="Mark as done" onPress={() => { setAskEmpty(false); e.turnIn(item, { empty: true }); }} style={{ flex: 1.3 }} />
              </View>
            </View>
          ) : (
            <Btn label="Mark as done" onPress={() => setAskEmpty(true)} />
          )}
          {!isQ && <Text style={s.hint}>{mine.length ? `Your PC attaches your file${mine.length > 1 ? 's' : ''} and presses Turn in on Google Classroom for you. This works on school Wi-Fi too.` : 'Add your finished work above, then turn it in.'}</Text>}
        </>)}
      </>)}

      {!handedIn && !queued && (
        <Pressable onPress={() => e.toggleSubmitted(item)} hitSlop={6} style={s.tick}>
          <MIcon n={item.submitted ? 'checkbox-marked' : 'checkbox-blank-outline'} s={22} c={item.submitted ? T.brand : T.faint} />
          <Text style={s.tickTxt}>{item.submitted ? 'Ticked off on my list' : 'Tick off on my own list (doesn’t turn anything in)'}</Text>
        </Pressable>
      )}
    </View>
  );
  const shownAnswer = (q.answer || item.answer || '').trim();
  const answerCard = isQ && (
    <View style={s.answerCard}>
      <View style={s.answerHead}>
        <MIcon n="text-box-edit-outline" s={22} c={T.sub} />
        <Text style={s.answerTitle}>Your answer</Text>
        {editable && minsLeft > 0 && minsLeft <= 60 && <Text style={[s.answerDue, minsLeft <= 3 && { color: T.red }]}>Due in {minsLeft} min</Text>}
      </View>
      {editable ? (
        <TextInput value={draft} onChangeText={setDraft} multiline placeholder="Type your answer" placeholderTextColor={T.faint} style={s.answerInput}
          autoFocus={minsLeft > 0 && minsLeft <= 120} textAlignVertical="top" />
      ) : (
        <Text style={[s.answerText, !shownAnswer && { color: T.faint }]} selectable>{shownAnswer || (dueLocked ? 'The due time passed before an answer was turned in.' : graded ? 'No answer was turned in.' : '')}</Text>
      )}
      {dueLocked && <Text style={s.answerHint}>This one closed when the due time passed: Classroom takes no more answers.</Text>}
    </View>
  );
  const comments = canClassroom
    ? <PrivateComments item={item} />
    : (!!item.comments && <View style={s.panel}><View style={s.panelHead}><MIcon n="account-outline" s={24} c={T.ink} /><Text style={s.panelTitle}>Private comments</Text></View><Text style={s.body}>{item.comments}</Text></View>);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }} onLayout={onPageLayout}>
      {/* the keyboard pushes the page up instead of covering the comment box */}
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View style={[s.wrap, two && s.wrapTwo]}>
          <View style={two ? { flex: 1, minWidth: 0 } : null}>
            <View style={s.headRow}>
              {two && <RowIcon item={item} size={40} />}
              <Text style={[s.title, two && s.titleBig]}>{item.title}</Text>
              <IconBtn mi="dots-vertical" onPress={moreMenu} size={24} color={T.ink} style={{ marginTop: two ? 0 : -6, marginRight: -10 }} />
            </View>
            <View style={s.metaBox}>
              {!!line1 && <Text style={s.meta1}>{line1}</Text>}
              {!!(line2 || due) && <Text style={s.meta2}>{line2}{line2 && due ? '  |  ' : ''}<Text style={ws === 'late' && due ? { color: T.red } : null}>{due}</Text></Text>}
              {item.starred && <View style={s.pinned}><MIcon n="pin" s={14} c={T.amberFill} /><Text style={s.pinnedTxt}>Pinned</Text></View>}
            </View>
            {hasUpdate(item) && (
              <View style={s.update}><MIcon n="bell-ring-outline" s={20} c={T.red} /><Text style={s.updateTxt}>Updated · {item.change_note || item.changeNote}</Text></View>
            )}

            <View style={s.divider2} />
            {!!cb.text && <View style={s.instr}><RichText text={cb.text} /></View>}
            {answerCard}

            {theirs.length > 0 && (
              <View style={[s.attachWrap, two && { marginRight: 0 }]}>
                {theirs.map((f) => <Attachment key={f.id} f={f} style={two ? s.attachHalf : null} onPress={() => openPreview(f, files)} />)}
              </View>
            )}

            {!two && yourWork}
            {!two && comments}

            <StepsCard item={item} />
            <NotesCard item={item} />
            {!!item.url && <View style={{ marginTop: 24, alignItems: 'flex-start' }}><Btn kind="outline" mi="open-in-new" label="Open in Google Classroom" onPress={() => Linking.openURL(item.url).catch(() => notify('That only opens on normal internet.'))} /></View>}
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
          <IconBtn mi="close" onPress={onClose} color={T.ink} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.fileName} numberOfLines={1}>{file.name}</Text>
            <Text style={s.fileSub} numberOfLines={1}>{fmtBytes(file.size)}{list.length > 1 ? ` · ${idx + 1} of ${list.length}` : ''}{path ? ' · on this device' : ''}</Text>
          </View>
          {list.length > 1 && (<>
            <IconBtn mi="chevron-left" onPress={() => list[idx - 1] && onSwitch(list[idx - 1])} color={idx === 0 ? '#C4C7C5' : T.ink} />
            <IconBtn mi="chevron-right" onPress={() => list[idx + 1] && onSwitch(list[idx + 1])} color={idx >= list.length - 1 ? '#C4C7C5' : T.ink} />
          </>)}
          {!!path && Platform.OS !== 'web' && <Btn small kind="soft" mi="share-variant-outline" label="Share" onPress={() => openFile(path)} />}
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
            <MIcon n={missing ? 'cloud-off-outline' : 'alert-circle-outline'} s={44} c={T.faint} />
            <Text style={s.centerTitle}>{missing ? 'This file hasn’t been copied to iCloud yet' : 'Couldn’t get the file'}</Text>
            <Text style={[s.fileSub, { textAlign: 'center', maxWidth: 340 }]}>{missing ? 'Ask your PC to send it — it usually arrives within a minute, as long as the PC is on.' : err.msg}</Text>
            {missing
              ? <Btn mi="send-outline" label={e.wanted[file.id] ? 'Asked — it’s on its way' : 'Ask my PC to send it'} disabled={!!e.wanted[file.id]} onPress={() => e.wantFile(file)} />
              : <Btn mi="refresh" label="Try again" onPress={() => setTries((n) => n + 1)} />}
            {missing && !!e.wanted[file.id] && <Btn kind="ghost" label="Check again" onPress={() => { e.refresh(); setTries((n) => n + 1); }} />}
          </View>
        )}
        {!!path && (Platform.OS === 'web'
          ? <View style={s.center}><Text style={s.centerTitle}>Previews open inside the installed app.</Text><Btn kind="soft" label="Open in the browser" onPress={() => Linking.openURL(path)} /></View>
          : <WebView source={{ uri }} originWhitelist={['*']} allowFileAccess allowFileAccessFromFileURLs allowUniversalAccessFromFileURLs allowingReadAccessToURL={dir} startInLoadingState
              renderLoading={() => <ActivityIndicator style={{ marginTop: 40 }} color={T.brand} />}
              renderError={() => <View style={s.center}><Text style={s.centerTitle}>This kind of file can’t be shown here</Text><Btn mi="share-variant-outline" label="Open in another app" onPress={() => openFile(path)} /></View>} />)}
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
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
        <Header title="Which assignment is this for?" subtitle={incoming.name} onBack={onClose} />
        <FlatList data={list} keyExtractor={(i) => i.id} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={[s.none, { textAlign: 'center', marginTop: 40 }]}>No open assignments to attach it to.</Text>}
          renderItem={({ item, index }) => <WorkRow item={item} showCourse last={index === list.length - 1} onPress={() => onPick(item)} />} />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { paddingBottom: 120 },
  wrap: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8 },
  wrapTwo: { paddingHorizontal: 24, flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  side: { width: 340 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingTop: 4 },
  title: { flex: 1, fontSize: 28, fontWeight: '400', color: T.ink, lineHeight: 36 },
  titleBig: { fontSize: 32, lineHeight: 40 },
  metaBox: { marginTop: 14, gap: 8 },
  meta1: { fontSize: 14, color: T.sub, lineHeight: 20 },
  meta2: { fontSize: 14, color: T.ink, lineHeight: 20 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinnedTxt: { fontSize: 13, color: T.amber, fontWeight: '500' },
  update: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: T.redSoft },
  updateTxt: { flex: 1, color: T.red, fontWeight: '500', fontSize: 14 },
  divider2: { height: 1, backgroundColor: T.line, marginTop: 16 },
  instr: { paddingTop: 16 },
  none: { fontSize: 14, color: T.sub },
  body: { fontSize: 14, lineHeight: 20, color: T.ink },
  answerCard: { marginTop: 20, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: T.line, backgroundColor: '#fff', gap: 12 },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  answerTitle: { flex: 1, fontSize: 16, fontWeight: '500', color: T.ink },
  answerDue: { fontSize: 13, fontWeight: '500', color: T.amber },
  answerInput: { minHeight: 130, maxHeight: 380, borderRadius: 8, borderWidth: 1, borderColor: '#747775', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 22, color: T.ink, fontFamily: 'GoogleSans_400Regular', outlineStyle: 'none' },
  answerText: { fontSize: 15, lineHeight: 22, color: T.ink },
  answerHint: { fontSize: 12.5, color: T.sub },
  attachWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 14, borderRadius: 8, borderWidth: 1, borderColor: T.line, backgroundColor: '#fff', width: '100%' },
  attachHalf: { width: '48.5%', flexGrow: 1, minWidth: 260 },
  fileName: { fontSize: 14, color: T.ink, fontWeight: '500', lineHeight: 20 },
  fileSub: { fontSize: 12, color: T.sub, marginTop: 2 },
  panel: { backgroundColor: T.tonal2, borderRadius: 16, padding: 16, gap: 14, marginTop: 16 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  panelTitle: { flex: 1, fontSize: 15, fontWeight: '400', color: T.ink },
  panelBig: { flex: 1, fontSize: 22, fontWeight: '400', color: T.ink },
  stateWord: { fontSize: 14, fontWeight: '500' },
  gradeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gradeL: { fontSize: 14, color: T.sub },
  gradeV: { fontSize: 18, fontWeight: '500', color: T.ink },
  divider: { height: 1, backgroundColor: '#C4C7C5' },
  myFile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 6, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: T.line },
  xBtn: { width: 36, height: 36, borderRadius: 18 },
  addRow: { flexDirection: 'row', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepTxt: { fontSize: 14, color: T.faint },
  stepNote: { fontSize: 13, color: T.sub, marginLeft: 34 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  resultTitle: { fontSize: 14, fontWeight: '500' },
  resultSub: { fontSize: 12.5, color: T.sub, marginTop: 2 },
  hint: { fontSize: 13, color: T.sub, lineHeight: 18 },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2 },
  tickTxt: { fontSize: 13, color: T.sub, flex: 1 },
  cmt: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cmtWho: { fontSize: 14, fontWeight: '500', color: T.ink },
  cmtWhen: { fontSize: 12, fontWeight: '400', color: T.sub },
  cmtTxt: { fontSize: 14, color: T.ink, lineHeight: 20, marginTop: 2 },
  cmtRetry: { fontSize: 13, color: T.brand, fontWeight: '500', marginTop: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 24, marginHorizontal: -4 },
  linkTxt: { flex: 1, fontSize: 14, fontWeight: '500', color: T.brand },
  cmtBox: { gap: 10 },
  cmtInput: { minHeight: 56, maxHeight: 160, borderRadius: 8, borderWidth: 1, borderColor: '#747775', backgroundColor: '#fff', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: T.ink, fontFamily: 'GoogleSans_400Regular', outlineStyle: 'none', textAlignVertical: 'top' },
  cmtActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  previewBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: T.line },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  centerTitle: { fontSize: 18, fontWeight: '500', color: T.ink, textAlign: 'center' },
});
