// Schroeder — cookie pool manager.
// buildRotationPlan() is pure and unit-tested. runSweep() is the browser
// side: it inventories chrome.cookies, plans, executes, and logs.
//
// Rules (from the sketch):
//  - Protected and functional cookies are NEVER in a plan.
//  - Safe Mode ON (default): only class 'tracker' (known names/domains).
//  - Safe Mode OFF: 'unknown-id' cookies are also eligible.
//  - Rotatable values are replaced with same-shape generated values.
//  - Signed (server-validated) values are expired instead — a tampered
//    signed value would be rejected anyway; expiry frays stitching too.
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.CookiePool = (function () {
  var Classify = Schroeder.CookieClassify;
  var Actions = Schroeder.Actions;

  function buildRotationPlan(cookies, opts, rng) {
    var safeMode = !opts || opts.safeMode !== false;
    var plan = [];
    (cookies || []).forEach(function (cookie) {
      var c = Classify.classify(cookie);
      var eligible = (c.cls === 'tracker') || (!safeMode && c.cls === 'unknown-id');
      if (!eligible) return;
      if (Classify.looksSigned(cookie.value)) {
        plan.push({
          action: Actions.assertAllowed('cookie-expire'),
          cookie: cookie, cls: c.cls,
          reason: 'signed value — expire instead of rotate (' + c.reason + ')'
        });
      } else {
        plan.push({
          action: Actions.assertAllowed('cookie-rotate'),
          cookie: cookie, cls: c.cls,
          newValue: Classify.generateReplacementValue(cookie, rng),
          reason: c.reason
        });
      }
    });
    return plan;
  }

  // ----- session-scoped identity (v2, Wonder build) ----------------------
  // v1 swept the cookie pool on an independent 4-hour cadence — which
  // fragmented the very interest accumulation the persona browsing was
  // trying to build. v2 scopes rotation to persona SESSIONS:
  // prepareSession() builds the rotation plan ONCE, just before a
  // persona's first session of the day; after that the persona's tracker
  // identity is FROZEN for the rest of its day, so the fake interest
  // accrues to a single tracker ID. A different persona (or a forced
  // manual sweep) prepares a fresh identity. The classifier and its
  // protection order are untouched — prepareSession plans through the
  // same buildRotationPlan() as v1.
  var sessionState = {
    personaId: null, dateKey: null, preparedAt: 0, frozen: false, planSize: 0
  };

  function prepareSession(cookies, opts, rng, personaId, dateKey) {
    opts = opts || {};
    if (!opts.force && sessionState.frozen &&
        sessionState.personaId === personaId &&
        sessionState.dateKey === dateKey) {
      return { plan: [], alreadyPrepared: true, state: freeze() };
    }
    var plan = buildRotationPlan(cookies, opts, rng);
    sessionState = {
      personaId: personaId, dateKey: dateKey,
      preparedAt: Date.now(), frozen: true, planSize: plan.length
    };
    return { plan: plan, alreadyPrepared: false, state: freeze() };
  }

  // Snapshot of the freeze state: which persona's identity is currently
  // held stable, and since when. Callers must treat a frozen persona's
  // cookies as hands-off until a different persona's session prepares.
  function freeze() {
    return {
      personaId: sessionState.personaId,
      dateKey: sessionState.dateKey,
      preparedAt: sessionState.preparedAt,
      frozen: sessionState.frozen,
      planSize: sessionState.planSize
    };
  }

  function isFrozenFor(personaId, dateKey) {
    return sessionState.frozen &&
      sessionState.personaId === personaId &&
      sessionState.dateKey === dateKey;
  }

  function resetSessionState() {
    sessionState = { personaId: null, dateKey: null, preparedAt: 0, frozen: false, planSize: 0 };
  }

  // ----- browser side (chrome.cookies) ------------------------------------

  function cookieUrl(cookie) {
    var scheme = cookie.secure ? 'https://' : 'http://';
    var host = String(cookie.domain || '').replace(/^\./, '');
    return scheme + host + (cookie.path || '/');
  }

  // Execute a plan. logFn(kind, detail) is injected by the background page.
  function executePlan(plan, logFn) {
    var results = [];
    var chain = Promise.resolve();
    plan.forEach(function (item) {
      chain = chain.then(function () {
        var c = item.cookie;
        var base = {
          url: cookieUrl(c), name: c.name, domain: c.domain,
          path: c.path, secure: c.secure, httpOnly: c.httpOnly,
          sameSite: c.sameSite, storeId: c.storeId
        };
        var op;
        if (item.action === 'cookie-rotate') {
          var setDetails = Object.assign({}, base, { value: item.newValue });
          if (!c.session && c.expirationDate) setDetails.expirationDate = c.expirationDate;
          op = chrome.cookies.set(setDetails);
        } else { // cookie-expire: re-set with expiry in the past
          var expDetails = Object.assign({}, base, {
            value: c.value, expirationDate: Math.floor(Date.now() / 1000) - 3600
          });
          op = chrome.cookies.set(expDetails);
        }
        return op.then(function () {
          results.push({ ok: true, item: item });
          if (logFn) logFn(item.action, c.domain + ' ' + c.name + ' — ' + item.reason);
        }).catch(function (err) {
          results.push({ ok: false, item: item, error: String(err) });
          if (logFn) logFn('cookie-error', c.domain + ' ' + c.name + ' — ' + String(err));
        });
      });
    });
    return chain.then(function () { return results; });
  }

  function runSweep(opts, rng, logFn) {
    return chrome.cookies.getAll({}).then(function (cookies) {
      var plan = buildRotationPlan(cookies, opts, rng);
      return executePlan(plan, logFn).then(function (results) {
        return {
          inventoried: cookies.length,
          planned: plan.length,
          rotated: results.filter(function (r) { return r.ok && r.item.action === 'cookie-rotate'; }).length,
          expired: results.filter(function (r) { return r.ok && r.item.action === 'cookie-expire'; }).length,
          failed: results.filter(function (r) { return !r.ok; }).length
        };
      });
    });
  }

  return {
    buildRotationPlan: buildRotationPlan,
    prepareSession: prepareSession,
    freeze: freeze,
    isFrozenFor: isFrozenFor,
    resetSessionState: resetSessionState,
    executePlan: executePlan,
    runSweep: runSweep
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.CookiePool;
