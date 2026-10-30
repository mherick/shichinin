// Persona generation, itinerary generation, provider fallback tests.
const { test, assert, assertEqual, assertRejects, Shichinin } = require('./harness');
const Local = Shichinin.LocalPersonaProvider;
const Spark = Shichinin.SparkPersonaProvider;
const Engine = Shichinin.PersonaEngine;

test('local personas: shape and cluster integrity', async () => {
  const personas = await Local.generatePersonas({ count: 4, seed: '2026-10-27' });
  assertEqual(personas.length, 4);
  for (const p of personas) {
    assert(p.displayName && p.displayName.length > 3, 'display name present');
    assert(p.clusterIds.length >= 2 && p.clusterIds.length <= 3,
      'persona has 2-3 clusters, got ' + p.clusterIds.length);
    assertEqual(p.clusterLabels.length, p.clusterIds.length);
    for (const id of p.clusterIds) {
      assert(Shichinin.ClusterById[id], 'cluster id exists: ' + id);
    }
  }
});

test('local personas: deterministic per seed, different across seeds', async () => {
  const a = await Local.generatePersonas({ count: 4, seed: '2026-10-27' });
  const b = await Local.generatePersonas({ count: 4, seed: '2026-10-27' });
  assertEqual(JSON.stringify(a), JSON.stringify(b), 'same seed -> same personas');
  const c = await Local.generatePersonas({ count: 4, seed: '2026-11-02' });
  assert(JSON.stringify(a) !== JSON.stringify(c), 'different seed -> different personas');
});

test('local personas: cluster variety across a week of seeds', async () => {
  const seen = new Set();
  for (let d = 1; d <= 7; d++) {
    const personas = await Local.generatePersonas({ count: 4, seed: '2026-10-' + String(20 + d) });
    personas.forEach(p => p.clusterIds.forEach(id => seen.add(id)));
  }
  assert(seen.size >= 12, 'expected >= 12 distinct clusters in a week, got ' + seen.size);
  assert(Shichinin.Clusters.length >= 12, 'cluster bank itself has >= 12 clusters');
});

