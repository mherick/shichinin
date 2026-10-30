// Schroeder — interest clusters for the local persona generator.
// Each cluster: real sites a person with this interest plausibly visits,
// and a bank of search queries such a person plausibly types.
// Sites are ordinary content/publisher pages. No ad links, ever.
//
// v2 (Wonder build) — tag-weighted destinations: each site is now an
// object { url, tagScore, revisit }. tagScore (1-3) is a HAND-CURATED
// estimate of how heavily the publisher's pages carry third-party ad /
// remarketing tags (Meta Pixel, Google Ads/GA, network tags): 3 = large
// ad-supported publisher, 2 = mid-size with some tagging, 1 = small or
// subscription/enthusiast site with little tagging. Scores were assigned
// by publisher profile in Oct 2026 (no runtime detection, no extra
// permissions); a stale or wrong score degrades to v1 behavior, never
// breakage. revisit: true marks sites worth a repeat visit within 48h
// (remarketing pools reward revisits).
var Schroeder = (typeof Schroeder !== 'undefined') ? Schroeder : {};

Schroeder.Clusters = [
  {
    id: 'sourdough',
    label: 'Home baking & sourdough',
    archetype: 'the sourdough obsessive',
    sites: [
      { url: 'https://www.kingarthurbaking.com/recipes', tagScore: 3, revisit: true },
      { url: 'https://www.theperfectloaf.com/guides/', tagScore: 1, revisit: false },
      { url: 'https://www.bbcgoodfood.com/recipes/collection/bread-recipes', tagScore: 3, revisit: true },
      { url: 'https://www.seriouseats.com/bread-recipes-5091376', tagScore: 3, revisit: true },
      { url: 'https://www.feastingathome.com/category/recipes/bread/', tagScore: 2, revisit: true }
    ],
    queries: [
      'sourdough starter feeding ratio', 'why is my sourdough gummy',
      'best dutch oven for bread baking', 'sourdough discard crackers recipe',
      'hydration percentage bread dough chart', 'how to strengthen weak starter',
      'ear on sourdough how to get', 'whole wheat sourdough recipe beginner'
    ]
  },
  {
    id: 'marathon',
    label: 'Marathon & endurance training',
    archetype: 'the marathon trainee',
    sites: [
      { url: 'https://www.runnersworld.com/training/', tagScore: 3, revisit: true },
      { url: 'https://www.marathontrainingacademy.com/', tagScore: 1, revisit: false },
      { url: 'https://www.halhigdon.com/training-programs/marathon-training/', tagScore: 1, revisit: false },
      { url: 'https://www.outsideonline.com/health/training-performance/', tagScore: 3, revisit: true },
      { url: 'https://www.runnersconnect.net/running-tips/', tagScore: 1, revisit: false }
    ],
    queries: [
      'marathon training plan 16 weeks intermediate', 'best carbon plate racing shoes 2026',
      'how to avoid hitting the wall marathon', 'zone 2 heart rate running calculator',
      'marathon gel strategy every how many miles', 'shin splints treatment runners',
      'tempo run vs threshold run difference', 'best marathons for first timers flat course'
    ]
  },
  {
    id: 'newparent',
    label: 'New parent & baby gear',
    archetype: 'the researching new parent',
    sites: [
      { url: 'https://www.babylist.com/hello-baby', tagScore: 3, revisit: true },
      { url: 'https://www.whattoexpect.com/first-year/', tagScore: 3, revisit: true },
      { url: 'https://www.lucieslist.com/', tagScore: 2, revisit: true },
      { url: 'https://www.healthychildren.org/English/Pages/default.aspx', tagScore: 1, revisit: false },
      { url: 'https://www.takingcarababy.com/blogs/home', tagScore: 2, revisit: true }
    ],
    queries: [
      'best stroller for newborn and toddler', 'baby sleep regression 4 months what to do',
      'convertible car seat vs infant carrier', 'when to start tummy time',
      'best white noise machine baby', 'baby led weaning first foods list',
      'how many diapers per day newborn', 'best baby carrier for bad back'
    ]
  },
  {
    id: 'indexinvesting',
    label: 'Personal finance & index investing',
    archetype: 'the index-fund optimizer',
    sites: [
      { url: 'https://www.bogleheads.org/wiki/Main_Page', tagScore: 1, revisit: false },
      { url: 'https://www.mrmoneymustache.com/blog/', tagScore: 2, revisit: true },
      { url: 'https://www.nerdwallet.com/category/investing', tagScore: 3, revisit: true },
      { url: 'https://www.investopedia.com/investing-4427685', tagScore: 3, revisit: true },
      { url: 'https://www.physicianonfire.com/blog/', tagScore: 2, revisit: true }
    ],
    queries: [
      'three fund portfolio allocation by age', 'roth ira vs traditional 401k math',
      'best high yield savings account rates', 'i bonds vs treasury bills 2026',
      'tax loss harvesting rules wash sale', 'how much emergency fund do i need',
      'vti vs voo difference', 'backdoor roth ira step by step'
    ]
  },
  {
    id: 'diyrenovation',
    label: 'Home renovation & DIY',
    archetype: 'the weekend renovator',
    sites: [
      { url: 'https://www.familyhandyman.com/project/', tagScore: 3, revisit: true },
      { url: 'https://www.thisoldhouse.com/how-to', tagScore: 3, revisit: true },
      { url: 'https://www.bobvila.com/category/diy/', tagScore: 3, revisit: true },
      { url: 'https://www.houzz.com/discussions', tagScore: 3, revisit: true },
      { url: 'https://www.finehomebuilding.com/blog', tagScore: 2, revisit: true }
    ],
    queries: [
      'how to patch large drywall hole', 'lvp flooring vs laminate durability',
      'best cordless drill for homeowner', 'how to unclog french drain',
      'tile backsplash grout spacing', 'cost to replace water heater 2026',
      'how to level a sloping floor', 'paint sheen for bathroom walls'
    ]
  },
  {
    id: 'gardening',
    label: 'Gardening & homesteading',
    archetype: 'the backyard homesteader',
    sites: [
      { url: 'https://www.gardeners.com/blogs', tagScore: 2, revisit: true },
      { url: 'https://www.almanac.com/gardening', tagScore: 3, revisit: true },
      { url: 'https://www.epicgardening.com/blog/', tagScore: 3, revisit: true },
      { url: 'https://www.morningchores.com/', tagScore: 2, revisit: true },
      { url: 'https://www.growveg.com/guides/', tagScore: 2, revisit: true }
    ],
    queries: [
      'when to start tomato seeds indoors zone 6', 'raised bed soil mix ratio',
      'how to keep deer out of garden', 'best laying hens for beginners',
      'companion planting chart vegetables', 'canning tomatoes water bath time',
      'soil ph test at home vinegar', 'fall garlic planting depth'
    ]
  },
  {
    id: 'photography',
    label: 'Photography',
    archetype: 'the golden-hour photographer',
    sites: [
      { url: 'https://www.dpreview.com/articles', tagScore: 3, revisit: true },
      { url: 'https://www.fstoppers.com/', tagScore: 3, revisit: true },
      { url: 'https://www.petapixel.com/news/', tagScore: 3, revisit: true },
      { url: 'https://www.lightroompresets.com/blogs/news', tagScore: 2, revisit: true },
      { url: 'https://www.bhphotovideo.com/explora/photography', tagScore: 3, revisit: true }
    ],
    queries: [
      'best 35mm prime lens street photography', 'mirrorless vs dslr in 2026',
      'how to shoot in manual mode cheat sheet', 'golden hour portrait settings',
      'lightroom vs capture one color', 'best camera bag for travel carry on',
      'film photography developing at home', 'nd filter for waterfalls how many stops'
    ]
  },
  {
    id: 'ev',
    label: 'Electric vehicles',
    archetype: 'the EV comparison shopper',
    sites: [
      { url: 'https://insideevs.com/news/', tagScore: 3, revisit: true },
      { url: 'https://electrek.co/guides/ev/', tagScore: 3, revisit: true },
      { url: 'https://www.cars.com/articles/electric-cars/', tagScore: 3, revisit: true },
      { url: 'https://www.consumerreports.org/cars/hybrids-evs/', tagScore: 1, revisit: false },
      { url: 'https://cleantechnica.com/category/clean-transport-2/', tagScore: 3, revisit: true }
    ],
    queries: [
      'ev battery degradation after 100k miles', 'best electric suv under 45k',
      'home level 2 charger installation cost', 'ev tax credit rules 2026',
      'real world range test highway speed', 'lithium iron phosphate vs nmc battery',
      'cheapest ev lease deals this month', 'do evs need less maintenance really'
    ]
  },
  {
    id: 'pcbuilding',
    label: 'PC building & mechanical keyboards',
    archetype: 'the keyboard-and-GPU tinkerer',
    sites: [
      { url: 'https://www.tomshardware.com/news/news', tagScore: 3, revisit: true },
      { url: 'https://www.pcgamer.com/news/', tagScore: 3, revisit: true },
      { url: 'https://www.keebtalk.com/latest', tagScore: 1, revisit: false },
      { url: 'https://www.rtings.com/keyboard/reviews/best', tagScore: 3, revisit: true },
      { url: 'https://pcpartpicker.com/guide/', tagScore: 3, revisit: true }
    ],
    queries: [
      'best budget gpu for 1440p gaming', 'gateron vs cherry mx switches sound',
      'how to lube keyboard switches', 'am5 vs lga 1700 platform longevity',
      '75 percent keyboard with knob', 'pc build under 1000 dollars 2026',
      'thermal paste how much to apply', 'hot swappable keyboard under 100'
    ]
  },
  {
    id: 'travelhacking',
    label: 'Travel hacking & backpacking',
    archetype: 'the points-and-miles backpacker',
    sites: [
      { url: 'https://www.thepointsguy.com/news/', tagScore: 3, revisit: true },
      { url: 'https://www.nomadicmatt.com/travel-blogs/', tagScore: 2, revisit: true },
      { url: 'https://www.lonelyplanet.com/articles', tagScore: 3, revisit: true },
      { url: 'https://www.traveloffpath.com/news/', tagScore: 3, revisit: true }
    ],
    queries: [
      'best travel credit card sign up bonus', 'how to find mistake fares',
      'one bag packing list 7kg', 'cheapest month to fly to japan',
      'travel insurance worth it backpacking', 'esim vs local sim europe',
      'hostel vs hotel solo travel europe', 'carry on only winter trip packing'
    ]
  },
  {
    id: 'skincare',
    label: 'Skincare & beauty',
    archetype: 'the skincare routine builder',
    sites: [
      { url: 'https://www.byrdie.com/skincare', tagScore: 3, revisit: true },
      { url: 'https://www.allure.com/skin-care', tagScore: 3, revisit: true },
      { url: 'https://www.paulaschoice.com/expert-advice', tagScore: 3, revisit: true },
      { url: 'https://www.dermstore.com/blog/', tagScore: 3, revisit: true },
      { url: 'https://www.beautypedia.com/skin-care-reviews', tagScore: 2, revisit: true }
    ],
    queries: [
      'retinol beginner routine sandwich method', 'vitamin c serum under 30 dollars',
      'how to repair damaged skin barrier', 'niacinamide vs azelaic acid',
      'best sunscreen no white cast', 'order of skincare products morning',
      'cerave vs la roche posay cleanser', 'how often to exfoliate oily skin'
    ]
  },
  {
    id: 'boardgames',
    label: 'Board games & tabletop RPGs',
    archetype: 'the game-night host',
    sites: [
      { url: 'https://boardgamegeek.com/wiki/page/Index', tagScore: 2, revisit: true },
      { url: 'https://www.dicebreaker.com/categories/board-game/news', tagScore: 3, revisit: true },
      { url: 'https://www.polygon.com/tabletop-games', tagScore: 3, revisit: true },
      { url: 'https://www.shutupandsitdown.com/read/', tagScore: 2, revisit: true },
      { url: 'https://www.enworld.org/', tagScore: 2, revisit: true }
    ],
    queries: [
      'best two player board games 2026', 'wingspan vs ark nova complexity',
      'how to teach catan to beginners', 'best gateway board games for family',
      'dnd one shot for new players', 'board game storage solutions small apartment',
      'cooperative board games not pandemic', 'best card games for 6 players'
    ]
  },
  {
    id: 'astronomy',
    label: 'Astronomy & astrophotography',
    archetype: 'the backyard astronomer',
    sites: [
      { url: 'https://skyandtelescope.org/astronomy-news/', tagScore: 2, revisit: true },
      { url: 'https://www.cloudynights.com/page/articles', tagScore: 2, revisit: true },
      { url: 'https://www.space.com/news', tagScore: 3, revisit: true },
      { url: 'https://astrophotography.com/articles/', tagScore: 1, revisit: false },
      { url: 'https://www.skyatnightmagazine.com/news/', tagScore: 3, revisit: true }
    ],
    queries: [
      'best beginner telescope under 500', 'how to find dark sky sites near me',
      'astrophotography with dslr settings', 'dobsonian vs refractor for planets',
      'what is bortle scale my area', 'best eyepieces for 8 inch dobsonian',
      'meteor shower calendar 2026', 'how to collimate a newtonian telescope'
    ]
  },
  {
    id: 'dogcare',
    label: 'Dog care & training',
    archetype: 'the first-time dog owner',
    sites: [
      { url: 'https://www.akc.org/expert-advice/', tagScore: 2, revisit: true },
      { url: 'https://www.petmd.com/dog/general-health', tagScore: 3, revisit: true },
      { url: 'https://www.rover.com/blog/', tagScore: 3, revisit: true },
      { url: 'https://www.whole-dog-journal.com/blog/', tagScore: 1, revisit: false },
      { url: 'https://www.dailypaws.com/dogs-puppies', tagScore: 3, revisit: true }
    ],
    queries: [
      'puppy crate training first week schedule', 'best food for dog sensitive stomach',
      'how much exercise does a border collie need', 'leash reactivity training steps',
      'puppy socialization checklist before 16 weeks', 'best puzzle toys for smart dogs',
      'how often to bathe a double coat dog', 'signs of separation anxiety dogs'
    ]
  },
  {
    id: 'watches',
    label: 'Watches & collecting',
    archetype: 'the watch collector',
    sites: [
      { url: 'https://www.hodinkee.com/articles', tagScore: 3, revisit: true },
      { url: 'https://www.watchuseek.com/forums/', tagScore: 3, revisit: true },
      { url: 'https://www.fratellowatches.com/category/news/', tagScore: 3, revisit: true },
      { url: 'https://www.ablogtowatch.com/', tagScore: 3, revisit: true },
      { url: 'https://www.timezone.com/category/articles/', tagScore: 2, revisit: true }
    ],
    queries: [
      'best automatic watch under 1000', 'seiko 5 vs orient bambino',
      'watch movement in house vs eta', 'how to read a tachymeter bezel',
      'vintage watch buying guide red flags', 'best nato strap brands',
      'watch winder necessary for automatics', '36mm vs 40mm watch wrist size'
    ]
  },
  {
    id: 'overlanding',
    label: 'Camping & overlanding',
    archetype: 'the overland trip planner',
    sites: [
      { url: 'https://www.outsideonline.com/gallery/', tagScore: 3, revisit: true },
      { url: 'https://expeditionportal.com/category/overland-journal/', tagScore: 2, revisit: true },
      { url: 'https://www.switchbacktravel.com/best-camping-gear', tagScore: 3, revisit: true },
      { url: 'https://www.rei.com/learn/expert-advice/camping', tagScore: 3, revisit: true },
      { url: 'https://www.trail4runner.com/category/overland/', tagScore: 1, revisit: false }
    ],
    queries: [
      'best rooftop tent for beginners', 'dispersed camping rules national forest',
      '12v fridge vs cooler for overlanding', 'recovery gear essentials list',
      'best budget camp kitchen setup', 'how to plan overland route offline maps',
      'sleeping pad r value by temperature', 'portable power station size for fridge'
    ]
  },
  {
    // v0.5.0 (Household build) — the adult-life signal cluster. In the
    // protective household modes ('adults' / 'child') this cluster is
    // always in rotation: SELECTIVE COHERENCE. Everything else about a
    // persona stays scrambled, but the household axis — grown-ups run
    // this home: mortgages, insurance, car repairs, careers, local
    // news, retirement — stays consistent and loud, so the profile
    // trackers build is a profile of adults.
    id: 'adultlife',
    label: 'Adult life: home, money & work admin',
    archetype: 'the grown-up running the household admin',
    adultLife: true,
    sites: [
      { url: 'https://www.bankrate.com/mortgages/', tagScore: 3, revisit: true },
      { url: 'https://www.nerdwallet.com/category/mortgages', tagScore: 3, revisit: true },
      { url: 'https://www.indeed.com/career-advice', tagScore: 3, revisit: true },
      { url: 'https://www.consumerreports.org/cars/car-repair/', tagScore: 1, revisit: false },
      { url: 'https://www.aarp.org/retirement/', tagScore: 2, revisit: true }
    ],
    queries: [
      'current mortgage rates today refinance', 'homeowners insurance what does it cover',
      'brake pad replacement cost estimate', 'how to ask for a raise at work',
      'local news headlines this morning', 'retirement catch up contributions over 50',
      'term life insurance how much coverage do i need', 'synthetic oil change interval miles'
    ]
  }
];

