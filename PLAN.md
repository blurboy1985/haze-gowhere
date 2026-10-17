# PLAN: Haze GoWhere v1

Goal: a mobile-first web app where a commuter picks a **Starting Point** and **Destination** and gets a **Recommended Route** (plus up to 2 alternatives) that minimises **Exposed** time, weighted by the live **Trip Band**. Terms are defined in [GLOSSARY.md](GLOSSARY.md), and the routing approach is recorded in [ADR 0001](docs/adr/0001-score-onemap-routes-not-own-graph.md).

## Settled decisions
- Mobile-first web app built with React, Vite, TypeScript and Leaflet on OneMap tiles. A Node/Express backend holds the OneMap credentials and refreshes the token.
- Haze Readings come from data.gov.sg: 24-hr PSI (shown) and 1-hr PM2.5 (drives routing), credited "Source: NEA / haze.gov.sg".
- Points can be set by GPS, OneMap search, or a map pin.
- Routes are OneMap `walk` plus `pt` (up to 3 itineraries). Each Leg gets an Exposure Tier:
  - bus or train ride: Protected
  - wait for a train: Protected
  - wait for a bus: Covered
  - walk: Exposed, except the parts along an LTA covered linkway, which are Covered
- Exposure Cost = minutes + K×Exposed + K/4×Covered. K by band: 1→0, 2→1, 3→3, 4→6. The "always minimise" option sets K=6. Routes taking more than twice as long as the fastest are dropped.
- Trip Band is the worst band of the nearest region label across the Exposed Legs.
- A Taxi Suggestion card (OneMap drive time) appears when the Trip Band is 3 or higher.
- Results show the haze banner, the Recommended Route and alternatives with exposure bars, and map lines coloured by tier.
- Develop locally. Ship a Dockerfile so the app can move to Airbase later.

## Steps
1. ✅ Scaffold: one npm package (simpler than workspaces), with `src/domain` (shared, pure), `src/web` (React) and `server/` (Express).
2. ✅ Domain logic (pure, unit-tested): polyline decoding, band from PM2.5, nearest region, leg tiering, covered-linkway overlap, Exposure Cost, ranking, and Trip Band. 14 tests.
3. ✅ Server: OneMap token manager, `/api/search`, `/api/reverse`, `/api/haze`, `/api/routes`, and mock routing. The covered-linkway index is loaded from `server/data/covered-linkways.geojson` if that file is present.
4. ✅ Web: starting-point and destination pickers (GPS, search, pin, drag), map, haze banner, route cards, Taxi Suggestion, mobile layout.
5. ✅ Dockerfile and README.
6. ✅ Verified (2026-10-16): tests, typecheck and build pass. Ran it in the browser with live NEA haze and live OneMap search, and with mock routing. The production server serves `dist` plus the API.

## Verified with real OneMap (2026-10-16)
- Routing works for real trips: Bishan→Orchard, Tampines→Bedok, Jurong East→NUS UTown. Reverse geocoding and drive routing also work.
- OneMap often returns only 1 public-transport itinerary for direct MRT trips.
- Waits between legs only appear when OneMap's leg times leave a gap.

