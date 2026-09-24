// Do not inherit a desktop-agent terminal's output pipes into Electron.
// The child uses an isolated synthetic profile and writes its own JSON report.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const [probe, release = 'release-t72'] = process.argv.slice(2);
assert(['probe-memory-curation.cjs', 'probe-release-runtime.cjs'].includes(probe));
assert(/^release(?:-[a-z0-9-]+)?$/.test(release));
const archive = path.join(root, release, 'win-unpacked/resources/app.asar');
assert(fs.existsSync(archive));
const child = spawn(require('electron'), [path.join(__dirname, probe)], {
  cwd: root, env: { ...process.env, DESKMATE_PROBE_ASAR: archive },
  detached: true, windowsHide: true, stdio: 'ignore',
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('spawn', () => console.log(JSON.stringify({ pid: child.pid, probe, release, started: true, passed: false })));
child.unref();