Schroeder.ClusterById = {};
Schroeder.Clusters.forEach(function (c) { Schroeder.ClusterById[c.id] = c; });

// ---- Household mode pools (v0.5.0) --------------------------------------
// Child-content blocklist: word-boundary patterns for terms that mark
// child-directed or parenting content. In the protective household
// modes ('adults' and 'child'), no cluster, site, or query matching
// this list may be browsed or searched by a decoy — the decoys are
// grown-ups, and the profile trackers build is of adults.
Schroeder.CHILD_CONTENT_TERMS = [
  'toy', 'toys', 'kid', 'kids', 'child', 'children', 'baby', 'babies',
  'toddler', 'newborn', 'infant', 'parent', 'parents', 'parenting',
  'cartoon', 'school', 'nursery', 'teen', 'teens', 'teenage',
  'diaper', 'diapers', 'stroller', 'playground', 'preschool',
  'kindergarten'
];
var CHILD_CONTENT_RE = new RegExp(
  '\\b(?:' + Schroeder.CHILD_CONTENT_TERMS.join('|') + ')\\b', 'i');

Schroeder.isChildContent = function (text) {
  return CHILD_CONTENT_RE.test(String(text || ''));
};

Schroeder.isProtectiveHousehold = function (household) {
  return household === 'adults' || household === 'child';
};

