// Wonder v2 tests: persona arcs, session scheduling, session-scoped
// cookies, signed-in-search removal (v0.4.0), tagScore weighting, Spark
// narrative schema, canary budget/emissions, Evidence Lab diff + canary
// matching.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, assert, assertEqual, assertRejects, Shichinin } = require('./harness');
const Local = Shichinin.LocalPersonaProvider;
const Spark = Shichinin.SparkPersonaProvider;
const Engine = Shichinin.PersonaEngine;
const Sch = Shichinin.Scheduler;
const Settings = Shichinin.Settings;
const Pool = Shichinin.CookiePool;
const Rng = Shichinin.Rng;
const Canaries = Shichinin.Canaries;
const Evidence = Shichinin.Evidence;

function cookie(name, domain, value, extra) {
  return Object.assign({
    name, domain, value, path: '/', secure: true, httpOnly: false,
    session: false, expirationDate: 1999999999
  }, extra || {});
}

// ----- persona arcs ---------------------------------------------------------

test('arcs: stageForDay progresses browse -> compare -> brand over 7 days', () => {
  assertEqual(Local.stageForDay(0), 'browse');
  assertEqual(Local.stageForDay(2), 'browse');
  assertEqual(Local.stageForDay(3), 'compare');
  assertEqual(Local.stageForDay(4), 'compare');
  assertEqual(Local.stageForDay(5), 'brand');
  assertEqual(Local.stageForDay(6), 'brand');
});

test('arcs: personas keep the same 2 clusters for 7 days, then a fresh arc starts', async () => {
  const spark = Spark.create({ getApiKey: () => Promise.resolve('') });
  const engine = Engine.create({ local: Local, spark });
  const day0 = await engine.generatePersonas({ count: 2, dateKey: '2026-10-29', arcState: null });
  assertEqual(day0.arcState.arcStartKey, '2026-10-29');
  assertEqual(day0.personas[0].arcStage, 'browse');
  assertEqual(day0.personas[0].clusterIds.length, 2, 'arc persona has exactly 2 clusters');

  const day3 = await engine.generatePersonas({ count: 2, dateKey: '2026-11-01', arcState: day0.arcState });
  assert(day3.arcReused, 'day 3 reuses the live arc');
  assertEqual(JSON.stringify(day3.personas[0].clusterIds), JSON.stringify(day0.personas[0].clusterIds),
    'same clusters on day 3');
  assertEqual(day3.personas[0].arcStage, 'compare', 'stage advanced to compare on day 3');
  assertEqual(day3.personas[0].arcDayIndex, 3);

  const day7 = await engine.generatePersonas({ count: 2, dateKey: '2026-11-05', arcState: day0.arcState });
  assert(!day7.arcReused, 'day 7 starts a fresh arc');
  assertEqual(day7.arcState.arcStartKey, '2026-11-05');
  assertEqual(day7.personas[0].arcStage, 'browse');
});

