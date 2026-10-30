// Schroeder — background service worker.
// Drives everything: the 1-minute alarm tick executes due itinerary steps
// in inactive background tabs, runs cookie-pool sweeps on cadence, and
// keeps the day plan (personas + scheduled steps) in chrome.storage.local.
// All automated actions go through Schroeder.Actions.assertAllowed.
importScripts(
  'lib/rng.js', 'lib/actions.js', 'lib/clusters.js', 'lib/canary.js',
  'lib/evidence.js', 'lib/scheduler.js',
  'lib/settings.js', 'lib/cookies-classify.js', 'lib/cookies-pool.js',
  'lib/personas-local.js', 'lib/personas-spark.js', 'lib/persona-engine.js',
  'lib/store.js'
);

var S = Schroeder;
var TICK_ALARM = 'schroeder-tick';
var PERSONA_TAB_TIMEOUT_MS = 6 * 60 * 1000;

var sparkProvider = S.SparkPersonaProvider.create({
  getApiKey: function () {
    return S.Store.getSettings().then(function (s) { return s.modelApiKey || ''; });
  }
});
var engine = S.PersonaEngine.create({
  local: S.LocalPersonaProvider,
  spark: sparkProvider
});

function todayKey() {
  return S.Scheduler.dateKeyOf(new Date());
}

// ----- day plan -----------------------------------------------------------

function ensurePlan(force) {
  var dateKey = todayKey();
  return chrome.storage.local.get(['dayPlan']).then(function (data) {
    var plan = data.dayPlan;
    if (!force && plan && plan.dateKey === dateKey && plan.steps) return plan;
    return S.Store.getSettings().then(function (settings) {
      // v0.5.0: level resolves through the household clamp — in 'child'
      // household mode the plan is built at High whatever the stored
      // Light/Standard/High setting says.
      var level = S.Scheduler.effectiveLevel(settings);
      var perPersonaBudget = Math.max(3, Math.floor(level.dailyVisitBudget / level.personas));
      // v2: a forced regenerate starts a fresh arc too.
      var arcsPromise = force ? Promise.resolve(null) : S.Store.getPersonaArcs();
      return arcsPromise.then(function (arcState) {
        return engine.generatePersonas({
          count: level.personas, dateKey: dateKey, arcState: arcState,
          household: settings.household
        }).then(function (pres) {
          var allSteps = [];
          var chain = Promise.resolve();
          var updatedArcs = pres.arcState || arcState;
          pres.personas.forEach(function (persona) {
            chain = chain.then(function () {
              return engine.generateItinerary({
                persona: persona, dateKey: dateKey,
                budget: perPersonaBudget,
                household: settings.household,
                arcStage: persona.arcStage || 'browse',
                yesterdayUrls: persona.visitedUrls || []
              }).then(function (ires) {
                allSteps = allSteps.concat(ires.steps);
                // Today's planned visits become tomorrow's revisit pool.
                updatedArcs = S.PersonaEngine.updateVisitedUrls(
                  updatedArcs, persona.id, ires.steps);
              });
            });
          });
          return chain.then(function () {
            var rng = S.Rng.create('schedule:' + dateKey);
            var personasById = {};
            pres.personas.forEach(function (p) { personasById[p.id] = p; });
            var steps = S.Scheduler.planSessions(
              allSteps, dateKey, rng, level, settings.activeHours, personasById);
            var newPlan = {
              dateKey: dateKey,
              personas: pres.personas,
              providerUsed: pres.providerUsed,
              fallbackReason: pres.fallbackReason,
              arcStartKey: updatedArcs ? updatedArcs.arcStartKey : dateKey,
              arcDayIndex: pres.personas.length && pres.personas[0].arcDayIndex !== undefined
                ? pres.personas[0].arcDayIndex : 0,
              steps: steps
            };
            return S.Store.savePersonaArcs(updatedArcs).then(function () {
              return chrome.storage.local.set({ dayPlan: newPlan });
            }).then(function () {
              return S.Store.log('plan',
                'New day plan (' + pres.providerUsed + ' provider): ' +
                pres.personas.length + ' personas, ' + steps.length + ' steps, arc day ' +
                (newPlan.arcDayIndex + 1) + ' of ' + S.PersonaEngine.ARC_DAYS +
                ' (stage: ' + (pres.personas[0] ? pres.personas[0].arcStage : '?') + ')').then(function () {
                return newPlan;
              });
            });
          });
        });
      });
    });
  });
}

