// Schroeder — Evidence Lab. Works only with REAL evidence:
// structured snapshots of what Google My Ad Center, Meta Ad Preferences
// and the DAA registry actually show, diffed locally against a baseline
// the user captures from their own accounts — plus canary matching
// (see canary.js) for causal attribution. All local; nothing is scraped
// and no extra permissions are needed — the user pastes what the pages
// show.
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.Evidence = (function () {
  // SAMPLE baseline shipped with the public repo so the shape of a
  // baseline is visible. It is NOT real data. Capture your own baseline
  // (extension paused, before you start) and replace these values.
  var BASELINE = Object.freeze({
    capturedAt: 'SAMPLE',
    source: 'SAMPLE baseline — replace with your own capture: Google My Ad Center + Meta Accounts Center → Ad preferences + DAA WebChoices',
    googleTopics: Object.freeze([
      'Sample Topic — Travel', 'Sample Topic — Cooking',
      'Sample Topic — Gardening', 'Sample Topic — Technology',
      'Sample Topic — Music', 'Sample Topic — Sports'
    ]),
    googleBrands: Object.freeze([
      'Sample Brand A', 'Sample Brand B', 'Sample Brand C'
    ]),
    metaTopics: Object.freeze([
      'Sample Meta Topic A', 'Sample Meta Topic B'
    ]),
    metaActivity: Object.freeze(['Sample Advertiser A', 'Sample Advertiser B']),
    daaStatus: 'SAMPLE — no DAA status captured'
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
    var canaryHits = (Schroeder.Canaries && Schroeder.Canaries.matchSnapshot)
      ? Schroeder.Canaries.matchSnapshot(snap) : [];
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

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.Evidence;
