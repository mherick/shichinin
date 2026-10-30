// Shichinin — SparkPersonaProvider (v2, Wonder build).
//
// v1's provider asked the model for executable itinerary steps. v2 demotes
// the model to ARC AUTHOR: Spark returns ONLY a persona NARRATIVE — a
// cluster pair chosen from the existing 16 clusters, query paraphrases,
// and arc-stage labels — as strict, schema-checked JSON. It NEVER returns
// steps, URLs, or executable actions. Local code (LocalPersonaProvider)
// turns the narrative into steps using only clusters.js domains, and
// every generated step still passes Actions.assertAllowed().
//
// Schema rules (validateNarrative throws on any violation, and
// PersonaEngine falls back to the local provider):
//   - top level must be an object with a "personas" array; a top-level
//     "steps" key is rejected outright (the model does not author steps);
//   - each persona: clusterIds is EXACTLY 2 ids, each present in
//     clusters.js (domains can therefore only come from clusters.js);
//   - queryParaphrases keys must be a subset of that persona's clusterIds
//     and each value a non-empty array of non-empty strings;
//   - arcStages, when present, may contain only 'browse' | 'compare' |
//     'brand'.
// With no key configured, generatePersonas throws the same clear NO_KEY
// error as v1 and the engine falls back. The live path stays untested
// against the real API (no key in this build); fake-fetch tests cover
// the schema.
var Shichinin = (typeof Shichinin !== 'undefined') ? Shichinin : {};

