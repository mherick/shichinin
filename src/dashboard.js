// Shichinin dashboard (v3): plain-language, novice-first.
// Shows today's decoys, everyday settings, the sites Shichinin leaves
// alone, advanced settings (own Meta AI key), and recent activity.
// Same messages and storage as before — UI only.
(function () {
  var S = Shichinin;
  var settings = null;

  function $(id) { return document.getElementById(id); }

  // ----- household mode (v0.5.0) -----------------------------------------
  var HOUSEHOLD_INPUTS = { adults: 'householdAdults', child: 'householdChild', mixed: 'householdMixed' };
  var HOUSEHOLD_EXPLAINERS = {
    adults: 'Decoys are all grown-ups. Trackers see an adults-only home, so marketing aimed at children has nothing to aim at here.',
    child: 'Decoys are still grown-ups, and they run at full strength. A child\u2019s real clicks get buried under adult noise \u2014 the profile trackers build is of adults.',
    mixed: 'Standard Shichinin: rotating decoys scramble the profile in every direction.'
  };

  function renderHousehold() {
    var mode = (settings && settings.household) || 'adults';
    Object.keys(HOUSEHOLD_INPUTS).forEach(function (m) {
      var input = $(HOUSEHOLD_INPUTS[m]);
      input.checked = (mode === m);
      input.closest('.household-option').classList.toggle('selected', mode === m);
    });
    $('householdExplainer').textContent = HOUSEHOLD_EXPLAINERS[mode] || HOUSEHOLD_EXPLAINERS.adults;
  }

  // ----- main render ------------------------------------------------------------

  function render(state) {
    settings = state.settings;
    var plan = state.plan;

    renderHousehold();

    var pill = $('status');
    pill.textContent = settings.paused ? 'Paused' : 'On';
    pill.className = 'pill' + (settings.paused ? ' paused' : '');
    var toggle = $('pauseBtn');
    toggle.textContent = settings.paused ? 'Start Shichinin' : 'Pause Shichinin';
    toggle.className = 'big-toggle' + (settings.paused ? ' paused' : '');
    var working = $('workingLine');
    working.textContent = settings.paused
      ? 'Shichinin is paused right now — no decoy activity is happening.'
      : 'Shichinin is on and working in the background.';
    working.className = 'working-line' + (settings.paused ? ' paused' : '');

    if (plan) {
      var who = plan.providerUsed === 'spark'
        ? 'Spark (Meta AI, using your own key) dreamed up today\'s decoys'
        : 'Shichinin dreamed up today\'s decoys right on this device';
      if (plan.fallbackReason) {
        who = 'Shichinin dreamed up today\'s decoys right on this device ' +
          '(Spark couldn\'t be reached, so it planned them itself)';
      }
      $('providerNote').textContent = who +
        ' · day ' + ((plan.arcDayIndex || 0) + 1) + ' of 7 with this set of decoys' +
        ' · ' + (plan.steps ? plan.steps.length : 0) + ' activities planned for today.';
    } else {
      $('providerNote').textContent = 'No plan yet for today — one is made automatically.';
    }

    var ul = $('personas');
    ul.innerHTML = '';
    (plan && plan.personas ? plan.personas : []).forEach(function (p) {
      var total = 0, done = 0;
      (plan.steps || []).forEach(function (st) {
        if (st.personaId === p.id) {
          total++;
          if (st.status === 'done') done++;
        }
      });
      var li = document.createElement('li');
      var whoEl = document.createElement('span');
      whoEl.className = 'who';
      whoEl.textContent = p.displayName;
      var whatEl = document.createElement('span');
      whatEl.className = 'what';
      whatEl.textContent =
        'Into: ' + (p.clusterLabels || []).join(', ') +
        ' · ' + total + (total === 1 ? ' activity' : ' activities') +
        ' planned today, ' + done + ' done';
      li.appendChild(whoEl);
      li.appendChild(whatEl);
      ul.appendChild(li);
    });

    $('setSafeMode').checked = !!settings.safeMode;
    $('setConsent').checked = !!settings.consentAutoAccept;
    $('setApiKey').value = settings.modelApiKey || '';
    $('pausedSites').value = (settings.pausedSites || []).join('\n');

    var logUl = $('log');
    logUl.innerHTML = '';
    (state.log || []).slice().reverse().forEach(function (entry) {
      var li = document.createElement('li');
      var time = document.createElement('span');
      time.className = 'time';
      time.textContent = new Date(entry.ts).toLocaleTimeString();
      var kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = entry.kind;
      li.appendChild(time);
      li.appendChild(kind);
      li.appendChild(document.createTextNode(entry.detail));
      logUl.appendChild(li);
    });
  }

  function refresh() {
    chrome.runtime.sendMessage({ type: 'SHICHININ_GET_STATE' }).then(render);
  }

  function lines(id) {
    return $(id).value.split('\n').map(function (s) { return s.trim().toLowerCase(); })
      .filter(function (s) { return s.length > 0; });
  }

  // One save path for every settings field (everyday toggles + API key),
  // so saving from either button never loses the other fields.
  function saveSettingsFromForm() {
    settings.safeMode = $('setSafeMode').checked;
    settings.consentAutoAccept = $('setConsent').checked;
    settings.modelApiKey = $('setApiKey').value.trim();
    S.Store.saveSettings(settings).then(function () {
      chrome.runtime.sendMessage({ type: 'SHICHININ_REGENERATE' }).then(refresh);
    });
  }

  Object.keys(HOUSEHOLD_INPUTS).forEach(function (mode) {
    $(HOUSEHOLD_INPUTS[mode]).addEventListener('change', function () {
      if (!settings || settings.household === mode) return;
      settings.household = mode;
      // Household mode shapes the decoy pool itself, so a change means
      // a fresh plan (and, in the worker, a fresh compliant arc).
      S.Store.saveSettings(settings).then(function () {
        chrome.runtime.sendMessage({ type: 'SHICHININ_REGENERATE' }).then(refresh);
      });
    });
  });

  $('pauseBtn').addEventListener('click', function () {
    settings.paused = !settings.paused;
    S.Store.saveSettings(settings).then(refresh);
  });
  $('regenBtn').addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'SHICHININ_REGENERATE' }).then(refresh);
  });
  $('sweepBtn').addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'SHICHININ_SWEEP_NOW' }).then(refresh);
  });
  $('clearLogBtn').addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'SHICHININ_CLEAR_LOG' }).then(refresh);
  });
  $('savePausedBtn').addEventListener('click', function () {
    settings.pausedSites = lines('pausedSites');
    S.Store.saveSettings(settings).then(refresh);
  });
  $('saveSettingsBtn').addEventListener('click', saveSettingsFromForm);
  $('saveApiKeyBtn').addEventListener('click', saveSettingsFromForm);
  // ----- your Google profile copy ------------------------------------------
  // The Google boxes from the old Evidence section, kept as a plain record:
  // no comparison, no scoring — just the lists, saved in this browser.
  var GOOGLE_BASELINE_TOPICS = [
    'TV Shows & Programs', 'Internet Service Plans', 'Jewelry',
    'Pets & Animals', 'Beverages', 'Games', 'Insurance', 'Clothing',
    'Food', 'Social Networks & Online Communities', 'Restaurants',
    'Movies & Films', 'Home Furniture', 'Banking', 'Health Care Services',
    'Music & Audio', 'Building Construction & Maintenance',
    'Motor Vehicles', 'TV Broadcasting', 'Vehicle Dealers'
  ];
  var GOOGLE_BASELINE_BRANDS = [
    'Walmart', 'Amazon.com', 'Apple', 'Capital One', 'Mazda Motor Corporation'
  ];

  function listLines(id) {
    return $(id).value.split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function loadGoogleCopy() {
    S.Store.getEvidenceSnapshots().then(function (list) {
      var snap = list && list.length ? list[list.length - 1] : null;
      var topics = snap && snap.googleTopics && snap.googleTopics.length
        ? snap.googleTopics : GOOGLE_BASELINE_TOPICS;
      var brands = snap && snap.googleBrands && snap.googleBrands.length
        ? snap.googleBrands : GOOGLE_BASELINE_BRANDS;
      $('googleTopics').value = topics.join('\n');
      $('googleBrands').value = brands.join('\n');
      if (snap && snap.capturedAt) {
        $('googleSaved').textContent = 'Last saved ' + snap.capturedAt + '.';
      }
    });
  }

  $('saveGoogleBtn').addEventListener('click', function () {
    var snap = {
      capturedAt: new Date().toISOString().slice(0, 10),
      source: 'manual copy (dashboard Google boxes)',
      googleTopics: listLines('googleTopics'),
      googleBrands: listLines('googleBrands')
    };
    S.Store.saveEvidenceSnapshot(snap).then(function () {
      $('googleSaved').textContent = 'Saved ' + snap.capturedAt + '.';
    });
  });

  loadGoogleCopy();

  refresh();
})();
