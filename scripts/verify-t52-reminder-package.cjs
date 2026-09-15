// Read only the final ASAR modules; never launch production main or real audio.
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const asar = require('@electron/asar');
const release = process.argv[2] || 'release-t52';
assert(/^release(?:-[a-z0-9-]+)?$/.test(release));
const archive = path.resolve(__dirname, '..', release, 'win-unpacked/resources/app.asar');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = {exports: {}};
  cache.set(file, module);
  const filename = `${archive}/${file}`;
  const localRequire = request => request.startsWith('.') ? load(path.posix.normalize(path.posix.join(path.posix.dirname(file), request))) : require(request);
  const factory = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${asar.extractFile(archive, path.normalize(file)).toString('utf8')}\n})`, {filename});
  factory(localRequire, module, module.exports, filename, path.posix.dirname(filename));
  return module.exports;
}
async function verify() {
  const {PersonalReminderConversation, parsePersonalReminderIntent} = load('electron/personal-reminders.cjs');
  const now = new Date(2026, 8, 15, 10).getTime();
  assert.equal(parsePersonalReminderIntent('明天下午六点二十分提醒我开会', {now}).remindAt, new Date(2026, 8, 16, 18, 20).getTime());
  const saved = [];
  const conversation = new PersonalReminderConversation({now: () => now, store: {create: value => {saved.push(value); return value;}, deliveryStatus: () => ({})}});
  assert.equal(conversation.execute('六点提醒我开会').type, 'clarify');
  assert.equal(conversation.execute('明天下午六点').ok, true);
  assert.equal(saved[0].remindAt, new Date(2026, 8, 16, 18).getTime());
  const {ThreeStageCompanionProvider} = load('electron/three-stage-companion-provider.cjs');
  let capture = 0, model = 0;
  const provider = new ThreeStageCompanionProvider({announcementOnly: true, asrFactory: () => {capture++; throw Error('ASR must not open');}, modelFactory: () => {model++; throw Error('model must not open');}, ttsFactory: () => ({connect: async () => ({ok: true}), close(){}})});
  assert.equal((await provider.connect()).ok, true);
  assert.equal(capture, 0); assert.equal(model, 0); provider.close();
  const {CompanionConversationController} = load('electron/companion-conversation.cjs');
  const {SimulatedCompanionAudioSource, SimulatedCompanionAudioSink} = load('electron/companion-audio.cjs');
  const source = new SimulatedCompanionAudioSource();
  source.start = () => {throw Error('microphone must not open');};
  let emit;
  const controller = new CompanionConversationController({providerLabel: 'three-stage', audioSource: source, audioSink: new SimulatedCompanionAudioSink(), providerFactory: options => {
    assert.equal(options.announcementOnly, true); emit = options.onEvent;
    return {connect: async () => ({ok: true}), sayHello: () => true, close(){}};
  }});
  const completion = controller.start({initialAnnouncement: '提醒你开会。', closeAfterAnnouncement: true, waitForAnnouncement: true});
  await new Promise(resolve => setImmediate(resolve));
  emit({type: 'tts.start'}); emit({type: 'tts.end'});
  assert.equal((await completion).voice, false); await controller.eventChain;
  assert.equal(controller.snapshot().active, false);
  console.log('T52 final-ASAR behavioral probe passed: Chinese time, draft date completion, TTS-only factories, no microphone capture and no false empty-audio success.');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