Shichinin.SparkPersonaProvider = (function () {
  var API_URL = 'https://api.meta.ai/v1/chat/completions';
  var MODEL = 'muse-spark-1.3';
  var ARC_STAGES = ['browse', 'compare', 'brand'];

  function create(deps) {
    deps = deps || {};
    var getApiKey = deps.getApiKey || function () { return Promise.resolve(''); };
    var fetchImpl = deps.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);

    function noKeyError() {
      var err = new Error('SparkPersonaProvider: no modelApiKey configured ' +
        '(set one in the Shichinin dashboard, or leave blank to use the local provider).');
      err.code = 'NO_KEY';
      return err;
    }

    function clusterIdList() {
      return (Shichinin.Clusters || []).map(function (c) { return c.id; });
    }

    function buildRequestBody(kind, payload) {
      var system = 'You are the arc author for Shichinin, a tracking-' +
        'pollution browser tool. You write persona NARRATIVES only. You ' +
        'never output steps, URLs, or actions. Respond with ONLY valid ' +
        'JSON, no prose.';
      var user;
      if (kind === 'personas') {
        // Back-compat kind: a narrative request framed as personas.
        user = 'Invent ' + payload.count + ' fictional browsing personas. ' +
          'Each persona: a name, an archetype, and 2-3 everyday interest ' +
          'clusters (cooking, sports, parenting, finance, crafts, cars, ' +
          'etc.). JSON shape: {"personas":[{"displayName":string,' +
          '"archetype":string,"clusterLabels":[string]}]}';
      } else { // 'narrative'
        user = 'Author ' + payload.count + ' persona narratives. Choose ' +
          'each persona\'s cluster pair ONLY from these cluster ids: ' +
          clusterIdList().join(', ') + '. For each persona also write ' +
          'query paraphrases (fresh phrasings of plausible searches) per ' +
          'cluster, and arc stage labels drawn only from: browse, ' +
          'compare, brand. NEVER include steps, URLs or actions. JSON ' +
          'shape: {"personas":[{"displayName":string,"archetype":string,' +
          '"clusterIds":[id,id],"queryParaphrases":{clusterId:[string]},' +
          '"arcStages":[string]}]}';
      }
      return {
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.9,
        response_format: { type: 'json_object' }
      };
    }

    function callSpark(kind, payload) {
      return getApiKey().then(function (key) {
        if (!key) throw noKeyError();
        if (!fetchImpl) throw new Error('SparkPersonaProvider: fetch unavailable');
        return fetchImpl(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key
          },
          body: JSON.stringify(buildRequestBody(kind, payload))
        });
      }).then(function (res) {
        if (!res || !res.ok) throw new Error('SparkPersonaProvider: API error ' + (res && res.status));
        return res.json();
      }).then(function (json) {
        var content = json && json.choices && json.choices[0] &&
          json.choices[0].message && json.choices[0].message.content;
        if (!content) throw new Error('SparkPersonaProvider: empty response');
        return JSON.parse(content);
      });
    }

    // Strict narrative schema validation. Pure; exported for tests.
    function validateNarrative(data) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('SparkPersonaProvider: narrative must be a JSON object');
      }
      if (data.steps !== undefined) {
        throw new Error('SparkPersonaProvider: narrative must not contain steps — ' +
          'the model authors narratives only; local code builds the steps');
      }
      if (!Array.isArray(data.personas) || !data.personas.length) {
        throw new Error('SparkPersonaProvider: narrative has no personas array');
      }
      return data.personas.map(function (p, i) {
        if (!p || typeof p !== 'object') {
          throw new Error('SparkPersonaProvider: persona ' + i + ' is not an object');
        }
        var ids = p.clusterIds;
        if (!Array.isArray(ids) || ids.length !== 2) {
          throw new Error('SparkPersonaProvider: persona ' + i +
            ' must choose exactly 2 clusterIds from clusters.js');
        }
        ids.forEach(function (id) {
          if (!Shichinin.ClusterById || !Shichinin.ClusterById[id]) {
            throw new Error('SparkPersonaProvider: unknown cluster id "' +
              String(id) + '" — clusters can only come from clusters.js');
          }
        });
        var paraphrases = {};
        if (p.queryParaphrases !== undefined) {
          if (!p.queryParaphrases || typeof p.queryParaphrases !== 'object' ||
              Array.isArray(p.queryParaphrases)) {
            throw new Error('SparkPersonaProvider: queryParaphrases must be an object');
          }
          Object.keys(p.queryParaphrases).forEach(function (cid) {
            if (ids.indexOf(cid) === -1) {
              throw new Error('SparkPersonaProvider: queryParaphrases for unlisted cluster "' + cid + '"');
            }
            var arr = p.queryParaphrases[cid];
            if (!Array.isArray(arr) || !arr.length ||
                !arr.every(function (q) { return typeof q === 'string' && q.trim().length > 0; })) {
              throw new Error('SparkPersonaProvider: queryParaphrases["' + cid + '"] must be non-empty strings');
            }
            paraphrases[cid] = arr.slice();
          });
        }
        var stages = ARC_STAGES.slice();
        if (p.arcStages !== undefined) {
          if (!Array.isArray(p.arcStages) ||
              !p.arcStages.every(function (s) { return ARC_STAGES.indexOf(s) !== -1; })) {
            throw new Error('SparkPersonaProvider: arcStages may only contain browse|compare|brand');
          }
          if (p.arcStages.length) stages = p.arcStages.slice();
        }
        return {
          displayName: String(p.displayName || 'Spark persona'),
          archetype: String(p.archetype || ''),
          clusterIds: ids.slice(),
          clusterLabels: ids.map(function (id) { return Shichinin.ClusterById[id].label; }),
          queryParaphrases: paraphrases,
          arcStages: stages
        };
      });
    }

    function generatePersonas(opts) {
      return callSpark('narrative', opts).then(function (data) {
        var narratives = validateNarrative(data);
        return narratives.map(function (n, i) {
          return {
            id: 'persona-spark-' + opts.seed + '-' + i,
            displayName: n.displayName,
            archetype: n.archetype,
            clusterIds: n.clusterIds,
            clusterLabels: n.clusterLabels,
            narrative: {
              queryParaphrases: n.queryParaphrases,
              arcStages: n.arcStages
            }
          };
        });
      });
    }

    // The model never authors steps. An itinerary for a Spark persona is
    // built LOCALLY from its narrative: paraphrases become the query pool
    // (queryOverrides) and every step comes out of LocalPersonaProvider,
    // hence out of clusters.js domains and through assertAllowed().
    // A persona without a narrative cannot be served here — throw, and
    // PersonaEngine falls back to the local provider wholesale.
    function generateItinerary(opts) {
      var persona = opts.persona || {};
      if (!persona.narrative) {
        return Promise.reject(new Error(
          'SparkPersonaProvider: no narrative on persona — steps are built locally from narratives only'));
      }
      var localOpts = {};
      for (var k in opts) localOpts[k] = opts[k];
      localOpts.queryOverrides = persona.narrative.queryParaphrases || {};
      return Shichinin.LocalPersonaProvider.generateItinerary(localOpts);
    }

    return {
      name: 'spark',
      buildRequestBody: buildRequestBody,
      validateNarrative: validateNarrative,
      generatePersonas: generatePersonas,
      generateItinerary: generateItinerary
    };
  }

  return { create: create, API_URL: API_URL, MODEL: MODEL, ARC_STAGES: ARC_STAGES };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Shichinin.SparkPersonaProvider;
