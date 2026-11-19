// One class, laid out like Google Classroom: a coloured banner, then Stream (everything posted, newest first, with what
// is coming up), Classwork (assignments and materials, grouped by month) and Grades (your scores and your average).
import React, { useContext, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppCtx } from '../ctx';
import { T, classPair, hair } from '../theme';
import { Card, Chip, DONE_STATES, Empty, GroupLabel, Icon, LinearGradient, RowIcon, Seg, StatePill, WorkRow, gradeParts, gradeSummary, isOpen, isWork, monthKey, monthLabel, niceName, postedDetail, realName, shortDue, teacherOf, workState } from '../ui';

const posted = (i) => i.posted_at || i.created_at || 0;
/** "Today, 10:19 AM" / "Nov 17, 9:28 AM" — when it was posted, as a line of its own. */
const when = (i) => { const t = postedDetail(i).replace(/^Posted /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const KIND_WORD = { assignment: 'a new assignment', material: 'new material', email: 'a message' };
const KIND_ALONE = { assignment: 'New assignment', material: 'New material', email: 'Message' };

/** One post in the Stream. An announcement shows its text; everything else is "<teacher> posted a new assignment: …". */
function StreamPost({ item, onPress, onLongPress }) {
  const nf = (item.files || []).filter((f) => f.origin !== 'upload').length;
  const who = niceName(item.author);
  if (item.kind === 'announcement') {
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={({ pressed }) => [s.post, pressed && { opacity: 0.7 }]}>
        <View style={s.postHead}>
          <RowIcon item={item} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={s.postWho}>{who || 'Announcement'}</Text>
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
  const lead = who ? `${who} posted ${KIND_WORD[item.kind] || 'a new post'}: ` : `${KIND_ALONE[item.kind] || 'New post'}: `;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={({ pressed }) => [s.post, s.postRow, pressed && { opacity: 0.7 }]}>
      <RowIcon item={item} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={s.postLine} numberOfLines={2}><Text style={s.postKind}>{lead}</Text>{item.title}</Text>
        <Text style={s.postWhen} numberOfLines={1}>{[when(item), work && (item.dueAt || item.due) && !DONE_STATES.includes(st) ? 'Due ' + shortDue(item) : ''].filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {item.starred && <Icon n="pin" s={14} c={T.amberFill} />}
        <StatePill item={item} plain />
      </View>
    </Pressable>
  );
}

const pctColor = (p) => (p >= 85 ? T.green : p >= 70 ? T.amber : T.red);

export function ClassScreen({ name }) {
  const e = useContext(AppCtx);
  const { items, openItem, pop } = e;
  const [tab, setTab] = useState('stream');
  const [kind, setKind] = useState('all');
  const pair = classPair(name);
  const mine = useMemo(() => items.filter((i) => (i.course || 'Other') === name).sort((a, b) => posted(b) - posted(a)), [items, name]);
  const teacher = useMemo(() => teacherOf(mine), [mine]);
  const upcoming = useMemo(() => mine.filter((i) => isOpen(i) && workState(i) !== 'late' && i.dueAt).sort((a, b) => a.dueAt - b.dueAt).slice(0, 3), [mine]);
  const missing = useMemo(() => mine.filter((i) => isOpen(i) && workState(i) === 'late'), [mine]);
  const groups = useMemo(() => {
    const list = mine.filter((i) => i.kind !== 'announcement' && (kind === 'all' || (kind === 'work' ? isWork(i) : !isWork(i))));
    // Like Classroom: posts sit under their topic, in the order the teacher arranged them. A post that has not been sorted
    // into a topic yet (just posted) waits at the top. Until the topics have been read, months are the fallback.
    if (list.some((i) => (i.io ?? -1) >= 0)) {
      const m = new Map();
      for (const i of list) {
        const placed = (i.io ?? -1) >= 0;
        const key = placed ? `t${i.to}` : 'new';
        let g = m.get(key);
        if (!g) { g = { k: key, label: placed ? (i.topic || 'No topic') : 'Just posted', ord: placed ? i.to : -1, list: [] }; m.set(key, g); }
        g.list.push(i);
      }
      const byTopic = [...m.values()].sort((a, b) => a.ord - b.ord);
      byTopic.forEach((g) => g.list.sort((a, b) => (a.io ?? 1e9) - (b.io ?? 1e9) || posted(b) - posted(a)));
      return byTopic;
    }
    const out = [];
    for (const i of list) {
      const k = monthKey(i);
      let g = out[out.length - 1];
      if (!g || g.k !== k) { g = { k, label: monthLabel(i), list: [] }; out.push(g); }
      g.list.push(i);
    }
    return out;
  }, [mine, kind]);
  // People: the teachers (read off the class's People page; the names on its posts when that has not been read yet).
  const cid = useMemo(() => { const u = (mine.find((i) => i.url) || {}).url || ''; return (u.match(/\/c\/([^/]+)/) || [])[1] || ''; }, [mine]);
  const roster = (e.remote && e.remote.people && cid && e.remote.people[cid]) || null;
  const teachers = useMemo(() => {
    if (roster && roster.t && roster.t.length) return roster.t.map(niceName);
    const n = {};
    for (const i of mine) if (realName(i.author)) n[i.author] = (n[i.author] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k]) => niceName(k));
  }, [mine, roster]);
  const scored = useMemo(() => mine.filter((i) => gradeParts(i.grade)), [mine]);
  const sum = useMemo(() => gradeSummary(mine), [mine]);
  const waiting = useMemo(() => mine.filter((i) => isWork(i) && workState(i) === 'turnedin' && !gradeParts(i.grade)).length, [mine]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={pair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
        <View style={s.glow} />
        <Pressable onPress={pop} hitSlop={14} style={({ pressed }) => [s.back, pressed && { opacity: 0.5 }]}>
          <Icon n="chevron-back" s={25} c="#fff" /><Text style={s.backTxt}>Classes</Text>
        </Pressable>
        <Text style={s.bannerTitle} numberOfLines={2}>{name}</Text>
        <Text style={s.bannerSub}>{[teacher, `${mine.length} post${mine.length === 1 ? '' : 's'}`, missing.length ? `${missing.length} missing` : ''].filter(Boolean).join(' · ')}</Text>
      </LinearGradient>
      <View style={s.segWrap}><Seg value={tab} onChange={setTab} options={[['stream', 'Stream'], ['classwork', 'Classwork'], ['people', 'People'], ['grades', 'Grades']]} /></View>

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
      ) : tab === 'classwork' ? (
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
      ) : tab === 'people' ? (
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.wrap}>
            <Text style={s.pHead}>Teachers</Text>
            <View style={s.pRule} />
            {teachers.length === 0 && <Text style={s.pNone}>Your teacher’s name shows up here after the PC has looked at this class.</Text>}
            {teachers.map((t) => (
              <View key={t} style={s.pRow}>
                <View style={[s.pAvatar, { backgroundColor: pair[0] }]}><Text style={s.pAvatarTxt}>{t.charAt(0).toUpperCase()}</Text></View>
                <Text style={s.pName}>{t}</Text>
              </View>
            ))}
            <View style={s.pHeadRow}>
              <Text style={s.pHead}>Classmates</Text>
              {!!(roster && roster.n) && <Text style={s.pCount}>{roster.n} student{roster.n === 1 ? '' : 's'}</Text>}
            </View>
            <View style={s.pRule} />
            <Text style={s.pNote}>{roster && roster.n ? 'Your classmates’ names stay in Google Classroom. This app only keeps how many there are, so other students’ names are not copied anywhere.' : 'The number of students shows up here after the PC has looked at this class.'}</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.wrap}>
            <Card style={s.sum}>
              <View style={{ flex: 1 }}>
                <Text style={s.sumL}>Average of graded work</Text>
                <Text style={[s.sumBig, sum.pct != null && { color: pctColor(sum.pct) }]}>{sum.pct != null ? `${sum.pct}%` : '—'}</Text>
                <Text style={s.sumSub}>{sum.n ? `${sum.got} of ${sum.of} points · ${sum.n} graded` : 'Nothing graded yet'}</Text>
              </View>
              <View style={s.sumSide}>
                <Text style={[s.sumNum, missing.length > 0 && { color: T.red }]}>{missing.length}</Text><Text style={s.sumCap}>missing</Text>
                <Text style={[s.sumNum, { marginTop: 8 }]}>{waiting}</Text><Text style={s.sumCap}>turned in, not graded yet</Text>
              </View>
            </Card>
            <Text style={s.fine}>Points earned out of points possible, across everything graded here. Your teacher may weigh work differently, so the grade in the school portal can be different.</Text>
            {scored.length === 0 ? <Empty icon="ribbon-outline" title="No grades yet" text="Scores show up here as soon as your teacher grades something." /> : (<>
              <GroupLabel title="Graded" count={scored.length} style={{ marginTop: 18 }} />
              <Card>
                {scored.map((i, k) => {
                  const g = gradeParts(i.grade), p = Math.round((g.got / g.of) * 100);
                  return (
                    <Pressable key={i.id} onPress={() => openItem(i.id)} style={({ pressed }) => [s.gRow, pressed && { backgroundColor: T.soft }]}>
                      <View style={[s.gBody, k < scored.length - 1 && s.gLine]}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.gTitle} numberOfLines={2}>{i.title}</Text>
                          <Text style={s.gSub} numberOfLines={1}>{postedDetail(i)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={s.gScore}>{i.grade}</Text>
                          <Text style={[s.gPct, { color: pctColor(p) }]}>{p}%</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </Card>
            </>)}
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
  pHead: { fontSize: 26, fontWeight: '600', color: T.ink, letterSpacing: -0.3 },
  pHeadRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 30 },
  pCount: { fontSize: 15, color: T.sub },
  pRule: { height: 1.5, backgroundColor: T.brand, marginTop: 8, marginBottom: 6, borderRadius: 1 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 },
  pAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pAvatarTxt: { color: '#fff', fontSize: 17, fontWeight: '600' },
  pName: { fontSize: 17, color: T.ink, letterSpacing: -0.3 },
  pNone: { fontSize: 15, color: T.sub, paddingVertical: 12 },
  pNote: { fontSize: 14, color: T.sub, lineHeight: 20, paddingVertical: 10 },
  sum: { flexDirection: 'row', padding: 18, gap: 16, alignItems: 'center' },
  sumL: { fontSize: 13, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.2 },
  sumBig: { fontSize: 44, fontWeight: '700', color: T.ink, letterSpacing: -1, marginTop: 2 },
  sumSub: { fontSize: 14, color: T.sub, marginTop: 1 },
  sumSide: { alignItems: 'flex-end', maxWidth: 150 },
  sumNum: { fontSize: 22, fontWeight: '700', color: T.ink },
  sumCap: { fontSize: 12.5, color: T.sub, textAlign: 'right' },
  fine: { fontSize: 12.5, color: T.faint, lineHeight: 17, marginTop: 8, marginHorizontal: 4 },
  gRow: { paddingLeft: 16 },
  gBody: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingRight: 16, minHeight: 56 },
  gLine: { borderBottomWidth: hair, borderBottomColor: T.line },
  gTitle: { fontSize: 16.5, color: T.ink, letterSpacing: -0.3, lineHeight: 21 },
  gSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  gScore: { fontSize: 17, fontWeight: '600', color: T.ink },
  gPct: { fontSize: 13, fontWeight: '600', marginTop: 1 },
});
