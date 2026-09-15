const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PERSONAL_REMINDERS_VERSION = 1;
const MAX_REMINDERS = 1000;
const REMINDER_STATUSES = new Set(["pending", "notified", "completed", "cancelled"]);
const MAX_TIMER_DELAY_MS = 2_147_000_000;

function cleanText(value, maxLength = 160) {
  return String(value || "").normalize("NFKC").replace(/[\u0000-\u001f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function validTimestamp(value, optional = false) {
  if (optional && value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 8_640_000_000_000_000) throw new Error("personal-reminder-time-invalid");
  return number;
}

function normalizeReminder(value = {}) {
  const title = cleanText(value.title);
  if (!title) throw new Error("personal-reminder-title-invalid");
  const id = String(value.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) throw new Error("personal-reminder-id-invalid");
  const status = String(value.status || "pending");
  if (!REMINDER_STATUSES.has(status)) throw new Error("personal-reminder-status-invalid");
  const reminder = {
    id,
    title,
    important: value.important === true,
    eventAt: validTimestamp(value.eventAt, true),
    remindAt: validTimestamp(value.remindAt, true),
    status,
    createdAt: validTimestamp(value.createdAt),
    updatedAt: validTimestamp(value.updatedAt),
    notifiedAt: validTimestamp(value.notifiedAt, true),
  };
  if (reminder.remindAt == null && reminder.eventAt == null && !reminder.important) throw new Error("personal-reminder-purpose-invalid");
  if (reminder.status === "notified" && reminder.notifiedAt == null) throw new Error("personal-reminder-notified-invalid");
  return Object.freeze(reminder);
}

function validateReminderState(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== PERSONAL_REMINDERS_VERSION || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.items) || value.items.length > MAX_REMINDERS) {
    throw new Error("personal-reminders-state-invalid");
  }
  const items = value.items.map(normalizeReminder);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("personal-reminders-id-duplicate");
  return Object.freeze({ version: PERSONAL_REMINDERS_VERSION, revision: value.revision, items: Object.freeze(items) });
}

function emptyReminderState() {
  return Object.freeze({ version: PERSONAL_REMINDERS_VERSION, revision: 0, items: Object.freeze([]) });
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try { fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function publicReminder(value) {
  const item = normalizeReminder(value);
  return Object.freeze({ ...item });
}

function reminderSortTime(item) {
  return item.remindAt ?? item.eventAt ?? Number.MAX_SAFE_INTEGER;
}

class PersonalReminderStore {
  constructor({ userDataPath, now = () => Date.now(), createId = () => randomUUID() } = {}) {
    this.filePath = path.join(userDataPath, "personal-reminders.json");
    this.previousPath = path.join(userDataPath, "personal-reminders.previous.json");
    this.now = now;
    this.createId = createId;
    this.failure = "";
    this.state = this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) return emptyReminderState();
    try { return validateReminderState(JSON.parse(fs.readFileSync(this.filePath, "utf8"))); }
    catch {
      this.failure = "personal-reminders-data-corrupt";
      try { return validateReminderState(JSON.parse(fs.readFileSync(this.previousPath, "utf8"))); }
      catch { return emptyReminderState(); }
    }
  }

  status() {
    return Object.freeze({ ready: !this.failure, reason: this.failure, revision: this.state.revision, count: this.state.items.length });
  }

  persist(items) {
    if (this.failure) throw new Error(this.failure);
    const next = validateReminderState({ version: PERSONAL_REMINDERS_VERSION, revision: this.state.revision + 1, items });
    if (fs.existsSync(this.filePath)) {
      const current = fs.readFileSync(this.filePath, "utf8");
      validateReminderState(JSON.parse(current));
      writeAtomic(this.previousPath, current);
    }
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    writeAtomic(this.filePath, serialized);
    const readback = validateReminderState(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    if (JSON.stringify(readback) !== JSON.stringify(next)) throw new Error("personal-reminders-readback-mismatch");
    this.state = readback;
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({ version: PERSONAL_REMINDERS_VERSION, revision: this.state.revision, items: Object.freeze(this.state.items.map(publicReminder)) });
  }

  create(value = {}) {
    const timestamp = this.now();
    const remindAt = validTimestamp(value.remindAt, true);
    const eventAt = validTimestamp(value.eventAt, true);
    if (remindAt != null && remindAt < timestamp - 30_000) throw new Error("personal-reminder-time-in-past");
    const reminder = normalizeReminder({
      id: this.createId(), title: value.title, important: value.important === true,
      eventAt, remindAt, status: "pending", createdAt: timestamp, updatedAt: timestamp, notifiedAt: null,
    });
    if (this.state.items.length >= MAX_REMINDERS) throw new Error("personal-reminders-capacity-reached");
    this.persist([...this.state.items, reminder]);
    return publicReminder(reminder);
  }

  updateStatus(id, status, extra = {}) {
    if (!REMINDER_STATUSES.has(status)) throw new Error("personal-reminder-status-invalid");
    const key = String(id || "");
    const index = this.state.items.findIndex((item) => item.id === key);
    if (index < 0) throw new Error("personal-reminder-not-found");
    const timestamp = this.now();
    const updated = normalizeReminder({ ...this.state.items[index], ...extra, status, updatedAt: timestamp });
    const items = [...this.state.items]; items[index] = updated; this.persist(items);
    return publicReminder(updated);
  }

  complete(id) { return this.updateStatus(id, "completed"); }

  snooze(id, minutes = 10) {
    const duration = Number(minutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) throw new Error("personal-reminder-snooze-invalid");
    return this.updateStatus(id, "pending", { remindAt: this.now() + duration * 60_000, notifiedAt: null });
  }

  deferDelivery(id, delayMs = 15_000) {
    const delay = Number(delayMs);
    if (!Number.isInteger(delay) || delay < 1_000 || delay > 300_000) throw new Error("personal-reminder-defer-invalid");
    return this.updateStatus(id, "pending", { remindAt: this.now() + delay, notifiedAt: null });
  }

  nextPendingDue() {
    return this.state.items.filter((item) => item.status === "pending" && item.remindAt != null).sort((left, right) => left.remindAt - right.remindAt)[0] || null;
  }

  claimDue(at = this.now(), limit = 20) {
    const due = this.state.items.filter((item) => item.status === "pending" && item.remindAt != null && item.remindAt <= at).sort((left, right) => left.remindAt - right.remindAt).slice(0, limit);
    if (!due.length) return [];
    const ids = new Set(due.map((item) => item.id));
    const updated = this.state.items.map((item) => ids.has(item.id) ? normalizeReminder({ ...item, status: "notified", notifiedAt: at, updatedAt: at }) : item);
    this.persist(updated);
    return updated.filter((item) => ids.has(item.id)).map(publicReminder);
  }

  dashboardSnapshot(at = this.now(), limit = 50) {
    const today = new Date(at); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime()); tomorrow.setDate(tomorrow.getDate() + 1);
    const active = this.state.items
      .filter((item) => !["completed", "cancelled"].includes(item.status))
      .sort((left, right) => reminderSortTime(left) - reminderSortTime(right) || right.createdAt - left.createdAt);
    const items = active.slice(0, Math.max(1, Math.min(100, Number(limit) || 50))).map(publicReminder);
    const todayCount = active.filter((item) => (item.remindAt != null && item.remindAt < tomorrow.getTime()) || (item.eventAt != null && item.eventAt >= today.getTime() && item.eventAt < tomorrow.getTime()) || (item.important && item.remindAt == null && item.eventAt == null)).length;
    return Object.freeze({ ready: !this.failure, reason: this.failure, revision: this.state.revision, activeCount: active.length, todayCount, items: Object.freeze(items) });
  }
}

function localDay(at, offset = 0) {
  const date = new Date(at); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + offset); return date;
}

function dateForText(source, now) {
  const absolute = source.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/u);
  if (absolute) {
    const year = absolute[1] ? Number(absolute[1]) : new Date(now).getFullYear();
    const candidate = new Date(year, Number(absolute[2]) - 1, Number(absolute[3]));
    if (!absolute[1] && candidate.getTime() < localDay(now).getTime()) candidate.setFullYear(year + 1);
    return candidate;
  }
  if (/大后天/u.test(source)) return localDay(now, 3);
  if (/后天/u.test(source)) return localDay(now, 2);
  if (/明天|明早|明晚/u.test(source)) return localDay(now, 1);
  if (/今天|今日|今晚|今早/u.test(source)) return localDay(now, 0);
  const weekday = source.match(/(下周|下星期|本周|这周|周|星期)([一二三四五六日天])/u);
  if (weekday) {
    const target = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }[weekday[2]];
    const current = new Date(now).getDay();
    const currentFromMonday = (current + 6) % 7;
    const targetFromMonday = (target + 6) % 7;
    let offset = targetFromMonday - currentFromMonday;
    if (weekday[1] === "下周" || weekday[1] === "下星期") offset += 7;
    else if (offset < 0 || (offset === 0 && !/本周|这周/u.test(weekday[1]))) offset += 7;
    return localDay(now, offset);
  }
  return null;
}

