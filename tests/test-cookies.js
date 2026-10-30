// Cookie classifier + rotation plan tests.
const { test, assert, assertEqual, assertMatch, Shichinin } = require('./harness');
const C = Shichinin.CookieClassify;
const Pool = Shichinin.CookiePool;
const Rng = Shichinin.Rng;

function cookie(name, domain, value, extra) {
  return Object.assign({
    name, domain, value, path: '/', secure: true, httpOnly: false,
    session: false, expirationDate: 1999999999
  }, extra || {});
}

test('classifier: _ga is a tracker', () => {
  const r = C.classify(cookie('_ga', '.example.com', 'GA1.2.123456789.1600000000'));
  assertEqual(r.cls, 'tracker');
});

test('classifier: _fbp and doubleclick IDE are trackers', () => {
  assertEqual(C.classify(cookie('_fbp', '.shop.com', 'fb.1.1600000000.123456')).cls, 'tracker');
  assertEqual(C.classify(cookie('IDE', '.doubleclick.net', 'AHWqTUlho239847293847')).cls, 'tracker');
  assertEqual(C.classify(cookie('anything', '.ads.criteo.com', 'x'.repeat(30))).cls, 'tracker',
    'tracker domain alone should classify as tracker');
});

test('classifier: _uetsid is a tracker, not protected (known names checked first)', () => {
  assertEqual(C.classify(cookie('_uetsid', '.site.com', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).cls, 'tracker');
});

test('classifier: session/auth cookies are protected', () => {
  assertEqual(C.classify(cookie('PHPSESSID', '.site.com', 'abc123', { session: true })).cls, 'protected');
  assertEqual(C.classify(cookie('auth_token', '.site.com', 'tok123456789012345')).cls, 'protected');
  assertEqual(C.classify(cookie('connect.sid', '.site.com', 's%3Aabcdef')).cls, 'protected');
  assertEqual(C.classify(cookie('csrftoken', '.site.com', 'zz9x8y7w6v5u4t3s2r1q')).cls, 'protected');
  assertEqual(C.classify(cookie('some_random_name', '.site.com', 'v', { session: true })).cls, 'protected',
    'any session cookie (no expiry) is protected');
});

test('classifier: functional cookies are functional', () => {
  assertEqual(C.classify(cookie('cookieconsent', '.site.com', 'accepted')).cls, 'functional');
  assertEqual(C.classify(cookie('lang', '.site.com', 'en-US')).cls, 'functional');
  assertEqual(C.classify(cookie('theme', '.site.com', 'dark')).cls, 'functional');
});

test('classifier: unrecognized cookies are unknown / unknown-id', () => {
  assertEqual(C.classify(cookie('user_pref_v2', '.news.com', 'blue')).cls, 'unknown');
  assertEqual(
    C.classify(cookie('visitor_key', '.news.com', '0123456789abcdef0123456789abcdef')).cls,
    'unknown-id');
});

test('classifier: matomo session cookie errs toward protected', () => {
  // Documents the deliberate bias: a false "protected" costs noise, a false
  // mutation can cost a login.
  assertEqual(C.classify(cookie('_pk_ses.1.abcd', '.site.com', '1')).cls, 'protected');
});

test('plan (safe mode): rotates trackers only, never protected/functional/unknown-id', () => {
  const rng = Rng.create('plan-test');
  const jar = [
    cookie('_ga', '.example.com', 'GA1.2.111111111.1600000000'),
    cookie('_fbp', '.shop.com', 'fb.1.1600000000.123456789'),
    cookie('PHPSESSID', '.shop.com', 'sessvalue', { session: true }),
    cookie('cookieconsent', '.shop.com', 'accepted'),
    cookie('visitor_key', '.news.com', '0123456789abcdef0123456789abcdef'),
    cookie('auth_token', '.bank.com', 'toktoktoktoktoktok')
  ];
  const plan = Pool.buildRotationPlan(jar, { safeMode: true }, rng);
  const names = plan.map(p => p.cookie.name).sort();
  assertEqual(JSON.stringify(names), JSON.stringify(['_fbp', '_ga']));
  for (const item of plan) {
    assertEqual(item.action, 'cookie-rotate');
    assert(Shichinin.Actions.isAllowed(item.action), 'plan action must be allowlisted');
  }
  const ga = plan.filter(p => p.cookie.name === '_ga')[0];
  assertMatch(ga.newValue, /^GA1\.2\.\d+\.\d+$/, 'replacement keeps the GA value shape');
  assert(ga.newValue !== 'GA1.2.111111111.1600000000', 'replacement differs from original');
});

test('plan (safe mode OFF): unknown-id cookies become eligible', () => {
  const rng = Rng.create('plan-test-2');
  const jar = [cookie('visitor_key', '.news.com', '0123456789abcdef0123456789abcdef')];
  assertEqual(Pool.buildRotationPlan(jar, { safeMode: true }, rng).length, 0);
  assertEqual(Pool.buildRotationPlan(jar, { safeMode: false }, rng).length, 1);
});

test('plan: signed (JWT-shaped) tracker values are expired, not rotated', () => {
  const rng = Rng.create('plan-test-3');
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const jar = [cookie('adid', '.doubleclick.net', jwt)];
  const plan = Pool.buildRotationPlan(jar, { safeMode: true }, rng);
  assertEqual(plan.length, 1);
  assertEqual(plan[0].action, 'cookie-expire');
  assert(C.looksSigned(jwt), 'fixture should look signed');
});

test('replacement values preserve shape (uuid, hex, digits)', () => {
  const rng = Rng.create('shape-test');
  const uuid = C.generateReplacementValue(
    cookie('x', '.a.com', '123e4567-e89b-42d3-a456-426614174000'), rng);
  assertMatch(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'uuid shape');
  const hex = C.generateReplacementValue(cookie('x', '.a.com', 'DEADBEEF0123456789ABCDEF'), rng);
  assertMatch(hex, /^[0-9A-F]{24}$/, 'uppercase hex shape + length preserved');
  const digits = C.generateReplacementValue(cookie('x', '.a.com', '1234567890'), rng);
  assertMatch(digits, /^\d{10}$/, 'digit shape + length preserved');
});
