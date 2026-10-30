// Schroeder — storage litter, CONSERVATIVE v1.
//
// Only a small allowlist of clearly analytics-scoped localStorage keys may
// be seeded, and only keys that ALREADY EXIST on the page during a persona
// visit (we overwrite a value the site's own analytics stack wrote; we do
// not invent a zoo of new keys). If nothing matches, the content script
// observes and logs only. Anything session/auth-shaped is explicitly
// off-limits even if it somehow matched a pattern.
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.StorageLitter = (function () {
  var FORBIDDEN = /(token|auth|sess|login|user|account|cart|checkout|jwt|passw)/i;

  // Exact-name entries are curated constants (e.g. 'optimizelyEndUserId' is
  // a numeric visitor id, not a credential, despite containing "User") and
  // are matched BEFORE the forbidden-word veto. The veto guards the
  // wildcard patterns.
  var ALLOWLIST = [
    { pattern: /^ajs_anonymous_id$/, kind: 'uuid', exactName: true, description: 'Segment anonymous id' },
    { pattern: /^optimizelyEndUserId$/, kind: 'numeric16', exactName: true, description: 'Optimizely end user id' },
    { pattern: /^_ga(_.*)?$/, kind: 'ga', description: 'Google Analytics client state' },
    { pattern: /^_hj.*/, kind: 'alnum32', description: 'Hotjar state' },
    { pattern: /^mp_[a-f0-9]+_mixpanel$/, kind: 'jsonish', description: 'Mixpanel distinct state' },
    { pattern: /^amplitude_id_.*/, kind: 'alnum32', description: 'Amplitude device id state' },
    { pattern: /^_rdt_.*/, kind: 'alnum32', description: 'Reddit pixel state' },
    { pattern: /^tt_.*/, kind: 'alnum32', description: 'TikTok pixel state' }
  ];

  function matchKey(key) {
    if (!key) return null;
    var i, entry;
    for (i = 0; i < ALLOWLIST.length; i++) {
      entry = ALLOWLIST[i];
      if (entry.exactName && entry.pattern.test(key)) return entry;
    }
    if (FORBIDDEN.test(key)) return null;
    for (i = 0; i < ALLOWLIST.length; i++) {
      entry = ALLOWLIST[i];
      if (!entry.exactName && entry.pattern.test(key)) return entry;
    }
    return null;
  }

  function generateSeedValue(entry, rng) {
    switch (entry.kind) {
      case 'uuid':
        return Schroeder.CookieClassify
          ? Schroeder.CookieClassify.generateUuid(rng)
          : 'generated-by-persona-visit';
      case 'ga':
        return 'GA1.1.' + rng.int(100000000, 2147483647) + '.' + rng.int(1500000000, 1999999999);
      case 'numeric16': {
        var d = '';
        for (var i = 0; i < 16; i++) d += String(rng.int(0, 9));
        return d;
      }
      case 'jsonish':
        return JSON.stringify({ distinct_id: randomToken(24, rng) });
      default:
        return randomToken(32, rng);
    }
  }

  function randomToken(len, rng) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    for (var i = 0; i < len; i++) out += chars[rng.int(0, chars.length - 1)];
    return out;
  }

  return {
    ALLOWLIST: ALLOWLIST,
    matchKey: matchKey,
    generateSeedValue: generateSeedValue
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.StorageLitter;