const TIME_PATTERN = /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨)?\s*(\d{1,2})\s*(?:点|时)(?:钟)?(?:(半)|(\d{1,2})\s*分?)?/gu;

function timeMentions(source) {
  const mentions = [];
  for (const match of source.matchAll(TIME_PATTERN)) {
    const hour = Number(match[2]), minute = match[3] ? 30 : Number(match[4] || 0);
    if (hour > 23 || minute > 59) continue;
    mentions.push({ start: match.index, end: match.index + match[0].length, text: match[0], period: match[1] || "", hour, minute });
  }
  return mentions;
}

function explicitHour(mention) {
  let hour = mention.hour;
  if (["下午", "晚上", "傍晚"].includes(mention.period) && hour < 12) hour += 12;
  if (mention.period === "中午" && hour < 11) hour += 12;
  if (["上午", "早上", "早晨", "凌晨"].includes(mention.period) && hour === 12) hour = 0;
  return hour;
}

function reminderMentionIndex(source, mentions) {
  const anchors = [...source.matchAll(/提醒/gu)].map((match) => match.index);
  if (!anchors.length) return -1;
  let best = 0, bestDistance = Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < mentions.length; index += 1) {
    const distance = Math.min(...anchors.map((anchor) => anchor >= mentions[index].end ? anchor - mentions[index].end : mentions[index].start - anchor + 2));
    if (distance < bestDistance || (distance === bestDistance && index > best)) { best = index; bestDistance = distance; }
  }
  return best;
}

