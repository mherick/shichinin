// Shichinin — content script.
// Jobs:
//   1. Consent posture: find an "Accept all" consent control and activate
//      it (logged). If there is no confident accept-all, do nothing.
//   2. Persona steps: when the background says this tab is executing a
//      step, perform dwell + human-ish scrolling, persona searches, and
//      conservative storage litter, then report completion.
//
// DESIGN LAW: this file contains exactly ONE element-activation call,
// inside sanctionedClick() below, and it only ever fires for the two
// sanctioned kinds: 'consent-accept' and 'search' (the search form's own
// submit control). There is no code path that activates ads, links,
// signup or purchase elements.
(function () {
  'use strict';
  if (window.top !== window) return; // top frame only

  var S = Shichinin;

  function sanctionedClick(el, kind) {
    if (kind !== 'consent-accept' && kind !== 'search') {
      throw new Error('Shichinin design law: unsanctioned activation kind "' + kind + '"');
    }
    S.Actions.assertAllowed(kind);
    el.click();
  }

  function sendLog(kind, detail) {
    try {
      chrome.runtime.sendMessage({ type: 'SHICHININ_LOG', kind: kind, detail: detail });
    } catch (e) { /* extension context may be gone; ignore */ }
  }

  function getSettings() {
    return chrome.storage.local.get(['settings']).then(function (data) {
      return S.Settings.merge(data.settings);
    });
  }

  // ----- consent ------------------------------------------------------------

  function ancestorContext(el) {
    var parts = [];
    var node = el;
    for (var i = 0; i < 5 && node; i++) {
      if (node.id) parts.push('#' + node.id);
      if (node.className && typeof node.className === 'string') parts.push('.' + node.className.split(/\s+/).join('.'));
      node = node.parentElement;
    }
    return parts.join(' ');
  }

  function tryConsentAccept() {
    var el = null;
    var i, candidate;
    for (i = 0; i < S.Consent.KNOWN_CMP_SELECTORS.length && !el; i++) {
      try { candidate = document.querySelector(S.Consent.KNOWN_CMP_SELECTORS[i]); }
      catch (e) { candidate = null; }
      if (candidate && candidate.offsetParent !== null) el = candidate;
    }
    if (!el) {
      var nodes = document.querySelectorAll(
        'button, [role="button"], input[type="button"], input[type="submit"], a');
      var descriptors = [];
      var elements = [];
      for (i = 0; i < nodes.length && elements.length < 200; i++) {
        var n = nodes[i];
        if (n.offsetParent === null) continue; // not visible
        var text = (n.innerText || n.value || n.textContent || '').trim();
        if (!text && !n.id) continue;
        descriptors.push({
          text: text, id: n.id || '',
          className: typeof n.className === 'string' ? n.className : '',
          context: ancestorContext(n)
        });
        elements.push(n);
      }
      var idx = S.Consent.findAcceptCandidate(descriptors);
      if (idx >= 0) el = elements[idx];
    }
    if (el) {
      sanctionedClick(el, 'consent-accept');
      sendLog('consent-accept', location.hostname + ' — "' +
        (el.innerText || el.id || 'accept button').trim().slice(0, 60) + '"');
      return true;
    }
    return false;
  }

  // ----- dwell + scroll -------------------------------------------------------

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function dwellAndScroll(dwellSec, rng) {
    var totalMs = rng.int(dwellSec[0], dwellSec[1]) * 1000;
    var deadline = Date.now() + Math.min(totalMs, 5 * 60 * 1000);
    function loop() {
      if (Date.now() >= deadline) return Promise.resolve();
      var dy = rng.int(200, 650);
      if (rng.chance(0.15)) dy = -rng.int(80, 240); // occasional scroll-back
      window.scrollBy(0, dy);
      return sleep(rng.int(700, 1700)).then(loop);
    }
    return loop();
  }

  // ----- storage litter -----------------------------------------------------

  function attemptStorageLitter(step) {
    var rng = S.Rng.create('litter:' + step.id);
    var seeded = 0, observed = 0;
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      observed = keys.length;
      keys.forEach(function (key) {
        var entry = S.StorageLitter.matchKey(key);
        if (entry) {
          localStorage.setItem(key, S.StorageLitter.generateSeedValue(entry, rng));
          seeded++;
          sendLog('storage-seed', location.hostname + ' — key "' + key + '" (' + entry.description + ')');
        }
      });
      if (!seeded) {
        sendLog('storage-observe', location.hostname + ' — observed ' + observed +
          ' localStorage keys, none on the analytics allowlist');
      }
    } catch (e) {
      sendLog('storage-observe', location.hostname + ' — localStorage unavailable');
    }
    return seeded;
  }

  // ----- search execution ----------------------------------------------------

  function findSearchInput(step) {
    var selectors = [
      'textarea[name="q"]', 'input[name="q"]', '#searchbox_input',
      'input[type="search"]', 'input[name="query"]', 'input[id*="search" i]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function setInputValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function performSearch(step) {
    var flagKey = 'shichinin_step_' + step.id;
    if (sessionStorage.getItem(flagKey) === 'searched') {
      return Promise.resolve('already-searched'); // we are on the results page
    }
    var input = findSearchInput(step);
    if (!input) {
      sessionStorage.setItem(flagKey, 'searched');
      location.href = step.resultsPrefix + encodeURIComponent(step.query);
      return Promise.resolve('navigated-direct');
    }
    input.focus();
    setInputValue(input, step.query);
    sessionStorage.setItem(flagKey, 'searched');
    return sleep(450).then(function () {
      var form = input.form;
      if (form) {
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      } else {
        location.href = step.resultsPrefix + encodeURIComponent(step.query);
      }
      return 'submitted';
    });
  }

  // ----- main -----------------------------------------------------------------

  function reportDone(outcome) {
    try {
      chrome.runtime.sendMessage({ type: 'SHICHININ_STEP_DONE', outcome: outcome });
    } catch (e) { /* ignore */ }
  }

  function executeStep(step, settings) {
    var rng = S.Rng.create('exec:' + step.id + ':' + Date.now());
    var work;
    if (step.action === 'search') {
      work = performSearch(step)
        .then(function () { return sleep(1200); })
        .then(function () { return dwellAndScroll(step.dwellSec, rng); });
    } else { // visit
      work = dwellAndScroll(step.dwellSec, rng);
    }
    return work.then(function () {
      attemptStorageLitter(step);
      reportDone('done');
    }).catch(function () {
      reportDone('failed');
    });
  }

  function init() {
    getSettings().then(function (settings) {
      var hostPaused = S.Settings.isHostPaused(location.hostname, settings.pausedSites);

      if (settings.consentAutoAccept && !settings.paused && !hostPaused) {
        // CMPs often render late; try a few times, then stop.
        var attempts = 0;
        var timer = setInterval(function () {
          attempts++;
          if (tryConsentAccept() || attempts >= 4) clearInterval(timer);
        }, 900);
      }

      if (settings.paused || hostPaused) return;

      chrome.runtime.sendMessage({ type: 'SHICHININ_GET_INSTRUCTIONS' })
        .then(function (resp) {
          if (resp && resp.step) executeStep(resp.step, settings);
        })
        .catch(function () { /* not a persona tab; normal page */ });
    }).catch(function () { /* storage unavailable; do nothing */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
