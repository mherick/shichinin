// Validates manifest.json: parses, required MV3 fields present, and every
// referenced file exists on disk.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

let problems = [];
function check(cond, msg) { if (!cond) problems.push(msg); }

check(manifest.manifest_version === 3, 'manifest_version must be 3');
check(manifest.name === 'Shichinin', 'name must be Shichinin');
check(manifest.version === '0.5.1', 'version must be 0.5.1');
check(manifest.background && manifest.background.service_worker, 'background service worker declared');

const refs = [];
if (manifest.background) refs.push(manifest.background.service_worker);
if (manifest.action && manifest.action.default_popup) refs.push(manifest.action.default_popup);
if (manifest.options_page) refs.push(manifest.options_page);
for (const cs of manifest.content_scripts || []) {
  for (const js of cs.js || []) refs.push(js);
}
for (const ref of refs) {
  check(fs.existsSync(path.join(root, ref)), 'referenced file missing: ' + ref);
}

// Every html page's local script/link references should exist too.
for (const page of ['src/popup.html', 'src/dashboard.html']) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const ref = path.join(root, 'src', m[1]);
    check(fs.existsSync(ref), page + ' references missing file: ' + m[1]);
  }
}

const allowedPermissions = ['cookies', 'storage', 'alarms', 'tabs', 'idle'];
for (const p of manifest.permissions || []) {
  check(allowedPermissions.includes(p), 'unexpected permission: ' + p);
}
check(!(manifest.permissions || []).includes('history'),
  'history permission must NOT be requested');
check(!(manifest.permissions || []).includes('webRequest'),
  'webRequest permission must NOT be requested');

if (problems.length) {
  console.log('MANIFEST INVALID:');
  problems.forEach(p => console.log(' - ' + p));
  process.exit(1);
}
console.log('manifest.json valid: MV3, ' + refs.length + ' referenced files all present, ' +
  'permissions = [' + (manifest.permissions || []).join(', ') + ']');
