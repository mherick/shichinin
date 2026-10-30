// Schroeder — LocalPersonaProvider (the default, fully working provider).
//
// v2 (Wonder build) — PERSISTENT PERSONA ARCS IN SESSION BURSTS.
// v1 reshuffled 2-3 random clusters per persona per day and sprayed the
// steps across 07:00-23:00. Trackers' frequency/recency weighting throws
// that away. v2 instead:
//   - Each persona keeps the SAME 2 clusters for a 7-day arc.
//   - The day is built as 3-4 SESSIONS (bursts). Inside a session the
//     pattern is: search -> visit -> deeper visit -> revisit yesterday's
//     site (first session) / more of the session's cluster. The scheduler
//     turns sessions into 15-35 minute bursts at persona-consistent
//     times of day (persona.scheduleWindows).
//   - The arc progresses day over day: browse -> compare -> brand
//     (ARC_STAGES / stageForDay). Brand-stage searches are prefixed with
//     the brand of a top site in the cluster, the way a real person who
//     has settled on a source searches.
//   - Destination sites are TAG-WEIGHTED: clusters.js sites carry a
//     hand-curated tagScore; higher-score (heavily ad-tagged) publishers
//     are picked more often.
//   - ~15% of each persona's budget goes to its assigned CANARY cluster
//     (canary.js) — a planted interest, absent from the user's baseline,
//     for causal attribution in the Evidence Lab. Canary steps are
//     marked canary: true and logged with timestamps when executed.
//   - Decoy searches run ONLY on account-free engines (DuckDuckGo,
//     Brave, Startpage). Signed-in search was removed in v0.4.0: Google
//     (and Bing, for signed-in Microsoft accounts) searches from the
//     user's own browser put the user's platform accounts at risk of
//     suspension, so there is no code path that can select them.
//
// Provider interface (implemented identically by SparkPersonaProvider):
//   generatePersonas({ count, seed, household }) -> Promise<persona[]>
//   generateItinerary({ persona, dateKey, budget, household,
//                       arcStage, yesterdayUrls, queryOverrides })
//                                                -> Promise<step[]>
// Persona: { id, displayName, archetype, clusterIds (exactly 2),
//            clusterLabels, canaryId, scheduleWindows,
//            adult: true, ageBand }
// v0.5.0 (Household build): EVERY decoy persona is an adult — adult is
// always true and ageBand is always an adult band (see AGE_BANDS). In
// the protective household modes ('adults' / 'child') personas are
// drawn only from the household pool in clusters.js: no child-directed
// or parenting cluster, and the adult-life cluster always rotates
// (selective coherence — the grown-ups axis stays consistent).
// Step:    { id, personaId, clusterId, action: 'visit'|'search',
//            url?, engine?, query?, dwellSec: [min, max],
//            sessionIndex, canary?, revisit? }
// Every step action is asserted against the design-law allowlist.
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.LocalPersonaProvider = (function () {
  var FIRST_NAMES = [
    'Maya', 'Jordan', 'Priya', 'Marcus', 'Elena', 'Tom', 'Aisha', 'Leo',
    'Nora', 'Felix', 'June', 'Omar', 'Iris', 'Hugo', 'Tara', 'Ben',
    'Lena', 'Marco', 'Sana', 'Will', 'Greta', 'Dev', 'Ana', 'Cole'
  ];

  // The ONLY decoy search engines. All three are account-free for
  // consumers: there is no Google or Microsoft account attached to a
  // search, so nothing here can get a user's account terminated.
  // (Google and Bing were removed in v0.4.0 — see the header note.)
  var ENGINES_ANON = [
    { id: 'duckduckgo', home: 'https://duckduckgo.com/', resultsPrefix: 'https://duckduckgo.com/?q=' },
    { id: 'brave', home: 'https://search.brave.com/', resultsPrefix: 'https://search.brave.com/search?q=' },
    { id: 'startpage', home: 'https://www.startpage.com/', resultsPrefix: 'https://www.startpage.com/sp/search?query=' }
  ];

  var ARC_STAGES = ['browse', 'compare', 'brand'];
  var ARC_DAYS = 7;
  var CANARY_SHARE = 0.15;

  // Decoys are grown-ups, in every mode. The age band is the persona's
  // identifiable adult marker; there is no code path that authors a
  // minor persona.
  var AGE_BANDS = ['25-34', '35-44', '45-54', '55-64', '65+'];

  // Day-over-day arc progression inside the 7-day window.
  function stageForDay(dayIndex) {
    if (dayIndex <= 2) return 'browse';
    if (dayIndex <= 4) return 'compare';
    return 'brand';
  }

  // ---- site helpers (clusters.js sites are {url, tagScore, revisit}) ---

  function siteUrl(entry) { return typeof entry === 'string' ? entry : entry.url; }
  function siteScore(entry) { return typeof entry === 'string' ? 1 : (entry.tagScore || 1); }

  // Tag-weighted pick: a tagScore-3 publisher is 3x as likely as a
  // tagScore-1 one. This is the mechanism that aims visits at pages that
  // actually carry remarketing tags.
  function pickSiteWeighted(clusterLike, rng) {
    var sites = (clusterLike && clusterLike.sites) || [];
    if (!sites.length) return null;
    var total = 0;
    sites.forEach(function (s) { total += siteScore(s); });
    var roll = rng.float(0, total);
    for (var i = 0; i < sites.length; i++) {
      roll -= siteScore(sites[i]);
      if (roll <= 0) return sites[i];
    }
    return sites[sites.length - 1];
  }

  // Brand tokens for brand-stage query prefixes, keyed by cluster id
  // (the cluster's flagship publisher, humanized).
  var CLUSTER_BRANDS = {
    sourdough: 'king arthur baking', marathon: "runner's world",
    newparent: 'babylist', indexinvesting: 'bogleheads',
    diyrenovation: 'family handyman', gardening: "gardener's supply",
    photography: 'dpreview', ev: 'insideevs', pcbuilding: "tom's hardware",
    travelhacking: 'the points guy', skincare: 'byrdie',
    boardgames: 'board game geek', astronomy: 'sky and telescope',
    dogcare: 'akc', watches: 'hodinkee', overlanding: 'outside magazine',
    adultlife: 'bankrate'
  };

  // Stage-ordered query pool: 'compare' floats comparison-flavored
  // queries to the front; 'browse' and 'brand' use the bank as-is
  // (brand stage instead prefixes queries at generation time).
  function stageQueries(cluster, stage) {
    var queries = (cluster.queries || []).slice();
    if (stage === 'compare') {
      var cmp = queries.filter(function (q) { return /vs|best|difference|compare|review|worth it/i.test(q); });
      var rest = queries.filter(function (q) { return cmp.indexOf(q) === -1; });
      return cmp.concat(rest);
    }
    return queries;
  }

  function generatePersonas(opts) {
    var rng = Schroeder.Rng.create('personas:' + opts.seed);
    // Household pool: protective modes exclude child-directed /
    // parenting clusters (see clusters.js); 'mixed' (or no mode, the
    // v0.4.0 back-compat path) draws from the full bank.
    var clusters = Schroeder.householdClusters
      ? Schroeder.householdClusters(opts.household)
      : Schroeder.Clusters;
    var protective = Schroeder.isProtectiveHousehold
      ? Schroeder.isProtectiveHousehold(opts.household) : false;
    var adultLife = null;
    clusters.forEach(function (c) { if (c.id === 'adultlife') adultLife = c; });
    var canaryIds = (Schroeder.Canaries && Schroeder.Canaries.CANARY_IDS) || [];
    var usedFirstNames = {};
    var personas = [];
    for (var i = 0; i < opts.count; i++) {
      // v2: exactly 2 clusters, held for the whole 7-day arc.
      var picked = rng.sample(clusters, 2);
      // Selective coherence: in protective modes the adult-life cluster
      // is always in rotation — persona 0 leads with it, every arc.
      if (protective && adultLife && i === 0 &&
          picked[0].id !== adultLife.id && picked[1].id !== adultLife.id) {
        picked = [adultLife, picked[0]];
      }
      var first = rng.pick(FIRST_NAMES);
      if (usedFirstNames[first]) first = rng.pick(FIRST_NAMES);
      usedFirstNames[first] = true;
      var primary = picked[0];
      // Persona-consistent session start hours inside the active window:
      // four windows ~4h apart with a per-persona offset, stable for the
      // persona's whole life (the scheduler adds only minute jitter).
      var baseHour = 7 + (i % 4);
      var windows = [];
      for (var w = 0; w < 4; w++) windows.push(Math.min(21, baseHour + w * 4 + (i % 2)));
      personas.push({
        id: 'persona-' + opts.seed + '-' + i,
        displayName: first + ' — ' + primary.archetype,
        archetype: primary.archetype,
        clusterIds: picked.map(function (c) { return c.id; }),
        clusterLabels: picked.map(function (c) { return c.label; }),
        canaryId: canaryIds.length ? canaryIds[i % canaryIds.length] : null,
        scheduleWindows: windows,
        adult: true,
        ageBand: rng.pick(AGE_BANDS)
      });
    }
    return Promise.resolve(personas);
  }

  function generateItinerary(opts) {
    var persona = opts.persona;
    var budget = Math.max(3, opts.budget || 12);
    var rng = Schroeder.Rng.create('itinerary:' + opts.dateKey + ':' + persona.id);
    var engines = ENGINES_ANON; // the only engine set — no signed-in path exists
    var stage = opts.arcStage || 'browse';
    var yesterdayUrls = opts.yesterdayUrls || [];
    var overrides = opts.queryOverrides || {};
    var steps = [];
    var seq = 0;

    // Household defense in depth (v0.5.0): whatever authored this
    // persona — local pool, a Spark narrative, or an arc persisted by
    // an older build — a protective mode never emits a child-directed
    // destination or search. Clusters resolve through the item-level
    // filter, and query override pools are filtered the same way.
    var protective = Schroeder.isProtectiveHousehold
      ? Schroeder.isProtectiveHousehold(opts.household) : false;
    function resolveCluster(clusterLike) {
      if (!clusterLike || !protective) return clusterLike;
      return Schroeder.filterClusterForHousehold(clusterLike, opts.household);
    }

    function queryFor(clusterLike, clusterId) {
      var pool = overrides[clusterId] || stageQueries(clusterLike, stage);
      if (protective) {
        pool = pool.filter(function (q) { return !Schroeder.isChildContent(q); });
        if (!pool.length) pool = stageQueries(clusterLike, stage);
      }
      var q = rng.pick(pool);
      if (stage === 'brand' && CLUSTER_BRANDS[clusterId]) {
        q = CLUSTER_BRANDS[clusterId] + ' ' + q;
      }
      return q;
    }

    function makeSearch(clusterLike, clusterId, sessionIndex) {
      var engine = rng.pick(engines);
      return {
        id: persona.id + '-' + opts.dateKey + '-' + (seq++),
        personaId: persona.id, clusterId: clusterId,
        action: Schroeder.Actions.assertAllowed('search'),
        engine: engine.id, engineHome: engine.home,
        resultsPrefix: engine.resultsPrefix,
        query: queryFor(clusterLike, clusterId),
        dwellSec: [15, 55],
        sessionIndex: sessionIndex
      };
    }

    function makeVisit(clusterLike, clusterId, sessionIndex, visitOpts) {
      visitOpts = visitOpts || {};
      var entry = pickSiteWeighted(clusterLike, rng);
      var step = {
        id: persona.id + '-' + opts.dateKey + '-' + (seq++),
        personaId: persona.id, clusterId: clusterId,
        action: Schroeder.Actions.assertAllowed('visit'),
        url: visitOpts.url || siteUrl(entry),
        dwellSec: visitOpts.deep ? [45, 110] : [25, 110],
        sessionIndex: sessionIndex
      };
      if (visitOpts.revisit) step.revisit = true;
      return step;
    }

    // Sessions: 3-4 per day for a full budget, fewer for a tiny one.
    var sessionCount = budget >= 10 ? (rng.chance(0.5) ? 4 : 3) : (budget >= 6 ? 2 : 1);
    var perSession = [];
    var base = Math.floor(budget / sessionCount);
    var remainder = budget - base * sessionCount;
    for (var s0 = 0; s0 < sessionCount; s0++) perSession.push(base + (s0 < remainder ? 1 : 0));

    var clusterIds = persona.clusterIds && persona.clusterIds.length
      ? persona.clusterIds : [null];

    for (var s = 0; s < sessionCount; s++) {
      var clusterId = clusterIds[s % clusterIds.length];
      var cluster = resolveCluster(Schroeder.ClusterById[clusterId]);
      if (!cluster) continue;
      // A blocked cluster (e.g. a parenting cluster on an arc authored
      // before Household mode existed) yields no steps at all in a
      // protective mode — its filtered site/query banks are not used,
      // and the session is simply skipped.
      if (protective && !(cluster.sites || []).length && !(cluster.queries || []).length) continue;
      if (protective && Schroeder.isClusterBlockedForHousehold(cluster)) continue;
      var n = perSession[s];
      for (var pos = 0; pos < n; pos++) {
        if (pos === 0) {
          steps.push(makeSearch(cluster, clusterId, s)); // session opens with a search
        } else if (pos === 1) {
          steps.push(makeVisit(cluster, clusterId, s, {})); // first visit
        } else if (pos === 2) {
          steps.push(makeVisit(cluster, clusterId, s, { deep: true })); // deeper page
        } else if (pos === 3 && s === 0 && yesterdayUrls.length) {
          // Revisit yesterday's site — remarketing pools reward revisits,
          // and the arc gains day-over-day continuity.
          steps.push(makeVisit(cluster, clusterId, s, {
            url: yesterdayUrls[yesterdayUrls.length - 1], revisit: true
          }));
        } else if (pos % 2 === 0) {
          steps.push(makeVisit(cluster, clusterId, s, {}));
        } else {
          steps.push(makeSearch(cluster, clusterId, s));
        }
      }
    }

    // Canary allocation: convert later fill steps (never a session's
    // opening search/first visit, never the revisit step) into canary
    // steps until ~15% of the budget is canary emissions.
    var canary = persona.canaryId && Schroeder.Canaries
      ? resolveCluster(Schroeder.Canaries.ById[persona.canaryId]) : null;
    if (canary && steps.length >= 6) {
      var target = Math.max(1, Math.round(budget * CANARY_SHARE));
      var placed = 0;
      for (var i = steps.length - 1; i >= 0 && placed < target; i--) {
        var st = steps[i];
        var posInSession = 0;
        for (var j = 0; j < i; j++) if (steps[j].sessionIndex === st.sessionIndex) posInSession++;
        if (posInSession < 3 || st.revisit) continue;
        var replacement;
        if (st.action === 'search') {
          replacement = makeSearch(canary, canary.id, st.sessionIndex);
        } else {
          replacement = makeVisit(canary, canary.id, st.sessionIndex, {});
        }
        replacement.id = st.id;
        replacement.canary = true;
        replacement.canaryId = canary.id;
        steps[i] = replacement;
        placed++;
      }
    }

    return Promise.resolve(steps.slice(0, budget));
  }

  // URLs of the visit steps in an itinerary — the caller persists these
  // into the persona's arc state as visitedUrls; tomorrow they become
  // yesterdayUrls (the revisit source).
  function collectVisitedUrls(steps) {
    var urls = [];
    (steps || []).forEach(function (s) {
      if (s.action === 'visit' && s.url && urls.indexOf(s.url) === -1) urls.push(s.url);
    });
    return urls;
  }

  return {
    name: 'local',
    generatePersonas: generatePersonas,
    generateItinerary: generateItinerary,
    collectVisitedUrls: collectVisitedUrls,
    pickSiteWeighted: pickSiteWeighted,
    AGE_BANDS: AGE_BANDS,
    siteUrl: siteUrl,
    stageQueries: stageQueries,
    stageForDay: stageForDay,
    ARC_STAGES: ARC_STAGES,
    ARC_DAYS: ARC_DAYS,
    CANARY_SHARE: CANARY_SHARE,
    ENGINES_ANON: ENGINES_ANON
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.LocalPersonaProvider;