function resolvedHour(mention, eventMention = null) {
  if (mention.period) return explicitHour(mention);
  if (eventMention) {
    const eventHour = explicitHour(eventMention);
    const options = mention.hour <= 11 ? [mention.hour, mention.hour + 12] : [mention.hour];
    const beforeEvent = options.filter((hour) => hour <= eventHour);
    if (beforeEvent.length) return beforeEvent.at(-1);
  }
  if (mention.hour >= 1 && mention.hour <= 7) return null;
  return mention.hour;
}

function timestampFor(day, mention, hour) {
  const date = new Date(day.getTime()); date.setHours(hour, mention.minute, 0, 0); return date.getTime();
}

function cleanReminderTitle(source) {
  return cleanText(source
    .replace(/^(?:(?:小岚|小兰|小蓝)[，,、\s]*)+/u, "")
    .replace(TIME_PATTERN, " ")
    .replace(/(?:(?:\d{4})年)?\d{1,2}月\d{1,2}[日号]?|大后天|后天|明天|今天|今日|今晚|今早|明早|明晚|(?:下周|下星期|本周|这周|周|星期)[一二三四五六日天]/gu, " ")
    .replace(/(?:请|麻烦)?(?:你)?(?:到时候)?(?:记得|要|帮我)?提醒(?:我|一下)?/gu, " ")
    .replace(/(?:然后|到时候|对吧|好不好|可以吗|行吗)/gu, " ")
    .replace(/^[\s，,。.!！?？]*(?:我)?(?:有|安排|约了)(?:一个|个|一场)?/u, "")
    .replace(/[，,。.!！?？、；;：:]+/gu, " "));
}

function cleanImportantTitle(source) {
  return cleanText(source
    .replace(/^(?:(?:小岚|小兰|小蓝)[，,、\s]*)+/u, "")
    .replace(/(?:这件事|这个事情|这件事情)?(?:很|非常)?重要(?:的事情|的事|事项)?/gu, " ")
    .replace(/(?:请|麻烦)?(?:你)?(?:帮我)?(?:记一下|记录一下|记下来|记录下来)/gu, " ")
    .replace(/(?:作为|设为|标为)?重要事项/gu, " ")
    .replace(/[，,。.!！?？、；;：:]+/gu, " "));
}

