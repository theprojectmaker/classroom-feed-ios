// Readable instructions, your own notes and steps on a post, and the "add my own assignment" form — drawn like Google Classroom
// (Google Sans, outlined panels, Material fields).
import React, { useContext, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './theme';
import { AppCtx } from './ctx';
import { Btn, Chip, DAY, Header, MIcon, Progress, Text, shortDue, startOfToday } from './ui';

/* ---------- readable text: bullets, headings, tappable links ---------- */
function linkify(t) {
  return t.split(/(https?:\/\/[^\s)]+)/g).map((p, k) => (/^https?:\/\//.test(p)
    ? <Text key={k} style={x.link} onPress={() => Linking.openURL(p).catch(() => {})}>{p.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</Text>
    : p));
}
export function RichText({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <View>
      {lines.map((raw, i) => {
        const t = raw.replace(/\s+$/, '');
        if (!t.trim()) return <View key={i} style={{ height: 10 }} />;
        const b = t.match(/^\s*([-•*–·]|\d{1,2}[.)])\s+(.*)$/);
        if (b) return (
          <View key={i} style={x.bulletRow}>
            <Text style={x.bullet}>{/\d/.test(b[1]) ? b[1] : '•'}</Text>
            <Text style={[x.body, { flex: 1 }]} selectable>{linkify(b[2])}</Text>
          </View>
        );
        const tt = t.trim();
        const head = (tt.length < 60 && /:$/.test(tt)) || (/^[A-Z0-9][A-Z0-9 &:/'’-]{3,50}$/.test(tt) && /[A-Z]{3}/.test(tt));
        return <Text key={i} selectable style={[x.body, head && x.head]}>{linkify(t)}</Text>;
      })}
    </View>
  );
}

/* ---------- my notes (saved on the device, per post) ---------- */
export function NotesCard({ item }) {
  const { updateItem } = useContext(AppCtx);
  const [v, setV] = useState(item.notes || '');
  useEffect(() => {
    if (v === (item.notes || '')) return undefined;
    const t = setTimeout(() => updateItem(item.id, { notes: v }), 600);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={x.card}>
      <View style={x.cardHead}><MIcon n="note-edit-outline" s={22} c={T.sub} /><Text style={x.cardTitle}>My notes</Text></View>
      <TextInput multiline value={v} onChangeText={setV} placeholder="Anything to remember: key ideas, questions, what the teacher said…" placeholderTextColor={T.faint} style={x.notes} />
    </View>
  );
}

/* ---------- steps: break the work into small checkable pieces ---------- */
export function StepsCard({ item }) {
  const { updateItem } = useContext(AppCtx);
  const steps = item.steps || [];
  const [v, setV] = useState('');
  const set = (n) => updateItem(item.id, { steps: n });
  const add = () => { const t = v.trim(); if (!t) return; set([...steps, { t, done: false }]); setV(''); };
  const done = steps.filter((p) => p.done).length;
  return (
    <View style={x.card}>
      <View style={x.cardHead}>
        <MIcon n="format-list-checks" s={22} c={T.sub} /><Text style={x.cardTitle}>Steps</Text>
        {steps.length > 0 && <Text style={x.cardCount}>{done}/{steps.length}</Text>}
      </View>
      {steps.length > 0 && <Progress value={done / steps.length} color={T.greenFill} style={{ marginBottom: 6 }} />}
      {steps.map((p, i) => (
        <Pressable key={i} onPress={() => set(steps.map((q, k) => (k === i ? { ...q, done: !q.done } : q)))} onLongPress={() => set(steps.filter((_, k) => k !== i))} style={x.step}>
          <MIcon n={p.done ? 'checkbox-marked' : 'checkbox-blank-outline'} s={24} c={p.done ? T.brand : T.faint} />
          <Text style={[x.stepTxt, p.done && { textDecorationLine: 'line-through', color: T.faint }]}>{p.t}</Text>
        </Pressable>
      ))}
      <View style={x.addRow}>
        <TextInput value={v} onChangeText={setV} onSubmitEditing={add} placeholder="Add a step (hold a step to remove it)" placeholderTextColor={T.faint} style={x.addInput} returnKeyType="done" />
        <Pressable onPress={add} hitSlop={8} disabled={!v.trim()}><MIcon n="plus-circle" s={30} c={v.trim() ? T.brand : T.line} /></Pressable>
      </View>
    </View>
  );
}

/* ---------- Add your own assignment ---------- */
const DUE = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['No date', null]];
const endOf = (d) => { const t = new Date(startOfToday() + d * DAY); t.setHours(23, 59, 0, 0); return t.getTime(); };
function parseDate(v) {
  const m = String(v).trim().match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(); d.setMonth(Number(m[1]) - 1, Number(m[2])); d.setHours(23, 59, 0, 0);
  if (d.getTime() < startOfToday()) d.setFullYear(d.getFullYear() + 1);
  return d.getMonth() === Number(m[1]) - 1 ? d.getTime() : null;
}
export function AddModal({ classes, onSave, onClose }) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(classes[0] || '');
  const [custom, setCustom] = useState('');
  const [due, setDue] = useState(1);
  const [typed, setTyped] = useState('');
  const [kind, setKind] = useState('assignment');
  const [body, setBody] = useState('');
  const dueAt = parseDate(typed) || (due == null ? 0 : endOf(due));
  const cls = (custom.trim() || course || 'My work').trim();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
        <Header title="Add to my work" onBack={onClose} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <Text style={x.lbl}>What is it?</Text>
          <View style={x.wrap}>{[['assignment', 'Assignment'], ['material', 'Study / material']].map(([k, l]) => <Chip key={k} label={l} on={kind === k} onPress={() => setKind(k)} />)}</View>
          <Text style={x.lbl}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Read chapter 4, Quiz study guide" placeholderTextColor={T.faint} style={x.field} autoFocus />
          <Text style={x.lbl}>Class</Text>
          <View style={x.wrap}>{classes.map((c) => <Chip key={c} label={c} on={!custom.trim() && course === c} onPress={() => { setCourse(c); setCustom(''); }} />)}</View>
          <TextInput value={custom} onChangeText={setCustom} placeholder="…or type a new class name" placeholderTextColor={T.faint} style={[x.field, { marginTop: 10 }]} />
          {kind === 'assignment' && (<>
            <Text style={x.lbl}>Due</Text>
            <View style={x.wrap}>{DUE.map(([l, d]) => <Chip key={l} label={l} on={!typed && due === d} onPress={() => { setDue(d); setTyped(''); }} />)}</View>
            <TextInput value={typed} onChangeText={setTyped} placeholder="…or type a date like 11/20" placeholderTextColor={T.faint} style={[x.field, { marginTop: 10 }]} keyboardType="numbers-and-punctuation" />
            <Text style={x.hint}>{dueAt ? 'Due ' + shortDue({ dueAt }).replace(/, 11:59 PM/, '') : 'No due date'}</Text>
          </>)}
          <Text style={x.lbl}>Notes (optional)</Text>
          <TextInput value={body} onChangeText={setBody} multiline placeholder="Instructions, pages, what to study…" placeholderTextColor={T.faint} style={[x.field, { minHeight: 90, textAlignVertical: 'top' }]} />
          <View style={{ marginTop: 22 }}><Btn icon="checkmark" label="Add" disabled={!title.trim()} onPress={() => onSave({ title: title.trim(), course: cls, dueAt: kind === 'assignment' ? dueAt : 0, body: body.trim(), kind })} /></View>
          <Text style={x.hint}>Stays on this device. You can attach files, add steps and notes, and tick it off like any other assignment.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const x = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22, color: T.ink },
  head: { fontWeight: '700', marginTop: 6, color: T.ink },
  link: { color: T.brand },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  bullet: { fontSize: 15, lineHeight: 22, color: T.sub, minWidth: 18 },
  card: { marginTop: 24, padding: 16, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: T.line },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '500', color: T.ink, flex: 1 },
  cardCount: { fontSize: 14, color: T.sub, fontWeight: '500' },
  notes: { minHeight: 90, fontSize: 15, lineHeight: 22, color: T.ink, fontFamily: 'GoogleSans_400Regular', textAlignVertical: 'top', padding: 0, outlineStyle: 'none' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  stepTxt: { flex: 1, fontSize: 15, color: T.ink },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  addInput: { flex: 1, fontSize: 15, color: T.ink, fontFamily: 'GoogleSans_400Regular', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.line, outlineStyle: 'none' },
  lbl: { fontSize: 14, fontWeight: '500', color: T.sub, marginTop: 22, marginBottom: 8 },
  field: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#747775', borderRadius: 4, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: T.ink, fontFamily: 'GoogleSans_400Regular', outlineStyle: 'none' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12.5, color: T.sub, marginTop: 8, lineHeight: 18 },
});
