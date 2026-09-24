// Package the exact previously adopted app, never a device dump or a new build.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = '57d30d3a0ea19e6a9bddc37a792973e85c20e7a9';
const build = path.join(root, 'firmware/easyinput-controller/build-t43-final-head-57d30d3');
const output = path.join(root, 'release-easyinput-t43a/package');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const appHash = '4b825c74e5daeec5f9c67a99d1860a25ef2b4d872713833ef68c5d1918028e56';
const partitionHash = '7c541b70dcac8f920c2d11589f06745e1b033fa9b95b8343de2748bb8312a278';
const description = JSON.parse(fs.readFileSync(path.join(build, 'project_description.json'), 'utf8'));
assert.equal(description.project_version, '57d30d3');
assert.equal(description.git_revision, 'v5.5.5');
assert.equal(description.target, 'esp32s3');
assert.equal(execFileSync('git', ['diff', source, 'HEAD', '--', 'firmware/easyinput-controller'], { cwd: root, encoding: 'utf8' }).trim(), '');
const app = fs.readFileSync(path.join(build, 'deskmate_easyinput_controller.bin'));
assert.equal(hash(app), appHash);
assert.equal(app.length, 880400);
assert.equal(app[0], 0xe9);
assert.equal(app.readUInt16LE(12), 9); // ESP32-S3 image chip ID.
assert.equal(app.readUInt32LE(32), 0xabcd5432);
const cstring = offset => app.subarray(offset, offset + 32).toString('utf8').split('\0')[0];
assert.equal(cstring(48), '57d30d3');
assert.equal(cstring(144), 'v5.5.5');
assert.equal(hash(fs.readFileSync(path.join(build, 'partition_table/partition-table.bin'))), partitionHash);
const ascii = app.toString('latin1');
assert(!/-----BEGIN [^-]*PRIVATE KEY-----|sk-[A-Za-z0-9]{24,}/.test(ascii), 'Possible credential in app');
// No raw build metadata, SDKCONFIG, NVS, logs or executable tooling is exported.
assert(!fs.existsSync(output), 'Output already exists; inspect it instead of silently overwriting');
fs.mkdirSync(output, { recursive: true });
const files = [];
function put(name, data) {
  const destination = path.join(output, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, data);
  files.push(name.replaceAll('\\', '/'));
}
put('deskmate_easyinput_controller.bin', app);
put('README.md', fs.readFileSync(path.join(root, 'docs/setup/easyinput-firmware-download.md')));
put('LICENSE.txt', fs.readFileSync(path.join(root, 'LICENSE')));
put('THIRD_PARTY_NOTICES.md', fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md')));
const idf = path.resolve(description.idf_path);
put('licenses/esp-idf/LICENSE', fs.readFileSync(path.join(idf, 'LICENSE')));
// Collect notices only from the actual build's components, not other projects.
for (const component of description.build_component_paths.filter(Boolean)) {
  const base = path.resolve(component);
  const relativeIdf = path.relative(idf, base);
  const managed = path.join(root, 'firmware/easyinput-controller/managed_components');
  const relativeManaged = path.relative(managed, base);
  const prefix = !relativeIdf.startsWith('..') && !path.isAbsolute(relativeIdf) ? `esp-idf/${relativeIdf}`
    : !relativeManaged.startsWith('..') && !path.isAbsolute(relativeManaged) ? `managed/${relativeManaged}` : null;
  if (!prefix) continue;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory() && !['.git', 'test', 'test_apps', 'examples', 'build'].includes(entry.name)) walk(filename);
      else if (entry.isFile() && /^(LICENSE|COPYING|NOTICE)([._-].*)?$/i.test(entry.name)) put(path.join('licenses', prefix, path.relative(base, filename)), fs.readFileSync(filename));
    }
  }
  walk(base);
}
put('manifest.json', JSON.stringify({ schema: 'deskmate-easyinput-community-v1', sourceCommit: source,
  board: 'EasyInput V2.0 / AI Keyboard V2.1', target: 'esp32s3', flashMB: 16, sdk: 'ESP-IDF v5.5.5',
  appVersion: '57d30d3', desktopVersion: '0.1.7', mode: 'app-only', offset: '0x10000',
  size: app.length, endInclusive: '0xE6F0F', eraseEndInclusive: '0xE6FFF', sha256: appHash,
  requiredPartitionSha256: partitionHash, partitionComparisonLength: '0xC00',
  deviceAccessThisRelease: false, fullFlashEraseAllowed: false, preserveNvs: true,
  knownHardwareEvidence: 'T43A 2026-09-14; see README for limits',
  credentialPatternScan: 'no matches; not a proof of absence of all possible sensitive strings'
}, null, 2) + '\n');
put('SHA256SUMS.txt', files.sort().map(name => `${hash(fs.readFileSync(path.join(output, name)))}  ${name}`).join('\n') + '\n');
console.log(JSON.stringify({ ok: true, appSha256: appHash, files: files.length, output }));
