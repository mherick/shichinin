// Household mode tests (v0.5.0): protective persona pools, the
// child-content blocklist, the child-mode level clamp, adult markers,
// arc-reuse rejection, and the frozen actions.js hash.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { test, assert, assertEqual, Shichinin } = require('./harness');
const Local = Shichinin.LocalPersonaProvider;
const Spark = Shichinin.SparkPersonaProvider;
const Engine = Shichinin.PersonaEngine;
const Sch = Shichinin.Scheduler;

test('household: settings default is adults; unknown values fall back to adults', () => {
  const Settings = Shichinin.Settings;
  assertEqual(Settings.DEFAULTS.household, 'adults', 'DEFAULTS.household is adults');
  assertEqual(Settings.merge({}).household, 'adults', 'merge defaults to adults');
  assertEqual(Settings.merge({ household: 'child' }).household, 'child', 'child survives merge');
  assertEqual(Settings.merge({ household: 'bogus' }).household, 'adults',
    'unrecognized household falls back to the protective default');
  assertEqual(JSON.stringify(Settings.HOUSEHOLD_MODES), JSON.stringify(['adults', 'child', 'mixed']));
});

test('household: adults and child modes yield 100% adult personas (60 samples each)', async () => {
  for (const mode of ['adults', 'child']) {
    let sampled = 0;
    for (let s = 0; s < 6; s++) {
      const personas = await Local.generatePersonas({
        count: 10, seed: 'household-' + mode + '-' + s, household: mode
      });
      for (const p of personas) {
        sampled++;
        assert(p.adult === true, mode + ': persona carries the adult marker');
        assert(Local.AGE_BANDS.indexOf(p.ageBand) !== -1,
          mode + ': ageBand is an adult band, got ' + p.ageBand);
        for (const id of p.clusterIds) {
          assert(Shichinin.clusterAllowedForHousehold(id, mode),
            mode + ': cluster allowed in protective mode: ' + id);
        }
      }
    }
    assert(sampled >= 50, mode + ': sampled >= 50 personas, got ' + sampled);
  }
});

test('household: adult-life cluster always rotates in protective modes', async () => {
  for (const mode of ['adults', 'child']) {
    for (let s = 0; s < 5; s++) {
      const personas = await Local.generatePersonas({
        count: 4, seed: 'adultlife-' + mode + '-' + s, household: mode
      });
      assert(personas[0].clusterIds.indexOf('adultlife') !== -1,
        mode + ': persona 0 leads with the adult-life cluster (seed ' + s + ')');
    }
  }
});

test('household: pool scan — no blocklisted term reachable in protective modes', () => {
  for (const mode of ['adults', 'child']) {
    const pool = Shichinin.householdClusters(mode);
    assert(pool.length >= 12, mode + ': protective pool still has breadth, got ' + pool.length);
    assert(!pool.some(c => c.id === 'newparent'), mode + ': parenting cluster is out of the pool');
    const texts = [];
    pool.forEach(c => {
      texts.push(c.label, c.archetype);
      (c.sites || []).forEach(s => texts.push(typeof s === 'string' ? s : s.url));
      (c.queries || []).forEach(q => texts.push(q));
    });
    // Canary clusters feed protective-mode itineraries too.
    Shichinin.Canaries.CANARIES.forEach(c => {
      texts.push(c.label, c.archetype);
      c.sites.forEach(s => texts.push(s.url));
      c.queries.forEach(q => texts.push(q));
    });
    for (const t of texts) {
      assert(!Shichinin.isChildContent(t),
        mode + ': no blocklisted term in protective pool text: ' + JSON.stringify(t));
    }
  }
  // Mixed mode keeps the full bank, parenting cluster included.
  const mixed = Shichinin.householdClusters('mixed');
  assert(mixed.some(c => c.id === 'newparent'), 'mixed: parenting cluster still available');
  assertEqual(mixed.length, Shichinin.Clusters.length, 'mixed: full cluster bank');
});

