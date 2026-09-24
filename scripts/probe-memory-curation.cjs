// Synthetic profile, actual store + production renderer; all network denied.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const productRoot = process.env.DESKMATE_PROBE_ASAR || path.resolve(__dirname, '..');
const { CompanionMemoryStore } = require(path.join(productRoot, 'electron/companion-memory.cjs'));
const { MemoryCandidateReviewService } = require(path.join(productRoot, 'electron/memory-candidate-review.cjs'));
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-t71-ui-'));
app.setPath('userData', directory); app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const reportPath = path.join(app.getPath('temp'), 'deskmate-t71-ui-report.json');
let win, store;
const watchdog = setTimeout(() => { fs.writeFileSync(reportPath, JSON.stringify({ ok: false, reason: 'timeout' })); app.exit(2); }, 60000);
app.whenReady().then(async () => {
  const report = { ok: false, directory, productRoot, stage: 'setup', screenshots: [] };
  try {
    store = new CompanionMemoryStore({ userDataPath: directory });
    const { createKnowledgeOsSettings } = require(path.join(productRoot, 'electron/knowledgeos-settings.cjs'));
    const knowledgeSettings = createKnowledgeOsSettings({ userDataPath: directory });
    const { MemoryCurationService } = require(path.join(productRoot, 'electron/memory-curation.cjs'));
    const turn = store.appendTurn({ sessionId: 'fixture', role: 'user', content: '我希望回答简洁一些，这是我一直以来的习惯。' });
    store.addCandidate({ day: '2099-01-01', kind: 'preference', summary: '喜欢简洁回答', sourceTurnIds: [turn.id] });
    store.addCandidate({ day: '2099-01-01', kind: 'fact', summary: '需要核对的合成背景' });
    let modelRequests = 0;
    const service = new MemoryCurationService({ store, policyStore: { snapshot: () => ({ enabledSources: ['companion'] }) }, loadSecret: () => ({}),
      requestJson: async ({ messages }) => {
        modelRequests++; const input = JSON.parse(messages.at(-1).content);
        return input.proposed ? { decisions: input.proposed.map(g => ({ index:g.index, verdict:'supported', reason:'合成原话支持' })) } :
          { groups: input.items.map(item => ({ ids:[item.id], action:item.evidenceIds.length ? 'remember' : 'review', kind:item.kind, summary:item.content, reason:item.evidenceIds.length ? '明确原话' : '这条背景是你本人的吗？', certainty:'explicit', evidence:item.evidenceIds.length ? [{turnId:turn.id,quote:'我希望回答简洁一些，这是我一直以来的习惯。'}] : [] })) };
      } });
    ipcMain.handle('probe:memory-review', (_event, { command, value }) => {
      if (command === 'status') return store.status();
      if (command === 'curation') return { ...service.status(), questionsList:store.curationQuestions() };
      if (command === 'enable') return store.setCurationEnabled(value);
      if (command === 'run') return service.run({force:true,maxBatches:20});
      if (command === 'resolve') return store.resolveCurationQuestion(value);
      if (command === 'list') return store.list(value);
      if (command === 'turns') return store.listTurns(value);
      if (command === 'knowledge-status') return knowledgeSettings.status();
      if (command === 'knowledge-save') return knowledgeSettings.save(value);
    });
    win = new BrowserWindow({ show: false, width: 1440, height: 1024, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'probe-memory-curation-preload.cjs') } });
    win.webContents.session.setPermissionRequestHandler((_c, _p, done) => done(false));
    win.webContents.session.webRequest.onBeforeRequest((request, done) => done({ cancel: !/^(file|data|devtools):/.test(request.url) }));
    const errors = [];
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 3 && /ReferenceError|TypeError|Minified React/.test(message)) errors.push(message); });
    const js = code => win.webContents.executeJavaScript(code);
    const until = async code => { for (let i = 0; i < 100; i++) { if (await js(code)) return; await pause(100); } throw Error(`timeout: ${code}`); };
    const click = async label => { assert(await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}); if(!b||b.disabled)return false; b.click();return true;})()`), label); await pause(200); };
    const entry = path.join(productRoot, 'dist/client/index.html');
    assert(fs.existsSync(entry), 'built entry missing');
    report.stage = 'load';
    await win.loadFile(entry);
    await js("location.hash='#/memory'; true;");
    await until(`document.querySelector('.memory-curation')`);
    report.stage='optional-knowledgeos';
    const switchSelector = '[role="switch"][aria-label="启用 KnowledgeOS"]';
    assert.equal(await js(`document.querySelector(${JSON.stringify(switchSelector)}).getAttribute('aria-checked')`), 'false');
    assert(await js(`document.body.textContent.includes('本地长期保存 · KnowledgeOS 已关闭')`));
    assert.equal(await js(`document.body.textContent.includes('KnowledgeOS 写入状态')`), false);
    await js(`window.confirm=()=>false; document.querySelector(${JSON.stringify(switchSelector)}).click(); true;`);
    await pause(200); assert.equal(knowledgeSettings.status().syncEnabled, false);
    await js(`window.confirm=()=>true; document.querySelector(${JSON.stringify(switchSelector)}).click(); true;`);
    await until(`document.querySelector(${JSON.stringify(switchSelector)}).getAttribute('aria-checked')==='true'`);
    assert.equal(knowledgeSettings.status().readEnabled, true); assert.equal(knowledgeSettings.status().syncEnabled, true);
    await js(`document.querySelector(${JSON.stringify(switchSelector)}).click(); true;`);
    await until(`document.querySelector(${JSON.stringify(switchSelector)}).getAttribute('aria-checked')==='false'`);
    assert.equal(knowledgeSettings.status().readEnabled, false); assert.equal(knowledgeSettings.status().syncEnabled, false);
    report.knowledgeOsToggle = { defaultOff: true, cancelPreserved: true, enablePersisted: true, disablePersisted: true };
    report.stage='consent';
    await click('开启自动整理'); assert.equal(modelRequests,0);
    assert(await js(`document.querySelector('.candidate-review__confirm').textContent.includes('产生费用')`));
    await click('允许并开启'); await click('立即整理');
    await until(`document.querySelector('.memory-curation__question')`);
    assert.equal(store.curationStatus().questions,1); assert.equal(store.status().longTermMemories,1); assert.equal(modelRequests,2);
    for (const [width, height] of [[1440, 1024], [1024, 768]]) {
      report.stage = `capture-${width}`;
      win.setSize(width, height); await pause(300);
      await js(`document.querySelector('.candidate-review').scrollIntoView({behavior:'instant',block:'start'}); document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();}); true;`); await pause(250);
      assert(await js(`document.documentElement.scrollWidth <= innerWidth + 1`), 'horizontal overflow');
      let capture;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await pause(1000); capture = await win.webContents.capturePage(); break; }
        catch (error) { if (attempt === 2) throw error; (report.captureRetries ||= []).push(String(error.message)); }
      }
      const file = path.join(directory, `memory-${width}.png`); fs.writeFileSync(file, capture.toPNG()); report.screenshots.push(file);
    }
    report.stage='question-resolution';
    await click('不作为长期记忆'); assert.equal(store.curationStatus().questions,1);
    await click('确认'); await until(`document.body.textContent.includes('目前没有需要你核对的问题')`);
    assert.equal(store.curationStatus().questions,0);
    await click('长期记忆'); await until(`document.body.textContent.includes('查看整理来源')`);
    assert(await js(`document.body.textContent.includes('自动整理的长期记忆')`));
    await click('原始归档'); await until(`document.querySelectorAll('.memory-item-list article').length===2`);
    await click('暂停自动整理'); assert.equal(store.curationStatus().enabled,false);
    assert.deepEqual(errors, []); report.ok = true; report.stage = 'complete'; report.modelRequests = modelRequests;
  } catch (error) { report.error = error.stack; }
  finally { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); clearTimeout(watchdog); store?.close(); win?.destroy(); app.exit(report.ok ? 0 : 1); }
});
