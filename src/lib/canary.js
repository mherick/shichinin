// Schroeder — canary clusters (v2, Wonder build).
//
// A canary is a planted interest with three properties:
//   (i)   ABSENT from the Oct 28 ad-profile baseline,
//   (ii)  NO overlap with the real user (no AI marketing, no military),
//   (iii) distinctive vocabulary, so a substring match in a later
//         ad-profile snapshot is unambiguous.
// Because the canary was verifiably absent at baseline and the ONLY actor
// emitting it is Schroeder, a canary hit in Google My Ad Center topics or
// Meta ad topics is causal proof of pollution — not correlation, not
// profile drift. That is the Evidence Lab's kill shot.
//
// Shape mirrors clusters.js: { id, label, archetype, canary: true,
// sites: [{url, tagScore, revisit}], queries: [..], synonyms: [..] }.
// `synonyms` is the Evidence Lab match list (lowercase substrings).
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.Canaries = (function () {
  var CANARIES = [
    {
      id: 'canary-axolotl',
      label: 'Axolotl breeding & care',
      archetype: 'the axolotl breeder',
      canary: true,
      sites: [
        { url: 'https://www.thesprucepets.com/axolotl-care-1238356', tagScore: 3, revisit: true },
        { url: 'https://www.caudata.org/forum/', tagScore: 1, revisit: false },
        { url: 'https://reptilesmagazine.com/category/amphibians/', tagScore: 2, revisit: true },
        { url: 'https://www.petmd.com/fish/general-health', tagScore: 3, revisit: true }
      ],
      queries: [
        'axolotl breeding setup tank', 'how to cycle an axolotl tank',
        'axolotl gill fungus treatment', 'best earthworms for axolotls',
        'axolotl morphs golden albino vs leucistic', 'axolotl water temperature too warm fix',
        'axolotl eggs hatching brine shrimp', 'can axolotls live together safely'
      ],
      synonyms: ['axolotl', 'mexican walking fish', 'wooper', 'caudata']
    },
    {
      id: 'canary-chainsaw-carving',
      label: 'Competitive chainsaw carving',
      archetype: 'the chainsaw carver',
      canary: true,
      sites: [
        { url: 'https://www.woodmagazine.com/', tagScore: 2, revisit: true },
        { url: 'https://www.finewoodworking.com/blog', tagScore: 2, revisit: true },
        { url: 'https://www.popularmechanics.com/home/tools/', tagScore: 3, revisit: true },
        { url: 'https://www.instructables.com/', tagScore: 3, revisit: true }
      ],
      queries: [
        'chainsaw carving competition scoring', 'best carving bar and chain setup',
        'how to carve a bear with a chainsaw', 'chainsaw carving log selection green vs dry',
        'carving chain pitch safety kickback', 'chainsaw sculpture finishing oil',
        'chainsaw carving contest near me', 'detail carving with dime tip bar'
      ],
      synonyms: ['chainsaw carving', 'chainsaw sculpture', 'chainsaw carver', 'carved bear', 'wood carving competition']
    },
    {
      id: 'canary-mainframe',
      label: 'Vintage mainframe restoration',
      archetype: 'the mainframe restorer',
      canary: true,
      sites: [
        { url: 'https://www.computerhistory.org/tdih/', tagScore: 1, revisit: false },
        { url: 'https://www.vcfed.org/', tagScore: 1, revisit: false },
        { url: 'https://www.righto.com/', tagScore: 1, revisit: true },
        { url: 'https://www.curiousmarc.com/', tagScore: 1, revisit: true }
      ],
      queries: [
        'vintage mainframe restoration project', 'ibm system 360 power supply repair',
        'pdp-11 unibus troubleshooting', 'mainframe core memory repair',
        'hercules emulator vs real iron mainframe', 'restoring a dec vax 11/780',
        'mainframe blinkenlights console panel', 'where to buy vintage mainframe parts'
      ],
      synonyms: ['mainframe', 'vintage computer', 'retro computing', 'pdp-11', 'system/360', 'retrobattlestations']
    },
    {
      id: 'canary-dog-grooming',
      label: 'Competitive dog grooming',
      archetype: 'the competition groomer',
      canary: true,
      sites: [
        { url: 'https://www.akc.org/expert-advice/health/', tagScore: 2, revisit: true },
        { url: 'https://www.petmd.com/dog/general-health', tagScore: 3, revisit: true },
        { url: 'https://www.dailypaws.com/dogs-puppies', tagScore: 3, revisit: true },
        { url: 'https://www.groomerschoice.com/', tagScore: 2, revisit: true }
      ],
      queries: [
        'competitive dog grooming contest rules', 'poodle continental clip grooming competition',
        'best shears for dog grooming competition', 'creative grooming championship entry',
        'doodle show groom scissor finish', 'grooming competition time limits classes',
        'how to become a master groomer ndga', 'pet grooming expo seminars'
      ],
      synonyms: ['dog grooming', 'pet grooming', 'grooming competition', 'master groomer', 'poodle groom']
    }
  ];

  var ById = {};
  CANARIES.forEach(function (c) { ById[c.id] = c; });

  // Substring-match a block of snapshot text against every canary's
  // synonym list. Returns [{ canaryId, label, matched: [synonym, ..] }].
  function matchText(text) {
    var hay = String(text || '').toLowerCase();
    var hits = [];
    CANARIES.forEach(function (c) {
      var matched = c.synonyms.filter(function (s) { return hay.indexOf(s) !== -1; });
      if (matched.length) hits.push({ canaryId: c.id, label: c.label, matched: matched });
    });
    return hits;
  }

  // Match against a normalized snapshot object's fields (arrays + strings).
  function matchSnapshot(snapshot) {
    if (!snapshot) return [];
    var text = [];
    ['googleTopics', 'googleBrands', 'metaTopics', 'metaActivity', 'daaStatus'].forEach(function (k) {
      var v = snapshot[k];
      if (Array.isArray(v)) text.push(v.join('\n'));
      else if (v) text.push(String(v));
    });
    return matchText(text.join('\n'));
  }

  return {
    CANARIES: CANARIES,
    CANARY_IDS: CANARIES.map(function (c) { return c.id; }),
    ById: ById,
    matchText: matchText,
    matchSnapshot: matchSnapshot,
    CANARY_SHARE: 0.15
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.Canaries;