test('household: protective itinerary emits no child content, even for a tainted persona', async () => {
  // A persona carrying the parenting cluster (e.g. an arc authored
  // before Household mode) must produce zero steps from that cluster
  // and zero blocklisted queries/URLs in a protective mode.
  const tainted = {
    id: 'persona-tainted', displayName: 'T — test', archetype: 'test',
    clusterIds: ['newparent', 'sourdough'], clusterLabels: ['x', 'y'],
    canaryId: null, scheduleWindows: [8, 12, 16, 20], adult: true, ageBand: '35-44'
  };
  for (const mode of ['adults', 'child']) {
    const steps = await Local.generateItinerary({
      persona: tainted, dateKey: '2026-10-30', budget: 16, household: mode
    });
    assert(steps.length > 0, mode + ': the clean cluster still produces steps');
    for (const s of steps) {
      assert(s.clusterId !== 'newparent', mode + ': no steps from the blocked cluster');
      if (s.action === 'search') {
        assert(!Shichinin.isChildContent(s.query), mode + ': clean query: ' + s.query);
        assert(['duckduckgo', 'brave', 'startpage'].indexOf(s.engine) !== -1,
          mode + ': search engine is account-free: ' + s.engine);
      }
      if (s.action === 'visit') {
        assert(!Shichinin.isChildContent(s.url), mode + ': clean url: ' + s.url);
      }
    }
  }
});

test('household: child mode clamps the effective level to High', () => {
  assertEqual(Sch.effectiveLevelName({ household: 'child', aggressiveness: 'low' }), 'high',
    'child + Light stored -> High effective');
  assertEqual(Sch.effectiveLevelName({ household: 'child', aggressiveness: 'medium' }), 'high',
    'child + Standard stored -> High effective');
  assertEqual(Sch.effectiveLevel({ household: 'child', aggressiveness: 'low' }).dailyVisitBudget,
    Sch.levelConfig('high').dailyVisitBudget, 'child mode gets the High daily budget');
  assertEqual(Sch.effectiveLevel({ household: 'child', aggressiveness: 'low' }).personas,
    Sch.levelConfig('high').personas, 'child mode gets the High persona count');
  assertEqual(Sch.effectiveLevelName({ household: 'adults', aggressiveness: 'low' }), 'low',
    'adults mode honors the stored level');
  assertEqual(Sch.effectiveLevelName({ household: 'mixed', aggressiveness: 'medium' }), 'medium',
    'mixed mode honors the stored level');
  assertEqual(Sch.effectiveLevelName({}), 'high', 'no settings -> high (default)');
});

test('household: engine rejects a live arc that violates the mode', async () => {
  const spark = Spark.create({ getApiKey: () => Promise.resolve('') });
  const engine = Engine.create({ local: Local, spark });
  const taintedArc = {
    arcStartKey: '2026-10-29', providerUsed: 'local', fallbackReason: null,
    personas: [{
      id: 'persona-old-0', displayName: 'Old — test', archetype: 'test',
      clusterIds: ['newparent', 'sourdough'], clusterLabels: ['x', 'y'],
      canaryId: null, scheduleWindows: [8, 12, 16, 20], visitedUrls: []
      // note: no adult marker, no ageBand — an older build's persona
    }]
  };
  const prot = await engine.generatePersonas({
    count: 1, dateKey: '2026-10-30', arcState: taintedArc, household: 'adults'
  });
  assert(!prot.arcReused, 'protective mode does NOT reuse a violating arc');
  assert(prot.personas.every(p => p.adult === true && p.ageBand),
    'fresh arc personas carry adult markers');
  assert(prot.personas.every(p => p.clusterIds.indexOf('newparent') === -1),
    'fresh arc has no parenting cluster');

  const mixed = await engine.generatePersonas({
    count: 1, dateKey: '2026-10-30', arcState: taintedArc, household: 'mixed'
  });
  assert(mixed.arcReused, 'mixed mode still reuses the same arc (v0.4.0 behavior)');
});

test('household: spark narrative choosing the parenting cluster falls back to local', async () => {
  const fakeFetch = () => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify({
        personas: [{
          displayName: 'Spark — test', archetype: 'the tester',
          clusterIds: ['newparent', 'sourdough'],
          queryParaphrases: {}, arcStages: ['browse']
        }]
      }) } }]
    })
  });
  const spark = Spark.create({ getApiKey: () => Promise.resolve('k'), fetchImpl: fakeFetch });
  const engine = Engine.create({ local: Local, spark });
  const res = await engine.generatePersonas({ count: 1, seed: 'hh-spark', household: 'adults' });
  assertEqual(res.providerUsed, 'local', 'violating spark narrative falls back to local');
  assert(res.personas.every(p => p.adult === true), 'fallback personas are adult');
  assert(res.personas.every(p => p.clusterIds.indexOf('newparent') === -1),
    'fallback personas avoid the parenting cluster');
});

test('design law: actions.js matches its pinned sha256 (frozen allowlist; v0.5.1 change is the name only)', () => {
  const file = path.join(__dirname, '..', 'src', 'lib', 'actions.js');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assertEqual(hash, '67a9f83d7130fb09e0608273828ffaadafadaf95cbd5ffe6fd0c88c9f39a4ffd',
    'actions.js sha256 matches the pinned v0.5.1 value');
});
