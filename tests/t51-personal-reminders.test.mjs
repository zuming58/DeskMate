import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PersonalReminderScheduler,
  PersonalReminderStore,
  executePersonalReminderIntent,
  parsePersonalReminderIntent,
} = require("../electron/personal-reminders.cjs");
const { CompanionIntentBridge } = require("../electron/companion-intent-bridge.cjs");

const at = (year, month, day, hour, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();
const now = at(2026, 9, 15, 10);
const ids = () => { let value = 0; return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`; };

test("T51 parses separate event and reminder times from the exhibition example", () => {
  const explicit = parsePersonalReminderIntent("小岚，明天下午4点有个产品展示，下午1点提醒我", { now });
  assert.equal(explicit.type, "create");
  assert.equal(explicit.title, "产品展示");
  assert.equal(explicit.eventAt, at(2026, 9, 16, 16));
  assert.equal(explicit.remindAt, at(2026, 9, 16, 13));

  const inherited = parsePersonalReminderIntent("明天下午4点有个产品展示，1点钟要提醒我", { now });
  assert.equal(inherited.remindAt, at(2026, 9, 16, 13));
  assert.equal(inherited.eventAt, at(2026, 9, 16, 16));
});

test("T51 asks about ambiguous small hours instead of silently choosing morning or afternoon", () => {
  assert.deepEqual(parsePersonalReminderIntent("明天4点提醒我开会", { now }), {
    recognized: true, type: "clarify", reason: "personal-reminder-time-ambiguous",
  });
  const direct = parsePersonalReminderIntent("明天下午4点提醒我开会", { now });
  assert.equal(direct.title, "开会");
  assert.equal(direct.remindAt, at(2026, 9, 16, 16));
  assert.equal(direct.eventAt, direct.remindAt);
});

test("T51 resolves this-week and next-week dates without skipping an extra week", () => {
  const thisFriday = parsePersonalReminderIntent("本周五下午3点提醒我交材料", { now });
  const nextMonday = parsePersonalReminderIntent("下周一下午3点提醒我交材料", { now });
  assert.equal(thisFriday.remindAt, at(2026, 9, 18, 15));
  assert.equal(nextMonday.remindAt, at(2026, 9, 21, 15));
});

test("T51 records an important item without inventing a notification time", () => {
  const parsed = parsePersonalReminderIntent("这件事很重要，帮我记一下：展会要带电源线", { now });
  assert.equal(parsed.type, "create");
  assert.equal(parsed.title, "展会要带电源线");
  assert.equal(parsed.important, true);
  assert.equal(parsed.remindAt, null);
  assert.equal(parsed.eventAt, null);
});

test("T51 store is atomic, persistent and keeps event time separate from notification time", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t51-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new PersonalReminderStore({ userDataPath: directory, now: () => now, createId: ids() });
  const reminder = store.create({ title: "产品展示", remindAt: at(2026, 9, 16, 13), eventAt: at(2026, 9, 16, 16), important: true });
  assert.equal(reminder.status, "pending");
  assert.equal(store.dashboardSnapshot(now).activeCount, 1);
  const reopened = new PersonalReminderStore({ userDataPath: directory, now: () => now });
  assert.equal(reopened.snapshot().items[0].eventAt, at(2026, 9, 16, 16));
  reopened.complete(reminder.id);
  assert.equal(reopened.dashboardSnapshot(now).activeCount, 0);
});

test("T51 due scheduler claims once before delivery and supports local snooze", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t51-scheduler-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let clock = now, callback;
  const store = new PersonalReminderStore({ userDataPath: directory, now: () => clock, createId: ids() });
  const item = store.create({ title: "拿资料", remindAt: now + 60_000, eventAt: now + 60_000 });
  const delivered = [];
  const scheduler = new PersonalReminderScheduler({ store, now: () => clock, schedule: (fn) => { callback = fn; return { unref() {} }; }, cancel: () => {}, onDue: async (value) => { delivered.push(value.id); return { ok: true, voice: true }; } });
  scheduler.start(); clock += 60_000; await callback();
  assert.deepEqual(delivered, [item.id]);
  assert.equal(store.snapshot().items[0].status, "notified");
  await scheduler.tick(); assert.deepEqual(delivered, [item.id]);
  store.deferDelivery(item.id, 15_000); scheduler.reschedule();
  assert.equal(store.snapshot().items[0].status, "pending");
  assert.equal(store.snapshot().items[0].remindAt, clock);
  assert.equal(store.snapshot().items[0].nextAttemptAt, clock + 15_000);
  store.snooze(item.id, 10); scheduler.reschedule();
  assert.equal(store.snapshot().items[0].status, "pending");
  assert.equal(store.snapshot().items[0].remindAt, clock + 600_000);
  scheduler.stop();
});

test("T51 local voice action creates and lists reminders without a model", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t51-voice-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new PersonalReminderStore({ userDataPath: directory, now: () => now, createId: ids() });
  const created = executePersonalReminderIntent("明天下午4点有个活动，下午1点提醒我", { store, now });
  assert.equal(created.ok, true);
  assert.match(created.answer, /明天13:00提醒你/);
  assert.match(created.answer, /事情时间是明天16:00/);
  const listed = executePersonalReminderIntent("我今天还有什么提醒", { store, now });
  assert.equal(listed.type, "list");
  assert.match(listed.answer, /活动/);
});

test("T51 companion Bridge claims reminder turns before the model classifier", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t51-bridge-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new PersonalReminderStore({ userDataPath: directory, now: () => now, createId: ids() });
  let classifierCalls = 0;
  const bridge = new CompanionIntentBridge({
    appActions: { listRegistered: () => [] },
    reminderAction: (text) => executePersonalReminderIntent(text, { store, now }),
    requestJson: async () => { classifierCalls += 1; return { type: "none" }; },
  });
  const utterance = "明天下午4点有活动，下午1点提醒我";
  assert.equal(bridge.claimsTurn(utterance), true);
  const result = await bridge.analyze(utterance);
  assert.equal(result.result.type, "manage_personal_reminder");
  assert.equal(result.result.action, "create");
  assert.match(result.result.answer, /明天13:00/);
  assert.equal(classifierCalls, 0);
});

test("T51 due delivery speaks through 小岚 without a Windows alarm and queues behind dictation", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const delivery = main.slice(main.indexOf("async function deliverPersonalReminder"), main.indexOf("async function stopCompanionConversation"));
  assert.doesNotMatch(delivery, /new Notification|notification\.show|silent:/);
  assert.match(delivery, /formatPersonalReminderAnnouncement\(reminder, \{ ownerName \}\)/);
  assert.match(delivery, /companionPersonaStore\?\.snapshot\?\.\(\)\?\.persona\?\.ownerName/);
  assert.match(delivery, /deferDelivery\(reminder\.id, 15_000\)/);
});
