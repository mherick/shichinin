// Shichinin — cookie classification + replacement-value generation (pure).
//
// Classification order matters and is deliberate:
//   1. Known tracker names/domains  -> 'tracker'   (checked FIRST, because
//      some tracker cookies have names that look session-ish, e.g. _uetsid)
//   2. Session/auth-shaped names, or session cookies -> 'protected'
//      (NEVER mutated — logins must keep working; when in doubt, protect)
//   3. Known functional names        -> 'functional' (never mutated)
//   4. Heuristic ID-like cookies     -> 'unknown-id' (mutated only when
//      Safe Mode is OFF)
//   5. Everything else               -> 'unknown'   (never mutated)
var Shichinin = (typeof Shichinin !== 'undefined') ? Shichinin : {};

Shichinin.CookieClassify = (function () {
  var TRACKER_NAME_PATTERNS = [
    /^_ga($|_)/, /^_gid$/, /^_gat($|_)/, /^_gcl_/, /^_gads$/, /^_gpi$/,
    /^_fbp$/, /^_fbc$/, /^_hjid$/, /^_hjSession/, /^_hjAbsoluteSession/,
    /^_pk_id\./, /^_pk_ref\./, /^_uetsid$/, /^_uetvid$/, /^IDE$/,
    /^test_cookie$/, /^_scid$/, /^_sctr$/, /^cto_bundle$/, /^_ttp$/,
    /^_tt_enable_cookie$/, /^li_sugr$/, /^bcookie$/, /^_rdt_uuid$/,
    /^ajs_anonymous_id$/, /^_pin_unauth$/, /^_derived_epik$/, /^epik$/,
    /^fr$/, /^_yasc$/, /^_ym_uid$/, /^_ym_d$/
  ];

  var TRACKER_DOMAINS = [
    'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
    'googleadservices.com', 'facebook.net', 'analytics.twitter.com',
    'bat.bing.com', 'ads.yahoo.com', 'adservice.google.com',
    'amazon-adsystem.com', 'criteo.com', 'criteo.net', 'taboola.com',
    'outbrain.com', 'scorecardresearch.com', 'quantserve.com',
    'hotjar.com', 'clarity.ms', 'adsrvr.org', 'advertising.com',
    'mathtag.com', 'rlcdn.com', 'casalemedia.com', 'pubmatic.com',
    'rubiconproject.com', 'openx.net', 'smartadserver.com',
    'teads.tv', 'sharethrough.com', 'triplelift.com', 'indexww.com'
  ];

  // Names that strongly suggest session/auth/security state. Err toward
  // protecting: a false 'protected' costs a little noise; a false mutation
  // costs a broken login.
  var PROTECTED_NAME = /(sess|(^|[^a-z])ses([^a-z]|$)|session|auth|token|login|logon|sid|csrf|xsrf|jwt|passw|secret|remember|account|oauth|sso|bearer|credential|otp|2fa|verify|secure|signed_in|logged)/i;

  var EXPLICIT_PROTECTED_NAMES = [
    'phpsessid', 'asp.net_sessionid', 'jsessionid', 'sessionid',
    'connect.sid', 'laravel_session', 'rack.session', '_session_id',
    'csrftoken', 'x-csrf', '__requestverificationtoken', 'wordpress_logged_in'
  ];

  var FUNCTIONAL_NAMES = [
    'cookieconsent', 'cookies-accepted', 'cookie_consent', 'consent',
    'gdpr-consent', 'optanonconsent', 'lang', 'language', 'locale',
    'currency', 'theme', 'darkmode', 'dark_mode', 'timezone', 'tz',
    'country', 'region', 'contrast', 'fontsize', 'accessibility'
  ];

  function domainMatches(domain, list) {
    var d = String(domain || '').replace(/^\./, '').toLowerCase();
    return list.some(function (t) {
      return d === t || d.slice(-(t.length + 1)) === '.' + t;
    });
  }

  function classify(cookie) {
    var name = String(cookie.name || '');
    var lower = name.toLowerCase();
    var domain = String(cookie.domain || '');

    // 1. Known trackers first.
    for (var i = 0; i < TRACKER_NAME_PATTERNS.length; i++) {
      if (TRACKER_NAME_PATTERNS[i].test(name)) {
        return { cls: 'tracker', reason: 'known tracker name pattern', rotatable: true };
      }
    }
    if (domainMatches(domain, TRACKER_DOMAINS)) {
      return { cls: 'tracker', reason: 'known tracker domain', rotatable: true };
    }

    // 2. Protected: session/auth. Never touched.
    if (EXPLICIT_PROTECTED_NAMES.indexOf(lower) !== -1 || lower.indexOf('wordpress_logged_in') === 0) {
      return { cls: 'protected', reason: 'explicit session/auth cookie', rotatable: false };
    }
    if (PROTECTED_NAME.test(name)) {
      return { cls: 'protected', reason: 'session/auth-shaped name', rotatable: false };
    }
    if (cookie.session === true) {
      return { cls: 'protected', reason: 'session cookie (no expiry)', rotatable: false };
    }

    // 3. Functional.
    if (FUNCTIONAL_NAMES.indexOf(lower) !== -1) {
      return { cls: 'functional', reason: 'known functional cookie', rotatable: false };
    }

    // 4. ID-like heuristic.
    if (looksLikeIdValue(cookie.value) && name.replace(/[^a-z0-9_]/gi, '').length <= 32) {
      return { cls: 'unknown-id', reason: 'ID-like value, unrecognized name', rotatable: false };
    }

    return { cls: 'unknown', reason: 'unrecognized', rotatable: false };
  }

  // --- value shapes -------------------------------------------------------

  // JWT-shaped: three base64url segments separated by dots.
  function looksSigned(value) {
    var v = String(value || '');
    var parts = v.split('.');
    return parts.length === 3 &&
      parts.every(function (p) { return /^[A-Za-z0-9_-]+$/.test(p) && p.length >= 4; }) &&
      v.length > 40;
  }

  function looksLikeIdValue(value) {
    var v = String(value || '');
    if (v.length < 12) return false;
    if (/^[0-9a-f]{16,}$/i.test(v)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
    if (/^GA\d\.\d\.\d+\.\d+$/.test(v)) return true;
    if (/^[A-Za-z0-9_-]{20,}$/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v)) return true;
    return false;
  }

  // Generate a plausible replacement value with the same shape as the old
  // one, so the cookie still "looks like" the tracker's own format.
  function generateReplacementValue(cookie, rng) {
    var v = String(cookie.value || '');
    var m;
    if ((m = v.match(/^GA(\d)\.(\d)\.(\d+)\.(\d+)$/))) {
      return 'GA' + m[1] + '.' + m[2] + '.' + rng.int(100000000, 2147483647) + '.' + rng.int(1500000000, 1999999999);
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      return generateUuid(rng);
    }
    if (/^\d+$/.test(v) && v.length >= 6) { // checked before hex: digits are hex chars too
      var digits = '';
      for (var i = 0; i < v.length; i++) digits += String(rng.int(0, 9));
      return digits;
    }
    if (/^[0-9a-f]+$/i.test(v) && v.length >= 8) {
      return randomHex(v.length, rng, v === v.toUpperCase());
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) {
      return rng.int(1, 9) + '.' + rng.int(100000000, 999999999) + '.' + rng.int(100000000, 999999999) + '.' + rng.int(1500000000, 1999999999);
    }
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    var len = Math.min(Math.max(v.length, 16), 64);
    for (var j = 0; j < len; j++) out += chars[rng.int(0, chars.length - 1)];
    return out;
  }

  function generateUuid(rng) {
    function hex(n) { return randomHex(n, rng, false); }
    return hex(8) + '-' + hex(4) + '-4' + hex(3) + '-' +
      '89ab'[rng.int(0, 3)] + hex(3) + '-' + hex(12);
  }

  function randomHex(len, rng, upper) {
    var chars = upper ? '0123456789ABCDEF' : '0123456789abcdef';
    var out = '';
    for (var i = 0; i < len; i++) out += chars[rng.int(0, 15)];
    return out;
  }

  return {
    TRACKER_DOMAINS: TRACKER_DOMAINS,
    classify: classify,
    looksSigned: looksSigned,
    looksLikeIdValue: looksLikeIdValue,
    generateReplacementValue: generateReplacementValue,
    generateUuid: generateUuid
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Shichinin.CookieClassify;