test('arcs: visited URLs persist into arc state (tomorrow\'s revisit pool)', async () => {
  const personas = await Local.generatePersonas({ count: 1, seed: 'arc-visited' });
  const steps = await Local.generateItinerary({
    persona: personas[0], dateKey: '2026-10-29', budget: 12, liveFire: false
  });
  const state = { arcStartKey: '2026-10-29', personas: [Object.assign({}, personas[0], { visitedUrls: [] })] };
  const updated = Engine.updateVisitedUrls(state, personas[0].id, steps);
  const stored = Engine.personaState(updated, personas[0].id);
  assert(stored.visitedUrls.length >= 2, 'visit urls recorded, got ' + stored.visitedUrls.length);
  assert(stored.visitedUrls.every(u => /^https:\/\//.test(u)), 'recorded entries are urls');
  const again = Engine.updateVisitedUrls(updated, personas[0].id, steps);
  assertEqual(Engine.personaState(again, personas[0].id).visitedUrls.length, stored.visitedUrls.length,
    're-recording the same steps dedups');
});

test('sessions: itinerary is built as 3-4 sessions, each opening with a search and going deeper', async () => {
  const personas = await Local.generatePersonas({ count: 1, seed: 'session-shape' });
  const steps = await Local.generateItinerary({
    persona: personas[0], dateKey: '2026-10-29', budget: 16, liveFire: false
  });
  const bySession = {};
  steps.forEach(st => { (bySession[st.sessionIndex] = bySession[st.sessionIndex] || []).push(st); });
  const idx = Object.keys(bySession).map(Number).sort((a, b) => a - b);
  assert(idx.length >= 3 && idx.length <= 4, 'expected 3-4 sessions, got ' + idx.length);
  for (const i of idx) {
    const sess = bySession[i];
    assertEqual(sess[0].action, 'search', 'session ' + i + ' opens with a search');
    assert(sess.filter(x => x.action === 'visit').length >= 2,
      'session ' + i + ' has a visit and a deeper visit');
  }
});

test('sessions: planSessions bursts each session inside 35 min at persona-consistent hours', async () => {
  const personas = await Local.generatePersonas({ count: 1, seed: 'session-sched' });
  const persona = personas[0];
  const mk = async dk => {
    const steps = await Local.generateItinerary({ persona, dateKey: dk, budget: 16, liveFire: false });
    const byId = {}; byId[persona.id] = persona;
    return Sch.planSessions(steps, dk, Rng.create('ps:' + dk), Sch.levelConfig('high'), [7, 23], byId);
  };
  const dayA = await mk('2026-10-29');
  const dayB = await mk('2026-10-30');
  for (const planned of [dayA, dayB]) {
    const bySession = {};
    planned.forEach(st => { (bySession[st.sessionId] = bySession[st.sessionId] || []).push(st); });
    const ids = Object.keys(bySession);
    assert(ids.length >= 3 && ids.length <= 4, 'planned session count 3-4, got ' + ids.length);
    for (const id of ids) {
      const times = bySession[id].map(x => x.scheduledAt);
      const span = Math.max.apply(null, times) - Math.min.apply(null, times);
      assert(span <= Sch.SESSION_MAX_MINUTES * 60 * 1000,
        'session span ' + Math.round(span / 60000) + 'min within 35min');
      assert(bySession[id].every(x => x.status === 'pending'), 'steps pending');
    }
  }
  const startHour = planned => {
    const first = planned.filter(x => x.sessionIndex === 0)
      .reduce((a, b) => (a.scheduledAt < b.scheduledAt ? a : b));
    return new Date(first.scheduledAt).getHours();
  };
  assertEqual(startHour(dayA), persona.scheduleWindows[0], 'day A session 0 at the persona window hour');
  assertEqual(startHour(dayB), persona.scheduleWindows[0], 'day B session 0 at the SAME hour (persona-consistent)');
});

test('revisit: first session revisits yesterday\'s site when a pool exists', async () => {
  const personas = await Local.generatePersonas({ count: 1, seed: 'revisit-test' });
  const yday = 'https://www.kingarthurbaking.com/recipes';
  const steps = await Local.generateItinerary({
    persona: personas[0], dateKey: '2026-10-30', budget: 16, liveFire: false,
    yesterdayUrls: ['https://example.com/older', yday]
  });
  const revisit = steps.filter(st => st.revisit);
  assertEqual(revisit.length, 1, 'exactly one revisit step');
  assertEqual(revisit[0].url, yday, 'revisit targets the most recent yesterday url');
  assertEqual(revisit[0].sessionIndex, 0, 'revisit lives in the first session');
});

test('brand stage: searches carry the cluster brand prefix', async () => {
  const personas = await Local.generatePersonas({ count: 1, seed: 'brand-test' });
  const steps = await Local.generateItinerary({
    persona: personas[0], dateKey: '2026-11-03', budget: 16, liveFire: false, arcStage: 'brand'
  });
  const searches = steps.filter(st => st.action === 'search' && !st.canary);
  assert(searches.length >= 2, 'has brand-stage searches');
  const brands = ['king arthur baking', "runner's world", 'babylist', 'bogleheads',
    'family handyman', "gardener's supply", 'dpreview', 'insideevs', "tom's hardware",
    'the points guy', 'byrdie', 'board game geek', 'sky and telescope', 'akc',
    'hodinkee', 'outside magazine'];
  for (const st of searches) {
    assert(brands.some(b => st.query.indexOf(b + ' ') === 0),
      'brand-stage query is prefixed: ' + st.query);
  }
});

// ----- session-scoped cookies -------------------------------------------------

test('cookie sessions: rotate once before the session, freeze during it, new persona rotates again', () => {
  Pool.resetSessionState();
  const jar = [
    cookie('_ga', '.example.com', 'GA1.2.111111111.1600000000'),
    cookie('PHPSESSID', '.shop.com', 'sessvalue', { session: true })
  ];
  const first = Pool.prepareSession(jar, { safeMode: true }, Rng.create('cs1'), 'persona-A', '2026-10-29');
  assertEqual(first.alreadyPrepared, false);
  assertEqual(first.plan.length, 1, 'one tracker planned; the session cookie is never in a plan');
  assertEqual(first.plan[0].cookie.name, '_ga');
  assert(Pool.isFrozenFor('persona-A', '2026-10-29'), 'identity frozen for persona A today');
  assertEqual(Pool.freeze().personaId, 'persona-A');

  const during = Pool.prepareSession(jar, { safeMode: true }, Rng.create('cs2'), 'persona-A', '2026-10-29');
  assertEqual(during.alreadyPrepared, true, 'same persona, same day: no re-rotation mid-session');
  assertEqual(during.plan.length, 0);

  const other = Pool.prepareSession(jar, { safeMode: true }, Rng.create('cs3'), 'persona-B', '2026-10-29');
  assertEqual(other.alreadyPrepared, false, 'a different persona prepares a fresh identity');
  assertEqual(other.plan.length, 1);

  const nextDay = Pool.prepareSession(jar, { safeMode: true }, Rng.create('cs4'), 'persona-B', '2026-10-30');
  assertEqual(nextDay.alreadyPrepared, false, 'a new day prepares again');
  Pool.resetSessionState();
});

// ----- signed-in search: permanently removed (v0.4.0) ----------------------------

test('signed-in search removed: google can never be enabled, legacy flags are inert', async () => {
  const merged = Settings.merge({});
  assertEqual(merged.liveFireUntil, 0, 'liveFireUntil still defaults to 0 (legacy field)');
  assert(!Sch.canUseGoogleSearch(merged, 1000), 'google gated off by default');

  // Settings carried over from an older install — a future liveFireUntil
  // and the legacy logged-in toggle — must NOT reopen the gate.
  const legacy = Settings.merge({ loggedInPollution: true, liveFireUntil: Date.now() + 60 * 60 * 1000 });
  assert(!Sch.canUseGoogleSearch(legacy, Date.now()), 'legacy flags no longer enable google');
  assert(!Sch.canUseGoogleSearch(null, Date.now()), 'gate closed even without settings');

  assertEqual(Settings.armLiveFire, undefined, 'armLiveFire helper removed');
  assertEqual(Settings.disarmLiveFire, undefined, 'disarmLiveFire helper removed');
  assertEqual(Sch.isLiveFireActive, undefined, 'isLiveFireActive removed');
  assertEqual(Sch.liveFireRemainingMs, undefined, 'liveFireRemainingMs removed');

  // Even when a caller passes the old opt-in flags, itineraries only
  // ever use the account-free engines.
  const personas = await Local.generatePersonas({ count: 1, seed: 'no-google' });
  const steps = await Local.generateItinerary({
    persona: personas[0], dateKey: '2026-10-30', budget: 16,
    liveFire: true, loggedInPollution: true
  });
  const enginesUsed = [...new Set(steps.filter(s => s.action === 'search').map(s => s.engine))];
  assert(enginesUsed.length > 0, 'itinerary still contains searches');
  for (const e of enginesUsed) {
    assert(['duckduckgo', 'brave', 'startpage'].includes(e), 'search engine is account-free: ' + e);
  }
});

// ----- tag weighting --------------------------------------------------------------

test('tagScore: every cluster site carries a curated score and revisit flag', () => {
  for (const c of Shichinin.Clusters) {
    assert(c.sites.length >= 4, c.id + ' has at least 4 sites (reddit destinations removed in v0.4.0)');
    for (const s of c.sites) {
      assert(typeof s === 'object' && s.url && /^https:\/\//.test(s.url), c.id + ' site is an entry object');
      assert(s.tagScore >= 1 && s.tagScore <= 3, c.id + ' tagScore in 1..3, got ' + s.tagScore);
      assert(typeof s.revisit === 'boolean', c.id + ' revisit flag present');
    }
  }
});

test('tagScore: weighted picking favors heavily-tagged publishers', () => {
  const fake = {
    sites: [
      { url: 'https://low.example/', tagScore: 1, revisit: false },
      { url: 'https://high.example/', tagScore: 3, revisit: true }
    ]
  };
  const rng = Rng.create('tag-weight');
  let low = 0, high = 0;
  for (let i = 0; i < 600; i++) {
    const pick = Local.pickSiteWeighted(fake, rng);
    if (pick.url.indexOf('low') !== -1) low++; else high++;
  }
  assert(high > low * 1.5, 'tagScore-3 site picked much more often (high ' + high + ' vs low ' + low + ')');
});

// ----- Spark as arc author ----------------------------------------------------------

test('spark narrative schema: a valid narrative passes and keeps its cluster pair', () => {
  const spark = Spark.create({ getApiKey: () => Promise.resolve('k') });
  const out = spark.validateNarrative({
    personas: [{
      displayName: 'Nia — the tester', archetype: 'the tester',
      clusterIds: ['gardening', 'astronomy'],
      queryParaphrases: { gardening: ['raised bed soil mix for fall garlic'] },
      arcStages: ['browse', 'brand']
    }]
  });
  assertEqual(out.length, 1);
  assertEqual(JSON.stringify(out[0].clusterIds), JSON.stringify(['gardening', 'astronomy']));
  assertEqual(out[0].clusterLabels.length, 2);
  assertEqual(out[0].queryParaphrases.gardening[0], 'raised bed soil mix for fall garlic');
});

test('spark narrative schema: unknown clusters and wrong pair sizes are rejected', () => {
  const spark = Spark.create({ getApiKey: () => Promise.resolve('k') });
  const bad = [
    { personas: [{ clusterIds: ['sourdough', 'not-a-cluster'] }] },
    { personas: [{ clusterIds: ['sourdough'] }] },
    { personas: [{ clusterIds: ['sourdough', 'marathon', 'ev'] }] },
    { personas: [{ clusterIds: ['sourdough', 'marathon'], queryParaphrases: { ev: ['x'] } }] },
    { personas: [{ clusterIds: ['sourdough', 'marathon'], arcStages: ['browse', 'teleport'] }] },
    { personas: [{ clusterIds: ['sourdough', 'marathon'], queryParaphrases: { sourdough: [] } }] }
  ];
  for (const b of bad) {
    let threw = false;
    try { spark.validateNarrative(b); } catch (e) { threw = true; }
    assert(threw, 'schema violation rejected: ' + JSON.stringify(b).slice(0, 60));
  }
  let msg = '';
  try { spark.validateNarrative(bad[0]); } catch (e) { msg = e.message; }
  assert(msg.indexOf('unknown cluster') !== -1, 'unknown cluster called out by name');
});

test('spark itinerary: steps are built locally from the narrative paraphrases', async () => {
  const spark = Spark.create({ getApiKey: () => Promise.resolve('k') });
  const persona = {
    id: 'persona-spark-test', clusterIds: ['sourdough', 'marathon'],
    narrative: {
      queryParaphrases: {
        sourdough: ['my paraphrased starter question'],
        marathon: ['my paraphrased marathon question']
      },
      arcStages: ['browse', 'compare', 'brand']
    }
  };
  const steps = await spark.generateItinerary({
    persona, dateKey: '2026-10-29', budget: 12, liveFire: false
  });
  assert(steps.length >= 3, 'steps built');
  for (const st of steps) {
    assert(Shichinin.Actions.isAllowed(st.action), 'step allowlisted');
    if (st.action === 'search') {
      assert(['my paraphrased starter question', 'my paraphrased marathon question']
        .indexOf(st.query) !== -1, 'search query comes from the narrative: ' + st.query);
    }
    if (st.action === 'visit') {
      assert(Shichinin.ClusterById[st.clusterId] || st.canary,
        'visit cluster is a curated cluster');
    }
  }
  await assertRejects(
    () => spark.generateItinerary({ persona: { id: 'p', clusterIds: ['sourdough', 'marathon'] }, dateKey: 'd', budget: 4 }),
    'no narrative on persona');
});

// ----- canaries ------------------------------------------------------------------------

test('canaries: four planted interests, cluster-shaped, absent from the baseline', () => {
  assertEqual(Canaries.CANARIES.length, 4);
  const baselineText = [].concat(
    Evidence.BASELINE.googleTopics, Evidence.BASELINE.googleBrands, Evidence.BASELINE.metaTopics
  ).join(' ').toLowerCase();
  for (const c of Canaries.CANARIES) {
    assertEqual(c.canary, true, c.id + ' marked canary');
    assert(c.sites.length >= 4, c.id + ' has at least 4 sites (reddit destinations removed in v0.4.0)');
    assertEqual(c.queries.length, 8, c.id + ' has 8 queries');
    assert(!Shichinin.ClusterById[c.id], c.id + ' is not a regular cluster');
    assert(c.synonyms.length >= 3, c.id + ' has synonyms for Evidence Lab matching');
    for (const syn of c.synonyms) {
      assert(baselineText.indexOf(syn) === -1,
        'canary synonym "' + syn + '" must be absent from the baseline');
    }
  }
});

test('canaries: about 15% of a persona budget is canary emissions', async () => {
  const personas = await Local.generatePersonas({ count: 4, seed: 'canary-share' });
  assert(personas.every(p => p.canaryId), 'every persona has an assigned canary');
  const steps = await Local.generateItinerary({
    persona: personas[0], dateKey: '2026-10-29', budget: 40, liveFire: false
  });
  const canarySteps = steps.filter(st => st.canary);
  const share = canarySteps.length / steps.length;
  assert(share >= 0.08 && share <= 0.25, 'canary share ~15%, got ' + share.toFixed(2));
  assert(canarySteps.every(st => st.canaryId === personas[0].canaryId), 'emissions use the assigned canary');
  assert(canarySteps.every(st => Shichinin.Actions.isAllowed(st.action)), 'canary steps allowlisted');
});

test('canaries: emissions are logged with timestamps via the store', async () => {
  const mem = {};
  global.chrome = {
    storage: {
      local: {
        get: keys => {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach(k => {
            if (mem[k] !== undefined) out[k] = mem[k];
          });
          return Promise.resolve(out);
        },
        set: obj => { Object.assign(mem, obj); return Promise.resolve(); }
      }
    }
  };
  vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'store.js'), 'utf8'),
    { filename: 'store.js' });
  const Store = Shichinin.Store;
  await Store.logCanaryEmission({
    canaryId: 'canary-axolotl', personaId: 'p1', action: 'search',
    query: 'axolotl breeding setup tank', ts: 1793200000000
  });
  await Store.logCanaryEmission({
    canaryId: 'canary-axolotl', personaId: 'p1', action: 'visit',
    url: 'https://www.thesprucepets.com/axolotl-care-1238356', ts: 1793200060000
  });
  const list = await Store.getCanaryEmissions();
  assertEqual(list.length, 2);
  assertEqual(list[0].ts, 1793200000000, 'timestamp recorded');
  assertEqual(list[0].query, 'axolotl breeding setup tank');
  assertEqual(list[1].url, 'https://www.thesprucepets.com/axolotl-care-1238356');
});

