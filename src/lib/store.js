// Schroeder — activity log + daily stats (chrome.storage.local backed).
// Everything the automation does is recorded here and shown in the
// dashboard. The modelApiKey is never written to the log.
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.Store = (function () {
  var LOG_KEY = 'activityLog';
  var STATS_KEY = 'dailyStats';
  var MAX_LOG = 600;
  var ARCS_KEY = 'personaArcs';          // v2: persistent persona arc state
  var CANARY_KEY = 'canaryEmissions';    // v2: timestamped canary emissions
  var EVIDENCE_KEY = 'evidenceSnapshots'; // v2: Evidence Lab snapshots
  var MAX_CANARY_LOG = 600;

  function getLocal(keys) { return chrome.storage.local.get(keys); }
  function setLocal(obj) { return chrome.storage.local.set(obj); }

  function emptyStats(dateKey) {
    return {
      dateKey: dateKey, visits: 0, searches: 0, consentAccepts: 0,
      cookieRotations: 0, cookieExpirations: 0, storageSeeds: 0, stepsFailed: 0
    };
  }

  function log(kind, detail) {
    return getLocal([LOG_KEY]).then(function (data) {
      var log = data[LOG_KEY] || [];
      log.push({ ts: Date.now(), kind: kind, detail: String(detail || '') });
      if (log.length > MAX_LOG) log = log.slice(log.length - MAX_LOG);
      return setLocal((function () { var o = {}; o[LOG_KEY] = log; return o; })());
    }).catch(function () { /* logging must never break automation */ });
  }

  function getLog(limit) {
    return getLocal([LOG_KEY]).then(function (data) {
      var log = data[LOG_KEY] || [];
      return limit ? log.slice(-limit) : log;
    });
  }

  function clearLog() {
    var o = {}; o[LOG_KEY] = [];
    return setLocal(o);
  }

  function getStats(dateKey) {
    return getLocal([STATS_KEY]).then(function (data) {
      var s = data[STATS_KEY];
      if (!s || s.dateKey !== dateKey) return emptyStats(dateKey);
      return s;
    });
  }

  function bumpStats(dateKey, field, n) {
    return getStats(dateKey).then(function (s) {
      s[field] = (s[field] || 0) + (n || 1);
      var o = {}; o[STATS_KEY] = s;
      return setLocal(o).then(function () { return s; });
    });
  }

  function getSettings() {
    return getLocal(['settings']).then(function (data) {
      return Schroeder.Settings.merge(data.settings);
    });
  }

  function saveSettings(settings) {
    return setLocal({ settings: Schroeder.Settings.merge(settings) });
  }

  // ----- v2: persona arc state -------------------------------------------

  function getPersonaArcs() {
    return getLocal([ARCS_KEY]).then(function (data) {
      return data[ARCS_KEY] || null;
    });
  }

  function savePersonaArcs(state) {
    var o = {}; o[ARCS_KEY] = state;
    return setLocal(o).then(function () { return state; });
  }

  // ----- v2: canary emissions ---------------------------------------------
  // Every executed canary step is recorded with its timestamp, so an
  // Evidence Lab canary hit can be matched against the exact emission
  // history: planted at T, appeared in the profile at T+n.

  function logCanaryEmission(emission) {
    var entry = {
      ts: emission.ts || Date.now(),
      canaryId: String(emission.canaryId || ''),
      personaId: String(emission.personaId || ''),
      action: String(emission.action || ''),
      query: emission.query ? String(emission.query) : null,
      url: emission.url ? String(emission.url) : null
    };
    return getLocal([CANARY_KEY]).then(function (data) {
      var list = data[CANARY_KEY] || [];
      list.push(entry);
      if (list.length > MAX_CANARY_LOG) list = list.slice(list.length - MAX_CANARY_LOG);
      var o = {}; o[CANARY_KEY] = list;
      return setLocal(o).then(function () { return entry; });
    }).catch(function () { /* logging must never break automation */ });
  }

  function getCanaryEmissions() {
    return getLocal([CANARY_KEY]).then(function (data) {
      return data[CANARY_KEY] || [];
    });
  }

  // ----- v2: evidence snapshots --------------------------------------------

  function saveEvidenceSnapshot(snapshot) {
    return getLocal([EVIDENCE_KEY]).then(function (data) {
      var list = data[EVIDENCE_KEY] || [];
      list.push(snapshot);
      var o = {}; o[EVIDENCE_KEY] = list;
      return setLocal(o).then(function () { return list; });
    });
  }

  function getEvidenceSnapshots() {
    return getLocal([EVIDENCE_KEY]).then(function (data) {
      return data[EVIDENCE_KEY] || [];
    });
  }

  return {
    log: log, getLog: getLog, clearLog: clearLog,
    getPersonaArcs: getPersonaArcs, savePersonaArcs: savePersonaArcs,
    logCanaryEmission: logCanaryEmission, getCanaryEmissions: getCanaryEmissions,
    saveEvidenceSnapshot: saveEvidenceSnapshot, getEvidenceSnapshots: getEvidenceSnapshots,
    getStats: getStats, bumpStats: bumpStats,
    emptyStats: emptyStats,
    getSettings: getSettings, saveSettings: saveSettings
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.Store;