function savePlan(plan) {
  return chrome.storage.local.set({ dayPlan: plan });
}

function getPersonaTabs() {
  return chrome.storage.session.get(['personaTabs']).then(function (d) {
    return d.personaTabs || {};
  });
}

function setPersonaTabs(map) {
  return chrome.storage.session.set({ personaTabs: map });
}

// ----- step execution -----------------------------------------------------

function idleState() {
  return new Promise(function (resolve) {
    try { chrome.idle.queryState(30, resolve); }
    catch (e) { resolve('active'); }
  });
}

function cleanupPersonaTabs(plan) {
  return getPersonaTabs().then(function (map) {
    var ids = Object.keys(map);
    if (!ids.length) return map;
    var now = Date.now();
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        var entry = map[id];
        var stale = (now - entry.startedAt) > PERSONA_TAB_TIMEOUT_MS;
        return chrome.tabs.get(Number(id)).then(function () {
          if (stale) {
            return chrome.tabs.remove(Number(id)).catch(function () {}).then(function () {
              markStep(plan, entry.stepId, 'failed');
              delete map[id];
              return S.Store.bumpStats(todayKey(), 'stepsFailed', 1);
            });
          }
        }).catch(function () {
          // Tab is gone (user closed it, crash, browser restart).
          markStep(plan, entry.stepId, 'failed');
          delete map[id];
        });
      });
    });
    return chain.then(function () { return setPersonaTabs(map).then(function () { return map; }); });
  });
}

function markStep(plan, stepId, status) {
  var step = plan.steps.filter(function (s) { return s.id === stepId; })[0];
  if (step && step.status === 'running') step.status = status;
  return step;
}

// The only search endpoints a step can ever open. Since v0.4.0 these
// are exclusively the account-free engines (DuckDuckGo, Brave,
// Startpage) — there is no signed-in search path to reroute through.
var ENGINE_ENDPOINTS = {};
S.LocalPersonaProvider.ENGINES_ANON
  .forEach(function (e) { ENGINE_ENDPOINTS[e.id] = e; });

function openStepTab(plan, step, settings) {
  S.Actions.assertAllowed(step.action);
  // Defensive: a step naming an unknown engine (e.g. a day plan written
  // by an older build that still had signed-in engines) falls back to
  // DuckDuckGo instead of opening the named endpoint.
  if (step.action === 'search' && !ENGINE_ENDPOINTS[step.engine]) {
    var fallback = ENGINE_ENDPOINTS.duckduckgo;
    S.Store.log('engine-fallback',
      'Search rerouted ' + step.engine + ' -> duckduckgo (engine no longer exists): "' + step.query + '"');
    step.engine = fallback.id;
    step.engineHome = fallback.home;
    step.resultsPrefix = fallback.resultsPrefix;
  }
  var url = step.action === 'search' ? step.engineHome : step.url;
  var host = S.Settings.hostOf(url);
  if (S.Settings.isHostPaused(host, settings.pausedSites)) {
    step.status = 'skipped';
    return S.Store.log('skipped', 'Paused site, step skipped: ' + url).then(function () { return null; });
  }
  step.status = 'running';
  return chrome.tabs.create({ url: url, active: false }).then(function (tab) {
    return getPersonaTabs().then(function (map) {
      map[tab.id] = { stepId: step.id, startedAt: Date.now() };
      return setPersonaTabs(map).then(function () { return tab.id; });
    });
  }).catch(function (err) {
    step.status = 'failed';
    return S.Store.log('step-failed', 'Could not open tab for ' + url + ': ' + err);
  });
}

// ----- cookie sessions (v2: session-scoped identity) ----------------------
// Rotation happens ONCE, just before a persona's first session of the
// day (prepareForStep), and the persona's tracker identity is then held
// stable (frozen) for the rest of its day. The old v1 cadence sweep is
// gone — it fragmented the interest accumulation the browsing builds.
// A manual sweep (popup/dashboard button) still exists: it prepares a
// fresh identity immediately, outside any persona session.