test('itinerary: budget cap respected, all actions allowlisted', async () => {
  const personas = await Local.generatePersonas({ count: 1, seed: 'budget-test' });
  const steps = await Local.generateItinerary({
    persona: personas[0], dateKey: '2026-10-27', budget: 16, loggedInPollution: false
  });
  assert(steps.length >= 3 && steps.length <= 16,
    'steps within budget, got ' + steps.length);
  for (const s of steps) {
    assert(Shichinin.Actions.isAllowed(s.action), 'step action allowlisted: ' + s.action);
    assert(s.action === 'visit' || s.action === 'search', 'step is visit/search');
    if (s.action === 'visit') assert(/^https:\/\//.test(s.url), 'visit has https url');
    if (s.action === 'search') {
      assert(s.query && s.query.length > 3, 'search has a query');
      assert(s.engineHome && s.resultsPrefix, 'search has engine endpoints');
    }
    assert(s.dwellSec[0] >= 10 && s.dwellSec[1] <= 120 && s.dwellSec[0] < s.dwellSec[1],
      'dwell range sane: ' + JSON.stringify(s.dwellSec));
  }
});

test('itinerary: no single cluster monopolizes a persona day', async () => {
  const personas = await Local.generatePersonas({ count: 4, seed: 'balance-test' });
  for (const p of personas) {
    const steps = await Local.generateItinerary({
      persona: p, dateKey: '2026-10-27', budget: 20, loggedInPollution: false
    });
    const counts = {};
    steps.forEach(s => { counts[s.clusterId] = (counts[s.clusterId] || 0) + 1; });
    const maxShare = Math.max.apply(null, Object.values(counts)) / steps.length;
    assert(maxShare <= 0.75, 'max cluster share ' + maxShare.toFixed(2) + ' should be <= 0.75');
  }
});

test('engines: only account-free engines exist — no google, no bing, no logged-in set', () => {
  const ids = Local.ENGINES_ANON.map(e => e.id);
  assertEqual(JSON.stringify(ids), JSON.stringify(['duckduckgo', 'brave', 'startpage']),
    'decoy engines are exactly duckduckgo, brave, startpage');
  assert(!Local.ENGINES_ANON.some(e => e.id === 'google'), 'google is not a decoy engine');
  assert(!Local.ENGINES_ANON.some(e => e.id === 'bing'), 'bing is not a decoy engine');
  assertEqual(Local.ENGINES_LOGGED_IN, undefined, 'the logged-in engine set no longer exists');
});

test('spark provider: no key -> clear NO_KEY error', async () => {
  const spark = Spark.create({ getApiKey: () => Promise.resolve('') });
  await assertRejects(() => spark.generatePersonas({ count: 2, seed: 'x' }), 'no modelApiKey');
  let code = null;
  try { await spark.generatePersonas({ count: 2, seed: 'x' }); }
  catch (e) { code = e.code; }
  assertEqual(code, 'NO_KEY');
});

test('spark provider: request body targets Muse Spark chat completions', () => {
  const spark = Spark.create({ getApiKey: () => Promise.resolve('k') });
  const body = spark.buildRequestBody('personas', { count: 3 });
  assertEqual(body.model, 'muse-spark-1.3');
  assertEqual(Spark.MODEL, 'muse-spark-1.3');
  assertEqual(Spark.API_URL, 'https://api.meta.ai/v1/chat/completions');
  assertEqual(body.messages.length, 2);
  assert(body.messages[1].content.indexOf('3') !== -1, 'prompt carries the count');
});

test('spark provider: with a key, parses a well-formed NARRATIVE response', async () => {
  // v2 adaptation: Spark no longer returns personas in the v1 shape or
  // executable steps at all — it authors narratives (cluster pair from
  // clusters.js + query paraphrases + arc stages), schema-checked.
  const fakeFetch = () => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify({
        personas: [{
          displayName: 'Test — the tester', archetype: 'the tester',
          clusterIds: ['sourdough', 'marathon'],
          queryParaphrases: { sourdough: ['how often to feed my starter'], marathon: ['16 week marathon plan'] },
          arcStages: ['browse', 'compare', 'brand']
        }]
      }) } }]
    })
  });
  const spark = Spark.create({ getApiKey: () => Promise.resolve('test-key'), fetchImpl: fakeFetch });
  const personas = await spark.generatePersonas({ count: 1, seed: 's' });
  assertEqual(personas.length, 1);
  assertEqual(personas[0].displayName, 'Test — the tester');
  assertEqual(JSON.stringify(personas[0].clusterIds), JSON.stringify(['sourdough', 'marathon']));
  assert(personas[0].narrative && personas[0].narrative.queryParaphrases.sourdough.length === 1,
    'narrative paraphrases carried on the persona');
});

test('spark provider: model trying to return steps (incl. a click) is rejected by the design law', async () => {
  // v2 adaptation: the v1 test fed generateItinerary a click step. In v2
  // the model never authors steps — a response smuggling steps in is a
  // schema violation and is rejected before anything can execute.
  const fakeFetch = () => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify({
        steps: [{ action: 'click', url: 'https://ads.example.com/' }],
        personas: []
      }) } }]
    })
  });
  const spark = Spark.create({ getApiKey: () => Promise.resolve('test-key'), fetchImpl: fakeFetch });
  await assertRejects(
    () => spark.generatePersonas({ count: 1, seed: 's' }),
    'must not contain steps');
});

test('engine: falls back to local when spark has no key', async () => {
  const spark = Spark.create({ getApiKey: () => Promise.resolve('') });
  const engine = Engine.create({ local: Local, spark });
  const res = await engine.generatePersonas({ count: 2, seed: 'fallback-test' });
  assertEqual(res.providerUsed, 'local');
  assert(res.fallbackReason && res.fallbackReason.indexOf('no modelApiKey') !== -1,
    'fallback reason explains the missing key');
  assertEqual(res.personas.length, 2);
});