// A cluster's identity text: what the cluster IS (label, archetype,
// destination hosts) — as opposed to individual queries, which the
// item-level filter below handles one by one. (Dog care stays an adult
// pet-owner interest even though one of its queries mentions puzzle
// toys; the 'newparent' cluster is parenting content in its identity.)
function clusterText(cluster) {
  var parts = [cluster.label || '', cluster.archetype || ''];
  (cluster.sites || []).forEach(function (s) {
    parts.push(typeof s === 'string' ? s : s.url);
  });
  return parts.join(' ');
}

// A cluster is blocked in protective modes if its identity — label,
// archetype, or a destination URL — is child-directed or parenting
// content (e.g. the whole 'newparent' cluster). Individual stray
// queries inside an otherwise adult cluster are stripped by the
// item-level filter instead.
Schroeder.isClusterBlockedForHousehold = function (cluster) {
  return !!cluster && Schroeder.isChildContent(clusterText(cluster));
};

Schroeder.clusterAllowedForHousehold = function (clusterId, household) {
  if (!Schroeder.isProtectiveHousehold(household)) return true;
  var cluster = Schroeder.ClusterById[clusterId];
  return !!cluster && !Schroeder.isClusterBlockedForHousehold(cluster);
};

// Item-level filter (defense in depth): returns a copy of the cluster
// with any blocked site/query removed. Used at itinerary time so even a
// persona authored outside the household pool cannot emit a blocked
// destination or search in a protective mode.
Schroeder.filterClusterForHousehold = function (cluster, household) {
  if (!cluster || !Schroeder.isProtectiveHousehold(household)) return cluster;
  var sites = (cluster.sites || []).filter(function (s) {
    return !Schroeder.isChildContent(typeof s === 'string' ? s : s.url);
  });
  var queries = (cluster.queries || []).filter(function (q) {
    return !Schroeder.isChildContent(q);
  });
  if (sites.length === (cluster.sites || []).length &&
      queries.length === (cluster.queries || []).length) return cluster;
  var copy = {};
  for (var k in cluster) copy[k] = cluster[k];
  copy.sites = sites;
  copy.queries = queries;
  return copy;
};

// The cluster pool persona generation may draw from in a household
// mode. Protective modes: blocked clusters removed entirely, remaining
// clusters item-filtered, and the adult-life cluster always present
// (selective coherence — the grown-ups axis keeps recurring).
Schroeder.householdClusters = function (household) {
  if (!Schroeder.isProtectiveHousehold(household)) return Schroeder.Clusters;
  return Schroeder.Clusters
    .filter(function (c) { return !Schroeder.isClusterBlockedForHousehold(c); })
    .map(function (c) { return Schroeder.filterClusterForHousehold(c, household); });
};

Schroeder.ADULT_LIFE_CLUSTER_ID = 'adultlife';

if (typeof module !== 'undefined' && module.exports) module.exports = Schroeder.Clusters;