function executeCookiePlan(plan, settings, label) {
  var counts = { 'cookie-rotate': 0, 'cookie-expire': 0 };
  return S.CookiePool.executePlan(plan, function (kind, detail) {
    if (counts[kind] !== undefined) counts[kind]++;
    return S.Store.log(kind, detail);
  }).then(function (results) {
    var dk = todayKey();
    return S.Store.bumpStats(dk, 'cookieRotations', counts['cookie-rotate'])
      .then(function () { return S.Store.bumpStats(dk, 'cookieExpirations', counts['cookie-expire']); })
      .then(function () {
        return S.Store.log('cookie-sweep',
          label + ': ' + counts['cookie-rotate'] + ' rotated, ' +
          counts['cookie-expire'] + ' expired, ' +
          results.filter(function (r) { return !r.ok; }).length + ' failed (safe mode ' +
          (settings.safeMode ? 'on' : 'off') + ')');
      }).then(function () {
        return {
          rotated: counts['cookie-rotate'], expired: counts['cookie-expire'],
          failed: results.filter(function (r) { return !r.ok; }).length
        };
      });
  });
}

function prepareSessionCookies(settings, personaId, force) {
  return chrome.cookies.getAll({}).then(function (cookies) {
    var rng = S.Rng.create('cookies:' + todayKey() + ':' + personaId);
    var res = S.CookiePool.prepareSession(cookies,
      { safeMode: settings.safeMode, force: !!force }, rng, personaId, todayKey());
    if (res.alreadyPrepared || !res.plan.length) {
      return { alreadyPrepared: !!res.alreadyPrepared, rotated: 0, expired: 0, failed: 0 };
    }
    return executeCookiePlan(res.plan, settings,
      'Session identity prepared for ' + personaId).then(function (summary) {
      summary.alreadyPrepared = false;
      return summary;
    });
  });
}

// Called right before the first step of a session launches. The
// preparedSessions map in engineState is the durable freeze record
// (the CookiePool's in-memory state does not survive service-worker
// restarts; this does).
function prepareForStep(step, settings) {
  if (!step.sessionId) return Promise.resolve(null);
  return chrome.storage.local.get(['engineState']).then(function (data) {
    var state = data.engineState || {};
    state.preparedSessions = state.preparedSessions || {};
    if (state.preparedSessions[step.sessionId]) return null; // frozen already
    state.preparedSessions[step.sessionId] = step.personaId;
    return chrome.storage.local.set({ engineState: state }).then(function () {
      return prepareSessionCookies(settings, step.personaId, false);
    });
  });
}

// Manual sweep (dashboard / popup "Rotate cookies now"): a fresh
// identity right now, not tied to a persona session.
function runCookieSweep(settings, force) {
  return prepareSessionCookies(settings, 'manual', true).then(function (summary) {
    return chrome.cookies.getAll({}).then(function (cookies) {
      return {
        inventoried: cookies.length,
        planned: summary.rotated + summary.expired,
        rotated: summary.rotated, expired: summary.expired, failed: summary.failed || 0
      };
    });
  });
}

// ----- the tick -------------------------------------------------------------

function tick() {
  return S.Store.getSettings().then(function (settings) {
    if (settings.paused) return;
    return idleState().then(function (state) {
      if (state === 'locked') return; // screen locked: full pause
      return ensurePlan(false).then(function (plan) {
        return cleanupPersonaTabs(plan).then(function (map) {
          var running = Object.keys(map).length;
          var level = S.Scheduler.effectiveLevel(settings);
          return S.Store.getStats(todayKey()).then(function (stats) {
            var chain = Promise.resolve();
            // Launch due steps up to the concurrency cap and budget.
            var launches = [];
            while (running + launches.length < level.maxConcurrentTabs) {
              if (S.Scheduler.budgetRemaining(level, stats) - launches.length <= 0) break;
              var step = S.Scheduler.nextPendingStep(
                plan.steps.filter(function (s) {
                  return launches.indexOf(s) === -1;
                }), Date.now());
              if (!step) break;
              launches.push(step);
            }
            launches.forEach(function (st) {
              chain = chain.then(function () { return prepareForStep(st, settings); })
                .then(function () { return openStepTab(plan, st, settings); });
            });
            return chain.then(function () { return savePlan(plan); });
          });
        });
      });
    });
  }).catch(function (err) {
    return S.Store.log('error', 'tick: ' + (err && err.message ? err.message : String(err)));
  });
}

