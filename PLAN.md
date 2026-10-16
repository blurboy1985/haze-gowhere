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
- ⏳ [#7](https://github.com/blurboy1985/haze-gowhere/issues/7) Spike done (`docs/spikes/2026-10-cbd-indoor-graph.md`): OSM's CBD indoor network is too fragmented for whole-Trip routing, so keep ADR 0001. Station-to-mall walks are often fully Protected, so an "indoor last-mile" ADR 0002 is proposed. Awaiting the user's decision

## Risks / known limitations
- OneMap routing needs a OneMap account (`ONEMAP_EMAIL` and `ONEMAP_PASSWORD` in `.env`). Without one, the server falls back to mock routing.

## Phase 2: fix issues #1–#7 (2026-10-16, done; #7 open pending the ADR 0002 decision)
Decisions: download and commit the LTA linkways; verify Docker by simulating the image steps locally plus a CI docker build; for weights, report findings and let the user decide; keep #7 open after an OSM check.

1. #2 Add a `HAZE_OVERRIDE_PM25` dev override and `planTrip` tests on both sides of the Band 3 taxi threshold. Check the taxi card in the UI.
2. #4 Request `TRANSIT`, `BUS` and `RAIL` itineraries in parallel, merge them, and dedupe by the ordered `(mode, route)` list. Check with Bishan→Orchard.
3. #6 Curate a list of elevated/open-air MRT and LRT stations. A train wait at those stations becomes Covered. Unit test it.
4. #3 Download `CoveredLinkWay_Sep2026.zip` and add `scripts/convert-linkways.ts` (shapefile + proj4, SVY21→WGS84). Match walks inside the polygons (point-in-polygon plus tolerance). Commit the GeoJSON with LTA attribution.
5. #5 Add `scripts/tune-trips.ts` with a fixture of about 15 trips. Run it at bands 1–4 and report proposed weight changes; the user decides.
6. #1 Simulate the image locally (clean `npm ci --omit=dev`, run from `dist`). Add a GitHub Actions workflow that builds and smoke-tests the image.
7. #7 Check OSM indoor/tunnel footway coverage, post the findings as a comment, and leave the issue open.
8. Verify everything (tests, build, browser), then commit per issue, push, and close the fixed issues.
