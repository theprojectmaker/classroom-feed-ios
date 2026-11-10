import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const slots = (item) => {
  const d = new Date(item.dueAt);
  const eve = new Date(d); eve.setDate(eve.getDate() - 1); eve.setHours(18, 0, 0, 0); // 6 PM the evening before
  return [['eve', eve.getTime()], ['soon', item.dueAt - 2 * 3600 * 1000]]; // and 2 hours before it is due
};

export async function cancelReminders(item) {
  if (Platform.OS === 'web') return;
  for (const [k] of [['eve'], ['soon']]) {
    try { await Notifications.cancelScheduledNotificationAsync(`rem-${item.id}-${k}`); } catch {}
  }
}

/** Local reminders (work with no connection): evening before and 2 hours before the due time. */
export async function scheduleReminders(item) {
  if (Platform.OS === 'web' || !item.dueAt || item.submitted) return;
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    await cancelReminders(item);
    const when = new Date(item.dueAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    for (const [k, at] of slots(item)) {
      if (at <= Date.now() + 60 * 1000) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `rem-${item.id}-${k}`,
        content: { title: 'Remember to submit', body: `${item.title} · ${item.course} — due ${when}`, sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
      });
    }
  } catch {}
}