function isReminderListQuery(source) {
  const compact = cleanText(source, 300).replace(/[，。！？、,.!?\s]+/gu, "");
  return /(?:我)?(?:今天|今日|明天|最近)?(?:还)?(?:有|安排了)?(?:什么|哪些|几个)?(?:个人)?(?:提醒|重要事项)(?:吗|呢|呀)?$/u.test(compact)
    || /(?:查看|看看|读一下|告诉我)(?:今天|今日|明天|最近)?(?:的)?(?:提醒|重要事项)/u.test(compact);
}

function isPersonalReminderUtterance(value) {
  const source = cleanText(value, 1000);
  if (!source) return false;
  return isReminderListQuery(source)
    || /提醒/u.test(source)
    || /(?:重要事项|重要的事|重要的事情|事情很重要|这件事很重要).{0,20}(?:记一下|记录一下|记下来|记录下来)/u.test(source)
    || /(?:记一下|记录一下|记下来|记录下来).{0,20}(?:重要事项|很重要)/u.test(source);
}

function parsePersonalReminderIntent(value, { now = Date.now() } = {}) {
  const source = cleanText(value, 1000);
  if (!isPersonalReminderUtterance(source)) return Object.freeze({ recognized: false, type: "none" });
  if (isReminderListQuery(source)) return Object.freeze({ recognized: true, type: "list" });
  if (/(?:你|小岚|小兰|小蓝).{0,8}(?:有没有|有没|能不能|可以不可以|会不会|能|可以|会).{0,8}提醒(?:功能)?/u.test(source)) {
    return Object.freeze({ recognized: true, type: "capability" });
  }
  if (!/提醒/u.test(source)) {
    const title = cleanImportantTitle(source);
    return Object.freeze(title
      ? { recognized: true, type: "create", title, important: true, eventAt: null, remindAt: null }
      : { recognized: true, type: "clarify", reason: "personal-reminder-title-missing" });
  }
  const mentions = timeMentions(source);
  if (!mentions.length) return Object.freeze({ recognized: true, type: "clarify", reason: "personal-reminder-time-missing" });
  const reminderIndex = reminderMentionIndex(source, mentions);
  const reminderTime = mentions[reminderIndex];
  const eventTime = mentions.length > 1 ? mentions.find((_, index) => index !== reminderIndex) : null;
  const reminderHour = resolvedHour(reminderTime, eventTime);
  if (reminderHour == null) return Object.freeze({ recognized: true, type: "clarify", reason: "personal-reminder-time-ambiguous" });
  let day = dateForText(source, now) || localDay(now);
  let remindAt = timestampFor(day, reminderTime, reminderHour);
  if (!dateForText(source, now) && remindAt < now - 30_000) {
    day = localDay(now, 1);
    remindAt = timestampFor(day, reminderTime, reminderHour);
  }
  const adjustedEventAt = eventTime ? timestampFor(day, eventTime, explicitHour(eventTime)) : remindAt;
  const title = cleanReminderTitle(source);
  if (!title) return Object.freeze({ recognized: true, type: "clarify", reason: "personal-reminder-title-missing" });
  if (remindAt < now - 30_000) return Object.freeze({ recognized: true, type: "clarify", reason: "personal-reminder-time-in-past" });
  return Object.freeze({ recognized: true, type: "create", title, important: /重要/u.test(source), eventAt: adjustedEventAt, remindAt });
}

