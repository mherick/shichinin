// Schroeder — PersonaEngine: provider selection with fallback, plus
// (v2, Wonder build) PERSISTENT ARC STATE management.
//
// Provider selection is v1's: try Spark, ANY failure (no key, network,
// malformed output, schema violation) falls back to the local provider,
// and the fallback reason is returned for the UI.
//
// Arc state (new in v2): a plain, JSON-serializable object the CALLER
// persists (background stores it in chrome.storage.local under
// 'personaArcs'):
//   { arcStartKey: 'YYYY-MM-DD', providerUsed, fallbackReason,
//     personas: [ persona + { arcStage, arcDayIndex, visitedUrls: [] } ] }
// A persona keeps the same 2 clusters for ARC_DAYS (7) days from
// arcStartKey. generatePersonas({ count, dateKey, arcState }) returns
// the SAME personas (with today's arcStage/arcDayIndex filled in) while
// the arc is live, and authors a fresh arc once it expires. Calling
// without dateKey keeps the v1 behavior (stateless, seed-driven).
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.PersonaEngine = (function () {
  var ARC_DAYS = 7;

  function dayDiff(fromKey, toKey) {
    var a = new Date(fromKey + 'T00:00:00').getTime();
    var b = new Date(toKey + 'T00:00:00').getTime();
    if (isNaN(a) || isNaN(b)) return 999;
    return Math.round((b - a) / (24 * 3600 * 1000));
  }

  function stageForDay(dayIndex) {
    return Schroeder.LocalPersonaProvider.stageForDay(dayIndex);
  }

  // Household enforcement (v0.5.0). In a protective mode ('adults' /
  // 'child'), a persona set is only acceptable if EVERY persona is an
  // adult (adult: true, adult ageBand) and none of its clusters is
  // child-directed or parenting content. A provider that hands back a
  // violating persona (e.g. a Spark narrative that chose the parenting
  // cluster) fails validation here and the engine falls back to the
  // local provider, whose pool is household-filtered by construction.
  function householdProtective(opts) {
    return !!(Schroeder.isProtectiveHousehold &&
      Schroeder.isProtectiveHousehold(opts.household));
  }

  function personaViolatesHousehold(p, opts) {
    if (!householdProtective(opts)) return false;
    if (!p || p.adult !== true || !p.ageBand) return true;
    return (p.clusterIds || []).some(function (id) {
      return !Schroeder.clusterAllowedForHousehold(id, opts.household);
    });
  }

  function stampAndCheckPersonas(personas, opts) {
    var bands = Schroeder.LocalPersonaProvider.AGE_BANDS;
    personas.forEach(function (p, i) {
      // Decoys are grown-ups: stamp the adult marker on any persona a
      // provider returned without one (the Spark narrative schema has
      // no age field; its cluster bank is adult interests).
      if (p.adult !== true) p.adult = true;
      if (!p.ageBand) p.ageBand = bands[i % bands.length];
      if (personaViolatesHousehold(p, opts)) {
        throw new Error('PersonaEngine: persona "' + (p.id || i) +
          '" violates household mode "' + opts.household +
          '" (non-adult persona or child-directed cluster) — falling back');
      }
    });
    return personas;
  }

  function create(deps) {
    var local = deps.local;
    var spark = deps.spark || null;

    function trySpark(method, opts) {
      if (!spark) return Promise.reject(new Error('spark provider not configured'));
      return spark[method](opts);
    }

    function generatePersonas(opts) {
      // v1-compatible stateless path.
      if (!opts.dateKey) {
        return trySpark('generatePersonas', opts).then(function (personas) {
          return { personas: stampAndCheckPersonas(personas, opts), providerUsed: 'spark', fallbackReason: null };
        }).catch(function (err) {
          return local.generatePersonas(opts).then(function (personas) {
            return {
              personas: stampAndCheckPersonas(personas, opts), providerUsed: 'local',
              fallbackReason: err && err.message ? err.message : String(err)
            };
          });
        });
      }

      // v2 arc path: reuse a live arc if one is supplied — unless the
      // stored arc violates the current household mode (authored under
      // 'mixed', or by an older build with no adult markers), in which
      // case it is NOT reused and a fresh, compliant arc is authored.
      var existing = opts.arcState;
      if (existing && Array.isArray(existing.personas) &&
          existing.personas.some(function (p) { return personaViolatesHousehold(p, opts); })) {
        existing = null;
      }
      if (existing && Array.isArray(existing.personas) &&
          existing.personas.length === opts.count && existing.arcStartKey) {
        var dayIndex = dayDiff(existing.arcStartKey, opts.dateKey);
        if (dayIndex >= 0 && dayIndex < ARC_DAYS) {
          var personas = existing.personas.map(function (p) {
            var copy = {};
            for (var k in p) copy[k] = p[k];
            copy.arcDayIndex = dayIndex;
            copy.arcStage = stageForDay(dayIndex);
            return copy;
          });
          var stateCopy = {
            arcStartKey: existing.arcStartKey,
            providerUsed: existing.providerUsed || 'local',
            fallbackReason: existing.fallbackReason || null,
            personas: personas
          };
          return Promise.resolve({
            personas: personas,
            providerUsed: stateCopy.providerUsed,
            fallbackReason: stateCopy.fallbackReason,
            arcState: stateCopy,
            arcReused: true
          });
        }
      }

      // Fresh arc: author personas with an arc-scoped seed, then wrap
      // them in arc state at day 0.
      var arcOpts = {};
      for (var k2 in opts) arcOpts[k2] = opts[k2];
      arcOpts.seed = 'arc:' + opts.dateKey;
      return trySpark('generatePersonas', arcOpts).then(function (personas) {
        return { personas: stampAndCheckPersonas(personas, arcOpts), providerUsed: 'spark', fallbackReason: null };
      }).catch(function (err) {
        return local.generatePersonas(arcOpts).then(function (personas) {
          return {
            personas: stampAndCheckPersonas(personas, arcOpts), providerUsed: 'local',
            fallbackReason: err && err.message ? err.message : String(err)
          };
        });
      }).then(function (res) {
        var canaryIds = (Schroeder.Canaries && Schroeder.Canaries.CANARY_IDS) || [];
        var stated = res.personas.map(function (p, idx) {
          var copy = {};
          for (var k3 in p) copy[k3] = p[k3];
          copy.arcDayIndex = 0;
          copy.arcStage = stageForDay(0);
          copy.visitedUrls = [];
          // Providers other than local may not assign canaries or
          // session windows; fill the same defaults local would.
          if (!copy.canaryId && canaryIds.length) {
            copy.canaryId = canaryIds[idx % canaryIds.length];
          }
          if (!copy.scheduleWindows) {
            var baseHour = 7 + (idx % 4);
            copy.scheduleWindows = [];
            for (var w = 0; w < 4; w++) {
              copy.scheduleWindows.push(Math.min(21, baseHour + w * 4 + (idx % 2)));
            }
          }
          return copy;
        });
        var state = {
          arcStartKey: opts.dateKey,
          providerUsed: res.providerUsed,
          fallbackReason: res.fallbackReason,
          personas: stated
        };
        return {
          personas: stated,
          providerUsed: res.providerUsed,
          fallbackReason: res.fallbackReason,
          arcState: state,
          arcReused: false
        };
      });
    }

    function generateItinerary(opts) {
      return trySpark('generateItinerary', opts).then(function (steps) {
        return { steps: steps, providerUsed: 'spark', fallbackReason: null };
      }).catch(function (err) {
        return local.generateItinerary(opts).then(function (steps) {
          return {
            steps: steps, providerUsed: 'local',
            fallbackReason: err && err.message ? err.message : String(err)
          };
        });
      });
    }

    return {
      generatePersonas: generatePersonas,
      generateItinerary: generateItinerary
    };
  }

  // Pure arc-state helpers (used by the background worker; unit-tested).
  // Merge the visit URLs of a fresh itinerary into a persona's
  // visitedUrls (dedup, most recent last, capped). Returns a NEW state.
  function updateVisitedUrls(arcState, personaId, steps) {
    if (!arcState) return arcState;
    var fresh = Schroeder.LocalPersonaProvider.collectVisitedUrls(steps);
    var state = JSON.parse(JSON.stringify(arcState));
    state.personas = (state.personas || []).map(function (p) {
      if (p.id !== personaId) return p;
      var urls = (p.visitedUrls || []).slice();
      fresh.forEach(function (u) { if (urls.indexOf(u) === -1) urls.push(u); });
      p.visitedUrls = urls.slice(-30);
      return p;
    });
    return state;
  }

  function personaState(arcState, personaId) {
    if (!arcState || !arcState.personas) return null;
    return arcState.personas.filter(function (p) { return p.id === personaId; })[0] || null;
  }

  return {
    create: create,
    ARC_DAYS: ARC_DAYS,
    dayDiff: dayDiff,
    stageForDay: stageForDay,
    updateVisitedUrls: updateVisitedUrls,
    personaState: personaState
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.PersonaEngine;
