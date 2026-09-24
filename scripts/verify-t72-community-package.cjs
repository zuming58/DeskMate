// Inspect only release inputs; never open the installed user's private profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const release = process.argv[2] || 'release-t72';
assert(/^release(?:-[a-z0-9-]+)?$/.test(release));
const resources = path.join(root, release, 'win-unpacked/resources');
const archive = path.join(resources, 'app.asar');
const extract = name => asar.extractFile(archive, path.normalize(name));
const files = asar.listPackage(archive).map(name => name.replaceAll('\\', '/'));
for (const name of files) {
  assert(!/\.(?:sqlite3?|db|pfx|pem|key)$/i.test(name), `private file type in package: ${name}`);
  assert(!/\/(?:recordings|maintenance-backups|user-data|knowledge-base)\//i.test(name), `private directory in package: ${name}`);
  assert(!/\/(?:companion-persona|knowledgeos-settings|xiaozhi-hardware-policy)\.json$/i.test(name), `saved profile in package: ${name}`);
}
let sourceFiles = 0;
function compareTree(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) compareTree(relative);
    else { assert(extract(relative).equals(fs.readFileSync(path.join(root, relative))), `package differs: ${relative}`); sourceFiles++; }
  }
}
compareTree('electron');
for (const [from, to] of [['LICENSE','LICENSE.txt'], ['THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md']]) {
  assert(fs.readFileSync(path.join(resources, to)).equals(fs.readFileSync(path.join(root, from))), `license differs: ${from}`);
}
for (const entry of fs.readdirSync(path.join(root, 'resources/licenses'))) {
  assert(fs.readFileSync(path.join(resources, 'licenses', entry)).equals(fs.readFileSync(path.join(root, 'resources/licenses', entry))), `third-party license differs: ${entry}`);
}
assert(fs.existsSync(path.join(resources, '..', 'LICENSES.chromium.html')));
const pkg = JSON.parse(extract('package.json'));
assert.equal(pkg.version, '0.1.7');
assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
assert.match(extract('electron/main.cjs').toString(), /t72-community-release/);
console.log(JSON.stringify({ ok: true, version: pkg.version, sourceFiles, noPrivateProfileInputs: true, licenseResources: true }));
