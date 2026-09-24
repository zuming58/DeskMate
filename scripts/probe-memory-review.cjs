// Synthetic profile, actual store + production renderer; all network denied.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const productRoot = process.env.DESKMATE_PROBE_ASAR || path.resolve(__dirname, '..');
const { CompanionMemoryStore } = require(path.join(productRoot, 'electron/companion-memory.cjs'));
const { MemoryCandidateReviewService } = require(path.join(productRoot, 'electron/memory-candidate-review.cjs'));
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-t70-ui-'));
app.setPath('userData', directory); app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const reportPath = path.join(app.getPath('temp'), 'deskmate-t70-ui-report.json');
let win, store;
const watchdog = setTimeout(() => { fs.writeFileSync(reportPath, JSON.stringify({ ok: false, reason: 'timeout' })); app.exit(2); }, 60000);
app.whenReady().then(async () => {
  const report = { ok: false, directory, productRoot, stage: 'setup', screenshots: [] };
  try {
    store = new CompanionMemoryStore({ userDataPath: directory });
    for (let i = 0; i < 30; i++) store.addCandidate({ day: '2099-01-01', kind: 'project', summary: `合成工作资料 ${i}：这里是很长的测试项目记录，用于验证小窗口换行，不代表真实用户数据。` });
    store.addCandidate({ day: '2099-01-01', kind: 'preference', summary: '合成偏好：喜欢简短回答' });
    store.appendTurn({ sessionId: 'synthetic', role: 'assistant', content: '合成助手回合', createdAt: '2099-01-01T01:00:00Z' });
    const review = new MemoryCandidateReviewService({ store, loadSecret: () => { throw Error('must not load credentials'); } });
    let modelRequests = 0;
    ipcMain.handle('probe:memory-review', (_event, { command, value }) => {
      if (command === 'status') return store.status();
      if (command === 'review') return store.candidateReview();
      if (command === 'list') return store.list(value);
      if (command === 'turns') return store.listTurns(value);
      if (command === 'batch') return store.reviewCandidateBatch(value);
      if (command === 'organize') { if (value?.useModel) { modelRequests++; return { ok: false, reason: 'fixture-no-network' }; } return review.organizeLocal(); }
    });
    win = new BrowserWindow({ show: false, width: 1440, height: 1024, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'probe-memory-review-preload.cjs') } });
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
    await until(`document.body.textContent.includes('候选箱')`); await click('候选箱');
    report.stage = 'local-classification';
    await until(`document.querySelector('.candidate-review')`); await click('本地分类');
    await until(`document.body.textContent.includes('工作资料 · 30')`);
    assert.equal(store.status().longTermMemories, 0);
    report.stage = 'consent';
    await click('模型归类（31）'); assert.equal(modelRequests, 0);
    assert(await js(`document.querySelector('.candidate-review__confirm').textContent.includes('发送给')`));
    await click('取消'); assert.equal(modelRequests, 0);
    await js(`document.querySelector('.candidate-review__group').open=true; document.querySelector('.candidate-review__item input').click(); true;`); await pause(150);
    report.stage = 'selection';
    await click('确认所选为长期记忆'); assert.equal(store.status().longTermMemories, 0);
    await click('确认操作'); await until(`document.body.textContent.includes('可选确认 · 0')`);
    assert.equal(store.status().longTermMemories, 1); assert.equal(store.status().pendingCandidates, 30);
    await click('工作资料 · 30');
    for (const [width, height] of [[1440, 1024], [1024, 768]]) {
      report.stage = `capture-${width}`;
      win.setSize(width, height); await pause(300);
      await js(`document.querySelector('.candidate-review').scrollIntoView({behavior:'instant',block:'start'}); document.querySelector('.candidate-review__group').open=true; document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();}); true;`); await pause(250);
      assert(await js(`document.documentElement.scrollWidth <= innerWidth + 1`), 'horizontal overflow');
      let capture;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await pause(1000); capture = await win.webContents.capturePage(); break; }
        catch (error) { if (attempt === 2) throw error; (report.captureRetries ||= []).push(String(error.message)); }
      }
      const file = path.join(directory, `memory-${width}.png`); fs.writeFileSync(file, capture.toPNG()); report.screenshots.push(file);
    }
    report.stage = 'original-records';
    await click('逐条纠正或删除'); await until(`document.body.textContent.includes('返回候选主题分组')`);
    assert(await js(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='纠正')`));
    await click('逐句记录'); await until(`document.body.textContent.includes('合成助手回合')`);
    assert.deepEqual(errors, []); report.ok = true; report.stage = 'complete'; report.modelRequests = modelRequests;
  } catch (error) { report.error = error.stack; }
  finally { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); clearTimeout(watchdog); store?.close(); win?.destroy(); app.exit(report.ok ? 0 : 1); }
});
