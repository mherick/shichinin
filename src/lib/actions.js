// Shichinin — THE DESIGN LAW, AS CODE.
//
// Shichinin NEVER clicks ads, never follows ad links, never triggers
// conversions, signups, or purchases. That is not a comment-level promise:
// the automation may only ever dispatch actions from the allowlist below.
// Every step produced by a persona provider and every step executed by the
// scheduler/content script is checked against this list. There is
// deliberately NO generic 'click' action. The only two element activations
// in the whole system are separate, narrowly-scoped action types:
//   - 'consent-accept' : clicking an "Accept all" consent button
//   - 'search'         : entering a query on a search engine (may submit
//                        the search form — that is the search itself)
// Anything not on the list throws.
var Shichinin = (typeof Shichinin !== 'undefined') ? Shichinin : {};

Shichinin.Actions = (function () {
  var ALLOWED_ACTIONS = Object.freeze([
    'visit',           // open a page in a background tab
    'dwell',           // stay on a page for a human-ish duration
    'scroll',          // scroll a page gradually
    'search',          // enter a persona query on a search engine
    'consent-accept',  // click an "Accept all"-style consent button
    'cookie-rotate',   // replace a tracker cookie's value with pool noise
    'cookie-expire',   // expire an unrotatable tracker cookie
    'storage-seed',    // write an allowlisted analytics storage key
    'tab-open',        // scheduler bookkeeping
    'tab-close'        // scheduler bookkeeping
  ]);

  function isAllowed(type) {
    return ALLOWED_ACTIONS.indexOf(type) !== -1;
  }

  function assertAllowed(type) {
    if (!isAllowed(type)) {
      throw new Error('Shichinin design law: action "' + String(type) +
        '" is not on the automation allowlist. Ad clicks, conversions, ' +
        'signups, purchases and generic clicks are forbidden by design.');
    }
    return type;
  }

  return {
    ALLOWED_ACTIONS: ALLOWED_ACTIONS,
    isAllowed: isAllowed,
    assertAllowed: assertAllowed
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Shichinin.Actions;