function formatReminderTime(timestamp, now = Date.now()) {
  const date = new Date(timestamp), today = localDay(now), tomorrow = localDay(now, 1);
  const day = localDay(timestamp);
  const prefix = day.getTime() === today.getTime() ? "今天" : day.getTime() === tomorrow.getTime() ? "明天" : `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${prefix}${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function voiceReminderAnswer(result, now = Date.now()) {
  if (result.type === "capability") return "可以。你可以告诉我事情发生的时间和希望几点提醒，我会把它保存在本机，并显示在工作台的提醒区。";
  if (result.type === "clarify") {
    if (result.reason === "personal-reminder-time-missing") return "可以提醒你，不过还缺少提醒时间。请说清楚哪一天、上午还是下午，以及几点。";
    if (result.reason === "personal-reminder-time-ambiguous") return "我还不能确定你说的是上午还是下午。请再说一次完整时间，我确认后再保存。";
    if (result.reason === "personal-reminder-time-in-past") return "这个提醒时间已经过去了，请告诉我一个新的时间。";
    return "我听到了记录请求，不过还不知道要记录什么。请把事情再说完整一点。";
  }
  if (result.type === "list") return "";
  const event = result.eventAt != null && result.eventAt !== result.remindAt ? `，事情时间是${formatReminderTime(result.eventAt, now)}` : "";
  return result.remindAt == null
    ? `已经把“${result.title}”记为重要事项，放到工作台了。`
    : `已经记下“${result.title}”，会在${formatReminderTime(result.remindAt, now)}提醒你${event}。`;
}

function executePersonalReminderIntent(value, { store, now = Date.now() } = {}) {
  const parsed = parsePersonalReminderIntent(value, { now });
  if (!parsed.recognized) return Object.freeze({ ok: false, reason: "personal-reminder-intent-unrecognized", answer: "" });
  if (parsed.type === "list") {
    const snapshot = store.dashboardSnapshot(now, 10);
    if (!snapshot.items.length) return Object.freeze({ ok: true, type: "list", changed: false, answer: "你现在没有未完成的个人提醒或重要事项。", snapshot });
    const summary = snapshot.items.slice(0, 3).map((item) => item.remindAt == null ? `重要事项“${item.title}”` : `${formatReminderTime(item.remindAt, now)}提醒“${item.title}”`).join("；");
    const suffix = snapshot.activeCount > 3 ? `；另外还有${snapshot.activeCount - 3}项，可以在工作台查看。` : "。";
    return Object.freeze({ ok: true, type: "list", changed: false, answer: `你有${snapshot.activeCount}项未完成：${summary}${suffix}`, snapshot });
  }
  if (parsed.type !== "create") return Object.freeze({ ok: parsed.type === "capability", type: parsed.type, changed: false, reason: parsed.reason || "", answer: voiceReminderAnswer(parsed, now) });
  try {
    const reminder = store.create(parsed);
    return Object.freeze({ ok: true, type: "create", changed: true, reminder, answer: voiceReminderAnswer(reminder, now) });
  } catch (error) {
    const reason = /^personal-reminder[a-z-]+$/u.test(String(error?.message || "")) ? error.message : "personal-reminder-save-failed";
    return Object.freeze({ ok: false, type: "create", changed: false, reason, answer: reason === "personal-reminder-time-in-past" ? "这个提醒时间已经过去了，请告诉我一个新的时间。" : "这条提醒没有保存成功，请稍后再试。" });
  }
}

class PersonalReminderScheduler {
  constructor({ store, now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout, onDue = async () => {}, onChange = () => {} } = {}) {
    this.store = store; this.now = now; this.schedule = schedule; this.cancel = cancel; this.onDue = onDue; this.onChange = onChange;
    this.timer = null; this.running = false; this.stopped = true;
  }

  start() { this.stopped = false; this.reschedule(); }
  stop() { this.stopped = true; if (this.timer) this.cancel(this.timer); this.timer = null; }
  reschedule() {
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    if (this.stopped) return;
    const next = this.store.nextPendingDue();
    if (!next) return;
    const delay = Math.max(0, Math.min(MAX_TIMER_DELAY_MS, next.remindAt - this.now()));
    this.timer = this.schedule(() => { this.timer = null; void this.tick(); }, delay);
    this.timer?.unref?.();
  }
  async tick() {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const due = this.store.claimDue(this.now());
      if (due.length) this.onChange(this.store.dashboardSnapshot(this.now()));
      for (const reminder of due) await this.onDue(reminder);
    } finally { this.running = false; this.reschedule(); }
  }
}

module.exports = {
  PERSONAL_REMINDERS_VERSION,
  MAX_REMINDERS,
  PersonalReminderScheduler,
  PersonalReminderStore,
  executePersonalReminderIntent,
  formatReminderTime,
  isPersonalReminderUtterance,
  normalizeReminder,
  parsePersonalReminderIntent,
  validateReminderState,
};