// ----- Evidence Lab ----------------------------------------------------------------------

test('evidence: free-text snapshots parse on newlines, commas and middle dots', () => {
  assertEqual(JSON.stringify(Evidence.parseSnapshotText('A, B\nC · D; E')),
    JSON.stringify(['A', 'B', 'C', 'D', 'E']));
});

test('evidence: diff vs the Oct 28 baseline separates retained, added and removed', () => {
  const snap = {
    googleTopics: Evidence.BASELINE.googleTopics.slice(1).concat(['Underwater Basket Weaving']),
    googleBrands: Evidence.BASELINE.googleBrands.concat(['Chewy']),
    metaTopics: Evidence.BASELINE.metaTopics.slice(),
    metaActivity: Evidence.BASELINE.metaActivity.slice(),
    daaStatus: Evidence.BASELINE.daaStatus
  };
  const diff = Evidence.diffSnapshot(snap);
  assertEqual(diff.googleTopics.retained.length, 19);
  assertEqual(JSON.stringify(diff.googleTopics.added), JSON.stringify(['Underwater Basket Weaving']));
  assertEqual(JSON.stringify(diff.googleTopics.removed), JSON.stringify(['TV Shows & Programs']));
  assertEqual(JSON.stringify(diff.googleBrands.added), JSON.stringify(['Chewy']));
  assertEqual(diff.metaTopics.removed.length, 0);
  assertEqual(diff.daaChanged, false);
  const analysis = Evidence.analyze(snap);
  assertEqual(analysis.summary.addedCount, 2);
  assertEqual(analysis.summary.canaryHitCount, 0, 'no canary in this snapshot');
});

test('evidence: a canary in a snapshot is a hit; the baseline itself has none', () => {
  const baselineAnalysis = Evidence.analyze({
    googleTopics: Evidence.BASELINE.googleTopics,
    googleBrands: Evidence.BASELINE.googleBrands,
    metaTopics: Evidence.BASELINE.metaTopics,
    metaActivity: Evidence.BASELINE.metaActivity,
    daaStatus: Evidence.BASELINE.daaStatus
  });
  assertEqual(baselineAnalysis.canaryHits.length, 0, 'baseline has no canary hits (by construction)');

  const hit = Evidence.analyze({
    googleTopics: ['Axolotl breeding', 'Games'],
    metaTopics: ['Competitive chainsaw carving']
  });
  assertEqual(hit.canaryHits.length, 2, 'both planted interests detected');
  const ids = hit.canaryHits.map(h => h.canaryId).sort();
  assertEqual(JSON.stringify(ids), JSON.stringify(['canary-axolotl', 'canary-chainsaw-carving']));
  assert(hit.canaryHits[0].matched.length >= 1, 'hit names the matched synonym');
});
