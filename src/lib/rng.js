// Schroeder — seedable PRNG + small random helpers.
// Used everywhere instead of Math.random so personas/itineraries are
// reproducible per day-seed (and unit-testable).
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.Rng = (function () {
  // FNV-1a string hash -> uint32 seed.
  function hashSeed(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // mulberry32
  function create(seed) {
    var a = (typeof seed === 'string') ? hashSeed(seed) : (seed >>> 0);
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      float: function (min, max) { return min + next() * (max - min); },
      int: function (min, max) { return Math.floor(next() * (max - min + 1)) + min; },
      chance: function (p) { return next() < p; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle: function (arr) {
        var out = arr.slice();
        for (var i = out.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
      },
      sample: function (arr, n) {
        return this.shuffle(arr).slice(0, n);
      }
    };
  }

  return { hashSeed: hashSeed, create: create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.Rng;