// ----- messages ---------------------------------------------------------------

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === 'SCHROEDER_GET_INSTRUCTIONS') {
    // A content script asks: is this tab a persona tab with a step?
    var tabId = sender.tab && sender.tab.id;
    if (tabId === undefined) { sendResponse({ step: null }); return; }
    getPersonaTabs().then(function (map) {
      var entry = map[tabId];
      if (!entry) { sendResponse({ step: null }); return; }
      chrome.storage.local.get(['dayPlan']).then(function (data) {
        var plan = data.dayPlan;
        var step = plan && plan.steps.filter(function (s) { return s.id === entry.stepId; })[0];
        sendResponse({ step: step || null });
      });
    });
    return true; // async
  }

  if (msg.type === 'SCHROEDER_STEP_DONE') {
    var doneTabId = sender.tab && sender.tab.id;
    getPersonaTabs().then(function (map) {
      var entry = doneTabId !== undefined ? map[doneTabId] : null;
      return chrome.storage.local.get(['dayPlan']).then(function (data) {
        var plan = data.dayPlan;
        var step = null;
        if (plan && entry) {
          step = markStep(plan, entry.stepId, msg.outcome === 'done' ? 'done' : 'failed');
        }
        var dk = todayKey();
        var work = Promise.resolve();
        if (step) {
          work = work.then(function () {
            return S.Store.log(
              msg.outcome === 'done' ? step.action : 'step-failed',
              (step.action === 'search' ? ('"' + step.query + '" via ' + step.engine)
                                        : step.url) +
              ' [' + (step.clusterId || '') + ']');
          }).then(function () {
            if (msg.outcome === 'done' && step.canary) {
              // Canary emission: timestamped proof of planting, matched
              // later against Evidence Lab snapshots.
              return S.Store.logCanaryEmission({
                canaryId: step.canaryId || step.clusterId,
                personaId: step.personaId,
                action: step.action,
                query: step.query || null,
                url: step.url || null,
                ts: Date.now()
              }).then(function () {
                return S.Store.log('canary',
                  'Canary emission [' + (step.canaryId || step.clusterId) + '] ' +
                  (step.action === 'search' ? '"' + step.query + '"' : step.url));
              });
            }
          }).then(function () {
            if (msg.outcome === 'done') {
              return S.Store.bumpStats(dk, step.action === 'search' ? 'searches' : 'visits', 1);
            }
            return S.Store.bumpStats(dk, 'stepsFailed', 1);
          });
        }
        return work.then(function () {
          if (plan) return savePlan(plan);
        }).then(function () {
          if (entry) { delete map[doneTabId]; return setPersonaTabs(map); }
        }).then(function () {
          if (doneTabId !== undefined) return chrome.tabs.remove(doneTabId).catch(function () {});
        });
      });
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'SCHROEDER_LOG') {
    // Content-script events: consent accepts, storage seeds.
    var statField = msg.kind === 'consent-accept' ? 'consentAccepts'
      : msg.kind === 'storage-seed' ? 'storageSeeds' : null;
    S.Store.log(msg.kind, msg.detail).then(function () {
      if (statField) return S.Store.bumpStats(todayKey(), statField, 1);
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'SCHROEDER_GET_STATE') {
    Promise.all([
      S.Store.getSettings(),
      S.Store.getStats(todayKey()),
      chrome.storage.local.get(['dayPlan']),
      S.Store.getLog(120)
    ]).then(function (r) {
      sendResponse({
        settings: r[0], stats: r[1],
        plan: r[2].dayPlan || null, log: r[3]
      });
    });
    return true;
  }

  if (msg.type === 'SCHROEDER_REGENERATE') {
    ensurePlan(true).then(function (plan) { sendResponse({ ok: true, plan: plan }); });
    return true;
  }

  if (msg.type === 'SCHROEDER_SWEEP_NOW') {
    S.Store.getSettings().then(function (settings) {
      runCookieSweep(settings, true).then(function (summary) {
        sendResponse({ ok: true, summary: summary });
      });
    });
    return true;
  }

  if (msg.type === 'SCHROEDER_CLEAR_LOG') {
    S.Store.clearLog().then(function () { sendResponse({ ok: true }); });
    return true;
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  getPersonaTabs().then(function (map) {
    if (map[tabId]) { delete map[tabId]; return setPersonaTabs(map); }
  });
});

// ----- lifecycle ---------------------------------------------------------------

function init() {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  ensurePlan(false).catch(function () {});
}

chrome.runtime.onInstalled.addListener(function () {
  S.Store.log('install', 'Schroeder installed. Default aggressiveness: HIGH. Safe mode: ON.');
  init();
});
chrome.runtime.onStartup.addListener(init);
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === TICK_ALARM) tick();
});
