// Shichinin popup: status pill, big Start/Pause button, plain
// Light / Standard / High choices, and today's activity in plain words.
(function () {
  var LEVELS = ['low', 'medium', 'high'];
  var HINTS = {
    low: 'A light dusting of decoy activity.',
    medium: 'A steady amount of decoy activity.',
    high: 'The most decoy activity — the recommended setting.'
  };
  var SEG_IDS = { low: 'aggrLow', medium: 'aggrStd', high: 'aggrHigh' };
  var HOUSEHOLD_LINES = {
    adults: 'Household: Adults only',
    child: 'Household: A child uses this browser',
    mixed: 'Household: A mix of people'
  };
  var settings = null;

  function $(id) { return document.getElementById(id); }

  function render(state) {
    settings = state.settings;
    var stats = state.stats || {};
    var pill = $('status');
    pill.textContent = settings.paused ? 'Paused' : 'On';
    pill.className = 'pill' + (settings.paused ? ' paused' : '');
    var toggle = $('pauseBtn');
    toggle.textContent = settings.paused ? 'Start Shichinin' : 'Pause Shichinin';
    toggle.className = 'big-toggle' + (settings.paused ? ' paused' : '');

    LEVELS.forEach(function (lv) {
      $(SEG_IDS[lv]).classList.toggle('selected', settings.aggressiveness === lv);
    });
    $('aggrHint').textContent = HINTS[settings.aggressiveness] || HINTS.high;

    // Household status line (v0.5.0). In 'child' mode the decoys run at
    // High (full strength) whatever the stored level says — the worker
    // clamps it — and the popup says so plainly.
    var household = settings.household || 'adults';
    $('householdLine').textContent = HOUSEHOLD_LINES[household] || HOUSEHOLD_LINES.adults;
    if (household === 'child' && settings.aggressiveness !== 'high') {
      $('aggrHint').textContent =
        'A child uses this browser, so decoys run at High — full strength — no matter what is picked here.';
    }

    var visits = stats.visits || 0;
    var searches = stats.searches || 0;
    $('activityLine').textContent =
      visits + (visits === 1 ? ' visit' : ' visits') + ' and ' +
      searches + (searches === 1 ? ' search' : ' searches') +
      ' made for your decoys today.';
    $('cVisits').textContent = visits;
    $('cSearches').textContent = searches;
    $('cRot').textContent = stats.cookieRotations || 0;
    $('cExp').textContent = stats.cookieExpirations || 0;
    $('cConsent').textContent = stats.consentAccepts || 0;
    $('cSeed').textContent = stats.storageSeeds || 0;
  }

  function refresh() {
    chrome.runtime.sendMessage({ type: 'SHICHININ_GET_STATE' }).then(render);
  }

  LEVELS.forEach(function (lv) {
    $(SEG_IDS[lv]).addEventListener('click', function () {
      if (!settings || settings.aggressiveness === lv) return;
      settings.aggressiveness = lv;
      Shichinin.Store.saveSettings(settings).then(function () {
        chrome.runtime.sendMessage({ type: 'SHICHININ_REGENERATE' }).then(refresh);
      });
    });
  });

  $('pauseBtn').addEventListener('click', function () {
    settings.paused = !settings.paused;
    Shichinin.Store.saveSettings(settings).then(refresh);
  });

  $('sweepBtn').addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'SHICHININ_SWEEP_NOW' }).then(refresh);
  });

  $('dashBtn').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });

  refresh();
})();
