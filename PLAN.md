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

## Open work (tracked on GitHub)
- [#1](https://github.com/blurboy1985/haze-gowhere/issues/1) Verify the Docker image builds and runs (Docker isn't installed here)
- [#2](https://github.com/blurboy1985/haze-gowhere/issues/2) Verify the Taxi Suggestion at Band 3+ (live haze was Band 2 everywhere)
- [#3](https://github.com/blurboy1985/haze-gowhere/issues/3) Load LTA covered-linkway data. Without it, every walking Leg counts as Exposed
- [#4](https://github.com/blurboy1985/haze-gowhere/issues/4) Request bus-only and rail-only itineraries to widen route choice
- [#5](https://github.com/blurboy1985/haze-gowhere/issues/5) Tune Avoidance Strength weights with real trips
- [#6](https://github.com/blurboy1985/haze-gowhere/issues/6) Elevated MRT platforms are treated as Protected, though they are really Covered
- [#7](https://github.com/blurboy1985/haze-gowhere/issues/7) Revisit ADR 0001 if indoor-link data appears

## Risks / known limitations
- OneMap routing needs a OneMap account (`ONEMAP_EMAIL` and `ONEMAP_PASSWORD` in `.env`). Without one, the server falls back to mock routing.
