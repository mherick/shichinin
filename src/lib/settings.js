// Shichinin — settings: defaults, merging, pause-list matching.
// Settings live in chrome.storage.local under the key "settings".
var Shichinin = (typeof Shichinin !== 'undefined') ? Shichinin : {};

Shichinin.Settings = (function () {
  // Sites where automation must never run by default: banking, payments,
  // government identity surfaces. Users can edit this in the dashboard.
  var DEFAULT_PAUSED_SITES = [
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com',
    'capitalone.com', 'usbank.com', 'paypal.com', 'venmo.com',
    'irs.gov', 'ssa.gov', 'localhost', '127.0.0.1'
  ];

  // Household modes (v0.5.0): who uses this browser. 'adults' and
  // 'child' are the protective modes — decoys are always grown-ups and
  // child-directed/parenting content is never browsed or searched, so
  // the profile trackers build is of adults. 'mixed' is standard
  // Shichinin (every cluster in rotation). See clusters.js.
  var HOUSEHOLD_MODES = ['adults', 'child', 'mixed'];

  var DEFAULTS = {
    paused: false,
    household: 'adults',          // v0.5.0 lead purpose: adults-only profile
    aggressiveness: 'high',       // locked default (Oct 27)
    safeMode: true,               // cookie mutations: tracker list only
    consentAutoAccept: true,      // accept-all posture
    loggedInPollution: false,     // LEGACY field, kept only so settings
                                  // stored by older versions still merge.
                                  // INERT since v0.4.0: nothing reads it —
                                  // signed-in decoy activity was removed.
    liveFireUntil: 0,             // LEGACY field, same status: kept for
                                  // data migration, read by nothing.
    modelApiKey: '',              // optional Meta Model API key (local only)
    pausedSites: DEFAULT_PAUSED_SITES.slice(),
    realInterestDomains: [],      // user-listed, for the SNR estimate
    activeHours: [7, 23]
  };

  function merge(stored) {
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    if (stored) {
      for (var k2 in DEFAULTS) {
        if (stored[k2] !== undefined) out[k2] = stored[k2];
      }
    }
    // An unrecognized household value (older build, hand-edited
    // storage) falls back to the protective default rather than
    // silently widening the decoy pool.
    if (HOUSEHOLD_MODES.indexOf(out.household) === -1) out.household = 'adults';
    return out;
  }

  function normalizeHost(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
  }

  // Paused if hostname equals an entry or is a subdomain of it.
  function isHostPaused(hostname, pausedSites) {
    var host = normalizeHost(hostname);
    if (!host) return false;
    return (pausedSites || []).some(function (entry) {
      var e = normalizeHost(entry);
      return e && (host === e || host.slice(-(e.length + 1)) === '.' + e);
    });
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }

  return {
    DEFAULTS: DEFAULTS,
    DEFAULT_PAUSED_SITES: DEFAULT_PAUSED_SITES,
    HOUSEHOLD_MODES: HOUSEHOLD_MODES,
    merge: merge,
    isHostPaused: isHostPaused,
    hostOf: hostOf
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Shichinin.Settings;
