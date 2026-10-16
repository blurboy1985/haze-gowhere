---
status: accepted (amends ADR 0001)
---

# Use OSM indoor links for the walk to and from stations in the CBD

ADR 0001 still holds: OneMap plans every Route. In addition, inside the CBD (bbox 1.275,103.840 – 1.305,103.865), from 06:00 to 23:00 SGT, each Route's first and last walk can be replaced by a walk over OpenStreetMap's enclosed pedestrian network: CityLink, Esplanade Xchange, Raffles City, Suntec, Marina Square and the like. The result is offered as an extra candidate Route, which ranking accepts or rejects like any other. We chose this because the [spike](../spikes/2026-10-cbd-indoor-graph.md) found OSM's indoor network too fragmented to plan whole Trips across the CBD, but often fully Protected for the walk between a station and the place next to it. That walk is where OneMap's routes leave avoidable Exposed minutes.

## Decisions

- **Tiers from OSM tags:** `highway=corridor`, `indoor=*` or `tunnel=yes` on pedestrian ways is Protected. `layer`/`level` < 0 alone is *not* Protected, because riverside paths under bridges carry it. Read and Clarke Streets (`tunnel=yes` under the Clarke Quay canopy) and Albert and Princess Streets (`tunnel=yes`, unverified) are Covered, so we never overclaim Protected. LTA covered linkways are applied on top at query time.
- **Data:** `scripts/build-indoor-graph.ts` fetches OSM, classifies the ways, and writes `server/data/cbd-indoor-graph.json`. That file is committed and licensed ODbL 1.0, and the build script is published as the method to recreate it. It is kept separate from the LTA linkway file (a Collective Database), so share-alike does not reach the LTA data.
- **Missing links:** five real links missing from OSM (four found by the spike, plus Raffles City ↔ CityLink, which is mapped only with `layer=-1`) are added from `scripts/fixtures/indoor-connectors.json`, marked unverified until they are fixed upstream in OSM.
- **Hours:** indoor links are used only from 06:00 to 23:00 SGT, roughly when malls and CityLink are open.
- **Presentation:** the indoor version is an extra ranked variant, not a replacement, so Band 1 can still pick the faster street walk.

## Consequences

- The map credits "© OpenStreetMap contributors", and the README explains how ODbL applies.
- Coverage is CBD-only. Other hubs (Jurong East, Tampines) need their own bbox and a check of their data quality before this can be extended.
