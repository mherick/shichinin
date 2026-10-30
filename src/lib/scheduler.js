// Schroeder — scheduler math (pure functions, unit-tested).
// Aggressiveness levels, daily budgets, time spreading, due-step selection.
//
// v2 (Wonder build) additions:
//   - planSessions(): steps arrive grouped into persona SESSIONS (see
//     personas-local.js). Each session becomes a 15-35 minute burst at a
//     persona-consistent time of day: the persona's scheduleWindows give
//     the start hour every day; only minute-level jitter varies. Steps
//     inside a session are spaced 2-5.5 minutes apart.
//   - Signed-in search gating: REMOVED in v0.4.0. The old Live-Fire
//     window (and the legacy v1 loggedInPollution flag) could route
//     decoy searches to Google signed in as the user — an account
//     suspension risk. canUseGoogleSearch() now answers false
//     unconditionally; legacy settings fields are ignored.
//   - Cookie rotation is no longer cadence-driven (LEVELS keep the v1
//     cookieRotationHours fields for compatibility): v2 rotates once per
//     persona session via CookiePool.prepareSession — see cookies-pool.js
//     and background.js.
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.Scheduler = (function () {
  // HIGH is the shipped default (locked decision, Oct 27).
  var LEVELS = Object.freeze({
    low: Object.freeze({
      name: 'low', personas: 1, dailyVisitBudget: 12,
      maxConcurrentTabs: 1, minGapSec: 300, cookieRotationHours: 24
    }),
    medium: Object.freeze({
      name: 'medium', personas: 2, dailyVisitBudget: 30,
      maxConcurrentTabs: 1, minGapSec: 180, cookieRotationHours: 12
    }),
    high: Object.freeze({
      name: 'high', personas: 4, dailyVisitBudget: 64,
      maxConcurrentTabs: 2, minGapSec: 90, cookieRotationHours: 4
    })
  });

  var DEFAULT_ACTIVE_HOURS = [7, 23]; // local time window for noise activity
  var SESSION_MIN_MINUTES = 15;
  var SESSION_MAX_MINUTES = 35;

  function levelConfig(name) {
    return LEVELS[name] || LEVELS.high;
  }

  // ---- household mode: effective aggressiveness (v0.5.0) -----------------
  // In 'child' household mode the effective level is ALWAYS High,
  // whatever Light/Standard/High the user picked: a child's real
  // signals get buried under maximum adult decoy volume. Both the plan
  // builder (persona count, daily budget) and the tick (concurrency,
  // budget) resolve the level through here so they can never disagree.
  function effectiveLevelName(settings) {
    if (settings && settings.household === 'child') return 'high';
    return (settings && settings.aggressiveness) || 'high';
  }

  function effectiveLevel(settings) {
    return levelConfig(effectiveLevelName(settings));
  }

  // ---- signed-in search gate (permanently closed, v0.4.0) ---------------

  // Decoy searches NEVER run on Google (or any signed-in surface).
  // This gate is kept as a single, testable statement of that rule: it
  // ignores every settings field, including legacy liveFireUntil /
  // loggedInPollution values carried over from older installs.
  function canUseGoogleSearch(settings, now) {
    return false;
  }

  // ---- v1 time spreading (kept; used for session-start fallback) --------

  function spreadTimes(count, dateKey, rng, activeHours, minGapSec) {
    var hours = activeHours || DEFAULT_ACTIVE_HOURS;
    var dayStart = new Date(dateKey + 'T00:00:00');
    var start = dayStart.getTime() + hours[0] * 3600 * 1000;
    var end = dayStart.getTime() + hours[1] * 3600 * 1000;
    var span = end - start;
    if (count <= 0) return [];
    var slot = span / count;
    var times = [];
    for (var i = 0; i < count; i++) {
      var jitter = (rng.next() - 0.5) * Math.min(slot * 0.8, 900 * 1000);
      var t = Math.round(start + slot * (i + 0.5) + jitter);
      if (times.length && t < times[times.length - 1] + (minGapSec || 0) * 1000) {
        t = times[times.length - 1] + (minGapSec || 0) * 1000;
      }
      if (t >= end) t = end - 1000;
      times.push(t);
    }
    return times;
  }

  // ---- session planning ---------------------------------------------------

  // Group flat steps into sessions: one group per (personaId, sessionIndex),
  // preserving in-session order.
  function groupSessions(steps) {
    var groups = [];
    var byKey = {};
    (steps || []).forEach(function (step) {
      var key = step.personaId + ':' + (step.sessionIndex || 0);
      if (!byKey[key]) {
        byKey[key] = {
          personaId: step.personaId,
          sessionIndex: step.sessionIndex || 0,
          steps: []
        };
        groups.push(byKey[key]);
      }
      byKey[key].steps.push(step);
    });
    return groups;
  }

  // Assign scheduledAt + sessionId to steps, session by session.
  // personasById: { personaId: persona } — used for scheduleWindows.
  // Returns NEW step objects sorted by scheduledAt; inputs not mutated.
  function planSessions(steps, dateKey, rng, level, activeHours, personasById) {
    var hours = activeHours || DEFAULT_ACTIVE_HOURS;
    var dayStart = new Date(dateKey + 'T00:00:00').getTime();
    var windowStart = dayStart + hours[0] * 3600 * 1000;
    var windowEnd = dayStart + hours[1] * 3600 * 1000;
    var groups = groupSessions(steps);

    // Fallback session starts (personas without scheduleWindows):
    // spread this persona's sessions across the active window.
    var sessionsPerPersona = {};
    groups.forEach(function (g) {
      sessionsPerPersona[g.personaId] = (sessionsPerPersona[g.personaId] || 0) + 1;
    });
    var fallbackStarts = {};
    Object.keys(sessionsPerPersona).forEach(function (pid) {
      fallbackStarts[pid] = spreadTimes(
        sessionsPerPersona[pid], dateKey, rng, hours, 3600);
    });
    var fallbackSeen = {};

    var out = [];
    groups.forEach(function (g) {
      var persona = personasById ? personasById[g.personaId] : null;
      var start;
      if (persona && Array.isArray(persona.scheduleWindows) && persona.scheduleWindows.length) {
        var hour = persona.scheduleWindows[g.sessionIndex % persona.scheduleWindows.length];
        start = dayStart + hour * 3600 * 1000 + rng.int(0, 45) * 60 * 1000;
      } else {
        var idx = fallbackSeen[g.personaId] || 0;
        fallbackSeen[g.personaId] = idx + 1;
        start = fallbackStarts[g.personaId][idx];
      }
      // Keep the whole burst inside the active window.
      if (start < windowStart) start = windowStart + rng.int(0, 30) * 60 * 1000;
      if (start > windowEnd - SESSION_MIN_MINUTES * 60 * 1000) {
        start = windowEnd - SESSION_MIN_MINUTES * 60 * 1000;
      }
      var sessionId = g.personaId + ':' + dateKey + ':s' + g.sessionIndex;
      var t = start;
      g.steps.forEach(function (step, j) {
        if (j > 0) t += rng.int(120, 330) * 1000; // 2-5.5 min between steps
        var copy = {};
        for (var k in step) copy[k] = step[k];
        copy.scheduledAt = t;
        copy.sessionId = sessionId;
        copy.status = 'pending';
        out.push(copy);
      });
    });
    out.sort(function (a, b) { return a.scheduledAt - b.scheduledAt; });
    return out;
  }

  // Legacy v1 entry point: schedule steps as one session per persona.
  function scheduleSteps(steps, dateKey, rng, level, activeHours) {
    return planSessions(steps, dateKey, rng, level, activeHours, null);
  }

  // Steps that are due (scheduledAt <= now) and still pending.
  function dueSteps(steps, now) {
    return steps.filter(function (s) {
      return s.status === 'pending' && s.scheduledAt <= now;
    });
  }

  function nextPendingStep(steps, now) {
    var due = dueSteps(steps, now);
    return due.length ? due[0] : null;
  }

  // Daily budget: visits+searches executed today must stay under the cap.
  function budgetRemaining(level, statsToday) {
    var used = (statsToday.visits || 0) + (statsToday.searches || 0);
    return Math.max(0, level.dailyVisitBudget - used);
  }

  function dateKeyOf(d) {
    var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
    var day = String(d.getDate()); if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }

  return {
    LEVELS: LEVELS,
    DEFAULT_ACTIVE_HOURS: DEFAULT_ACTIVE_HOURS,
    SESSION_MIN_MINUTES: SESSION_MIN_MINUTES,
    SESSION_MAX_MINUTES: SESSION_MAX_MINUTES,
    levelConfig: levelConfig,
    effectiveLevelName: effectiveLevelName,
    effectiveLevel: effectiveLevel,
    spreadTimes: spreadTimes,
    scheduleSteps: scheduleSteps,
    planSessions: planSessions,
    groupSessions: groupSessions,
    canUseGoogleSearch: canUseGoogleSearch,
    dueSteps: dueSteps,
    nextPendingStep: nextPendingStep,
    budgetRemaining: budgetRemaining,
    dateKeyOf: dateKeyOf
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.Scheduler;
