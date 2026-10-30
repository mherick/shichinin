// Shichinin — Evidence Lab (v2, Wonder build). Replaces the v1
// signal-to-noise "estimate", which was arithmetic on local counters
// dressed as a measurement. This module works only with REAL evidence:
// structured snapshots of what Google My Ad Center, Meta Ad Preferences
// and the DAA registry actually show, diffed locally against the
// pre-pollution baseline captured Oct 28, 2026 — plus canary matching
// (see canary.js) for causal attribution. All local; nothing is scraped
// and no extra permissions are needed — the user pastes what the pages
// show, exactly as the baseline was captured.
var Shichinin = (typeof Shichinin !== 'undefined') ? Shichinin : {};

Shichinin.Evidence = (function () {
  // Pre-loaded from ~/workspace/shichinin/test-evidence/
  // BASELINE-DIGEST-2026-10-28.md §1-2 (Shichinin PAUSED — pre-pollution).
  var BASELINE = Object.freeze({
    capturedAt: '2026-10-28',
    source: 'Google My Ad Center + Meta Accounts Center → Ad preferences + DAA WebChoices, Oct 28 2026, Shichinin paused',
    googleTopics: Object.freeze([
      'TV Shows & Programs', 'Internet Service Plans', 'Jewelry',
      'Pets & Animals', 'Beverages', 'Games', 'Insurance', 'Clothing',
      'Food', 'Social Networks & Online Communities', 'Restaurants',
      'Movies & Films', 'Home Furniture', 'Banking', 'Health Care Services',
      'Music & Audio', 'Building Construction & Maintenance',
      'Motor Vehicles', 'TV Broadcasting', 'Vehicle Dealers'
    ]),
    googleBrands: Object.freeze([
      'Walmart', 'Amazon.com', 'Apple', 'Capital One', 'Mazda Motor Corporation'
    ]),
    metaTopics: Object.freeze([
      'Business consulting', 'Shirts & tank tops', 'Home installation & assembly'
    ]),
    // §2 preview row: advertisers shown on the main Ad preferences page.
    metaActivity: Object.freeze(['Fieldy.ai', 'MBA at Rice', 'ReubenGeimah']),
    daaStatus: '99 participating companies, every one "No Choice Set"; Protect My Choices: not detected'
  });

  var FIELDS = ['googleTopics', 'googleBrands', 'metaTopics', 'metaActivity'];

  // Free text -> item list. Accepts newline-, comma- or "·"-separated
  // paste, matching how the baseline screenshots were transcribed.
  function parseSnapshotText(text) {
    if (Array.isArray(text)) return text.map(function (s) { return String(s).trim(); }).filter(Boolean);
    return String(text || '').split(/[\n,·;]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function normalizeSnapshot(input) {
    input = input || {};
    var snap = { capturedAt: input.capturedAt || null, daaStatus: String(input.daaStatus || '') };
    FIELDS.forEach(function (k) { snap[k] = parseSnapshotText(input[k]); });
    return snap;
  }

  function keyOf(s) { return String(s).trim().toLowerCase(); }

  function diffList(before, after) {
    var beforeKeys = {}, afterKeys = {};
    before.forEach(function (x) { beforeKeys[keyOf(x)] = x; });
    after.forEach(function (x) { afterKeys[keyOf(x)] = x; });
    return {
      retained: after.filter(function (x) { return beforeKeys[keyOf(x)] !== undefined; }),
      added: after.filter(function (x) { return beforeKeys[keyOf(x)] === undefined; }),
      removed: before.filter(function (x) { return afterKeys[keyOf(x)] === undefined; })
    };
  }

  function diffSnapshot(snapshot, baseline) {
    var b = baseline || BASELINE;
    var snap = normalizeSnapshot(snapshot);
    var diff = {};
    FIELDS.forEach(function (k) { diff[k] = diffList(b[k] || [], snap[k]); });
    diff.daaChanged = !!snap.daaStatus && snap.daaStatus !== b.daaStatus;
    return diff;
  }

  // Full analysis: diff vs baseline + canary hits + plain counts.
  // A null result is a valid, reportable result — that is the point.
  function analyze(snapshot, baseline) {
    var snap = normalizeSnapshot(snapshot);
    var diff = diffSnapshot(snap, baseline);
    var canaryHits = (Shichinin.Canaries && Shichinin.Canaries.matchSnapshot)
      ? Shichinin.Canaries.matchSnapshot(snap) : [];
    var totals = { added: 0, removed: 0, retained: 0 };
    FIELDS.forEach(function (k) {
      totals.added += diff[k].added.length;
      totals.removed += diff[k].removed.length;
      totals.retained += diff[k].retained.length;
    });
    return {
      snapshot: snap,
      diff: diff,
      canaryHits: canaryHits,
      summary: {
        addedCount: totals.added,
        removedCount: totals.removed,
        retainedCount: totals.retained,
        canaryHitCount: canaryHits.length,
        daaChanged: diff.daaChanged
      }
    };
  }

  return {
    BASELINE: BASELINE,
    FIELDS: FIELDS,
    parseSnapshotText: parseSnapshotText,
    normalizeSnapshot: normalizeSnapshot,
    diffList: diffList,
    diffSnapshot: diffSnapshot,
    analyze: analyze
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Shichinin.Evidence;
