// One class, laid out like Google Classroom: a coloured banner, then Stream (everything posted, newest first, with what
// is coming up) and Classwork (assignments and materials, grouped by month).
import React, { useContext, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppCtx } from '../ctx';
import { T, classPair } from '../theme';
import { Card, Chip, DONE_STATES, Empty, GroupLabel, Icon, LinearGradient, RowIcon, Seg, StatePill, WorkRow, isOpen, isWork, monthKey, monthLabel, postedDetail, shortDue, workState } from '../ui';

const posted = (i) => i.posted_at || i.created_at || 0;
/** "Today, 10:19 AM" / "Nov 17, 9:28 AM" — when it was posted, as a line of its own. */
const when = (i) => { const t = postedDetail(i).replace(/^Posted /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const KIND_WORD = { assignment: 'New assignment', material: 'New material', announcement: 'Announcement', email: 'Message' };

/** One post in the Stream. An announcement shows its text; everything else is a line that opens the post. */
function StreamPost({ item, onPress, onLongPress }) {
  const nf = (item.files || []).filter((f) => f.origin !== 'upload').length;
  if (item.kind === 'announcement') {
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={({ pressed }) => [s.post, pressed && { opacity: 0.7 }]}>
        <View style={s.postHead}>
          <RowIcon item={item} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={s.postWho}>Announcement</Text>
            <Text style={s.postWhen}>{when(item)}</Text>
          </View>
          {item.starred && <Icon n="pin" s={15} c={T.amberFill} />}
        </View>
        <Text style={s.postBody} numberOfLines={7}>{String(item.body || item.title || '').trim()}</Text>
        {nf > 0 && <View style={s.postFiles}><Icon n="attach" s={15} c={T.sub} /><Text style={s.postFilesTxt}>{nf} attachment{nf === 1 ? '' : 's'}</Text></View>}
      </Pressable>
    );
  }
  const work = isWork(item), st = workState(item);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={({ pressed }) => [s.post, s.postRow, pressed && { opacity: 0.7 }]}>
      <RowIcon item={item} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={s.postLine} numberOfLines={2}><Text style={s.postKind}>{(KIND_WORD[item.kind] || 'New post') + ': '}</Text>{item.title}</Text>
        <Text style={s.postWhen} numberOfLines={1}>{[when(item), work && (item.dueAt || item.due) && !DONE_STATES.includes(st) ? 'Due ' + shortDue(item) : ''].filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {item.starred && <Icon n="pin" s={14} c={T.amberFill} />}
        <StatePill item={item} />
      </View>
    </Pressable>
  );
}

export function ClassScreen({ name }) {
  const e = useContext(AppCtx);
  const { items, openItem, pop } = e;
  const [tab, setTab] = useState('stream');
  const [kind, setKind] = useState('all');
  const pair = classPair(name);
  const mine = useMemo(() => items.filter((i) => (i.course || 'Other') === name).sort((a, b) => posted(b) - posted(a)), [items, name]);
  const upcoming = useMemo(() => mine.filter((i) => isOpen(i) && workState(i) !== 'late' && i.dueAt).sort((a, b) => a.dueAt - b.dueAt).slice(0, 3), [mine]);
  const missing = useMemo(() => mine.filter((i) => isOpen(i) && workState(i) === 'late').length, [mine]);
  const groups = useMemo(() => {
    const list = mine.filter((i) => i.kind !== 'announcement' && (kind === 'all' || (kind === 'work' ? isWork(i) : !isWork(i))));
    const out = [];
    for (const i of list) {
      const k = monthKey(i);
      let g = out[out.length - 1];
      if (!g || g.k !== k) { g = { k, label: monthLabel(i), list: [] }; out.push(g); }
      g.list.push(i);
    }
    return out;
  }, [mine, kind]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={pair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
        <View style={s.glow} />
        <Pressable onPress={pop} hitSlop={14} style={({ pressed }) => [s.back, pressed && { opacity: 0.5 }]}>
          <Icon n="chevron-back" s={25} c="#fff" /><Text style={s.backTxt}>Classes</Text>
        </Pressable>
        <Text style={s.bannerTitle} numberOfLines={2}>{name}</Text>
        <Text style={s.bannerSub}>{mine.length} post{mine.length === 1 ? '' : 's'}{missing ? ` · ${missing} missing` : ''}</Text>
      </LinearGradient>
      <View style={s.segWrap}><Seg value={tab} onChange={setTab} options={[['stream', 'Stream'], ['classwork', 'Classwork']]} /></View>

      {tab === 'stream' ? (
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.wrap}>
            <Card style={s.upcoming}>
              <Text style={s.upTitle}>Upcoming</Text>
              {upcoming.length === 0 ? <Text style={s.upNone}>Woohoo, no work due soon!</Text> : upcoming.map((i) => (
                <Pressable key={i.id} onPress={() => openItem(i.id)} style={({ pressed }) => [s.upRow, pressed && { opacity: 0.5 }]}>
                  <Text style={s.upDue} numberOfLines={1}>{'Due ' + shortDue(i)}</Text>
                  <Text style={s.upName} numberOfLines={1}>{i.title}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setTab('classwork')} hitSlop={8}><Text style={s.upAll}>View all</Text></Pressable>
            </Card>
            {mine.length === 0 && <Empty icon="chatbubbles-outline" title="Nothing posted yet" />}
            {mine.map((i) => <StreamPost key={i.id} item={i} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />)}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.wrap}>
            <View style={s.chips}>
              {[['all', 'All'], ['work', 'Assignments'], ['material', 'Materials']].map(([k, label]) => <Chip key={k} label={label} on={kind === k} color={pair[0]} onPress={() => setKind(k)} />)}
            </View>
            {groups.length === 0 && <Empty icon="file-tray-outline" title="Nothing here yet" />}
            {groups.map((g) => (
              <View key={g.k} style={{ marginBottom: 20 }}>
                <GroupLabel title={g.label} count={g.list.length} />
                <Card>{g.list.map((i, k) => <WorkRow key={i.id} item={i} last={k === g.list.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />)}</Card>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18, overflow: 'hidden' },
  glow: { position: 'absolute', right: -60, top: -90, width: 260, height: 260, borderRadius: 130, backgroundColor: '#ffffff1f' },
  back: { flexDirection: 'row', alignItems: 'center', height: 40, marginLeft: -8, alignSelf: 'flex-start' },
  backTxt: { color: '#fff', fontSize: 17, marginLeft: -2 },
  bannerTitle: { color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: -0.3, marginTop: 14, lineHeight: 35 },
  bannerSub: { color: '#ffffffd9', fontSize: 14.5, marginTop: 4 },
  segWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: T.bg },
  page: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  wrap: { width: '100%', maxWidth: 820, alignSelf: 'center' },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  upcoming: { padding: 16, gap: 8, marginBottom: 12 },
  upTitle: { fontSize: 16, fontWeight: '600', color: T.ink },
  upNone: { fontSize: 14.5, color: T.sub },
  upRow: { gap: 1 },
  upDue: { fontSize: 12.5, color: T.sub },
  upName: { fontSize: 15, color: T.ink, fontWeight: '500', letterSpacing: -0.2 },
  upAll: { fontSize: 15, color: T.brand, fontWeight: '500', alignSelf: 'flex-end' },
  post: { backgroundColor: '#fff', borderRadius: T.radius, padding: 14, marginBottom: 10 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  postWho: { fontSize: 15.5, fontWeight: '600', color: T.ink },
  postWhen: { fontSize: 13, color: T.sub, marginTop: 1 },
  postBody: { fontSize: 15.5, color: T.text, lineHeight: 21 },
  postFiles: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  postFilesTxt: { fontSize: 13.5, color: T.sub },
  postLine: { fontSize: 15.5, color: T.ink, lineHeight: 20, letterSpacing: -0.2 },
  postKind: { color: T.sub },
});
