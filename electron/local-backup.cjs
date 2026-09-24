const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { LocalHistoryStore } = require('./local-history-store.cjs');
const { CompanionMemoryStore } = require('./companion-memory.cjs');
const { validateState: validatePrompts, PromptWorkbenchStore } = require('./prompt-workbench.cjs');
const { validateMemoryPolicy, DEFAULT_MEMORY_POLICY } = require('./companion-memory-policy.cjs');
const { validateCompanionPreferences, COMPANION_PREFERENCES_DEFAULT } = require('./companion-preferences.cjs');
const { validatePersona, PERSONA_DEFAULTS } = require('./companion-persona.cjs');
const { validatePolicy: validateMotionPolicy, DEFAULT_MOTION_AUTOMATION_POLICY } = require('./motion-automation.cjs');
const { validateXiaozhiHardwarePolicy, DEFAULT_XIAOZHI_HARDWARE_POLICY } = require('./xiaozhi-hardware-policy.cjs');
const { ChoreographyStore, validateChoreography, DEFAULT_MOTION_SETTINGS, MAX_CHOREOGRAPHIES } = require('./choreography-store.cjs');
const { validateReminderState } = require('./personal-reminders.cjs');
const MAX_BUNDLE = 256 * 1024 * 1024;
const MEMORY_TABLES = ['conversation_turns','daily_summaries','memory_candidates','companion_memory_outbox','companion_memory_meta','memory_digest_runs','memory_workday_state','memory_hourly_summaries','memory_daily_journals','memory_journal_outbox','memory_curation_items'];
const FIXED_FILES = ['voice-history.sqlite3','companion-memory.sqlite3','prompt-workbench-v1.json','companion-memory-policy.json','companion-preferences.json','companion-persona.json','personal-reminders.json','restored-ui-state.json','motion-automation-policy.json','xiaozhi-hardware-policy.json','choreographies.json'];
const EMPTY_REMINDERS = {version:1,revision:0,items:[]};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value);
const fail = code => { throw new Error(`backup-${code}`); };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const ACTIONS = new Set(['voice-input','voice-edit','select-all','copy','paste','undo','hotkey','fixed-text','open-app','companion-call','prompt-key-4','prompt-key-5','prompt-key-6','prompt-key-7','disabled','scroll-axis-toggle','text-caret-select','enter','backspace']);
const boundedText = (value,max) => typeof value === 'string' && value.length <= max;
function writeAtomic(file, bytes) {
  const temp = `${file}.tmp`;
  const fd = fs.openSync(temp,'w');
  try { fs.writeFileSync(fd,bytes);fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp,file);
}
function boundedRead(file, max = MAX_BUNDLE) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) fail('file-invalid-or-too-large');
  return fs.readFileSync(file);
}
function readJson(file, fallback) {
  if (!fs.existsSync(file)) return structuredClone(fallback);
  return JSON.parse(boundedRead(file, 40 * 1024 * 1024));
}
function select(value, keys) { return Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key,value[key]])); }
function safeBinding(raw) {
  if (!object(raw) || !ACTIONS.has(raw.action)) fail('keymap-invalid');
  for(const [key,max] of Object.entries({shortcut:64,text:960,appName:120})) if(raw[key] !== undefined && !boundedText(raw[key],max)) fail('keymap-invalid');
  if(raw.appActionId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw.appActionId))fail('keymap-invalid');
  // Application registry IDs are nonportable references, not executable paths.
  return select(raw,['action','shortcut','text','appActionId','appName']);
}
function safeConfig(raw, restore = false) {
  if (!object(raw) || raw.schemaVersion !== 15 || !object(raw.settings) || !object(raw.vocabulary)) fail('config-invalid');
  const settings = select(raw.settings, ['formatting','customOrganizerRule','floating','operation','startupSound','voiceShortcut','globalShortcutsEnabled','boardF22Enabled','rightAltEnabled','outputMode','activeWindowOutputEnabled','keyDiagnosticsEnabled','sttMode','companionName','companionWakePhrase','companionEndSmoothWindowMs','companionIdleTimeoutMs','companionConversationVolume','companionCodexBriefVolume','companionWakeEnabled']);
  for(const [key,values] of Object.entries({formatting:['raw','smart','custom'],operation:['toggle','hold'],outputMode:['history','clipboard'],sttMode:['unconfigured','mock','http','bailian']})) if(settings[key]!==undefined && !values.includes(settings[key]))fail('settings-invalid');
  for(const key of ['floating','startupSound','globalShortcutsEnabled','boardF22Enabled','rightAltEnabled','activeWindowOutputEnabled','keyDiagnosticsEnabled','companionWakeEnabled'])if(settings[key]!==undefined && typeof settings[key]!=='boolean')fail('settings-invalid');
  for(const [key,max] of Object.entries({customOrganizerRule:4000,voiceShortcut:64,companionName:32,companionWakePhrase:64}))if(settings[key]!==undefined && !boundedText(settings[key],max))fail('settings-invalid');
  validateCompanionPreferences({...COMPANION_PREFERENCES_DEFAULT,...Object.fromEntries(Object.entries({name:'companionName',wakePhrase:'companionWakePhrase',endSmoothWindowMs:'companionEndSmoothWindowMs',idleTimeoutMs:'companionIdleTimeoutMs',conversationVolume:'companionConversationVolume',codexBriefVolume:'companionCodexBriefVolume'}).filter(([,key])=>settings[key]!==undefined).map(([key,source])=>[key,settings[source]]))});
  if (!Array.isArray(raw.vocabulary.hotwords) || !Array.isArray(raw.vocabulary.rules) || raw.vocabulary.hotwords.length > 10000 || raw.vocabulary.rules.length > 10000) fail('vocabulary-invalid');
  const vocabulary = { hotwords: raw.vocabulary.hotwords.map(word => { if (!boundedText(word,1000)) fail('vocabulary-invalid');return word; }), rules: raw.vocabulary.rules.map(rule => { if (!object(rule) || !boundedText(rule.from,1000) || !boundedText(rule.to,1000) || (rule.id!==undefined && !boundedText(rule.id,200))) fail('vocabulary-invalid');return select(rule,['id','from','to']); }) };
  if (!Array.isArray(raw.keymap) || raw.keymap.length !== 8 || !object(raw.encoder)) fail('keymap-invalid');
  const config = { schemaVersion:15, keyboardLayoutVersion:1, settings, vocabulary, keymap:raw.keymap.map(safeBinding), encoder:{...select(raw.encoder,['mode','axis','speed','reverseVertical','reverseHorizontal']),press:safeBinding(raw.encoder.press)}, history:[] };
  // Persist unsynchronized local intent as well as the last device readback.
  for(const index of [0,1,2,3,7]) if(raw.keyboardPending?.keymap?.[`KEY${index+1}`]) config.keymap[index]=safeBinding(raw.keyboardPending.keymap[`KEY${index+1}`]);
  if(raw.keyboardPending?.encoder) { const pending=raw.keyboardPending.encoder;Object.assign(config.encoder,select(pending,['mode','axis','speed','reverseVertical','reverseHorizontal']));if(pending.press)config.encoder.press=safeBinding(pending.press); }
  const faces=new Set(['default','sleep','listen','think','focus','happy','sad','alert']);
  for(const key of ['expressionMapping','agentExpressionMapping']) if(raw[key]!==undefined){if(!object(raw[key]) || Object.keys(raw[key]).length>20 || Object.values(raw[key]).some(v=>!faces.has(v)))fail('expression-invalid');config[key]={...raw[key]};}
  if(raw.currentExpression!==undefined){if(!faces.has(raw.currentExpression))fail('expression-invalid');config.currentExpression=raw.currentExpression;}
  if(raw.agentControl!==undefined){const c=raw.agentControl;if(!object(c)||!['codex','claude','hermes','workbody','custom'].includes(c.agentId)||!boundedText(c.customName||'',48)||typeof c.automaticStatusEnabled!=='boolean')fail('agent-control-invalid');config.agentControl={agentId:c.agentId,customName:c.customName||'',automaticStatusEnabled:c.automaticStatusEnabled,state:'idle'};}
  if(!['scroll','cursor'].includes(config.encoder.mode) || !['vertical','horizontal'].includes(config.encoder.axis) || !Number.isInteger(config.encoder.speed) || config.encoder.speed<1 || config.encoder.speed>5 || ['reverseVertical','reverseHorizontal'].some(k=>typeof config.encoder[k]!=='boolean'))fail('encoder-invalid');
  if (Buffer.byteLength(json(config)) > 2 * 1024 * 1024) fail('config-too-large');
  if (restore) {
    const disableApp = value => value.action === 'open-app' ? {action:'disabled'} : value;
    config.keymap = config.keymap.map(disableApp); config.encoder.press = disableApp(config.encoder.press);
    Object.assign(config.settings,{microphoneId:'',microphoneSource:'computer',sttEndpoint:'',sttMode:'unconfigured',globalShortcutsEnabled:false,rightAltEnabled:false,companionWakeEnabled:false});
    config.keyboardPending = {keymap:Object.fromEntries([0,1,2,3,7].map(i=>[`KEY${i+1}`,config.keymap[i]])),encoder:config.encoder};
  }
  return config;
}
function readTables(file, tables) {
  const db = new DatabaseSync(file,{readOnly:true});
  try {
    db.exec('PRAGMA trusted_schema=OFF; BEGIN');
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') fail('database-corrupt');
    let size=0;
    const result = Object.fromEntries(tables.map(table => {
      const rows=[];
      for(const row of db.prepare(`SELECT * FROM ${table}`).iterate()) {
        size+=Buffer.byteLength(json(row));
        if(rows.length>=100000 || size>MAX_BUNDLE)fail('bundle-too-large');
        rows.push(row);
      }
      return [table,rows];
    }));
    db.exec('COMMIT'); return result;
  } finally { db.close(); }
}
function safeChoreography(value = {version:4,actions:[],defaultDanceName:'',motionSettings:DEFAULT_MOTION_SETTINGS}) {
  if(!object(value) || value.version!==4 || !Array.isArray(value.actions) || value.actions.length>MAX_CHOREOGRAPHIES)fail('choreography-invalid');
  const actions=value.actions.map(validateChoreography);
  if(new Set(actions.map(a=>a.name)).size!==actions.length || (value.defaultDanceName!=='' && !actions.some(a=>a.name===value.defaultDanceName)))fail('choreography-invalid');
  return {version:4,actions,defaultDanceName:value.defaultDanceName,motionSettings:ChoreographyStore.prototype.validateMotionSettings(value.motionSettings)};
}
function buildBundle(root, config, includeAudio = false) {
  const history = readTables(path.join(root,'voice-history.sqlite3'),['history','audio','metadata']);
  if (!history.metadata.some(row=>row.key==='legacy-complete' && row.value==='1')) fail('migration-incomplete');
  const memory = readTables(path.join(root,'companion-memory.sqlite3'),MEMORY_TABLES);
  const prompts = validatePrompts(readJson(path.join(root,'prompt-workbench-v1.json'), new PromptWorkbenchStore().snapshot()));
  const reminders = validateReminderState(readJson(path.join(root,'personal-reminders.json'),EMPTY_REMINDERS));
  const policies = {
    memory:validateMemoryPolicy(readJson(path.join(root,'companion-memory-policy.json'),DEFAULT_MEMORY_POLICY),{allowRuntime:true}),
    companion:validateCompanionPreferences(readJson(path.join(root,'companion-preferences.json'),COMPANION_PREFERENCES_DEFAULT)),
    persona:validatePersona(readJson(path.join(root,'companion-persona.json'),PERSONA_DEFAULTS)),
    motion:validateMotionPolicy(readJson(path.join(root,'motion-automation-policy.json'),DEFAULT_MOTION_AUTOMATION_POLICY)),
    hardware:validateXiaozhiHardwarePolicy(readJson(path.join(root,'xiaozhi-hardware-policy.json'),DEFAULT_XIAOZHI_HARDWARE_POLICY)),
    choreography:safeChoreography(readJson(path.join(root,'choreographies.json'),undefined))
  };
  const data = {config:safeConfig(config),prompts,reminders,policies,history,memory,audio:[],includeAudio:Boolean(includeAudio)};
  let size = Buffer.byteLength(json(data));
  if (includeAudio) for(const entry of history.audio) {
    if (!/^[a-f0-9]{64}$/.test(entry.digest)) fail('audio-digest-invalid');
    const bytes = boundedRead(path.join(root,'voice-recordings',`${entry.digest}.audio`),64*1024*1024);
    if (bytes.length !== entry.size || sha(bytes) !== entry.digest) fail('audio-integrity');
    size += Math.ceil(bytes.length * 4 / 3) + 300;
    if (size > MAX_BUNDLE - 1024) fail('bundle-too-large');
    data.audio.push({id:entry.id,digest:entry.digest,base64:bytes.toString('base64')});
  }
  const bundle = {format:'deskmate.local-backup',version:1,createdAt:new Date().toISOString(),data,digest:sha(json(data))};
  if (Buffer.byteLength(json(bundle)) > MAX_BUNDLE) fail('bundle-too-large');
  validateBundle(bundle);
  return bundle;
}
function validateBundle(bundle) {
  if (!object(bundle) || bundle.format !== 'deskmate.local-backup' || bundle.version !== 1 || !object(bundle.data) || sha(json(bundle.data)) !== bundle.digest) fail('integrity-or-version');
  if(Buffer.byteLength(json(bundle))>MAX_BUNDLE)fail('bundle-too-large');
  if(typeof bundle.createdAt!=='string' || !Number.isFinite(Date.parse(bundle.createdAt)) || new Date(bundle.createdAt).toISOString()!==bundle.createdAt)fail('date-invalid');
  const d = bundle.data;
  safeConfig(d.config); validatePrompts(d.prompts);
  if (!object(d.history) || !object(d.memory) || !object(d.policies) || !Array.isArray(d.audio) || typeof d.includeAudio !== 'boolean') fail('schema-invalid');
  const memoryNames = Object.keys(d.memory).sort().join();
  if (Object.keys(d.history).sort().join() !== ['audio','history','metadata'].join() || ![[...MEMORY_TABLES].sort().join(), MEMORY_TABLES.filter(name=>name!=='memory_curation_items').sort().join()].includes(memoryNames)) fail('tables-invalid');
  if (d.audio.length > 100000 || (!d.includeAudio && d.audio.length)) fail('audio-invalid');
  for(const table of [...Object.values(d.history),...Object.values(d.memory)]) if (!Array.isArray(table) || table.length > 100000) fail('rows-invalid');
  validateMemoryPolicy(d.policies.memory,{allowRuntime:true});validateCompanionPreferences(d.policies.companion);validatePersona(d.policies.persona);
  if(d.policies.motion)validateMotionPolicy(d.policies.motion);
  if(d.policies.hardware)validateXiaozhiHardwarePolicy(d.policies.hardware);
  if(d.policies.choreography)safeChoreography(d.policies.choreography);
  const audioIds=new Set();
  for(const entry of d.history.audio) {
    if(!object(entry) || !boundedText(entry.id,200) || !entry.id || audioIds.has(entry.id) || !/^[a-f0-9]{64}$/.test(entry.digest) || !Number.isInteger(entry.size) || entry.size<1 || entry.size>64*1024*1024 || !boundedText(entry.mime,100))fail('audio-metadata-invalid');
    audioIds.add(entry.id);
  }
  for(const row of d.history.history) {
    if(!object(row) || typeof row.payload!=='string' || Buffer.byteLength(row.payload)>1024*1024 || sha(row.payload)!==row.digest)fail('history-integrity');
    const value=JSON.parse(row.payload);
    if(!object(value) || String(value.id)!==row.id || !boundedText(row.id,200) || typeof value.text!=='string' || typeof value.time!=='string' || (value.audioId ?? null)!==row.audio_id || (row.audio_id!==null && !audioIds.has(row.audio_id)) || !['record','recording','memory','unknown'].includes(row.date_source) || (row.created_at!==null && (!Number.isSafeInteger(row.created_at) || row.created_at<=0 || row.created_at>8640000000000000)))fail('history-integrity');
  }
  for(const [name,rows] of Object.entries(d.memory)) for(const row of rows) {
    if(!object(row))fail('memory-row-invalid');
    for(const [key,value] of Object.entries(row)) {
      if(typeof value==='string' && Buffer.byteLength(value)>1024*1024)fail('memory-row-too-large');
      if(typeof value==='number' && !Number.isSafeInteger(value))fail('memory-number-invalid');
      if(key.endsWith('_json') || key==='source_turn_ids') {
        const parsed=JSON.parse(value);
        if(key==='source_turn_ids' ? !Array.isArray(parsed) || parsed.some(v=>typeof v!=='string') : !object(parsed))fail('memory-json-invalid');
      }
    }
  }
  const reminders = validateReminderState(d.reminders === undefined ? EMPTY_REMINDERS : d.reminders);
  return {...d,reminders,memory:{...d.memory,memory_curation_items:d.memory.memory_curation_items || []}};
}
function loadRows(db, tables) {
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const [name,rows] of Object.entries(tables)) {
      // Names originate from a strict allowlist validated above, not SQL in the bundle.
      const cols = db.prepare(`PRAGMA table_info(${name})`).all().map(row=>row.name);
      db.exec(`DELETE FROM ${name}`);
      const insert = db.prepare(`INSERT INTO ${name} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);
      for(const row of rows) {
        if (!object(row) || Object.keys(row).sort().join() !== [...cols].sort().join() || Object.values(row).some(v=>v!==null && !['string','number'].includes(typeof v))) fail('row-schema-invalid');
        insert.run(...cols.map(col=>row[col]));
      }
    }
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
function prepareRestore(root, bundle) {
  const d = validateBundle(bundle), id = randomUUID();
  const recovery = path.join(root,'recovery'); fs.mkdirSync(recovery,{recursive:true});
  const stage = path.join(recovery,`staged-${id}`);fs.mkdirSync(stage);
  const history = new LocalHistoryStore({userDataPath:stage});
  let memory;
  try {
    memory = new CompanionMemoryStore({userDataPath:stage});
    const rows = structuredClone(d.history);
    if (!d.includeAudio) {
      rows.audio=[];
      for(const row of rows.history) {
        const value=JSON.parse(row.payload); if(value.audioId){value.recordingUnavailable=true;delete value.audioId;}
        row.payload=json(value);row.digest=sha(row.payload);row.audio_id=null;
      }
    }
    rows.metadata=[{key:'legacy-complete',value:'1'}];
    loadRows(history.db,rows);
    const expected = new Map(rows.audio.map(row=>[String(row.id),row]));
    const supplied=new Set();
    for(const item of d.audio) {
      const entry=expected.get(String(item.id));
      if (!entry || supplied.has(String(item.id)) || item.digest!==entry.digest || typeof item.base64!=='string' || item.base64.length>Math.ceil(64*1024*1024/3)*4) fail('audio-manifest-invalid');
      const bytes=Buffer.from(item.base64,'base64');
      if(bytes.toString('base64')!==item.base64 || bytes.length!==entry.size || sha(bytes)!==entry.digest)fail('audio-integrity');
      history.putAudio({id:entry.id,bytes,mime:entry.mime,createdAt:entry.created_at});supplied.add(String(item.id));
    }
    if(supplied.size!==expected.size)fail('audio-missing');
    for(const row of rows.history) {
      const value=JSON.parse(row.payload);
      if(sha(row.payload)!==row.digest || String(value.id)!==row.id || (row.audio_id && !expected.has(row.audio_id)))fail('history-integrity');
    }
    loadRows(memory.db,d.memory);
    // Restoring records is not consent to send them to this machine's provider.
    memory.setCurationMeta('enabled',0);
    memory.setCurationMeta('consentRevision',memory.curationMeta('consentRevision')+1);
    // Keep source dates and honest pending/accepted receipts; hold only restored days.
    const importedDays=new Set([...d.memory.memory_daily_journals.map(row=>row.day),...d.memory.conversation_turns.map(row=>row.workday_day)]);
    for(const day of importedDays) if(day) memory.db.prepare('INSERT OR REPLACE INTO companion_memory_meta VALUES(?,1)').run(`restore-hold:${day}`);
    memory.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');history.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {history.close();memory?.close();}
  const prompts=validatePrompts(d.prompts);
  for(const scene of prompts.scenes)for(const key of [5,6,7])if(scene.bindings[key].type==='app')scene.bindings[key]={type:'disabled',label:'应用待重新选择',value:''};
  const ui={id,pending:true,config:safeConfig(d.config,true)};
  const files = {
    'prompt-workbench-v1.json':prompts,
    'companion-memory-policy.json':{...d.policies.memory,schedule:'manual',hourlyEnabled:false},
    'companion-preferences.json':{...d.policies.companion,wakeEnabled:false},
    'companion-persona.json':d.policies.persona,
    'personal-reminders.json':d.reminders,
    'motion-automation-policy.json':{...(d.policies.motion || DEFAULT_MOTION_AUTOMATION_POLICY),enabled:false,idleEnabled:false},
    'xiaozhi-hardware-policy.json':d.policies.hardware || DEFAULT_XIAOZHI_HARDWARE_POLICY,
    'choreographies.json':{...safeChoreography(d.policies.choreography),defaultDanceName:''},
    'restored-ui-state.json':ui
  };
  for(const [name,value] of Object.entries(files))writeAtomic(path.join(stage,name),json(value));
  const names=[...FIXED_FILES,...new Set(d.audio.map(a=>`voice-recordings/${a.digest}.audio`))];
  const manifest=names.map(name=>({name,digest:sha(boundedRead(path.join(stage,name)))}));
  writeAtomic(path.join(stage,'manifest.json'),json({id,manifest}));
  return {id,summary:{createdAt:bundle.createdAt,history:d.history.history.length,recordings:d.includeAudio?d.audio.length:0,turns:d.memory.conversation_turns.length,memories:d.memory.memory_candidates.length,journals:d.memory.memory_daily_journals.length,reminders:d.reminders.items.length,prompts:d.prompts.personal.length,scenes:d.prompts.scenes.length,includesAudio:d.includeAudio},expiresAt:Date.now()+10*60*1000};
}
function allowedTarget(name) {return FIXED_FILES.includes(name) || /^(?:voice-history|companion-memory)\.sqlite3-(?:wal|shm)$/.test(name) || /^voice-recordings\/[a-f0-9]{64}\.audio$/.test(name);}
function checkedTarget(root,name) {
  if(!allowedTarget(name))fail('target-invalid');
  let current=path.resolve(root);
  for(const part of name.split('/')) {current=path.join(current,part);if(fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())fail('target-link-invalid');}
  return current;
}
function validateId(id){if(!/^[a-f0-9-]{36}$/.test(id))fail('token-invalid');return id;}
function validateStage(root,id) {
  validateId(id);
  const stage=path.join(root,'recovery',`staged-${id}`), {manifest}=readJson(path.join(stage,'manifest.json'));
  if(!Array.isArray(manifest) || manifest.length>100010 || new Set(manifest.map(e=>e.name)).size!==manifest.length || manifest.some(e=>!allowedTarget(e.name) || /-(wal|shm)$/.test(e.name)) || FIXED_FILES.some(name=>!manifest.some(e=>e.name===name)))fail('manifest-invalid');
  for(const e of manifest){checkedTarget(root,e.name);if(sha(boundedRead(checkedTarget(stage,e.name)))!==e.digest)fail('staged-integrity');}
  return manifest;
}
function queueRestore(root,id,{supersedeInterrupted=false}={}){
  validateStage(root,id);const recovery=path.join(root,'recovery');
  if(fs.existsSync(path.join(recovery,'job.json'))) {
    const prior=readJson(path.join(recovery,'job.json'));
    if(['queued','applying'].includes(prior.phase)) {
      if(!supersedeInterrupted)fail('restore-already-queued');
      // Only the startup recovery confirmation can supersede a failed job.
      // Its journal and all original stage/rollback files remain available.
      writeAtomic(path.join(recovery,`interrupted-job-${id}.json`),json(prior));
    }
  }
  writeAtomic(path.join(recovery,'job.json'),json({id,phase:'queued'}));return {ok:true,restartRequired:true};
}
function applyQueuedRestore(root,{afterWrite}={}) {
  const recovery=path.join(root,'recovery'), jobFile=path.join(recovery,'job.json');
  if(!fs.existsSync(jobFile))return {ok:true,applied:false};
  const job=readJson(jobFile);validateId(job.id);
  if(!['queued','applying'].includes(job.phase))return {ok:true,applied:false};
  const stage=path.join(recovery,`staged-${job.id}`), previous=path.join(recovery,`previous-${job.id}`);
  const rollback=()=>{
    const entries=readJson(path.join(previous,'manifest.json'));
    if(!Array.isArray(entries) || entries.length>100014 || new Set(entries.map(e=>e.name)).size!==entries.length || entries.some(e=>!allowedTarget(e.name) || typeof e.exists!=='boolean') || FIXED_FILES.some(name=>!entries.some(e=>e.name===name)))fail('rollback-manifest-invalid');
    // Verify ALL copies before touching any target.
    for(const e of entries){checkedTarget(root,e.name);if(e.exists && sha(boundedRead(checkedTarget(previous,e.name)))!==e.digest)fail('rollback-integrity');}
    for(const e of entries){const target=checkedTarget(root,e.name);if(e.exists)writeAtomic(target,boundedRead(checkedTarget(previous,e.name)));else if(fs.existsSync(target))fs.unlinkSync(target);}
    writeAtomic(jobFile,json({...job,phase:'rolled-back'}));
  };
  if(job.phase==='applying'){rollback();return {ok:true,rolledBack:true};}
  const manifest=validateStage(root,job.id);
  fs.mkdirSync(previous,{recursive:true});
  const previousManifest=[];
  const names=[...manifest.map(e=>e.name),'voice-history.sqlite3-wal','voice-history.sqlite3-shm','companion-memory.sqlite3-wal','companion-memory.sqlite3-shm'];
  for(const name of names){const target=path.join(root,name),saved=path.join(previous,name);fs.mkdirSync(path.dirname(saved),{recursive:true});if(fs.existsSync(target)){const bytes=boundedRead(target);writeAtomic(saved,bytes);previousManifest.push({name,exists:true,digest:sha(bytes)});}else previousManifest.push({name,exists:false});}
  writeAtomic(path.join(previous,'manifest.json'),json(previousManifest));
  writeAtomic(jobFile,json({...job,phase:'applying'}));
  try {
    for(const name of names.filter(n=>/-(wal|shm)$/.test(n))){const target=path.join(root,name);if(fs.existsSync(target))fs.unlinkSync(target);}
    for(const entry of manifest){const target=path.join(root,entry.name);fs.mkdirSync(path.dirname(target),{recursive:true});writeAtomic(target,boundedRead(path.join(stage,entry.name)));afterWrite?.(entry.name);}
    writeAtomic(jobFile,json({...job,phase:'committed'}));return {ok:true,applied:true,id:job.id};
  } catch(error){rollback();return {ok:false,rolledBack:true,reason:'backup-restore-rolled-back'};}
}
module.exports={MAX_BUNDLE,MEMORY_TABLES,FIXED_FILES,sha,json,safeConfig,buildBundle,validateBundle,prepareRestore,queueRestore,applyQueuedRestore,boundedRead,readJson,writeAtomic};
