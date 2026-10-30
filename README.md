# Shichinin

A Chrome extension that fights ad tracking with **noise instead of silence**.
Instead of blocking trackers, it feeds them a crowd: rotating, entirely
fictional grown-up personas who browse and search like ordinary adults, so
the profile trackers build for the machine is a profile of people who
don't exist.

Built during the Meta AI Developer Hackathon, October 26 – November 4, 2026.

**The name:** *Shichinin* (七人) is Japanese for "seven people" — a nod to
the seven samurai who stood between a village and what was coming for it.
Shichinin's decoys do the same for a household: they stand between the
machine and the trackers, and the profile gets built on them instead.

## Built during the event

**All code in this repo was written during the event.** The extension
was designed and built from scratch between October 28 and October 30,
2026 — v1 on Oct 28, the household build (v0.5.0) on Oct 30. No
pre-existing codebase is included, and nothing in the repo predates the
hackathon window.

## The household idea

Trackers don't just profile a person — they profile a *machine*, including
whether a child uses it, and marketing aimed at children follows that
profile. Shichinin's first setting is therefore **Household — who uses
this browser?**

- **Adults only** — every decoy is a grown-up, and the adult signal stays
  *consistent* (a recurring cluster of mortgage, insurance, careers, local
  news, retirement) while everything else about the personas scrambles.
  Trackers see an adults-only home, so child-aimed marketing has no
  target on the machine. This consistency-inside-noise is the core
  mechanism; we call it **selective coherence**.
- **A child uses this browser** — the decoys are still all grown-ups, and
  they run at full strength no matter what activity level is set. A
  child's real clicks get buried under adult noise.
- **A mix of people** — standard decoy rotation.

Shichinin makes a machine *look adults-only to ad trackers*. It does not
claim to protect children, and it does not change the ads served inside
kids' content itself — it shapes the inferred profile, which is the part
of the system that follows a household from site to site.

## How it works

- **Personas** — fictional adults (interest profiles with age bands)
  generated locally, each living a multi-day **arc**: a small story told
  in searches and visits (planning a kitchen remodel, training for a 10k,
  researching a used truck).
- **Arc authoring with Muse Spark** — if the user pastes their *own*
  Meta Model API key into Settings, arcs are written by Muse Spark
  (Meta Model API) and then **validated locally** against the household
  setting. An arc that drifts toward child or parenting territory in a
  protective mode is rejected wholesale and replaced by the local
  generator. Without a key, the local generator writes every arc. The
  key never leaves the browser's local extension storage and is never
  sent anywhere except the Meta Model API.
- **Cookie pool** — rotates rotatable tracker cookie values on a timer,
  expires signed/token values it cannot safely rotate, and never touches
  session or authentication cookies.
- **Storage litter** — conservative by design: it only seeds values under
  analytics keys that already exist on a page.
- **Consent handling** — dismisses cookie banners so decoy visits behave
  like ordinary browsing.
- **Safe mode** — a pause list (major banks, PayPal/Venmo, irs.gov,
  ssa.gov, localhost, and anything the user adds) where the engine never
  runs.
- **Evidence** — the dashboard keeps a plain record of what Google My Ad
  Center thinks the user is into, and the library can diff snapshots
  against a baseline and flag planted "canary" interests, so a user can
  check whether the noise is actually moving their profile. The repo
  ships a clearly labeled SAMPLE baseline.

## The agentic layer

The only AI component is the **arc author** (`src/lib/personas-spark.js`),
and it is deliberately on a short leash:

- **Interface** — `POST https://api.meta.ai/v1/chat/completions`, model
  `muse-spark-1.3`, called with the *user's own* Meta Model API key
  (entered in Settings, stored only in local extension storage). With no
  key configured, the provider throws `NO_KEY` and the engine uses the
  local generator (`src/lib/personas-local.js`) — the product is fully
  functional without the API.
- **What the model returns** — strict JSON *narratives* only: for each
  persona, exactly 2 cluster IDs chosen from the fixed set in
  `src/lib/clusters.js`, optional query paraphrases, and arc-stage
  labels (`browse` | `compare` | `brand`). The model never returns
  steps, URLs, or executable actions; a response containing a top-level
  `steps` key is rejected outright.
- **Validation** — every response is schema-checked locally
  (`validateNarrative`). Any violation discards the response and falls
  back to the local provider. A second, household-specific validation
  then checks the resulting arcs against the Household setting:
  in a protective mode, any arc touching the parenting cluster or
  child-content terms is rejected wholesale and regenerated locally.
- **Execution** — local code turns validated narratives into browsing
  steps using only domains from `clusters.js`, and every step still has
  to pass the frozen allowlist in `src/lib/actions.js`
  (`Actions.assertAllowed()`). The model proposes stories; it never
  drives the browser.

## Design law — what it never does

- **Never clicks ads.** Not once, not ever, under any setting.
- **No signed-in automation.** Decoy searches run only on engines where
  no account is attached (DuckDuckGo, Brave, Startpage). Google and Bing
  are not used for decoy traffic.
- No fake accounts, no fake conversions, no fake purchases.
- Never solves a CAPTCHA and never evades a block.
- Never touches session or authentication cookies.

## Honest limits

- This is **not anonymity**. It does not defeat browser fingerprinting,
  IP-based tracking, or the identity of a user who is logged in somewhere.
- It shapes *inferred* profiles (interest and cookie signals). It does
  not block contextual advertising.
- The effect is gradual: profiles update as trackers re-observe the
  machine over days, not minutes.

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** and select the repo folder.
4. Open the extension's dashboard, answer the Household question, and
   press Start.

Optional: in **Settings → Advanced**, paste your own Meta Model API key
to have Muse Spark author persona arcs. Without a key everything still
works; arcs are generated locally.

## Tests

```sh
node tests/run-tests.js
```

74 tests cover the persona engine, household validation (including
Spark-authored arcs that violate the household setting being rejected),
the scheduler's household level clamp, the cookie pool, the evidence
diffing, and a frozen-action-allowlist check that the engine's action
set is byte-identical to the audited v1 set.

## Layout

- `src/lib/` — engine modules (personas, scheduler, cookie pool,
  evidence, household validation)
- `src/` — background worker, content script, popup, dashboard
- `tests/` — the full Node test suite
- `PHONE-TEST.md` — notes on phone testing routes for extensions

## License

MIT — see `LICENSE`.
