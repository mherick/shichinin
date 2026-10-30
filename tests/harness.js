// Shichinin test harness: loads the extension's lib files the same way
// the browser does (ordered classic scripts sharing one global), then
// runs registered tests. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LIB_DIR = path.join(__dirname, '..', 'src', 'lib');
const LIB_ORDER = [
  'rng.js', 'actions.js', 'clusters.js', 'canary.js', 'scheduler.js', 'settings.js',
  'cookies-classify.js', 'cookies-pool.js', 'consent.js', 'storage-litter.js',
  'personas-local.js', 'personas-spark.js', 'persona-engine.js', 'evidence.js'
];
for (const f of LIB_ORDER) {
  vm.runInThisContext(fs.readFileSync(path.join(LIB_DIR, f), 'utf8'), { filename: f });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function assert(cond, msg) {
  if (!cond) throw new Error('assert failed: ' + (msg || '(no message)'));
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'assertEqual') + ' — expected ' +
      JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}
function assertMatch(str, re, msg) {
  if (!re.test(String(str))) {
    throw new Error((msg || 'assertMatch') + ' — ' + JSON.stringify(str) + ' does not match ' + re);
  }
}
async function assertRejects(fn, msgPart, msg) {
  try { await fn(); } catch (e) {
    if (msgPart && String(e.message || e).indexOf(msgPart) === -1) {
      throw new Error((msg || 'assertRejects') + ' — rejected with unexpected message: ' + (e.message || e));
    }
    return;
  }
  throw new Error((msg || 'assertRejects') + ' — expected a rejection but it resolved');
}

async function run() {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log('PASS  ' + t.name);
    } catch (e) {
      failed++;
      console.log('FAIL  ' + t.name + '\n      ' + (e && e.message ? e.message : e));
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + tests.length + ' total');
  if (failed) process.exitCode = 1;
}

module.exports = { test, assert, assertEqual, assertMatch, assertRejects, run, Shichinin: global.Shichinin };