## Issue status (2026-10-16)
- ✅ [#1](https://github.com/blurboy1985/haze-gowhere/issues/1) Docker image is built and smoke-tested in CI (`.github/workflows/ci.yml`)
- ✅ [#2](https://github.com/blurboy1985/haze-gowhere/issues/2) Taxi Suggestion has tests and was seen in the UI at Band 3 (`HAZE_OVERRIDE_PM25`)
- ✅ [#3](https://github.com/blurboy1985/haze-gowhere/issues/3) LTA covered linkways (Sep 2026, 7,222 areas) are committed; walks can be Covered
- ✅ [#4](https://github.com/blurboy1985/haze-gowhere/issues/4) TRANSIT, BUS and RAIL itineraries are merged (about 5 candidates per Trip, up from 1–3)
- ✅ [#5](https://github.com/blurboy1985/haze-gowhere/issues/5) Weights kept (K 0/1/3/6, ¼ Covered, 2× cap), decided 2026-10-17 from `docs/tuning/2026-10-16.md`
- ✅ [#6](https://github.com/blurboy1985/haze-gowhere/issues/6) Waits on elevated platforms are Covered. Only applies where OneMap reports a wait gap
- ✅ [#7](https://github.com/blurboy1985/haze-gowhere/issues/7) Implemented as ADR 0002 (CBD Indoor Variants). Results in `docs/tuning/2026-10-17-indoor.md`

## Risks / known limitations
- OneMap routing needs a OneMap account (`ONEMAP_EMAIL` and `ONEMAP_PASSWORD` in `.env`). Without one, the server falls back to mock routing.

## Phase 2: fix issues #1–#7 (2026-10-16, done)
Decisions: download and commit the LTA linkways; verify Docker by simulating the image steps locally plus a CI docker build; for weights, report findings and let the user decide; keep #7 open after an OSM check.

1. #2 Add a `HAZE_OVERRIDE_PM25` dev override and `planTrip` tests on both sides of the Band 3 taxi threshold. Check the taxi card in the UI.
2. #4 Request `TRANSIT`, `BUS` and `RAIL` itineraries in parallel, merge them, and dedupe by the ordered `(mode, route)` list. Check with Bishan→Orchard.
3. #6 Curate a list of elevated/open-air MRT and LRT stations. A train wait at those stations becomes Covered. Unit test it.
4. #3 Download `CoveredLinkWay_Sep2026.zip` and add `scripts/convert-linkways.ts` (shapefile + proj4, SVY21→WGS84). Match walks inside the polygons (point-in-polygon plus tolerance). Commit the GeoJSON with LTA attribution.
5. #5 Add `scripts/tune-trips.ts` with a fixture of about 15 trips. Run it at bands 1–4 and report proposed weight changes; the user decides.
6. #1 Simulate the image locally (clean `npm ci --omit=dev`, run from `dist`). Add a GitHub Actions workflow that builds and smoke-tests the image.
7. #7 Check OSM indoor/tunnel footway coverage, post the findings as a comment, and leave the issue open.
8. Verify everything (tests, build, browser), then commit per issue, push, and close the fixed issues.

## Phase 3: #7 indoor last-mile in the CBD (ADR 0002, done 2026-10-17)
Decisions: commit the derived ODbL graph as its own file; add local connectors for the OSM gaps; use indoor links 06:00–23:00 SGT only; show the indoor version as an extra ranked variant.

1. `scripts/build-indoor-graph.ts`: fetch OSM for the CBD (mirror fallback, or a saved file), classify with the strict rules, apply the connectors from `scripts/fixtures/indoor-connectors.json`, and write `server/data/cbd-indoor-graph.json` (ODbL header).
2. `src/domain/indoorGraph.ts`: load the graph, snap a point to it, and run tier-weighted Dijkstra. Unit-tested on a synthetic graph.
3. `src/domain/indoorVariants.ts`: for each Route, re-route its first and last walks inside the bbox, snapping the station end to the nearest Protected node within 150 m. Emit a variant when it saves at least 1 Exposed min. Apply the LTA linkway index on top. Unit-tested.
4. Server: load the graph, allow indoor variants 06:00–23:00 SGT, and wire them into `fetchCandidates`. Add OSM attribution to the map, mark "indoor link" in the UI, and add a README ODbL section.
5. Verify: tests, typecheck, real CBD trips (Raffles Place→MBS, Bugis→Suntec, Esplanade→Suntec), the tuning harness before and after, and the browser. Then commit, push and update #7.

Where reality differed from the plan:
- **5 connectors, not 4.** The stricter rule (no layer-only Protected) splits Raffles City from CityLink by 10 m, which the spike predicted, so a fifth connector joins them.
- **Albert and Princess Streets** (`tunnel=yes` by Bugis, unverified) are treated as Covered, like Read and Clarke Streets, so we never overclaim Protected.
- **Bug fixed during verification:** the hop from a bus stop to the indoor network was counted as "inside the station" (Protected). Only train stations are enclosed, so a bus-stop hop is now Exposed (unit test added).
- **Bayfront → MBS hotel** is still about 5 Exposed min. The hotel end lands on an indoor piece that the Shoppes connector doesn't reach. The real layout couldn't be verified from the data, so no extra link was invented.
- **OneMap rate limit (HTTP 429)** hit during repeated harness runs. The harness now paces itself and retries 429s, so a tuning run can't silently lose candidates.
- Opening hours are checked in the server (not in `fetchCandidates`), with a dev-only `INDOOR_ALWAYS_OPEN=1` override.
- Also fixed: a walk-only "public transport" itinerary (e.g. at night) duplicated the Walk card; the hop paths were drawn in the wrong direction (caught by a continuity test).
- **Verified:** 33 tests, typecheck, build; tuning harness on 19 real trips; UI checked with a real noon plan (it was 04:50 SGT, so no live transit).
- **Follow-ups (not done):** fix the five connector gaps upstream in OSM (needs a mapper account and a survey), resolve the MBS hotel fragment, and consider extending the bbox to other hubs.

## Phase 4: deploy to Cloudflare at haze.danielquek.com (done 2026-10-17)
Decisions: a Cloudflare Worker plus static assets (no containers) on the Workers Paid plan. The Docker and Express setup stays for local and other hosts.

1. Move the API handlers (haze, search, reverse, routes) into framework-free `server/api.ts`. Express (`server/index.ts`) and the Worker both wrap it, so the logic exists once.
2. `worker/index.ts`: `/api/*` goes to the shared handlers, and everything else is served as static assets (SPA fallback). The linkway and indoor data load lazily from assets (`/data/*`) and are cached per isolate.
3. `wrangler.jsonc`: assets from `dist`, `nodejs_compat`, custom domain `haze.danielquek.com`. Add an `npm run deploy` script (build, copy `server/data`, `wrangler deploy`).
4. The user sets the `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` Worker secrets themselves (Claude does not enter credentials).
5. Verify with `wrangler dev` locally, then deploy. Check `https://haze.danielquek.com`: page, `/api/haze`, real `/api/routes` with no mock flag, and an indoor variant during the day. Then commit and push.
- **Verified (2026-10-17 05:20 SGT):** https://haze.danielquek.com serves the page, haze, search and reverse geocoding. Live routes come back `mock=false` with both secrets set. Not yet seen live: public-transport and indoor variants (it was before 06:00 SGT, so OneMap offered only walking). `wrangler dev` checks passed in workerd.

## Phase 5: Directions & Navigation UI/UX improvements (done 2026-10-18)
1. ✅ [#8](https://github.com/blurboy1985/haze-gowhere/pull/8) Rich transit & walking directions (`src/domain/directions.ts`): boarding/alighting stop names and codes, intermediate stop counts, official LTA MRT/LRT/bus colour badges, walking distances, and Singapore ETA windows.
2. ✅ [#9](https://github.com/blurboy1985/haze-gowhere/pull/9) Interactive map & Leg inspection (`src/web/MapView.tsx`): click any step to zoom & highlight its Leg on the map, boarding/alighting/interchange stop markers with tooltips, clickable midpoint duration + Exposed callout pills, GPS location dot, and floating map zoom/recenter controls.
3. ✅ [#10](https://github.com/blurboy1985/haze-gowhere/pull/10) Step-by-step live navigation mode (`src/domain/navigation.ts`, `src/web/NavigationBanner.tsx`): `▶ Start navigation` mode with a top guidance card colour-coded by Exposure Tier, next-step preview, remaining Exposed & total minutes, `← Prev` / `Next →` controls, and live GPS auto-advance.
4. ✅ [#11](https://github.com/blurboy1985/haze-gowhere/pull/11) Mobile bottom-sheet layout, departure time picker, and shareable Trip URLs (`src/domain/tripUrl.ts`): deep-linked `?from=&to=&minimise=&at=` URL sync with `🔗 Share` button, `Leave now` / `Depart at…` Singapore time picker (driving OneMap schedules and CBD Indoor Link opening hours), and `Map` / `Split` / `Full` mobile bottom-sheet snap states.

## Phase 6: Brand Logo & Haze-Themed UI/UX Redesign (done 2026-10-18)
1. ✅ **Logo & Brand System (`src/web/Logo.tsx`, `public/favicon.svg`, `index.html`)**: Custom "Sheltered Path Through Mist" SVG emblem whose ambient haze strata react to the active `PM2.5 Band` while a vivid **Protected** emerald corridor cuts cleanly through. Visible in both desktop and mobile headers plus browser favicon.
2. ✅ **Warm Atmospheric Mist Theme & Muted Basemap (`src/web/styles.css`)**: Smoky stone and warm mist surfaces (`Plus Jakarta Sans` + tabular `JetBrains Mono`), Band-reactive ambient panel & map vignette (`Trip Band` fallback to worst regional `PM2.5 Band`), and a haze-toned OneMap tile filter so **Protected**, **Covered**, and **Exposed** route polylines pop.
3. ✅ **Unified Trip Planner & Atmospheric Haze Banner (`src/web/App.tsx`, `src/web/PointPicker.tsx`, `src/web/HazeBanner.tsx`)**: Connected A→B planner card with quick-clear (`✕`) buttons, rotating swap button, active `Max protection` pill for **Always minimise exposure**, and a 4-stage `PM2.5 Band` severity gauge with peak `µg/m³` readout.
4. ✅ **Route Trade-Off Callouts & Empty/Loading UX (`src/domain/directions.ts`, `src/web/RouteCard.tsx`)**: Dynamic comparison badges (`describeRouteTradeoff`: `−X min Exposed vs fastest`, `Fastest & lowest exposure`), styled `🏢 Indoor Link` pills, shimmer loading skeletons, and 3 one-tap sample Singapore trips in the empty state.
