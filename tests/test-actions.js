// Action allowlist (design law) + consent matcher + storage litter tests.
const fs = require('fs');
const path = require('path');
const { test, assert, assertEqual, Shichinin } = require('./harness');
const A = Shichinin.Actions;
const SRC = path.join(__dirname, '..', 'src');

test('allowlist: contains the sanctioned action vocabulary', () => {
  for (const a of ['visit', 'dwell', 'scroll', 'search', 'consent-accept',
    'cookie-rotate', 'cookie-expire', 'storage-seed']) {
    assert(A.isAllowed(a), a + ' should be allowed');
  }
});

test('allowlist: forbids clicks, purchases, signups, conversions', () => {
  for (const bad of ['click', 'ad-click', 'adclick', 'purchase', 'buy',
    'signup', 'sign-up', 'convert', 'conversion', 'checkout', 'submit',
    'form-submit', 'follow-link', '']) {
    assert(!A.isAllowed(bad), JSON.stringify(bad) + ' must NOT be allowed');
  }
});

test('allowlist: assertAllowed throws on forbidden actions', () => {
  let threw = 0;
  for (const bad of ['click', 'purchase', 'teleport']) {
    try { A.assertAllowed(bad); } catch (e) { threw++; }
  }
  assertEqual(threw, 3);
  assertEqual(A.assertAllowed('visit'), 'visit');
});

test('design law: content.js has exactly ONE raw element activation, in the sanctioned helper', () => {
  const src = fs.readFileSync(path.join(SRC, 'content.js'), 'utf8');
  const matches = src.match(/\.click\(/g) || [];
  assertEqual(matches.length, 1,
    'content.js must contain exactly one .click( occurrence (inside sanctionedClick)');
  assert(src.indexOf('function sanctionedClick') !== -1, 'sanctionedClick helper must exist');
});

test('design law: background.js performs no element activation at all', () => {
  const src = fs.readFileSync(path.join(SRC, 'background.js'), 'utf8');
  assertEqual((src.match(/\.click\(/g) || []).length, 0);
});

test('design law: no ad-network interaction strings in executors', () => {
  for (const f of ['background.js', 'content.js']) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const bad of ['googlesyndication', 'adclick', 'doubleclick.net', '/ads/']) {
      assert(src.indexOf(bad) === -1, f + ' must not reference ' + bad);
    }
  }
});

// ----- consent matcher ------------------------------------------------------

const Consent = Shichinin.Consent;
function cand(text, context, id, className) {
  return { text, context: context || '', id: id || '', className: className || '' };
}

test('consent: picks "Accept all" over "Reject all"', () => {
  const list = [
    cand('Reject all', 'cookie-banner'),
    cand('Accept all', 'cookie-banner'),
    cand('Manage preferences', 'cookie-banner')
  ];
  assertEqual(Consent.findAcceptCandidate(list), 1);
});

test('consent: weak phrases need a consent context', () => {
  assertEqual(Consent.findAcceptCandidate([cand('Got it', 'article-body')]), -1);
  assertEqual(Consent.findAcceptCandidate([cand('Got it', 'cookie-consent-dialog')]), 0);
  assertEqual(Consent.findAcceptCandidate([cand('OK', 'random-dialog')]), -1);
});

test('consent: reject/manage-only banners yield no candidate', () => {
  assertEqual(Consent.findAcceptCandidate([
    cand('Manage preferences', 'cookie-banner'),
    cand('Essential only', 'cookie-banner')
  ]), -1);
});

test('consent: "accept" bundled with manage/settings is excluded', () => {
  assertEqual(Consent.findAcceptCandidate([
    cand('Accept and manage settings', 'cookie-banner')
  ]), -1);
});

test('consent: known CMP button id wins even with plain text', () => {
  const list = [cand('Accept', '', 'onetrust-accept-btn-handler')];
  assertEqual(Consent.findAcceptCandidate(list), 0);
  assertEqual(Consent.scoreCandidate(list[0]), 100);
});

test('consent: foreign-language accept-all matches (strong phrase)', () => {
  assertEqual(Consent.findAcceptCandidate([cand('Alle akzeptieren', 'cookie-banner')]), 0);
  assertEqual(Consent.findAcceptCandidate([cand('Tout accepter', '')]), 0);
});

// ----- storage litter ---------------------------------------------------------

const Litter = Shichinin.StorageLitter;

test('litter: allowlist matches analytics keys only', () => {
  assert(Litter.matchKey('ajs_anonymous_id'), 'segment anon id should match');
  assert(Litter.matchKey('_ga'), 'ga key should match');
  assert(Litter.matchKey('optimizelyEndUserId'), 'optimizely should match');
  assertEqual(Litter.matchKey('auth_token'), null);
  assertEqual(Litter.matchKey('session_cart'), null);
  assertEqual(Litter.matchKey('user_profile'), null);
  assertEqual(Litter.matchKey('random_key'), null);
});

test('litter: seed values have plausible shapes', () => {
  const rng = Shichinin.Rng.create('litter-test');
  const seg = Litter.matchKey('ajs_anonymous_id');
  const v = Litter.generateSeedValue(seg, rng);
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v),
    'segment seed should be a uuid, got ' + v);
  const opt = Litter.matchKey('optimizelyEndUserId');
  assert(/^\d{16}$/.test(Litter.generateSeedValue(opt, rng)), 'optimizely seed should be 16 digits');
});
