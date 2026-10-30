// Schroeder — consent-banner "Accept all" matcher (pure logic).
//
// Schroeder's posture is maximal cooperation: consent banners get
// "Accept all". The matcher is deliberately conservative to guarantee we
// never click anything else:
//   - Strong accept phrases ("accept all", "allow all cookies") match
//     anywhere.
//   - Weak phrases ("accept", "i agree", "got it", "ok") match ONLY inside
//     an element whose id/class/ancestry smells like a consent container.
//   - Any candidate whose text mentions reject/manage/settings/customize/
//     preferences/essential-only is excluded, even if it also says "accept".
//   - Known CMP button ids (OneTrust, Cookiebot, Didomi, TrustArc,
//     Sourcepoint, Quantcast) match directly.
// The content script turns DOM elements into descriptors and calls
// findAcceptCandidate(); -1 means "do nothing", which is always safe.
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.Consent = (function () {
  var KNOWN_CMP_IDS = [
    'onetrust-accept-btn-handler',
    'CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    'didomi-notice-agree-button',
    'truste-consent-button',
    'sp_choice_type_11' // Sourcepoint "Accept all" choice type
  ];

  var KNOWN_CMP_SELECTORS = [
    '#onetrust-accept-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#didomi-notice-agree-button',
    '.truste-button2', '.qc-cmp2-summary-buttons button[mode="primary"]',
    '[data-testid="uc-accept-all-button"]',
    '.fc-cta-consent', '#cookiescript_accept',
    'button[data-cookiebanner="accept_button"]'
  ];

  var STRONG_PHRASES = [
    'accept all', 'accept all cookies', 'allow all', 'allow all cookies',
    'accept all and close', 'accept & close', 'accept and continue',
    'accept all & continue', 'yes, accept all', 'alle akzeptieren',
    'tout accepter', 'aceptar todo'
  ];

  var WEAK_PHRASES = [
    'accept', 'accept cookies', 'i accept', 'agree', 'i agree',
    'agree and close', 'consent', 'got it', 'ok', 'okay', 'continue',
    'yes, i agree', 'allow cookies', 'allow'
  ];

  var REJECT_MARKERS = [
    'reject', 'decline', 'deny', 'refuse', 'manage', 'settings',
    'customize', 'customise', 'preferences', 'essential only',
    'necessary only', 'only necessary', 'only essential', 'do not accept',
    'learn more', 'more info', 'details', 'show purposes'
  ];

  var CONSENT_CONTEXT = /(cookie|consent|gdpr|ccpa|privacy|cmp|banner|didomi|onetrust|trustarc|sourcepoint|quantcast|sp_message|fc-dialog)/i;

  function normalizeText(t) {
    return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function hasRejectMarker(text) {
    return REJECT_MARKERS.some(function (m) { return text.indexOf(m) !== -1; });
  }

  // Score one candidate descriptor:
  // { text, id, className, context } — context is a string describing the
  // element's ancestors (ids/classes), used for the consent-context test.
  // Returns a score > 0 for a confident accept-all, or -1.
  function scoreCandidate(desc) {
    if (!desc) return -1;
    var text = normalizeText(desc.text);
    var id = String(desc.id || '');
    if (!text && !id) return -1;

    if (KNOWN_CMP_IDS.indexOf(id) !== -1) return 100;

    if (hasRejectMarker(text)) return -1;

    var inConsentContext = CONSENT_CONTEXT.test(
      String(desc.context || '') + ' ' + String(desc.className || '') + ' ' + id);

    for (var i = 0; i < STRONG_PHRASES.length; i++) {
      if (text === STRONG_PHRASES[i]) return inConsentContext ? 95 : 85;
      if (text.indexOf(STRONG_PHRASES[i]) !== -1 && text.length <= STRONG_PHRASES[i].length + 12) return 80;
    }
    if (inConsentContext) {
      for (var j = 0; j < WEAK_PHRASES.length; j++) {
        if (text === WEAK_PHRASES[j]) return 60;
      }
    }
    return -1;
  }

  // descriptors: array in DOM order. Returns the best index or -1.
  // Ties keep the earliest in DOM order.
  function findAcceptCandidate(descriptors) {
    var best = -1, bestScore = 0;
    (descriptors || []).forEach(function (d, i) {
      var s = scoreCandidate(d);
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return bestScore >= 60 ? best : -1;
  }

  return {
    KNOWN_CMP_SELECTORS: KNOWN_CMP_SELECTORS,
    STRONG_PHRASES: STRONG_PHRASES,
    WEAK_PHRASES: WEAK_PHRASES,
    REJECT_MARKERS: REJECT_MARKERS,
    scoreCandidate: scoreCandidate,
    findAcceptCandidate: findAcceptCandidate
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.Consent;
