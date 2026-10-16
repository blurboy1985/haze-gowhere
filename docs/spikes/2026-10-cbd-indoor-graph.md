# Spike: can OSM's CBD indoor walkways route through Protected space?

Issue [#7](https://github.com/blurboy1985/haze-gowhere/issues/7). Time-boxed spike, 2026-10-17. Script: [`scripts/spikes/cbd-indoor-graph.ts`](../../scripts/spikes/cbd-indoor-graph.ts) (throwaway, not imported by `src/` or `server/`). Data: every `highway=*` way in bbox `1.275,103.840,1.305,103.865`, from Overpass (OSM base 2026-10-16T20:14Z). overpass-api.de returned 502 and overpass.kumi.systems returned 500 on the day, so the data came from the maps.mail.ru mirror. The raw download is kept out of the repo (see ODbL below).

## Verdict

**Do not supersede ADR 0001 with our own end-to-end CBD router.** OSM does have one good Protected cluster: Raffles City, CityLink, Esplanade Xchange, One Raffles Link and Suntec form one connected 5.2 km network, and Marina Square is cut off from it only by one mis-tagged staircase. But that cluster cannot carry any of the three test Trips without a train. Both Raffles Place Trips still have 12.7–14.7 Exposed minutes when walked over OSM (OneMap's train route to MBS has 6), and the walk that beats Bus 133 on Bugis → Suntec does it with Covered paths, not Protected ones. Where OSM helps is **the walk between a station and a mall** (Esplanade or Promenade → Suntec, Bayfront → The Shoppes, all fully Protected). That suggests a narrower follow-up: keep OneMap for the Route, and re-route only the first and last walking Legs over OSM inside the CBD. That would be a new ADR that amends 0001, not one that supersedes it. It also needs four OSM gaps fixed first (listed below).

## Method

- **Graph:** consecutive node pairs of each walkable way become edges, and ways join wherever they share an OSM node id. Walking ignores `oneway`. Edges with neither end inside the bbox are clipped off. Motorways, construction, `foot=no`, private access without foot access, and road tunnels (Central Expressway, Fort Canning Link…) are excluded. Ordinary roads are kept as Exposed, because Singapore pavements are mostly not mapped as separate ways.
- **Tiers:** `highway=corridor`, `indoor=*`, `tunnel=yes` or `layer`/`level` < 0 → **Protected**. `covered=yes`, `covered=building_arcade` or `tunnel=building_passage` → **Covered**. Everything else, and anything tagged `covered=no` or `indoor=no`, → **Exposed**. Two deviations from the brief: only walkways and cycleways can be Protected (a `service` road at `layer=-1` is a car-park ramp), and `building_passage` is Covered, because it is a roofed opening at ground level, not enclosed space.
- **Routing:** Dijkstra at 80 m/min with cost = minutes + 6 × Exposed minutes, plus k=0 (shortest walk) for comparison. "Street" snaps each end of the Trip to the nearest node on the main walk network. "Inside" snaps it to the nearest Protected node within 150 m, as if the walker starts inside the station or finishes inside the mall. The 150 m hop itself is free, which flatters "inside" a little (the actual hops were 17–82 m).

## Data quality

- **Volume:** 19.8 km of Protected edges inside the bbox: corridor 7.9 km, tunnel 6.3 km, indoor 1.4 km, and layer/level < 0 alone 4.2 km. 60% of it is unnamed and 36% has a `level=*` tag.
- **False positives:** `layer<0` on its own is unreliable. Riverside paths under road bridges (Singapore River Promenade, Boat Quay, and The Esplanade cycleway under Esplanade Bridge) are tagged `layer=-1` but are open-air. `tunnel=yes` is also set on Read, Clarke, Albert and Princess Street pedestrian ways. At least Read and Clarke Streets sit under the Clarke Quay canopy, which is roofed but open-air, so they are likely Covered, not Protected (not surveyed). Excluding layer-only edges (the "strict" run) drops Protected to 15.6 km and splits Raffles City off by 10 m.
- **Fragmentation:** the Protected-only subgraph has **124 components, and 85 of them are shorter than 100 m.** 164 Protected nodes are dead ends. Most of these are short fragments that end at the street.
- **Missing or broken links that matter for real Trips** (gap = closest Protected nodes on each side):

  | Link | Gap | Cause |
  |---|---|---|
  | One Raffles Link ↔ Marina Square | 8 m | Steps [way 460428762](https://www.openstreetmap.org/way/460428762) have no `indoor`/`level` tag, so the chain breaks there |
  | Bugis MRT ↔ Bugis Junction | 19 m | The Bugis Street underpass and a travelator corridor next to Bugis Junction don't share a node |
  | MBS hotel towers ↔ The Shoppes | 57 m | Separate indoor fragments; the route crosses Bayfront Avenue in the open |
  | City Hall MRT ↔ Raffles City / CityLink | 68 m | The station's own tunnels ([way 1013977879](https://www.openstreetmap.org/way/1013977879)) don't reach the CityLink tunnel network |

- **Not modelled at all:** opening hours (malls and CityLink close late at night), MRT paid areas, lifts and escalators as separate links, and mall interiors. Most malls are mapped as a few corridors, not as a walkable floor.

## Connectivity

| Subgraph | Components | Largest | All six landmarks in one? |
|---|---|---|---|
| Protected (corridor / indoor / tunnel / layer<0) | 124 | 5.2 km (Suntec, CityLink, Esplanade Xchange, Raffles City, One Raffles Link) | **No.** Marina Square is a separate 1.3 km component, 8 m away |
| Strict Protected (no layer-only edges) | 81 | 3.7 km | No. Raffles City also splits off (10 m) |
| Protected, joining gaps ≤ 25 m | 77 | 6.5 km | **Yes** |
| Protected + Covered | 284 | 7.3 km | **Yes** |

So the Marina Centre cluster is very nearly one network, and one tag edit would join it. Nothing else in the CBD comes close: the next components are Change Alley / Raffles Place (2.3 km once 25 m gaps are joined), Bencoolen, and the Tanjong Pagar underground path. None of them connects to the Marina Centre cluster.

## Test routes vs OneMap

Walking only; minutes at 80 m/min; E / C / P = Exposed / Covered / Protected minutes.

| Trip | OSM, k=6 (street snap) | OSM, k=6 (inside snap) | OneMap (`docs/tuning/2026-10-16.md`) |
|---|---|---|---|
| Raffles Place MRT → Suntec City | 25.1 min · E 12.7 · C 0.5 · P 11.9 | same | not in the tuning set |
| Bugis Junction → Suntec City | 10.5 min · E 3.3 · C 6.7 · P 0.5 | same | Bus 133: 10 min · E 6 (5.7) · C 0. OneMap's own walk: 11.6 min · E 9.2 · C 2.4 |
| Raffles Place → Marina Bay Sands | 22.0 min · E 14.7 · P 7.3 | 20.8 min · E 12.8 · P 8.0 | NSL → CCL: 13 min · E 6 (5.8) · C 2 |

- **Raffles Place → Suntec:** there is no Protected way across the Singapore River. The best walk takes the Raffles Place underground (192 m), then about 1 km in the open along Collyer Quay and across the river, then the CityLink–Esplanade Xchange tunnels (735 m). In practice the Protected way is a train to City Hall or Esplanade, then the cluster.
- **Bugis → Suntec:** there is no underground link in OSM, and none is known to exist. The tier-weighted walk keeps to OSM `covered=yes` paths. Its Exposure Cost at K=6 (10.5 + 6×3.3 + 1.5×6.7 ≈ 40) is a little lower than Bus 133's (10.1 + 6×5.7 ≈ 44). But the gain is Covered time, which still has haze, and OSM's `covered=yes` is not the LTA linkway layer the app already uses, so the two numbers are not directly comparable.
- **Raffles Place → MBS:** walking is worse than OneMap (E 12.8+ vs 5.8). After the Raffles Place–Marina Bay Link underground (582 m), OSM has no Protected link onward, so the walk continues about 1 km in the open along Marina Boulevard.

**Station egress, the walk a hybrid would replace:**

| Walk | Best OSM (inside snap, k=6) |
|---|---|
| Esplanade MRT → Suntec City | 4.7 min, **all Protected** |
| Promenade MRT → Suntec City | 6.9 min, **all Protected** |
| Bayfront MRT → The Shoppes at MBS | 1.3 min, **all Protected** |
| Bayfront MRT → MBS hotel (tuning-trip point) | 5.2 min, E 4.0 (the 57 m gap) |
| City Hall MRT → Suntec City | 13.8 min, E 3.3 (the 68 m gap) |
| Bugis MRT → Bugis Junction | 2.9 min, E 2.8 (the 19 m gap) |

OneMap's NSL → CCL route to MBS has 6.2 walking minutes after Bayfront (E 4.6). If the MBS gap were mapped, the hybrid would cut that to about 1–2 Protected minutes. The Route's Exposed time would fall from 5.8 to about 1.2, which is the largest gain of any case tested here.

## ODbL share-alike implications

OSM data is licensed under ODbL 1.0. This is not legal advice; check it before anything ships.

- **Attribution.** Any map or route made from OSM data must credit "© OpenStreetMap contributors" with a link to the licence. The app's map attribution currently credits OneMap and SLA only.
- **Derivative Database.** A graph built from OSM, with our tier classification added, is a Derivative Database. Routes served from it are Produced Works. If we *publicly use* such a Produced Work (serving it in the app counts), ODbL §4.6 requires us to offer the derivative database, or a file or method that recreates it from OSM, under ODbL. Publishing the build script plus the tag rules would probably satisfy this, because the script recreates the graph from OSM.
- **Mixing with LTA linkways.** If LTA covered-linkway polygons are merged into the same graph, the result is arguably all one Derivative Database, and the LTA-derived part would have to be offered under ODbL. Whether the Singapore Open Data Licence allows that relicensing needs checking. The safer design is a Collective Database: keep the OSM graph and the LTA layer as separate datasets, and combine them only at query time.
- **Repo hygiene.** Committing an OSM extract, or a graph derived from one, puts ODbL data in the repo. That is why this spike keeps the download in a scratch directory and commits only the script.
- **Upstream fixes are free.** Fixing the four gaps directly in OSM improves the source for everyone and adds no licence work on our side.

## Recommendation

1. **Keep ADR 0001** for whole-Trip routing. OSM's indoor network is too fragmented and too unreliably tagged to plan whole Trips across the CBD, and the river and Bras Basah crossings are open-air in any case.
2. **Consider an ADR 0002, "OSM indoor last-mile in the CBD".** It would keep OneMap's Routes and replace a walking Leg that starts or ends inside the CBD bbox with a tier-weighted OSM walk when that lowers Exposure Cost. Protected would come from corridor, indoor or `tunnel=yes` on walkways only, never from `layer` alone. The Collective Database approach would handle ODbL, and OSM attribution would be added to the map.
3. **Prerequisites before building it:** fix the four OSM gaps (a survey and edit by a mapper, not code), check the false-positive tunnels at Clarke Quay, and re-run `scripts/tune-trips.ts` with an indoor-egress candidate generator to measure the gain across the whole tuning set, not only these three Trips.
4. **Keep #7 open**, relabelled as "trigger met for station egress only".

## Raw report

Output of `npx tsx scripts/spikes/cbd-indoor-graph.ts <osm.json>` (headings demoted):

### CBD indoor graph spike: bbox 1.275,103.840,1.305,103.865, OSM data as of 2026-10-16T20:14:19Z

#### Data quality

- 8756 highway ways in bbox, 7617 walkable, 22235 edges, 390.72 km.
- Edge length by basis: open 355.63 km, tunnel 6.34 km, covered 15.30 km, layer 4.16 km, corridor 7.92 km, indoor 1.37 km.
- Protected 19.78 km, of which 18.82 km on pedestrian highway types; 60% unnamed; 36% carry a level=* tag.
- Protected nodes that are dead ends (degree 1 in the whole graph): 164.

#### Connectivity

##### Protected-only (corridor / indoor / tunnel / layer<0)

124 components, 19.78 km. Largest 5 hold 49% of the length; 85 components are shorter than 100 m.

| # | Length | Nodes | Main names |
|---|---|---|---|
| 0 | 5217 m | 181 | Suntec City, CityLink Mall, Esplanade Xchange, Raffles City |
| 1 | 1621 m | 63 | (unnamed) |
| 2 | 1315 m | 33 | Marina Square, Pedestrian Mall, One Raffles Link |
| 3 | 769 m | 47 | Bencoolen |
| 4 | 766 m | 33 | Underground Path from Tanjong Pagar MRT |
| 5 | 483 m | 12 | SMU Concourse |
| 6 | 453 m | 25 | (unnamed) |
| 7 | 441 m | 45 | (unnamed) |
| 8 | 433 m | 20 | (unnamed) |
| 9 | 430 m | 11 | ICON Link@ClubStreet |

| Landmark | Component(s) |
|---|---|
| CityLink Mall | 0 |
| Esplanade Xchange | 0 |
| Raffles City | 0 |
| One Raffles Link | 0, 2 |
| Suntec City | 0 |
| Marina Square | 2 |

All six landmarks share one component: **no** (2 distinct components touched).

Closest approach between landmark components:

- 0 ↔ 2: 8 m

##### Strict Protected (no layer-only edges)

81 components, 15.62 km. Largest 5 hold 51% of the length; 50 components are shorter than 100 m.

| # | Length | Nodes | Main names |
|---|---|---|---|
| 0 | 3747 m | 120 | Suntec City, CityLink Mall, Esplanade Xchange, Fountain Court |
| 1 | 1613 m | 62 | (unnamed) |
| 2 | 1315 m | 33 | Marina Square, Pedestrian Mall, One Raffles Link |
| 3 | 769 m | 47 | Bencoolen |
| 4 | 541 m | 22 | Underground Path from Tanjong Pagar MRT |
| 5 | 483 m | 12 | SMU Concourse |
| 6 | 453 m | 25 | (unnamed) |
| 7 | 433 m | 20 | (unnamed) |
| 8 | 430 m | 11 | ICON Link@ClubStreet |
| 9 | 385 m | 12 | Read Street, Clarke Street |

| Landmark | Component(s) |
|---|---|
| CityLink Mall | 0 |
| Esplanade Xchange | 0 |
| Raffles City | 0, 13 |
| One Raffles Link | 0, 2 |
| Suntec City | 0 |
| Marina Square | 2 |

All six landmarks share one component: **no** (3 distinct components touched).

Closest approach between landmark components:

- 0 ↔ 2: 8 m
- 0 ↔ 13: 10 m

##### Protected-only, joining gaps ≤ 25 m

77 components, 19.78 km. Largest 5 hold 57% of the length; 45 components are shorter than 100 m.

| # | Length | Nodes | Main names |
|---|---|---|---|
| 0 | 6533 m | 214 | Suntec City, Marina Square, CityLink Mall, Esplanade Xchange |
| 1 | 2296 m | 90 | Change Alley |
| 2 | 841 m | 73 | (unnamed) |
| 3 | 769 m | 47 | Bencoolen |
| 4 | 766 m | 33 | Underground Path from Tanjong Pagar MRT |
| 5 | 596 m | 19 | SMU Concourse |
| 6 | 519 m | 28 | (unnamed) |
| 7 | 453 m | 25 | (unnamed) |
| 8 | 430 m | 11 | ICON Link@ClubStreet |
| 9 | 415 m | 28 | The Esplanade |

| Landmark | Component(s) |
|---|---|
| CityLink Mall | 0 |
| Esplanade Xchange | 0 |
| Raffles City | 0 |
| One Raffles Link | 0 |
| Suntec City | 0 |
| Marina Square | 0 |

All six landmarks share one component: **yes (#0)** (1 distinct components touched).

##### Protected + Covered

284 components, 35.09 km. Largest 5 hold 33% of the length; 213 components are shorter than 100 m.

| # | Length | Nodes | Main names |
|---|---|---|---|
| 0 | 7287 m | 252 | Suntec City, Marina Square, CityLink Mall, Esplanade Xchange |
| 1 | 1621 m | 63 | (unnamed) |
| 2 | 990 m | 90 | (unnamed) |
| 3 | 880 m | 20 | (unnamed) |
| 4 | 799 m | 50 | Bencoolen |
| 5 | 766 m | 33 | Underground Path from Tanjong Pagar MRT |
| 6 | 648 m | 40 | (unnamed) |
| 7 | 602 m | 19 | SMU Concourse |
| 8 | 591 m | 30 | (unnamed) |
| 9 | 562 m | 39 | (unnamed) |

| Landmark | Component(s) |
|---|---|
| CityLink Mall | 0 |
| Esplanade Xchange | 0 |
| Raffles City | 0 |
| One Raffles Link | 0 |
| Suntec City | 0 |
| Marina Square | 0 |

All six landmarks share one component: **yes (#0)** (1 distinct components touched).

#### Routes

Cost = minutes + 6 × Exposed minutes, 80 m/min. "Street" snaps each end to the nearest walkable node; "inside" snaps to the nearest Protected node within 150 m (i.e. you start in the station or finish inside the mall).

| Route | Snap | k | Walk | Exposed | Covered | Protected | Snap gap (from/to) | OneMap |
|---|---|---|---|---|---|---|---|---|
| Raffles Place MRT → Suntec City | street | 0 | 24.3 min | 20.6 | 0.5 | 3.1 | 3 m / 11 m |  |
| Raffles Place MRT → Suntec City | street | 6 | 25.1 min | 12.7 | 0.5 | 11.9 | 3 m / 11 m | not in tuning set |
| Raffles Place MRT → Suntec City | inside | 0 | 24.3 min | 20.6 | 0.5 | 3.1 | 3 m / 11 m |  |
| Raffles Place MRT → Suntec City | inside | 6 | 25.1 min | 12.7 | 0.5 | 11.9 | 3 m / 11 m |  |
| Bugis Junction → Suntec City | street | 0 | 9.7 min | 5.7 | 3.5 | 0.5 | 18 m / 11 m |  |
| Bugis Junction → Suntec City | street | 6 | 10.5 min | 3.3 | 6.7 | 0.5 | 18 m / 11 m | Bus 133: 10 min, E 6, C 0 |
| Bugis Junction → Suntec City | inside | 0 | 9.7 min | 5.7 | 3.5 | 0.5 | 18 m / 11 m |  |
| Bugis Junction → Suntec City | inside | 6 | 10.5 min | 3.3 | 6.7 | 0.5 | 18 m / 11 m |  |
| Raffles Place → Marina Bay Sands | street | 0 | 21.5 min | 18.9 | 0.0 | 2.6 | 3 m / 27 m |  |
| Raffles Place → Marina Bay Sands | street | 6 | 22.0 min | 14.7 | 0.0 | 7.3 | 3 m / 27 m | NSL → CCL: 13 min, E 6, C 2 |
| Raffles Place → Marina Bay Sands | inside | 0 | 20.4 min | 17.0 | 0.0 | 3.4 | 3 m / 32 m |  |
| Raffles Place → Marina Bay Sands | inside | 6 | 20.8 min | 12.8 | 0.0 | 8.0 | 3 m / 32 m |  |
| City Hall MRT → Suntec City | street | 0 | 10.1 min | 9.0 | 0.6 | 0.5 | 19 m / 11 m |  |
| City Hall MRT → Suntec City | street | 6 | 11.5 min | 2.2 | 0.1 | 9.2 | 19 m / 11 m |  |
| City Hall MRT → Suntec City | inside | 0 | 12.3 min | 10.0 | 1.5 | 0.9 | 33 m / 11 m |  |
| City Hall MRT → Suntec City | inside | 6 | 13.8 min | 3.3 | 0.9 | 9.6 | 33 m / 11 m |  |
| Esplanade MRT → Suntec City | street | 0 | 5.1 min | 3.7 | 0.9 | 0.5 | 2 m / 11 m |  |
| Esplanade MRT → Suntec City | street | 6 | 8.4 min | 2.3 | 0.8 | 5.3 | 2 m / 11 m |  |
| Esplanade MRT → Suntec City | inside | 0 | 4.7 min | 0.0 | 0.0 | 4.7 | 33 m / 11 m |  |
| Esplanade MRT → Suntec City | inside | 6 | 4.7 min | 0.0 | 0.0 | 4.7 | 33 m / 11 m |  |
| Promenade MRT → Suntec City | street | 0 | 6.2 min | 5.0 | 0.0 | 1.3 | 11 m / 11 m |  |
| Promenade MRT → Suntec City | street | 6 | 12.0 min | 1.0 | 1.5 | 9.5 | 11 m / 11 m |  |
| Promenade MRT → Suntec City | inside | 0 | 5.7 min | 0.7 | 0.0 | 5.0 | 48 m / 11 m |  |
| Promenade MRT → Suntec City | inside | 6 | 6.9 min | 0.0 | 0.0 | 6.9 | 48 m / 11 m |  |
| Bayfront MRT → Marina Bay Sands | street | 0 | 3.6 min | 3.6 | 0.0 | 0.0 | 20 m / 27 m |  |
| Bayfront MRT → Marina Bay Sands | street | 6 | 3.6 min | 3.6 | 0.0 | 0.0 | 20 m / 27 m |  |
| Bayfront MRT → Marina Bay Sands | inside | 0 | 5.2 min | 4.0 | 0.0 | 1.1 | 60 m / 32 m |  |
| Bayfront MRT → Marina Bay Sands | inside | 6 | 5.2 min | 4.0 | 0.0 | 1.1 | 60 m / 32 m |  |
| Bayfront MRT → The Shoppes at MBS | street | 0 | 3.7 min | 2.0 | 0.0 | 1.7 | 20 m / 17 m |  |
| Bayfront MRT → The Shoppes at MBS | street | 6 | 3.7 min | 2.0 | 0.0 | 1.7 | 20 m / 17 m |  |
| Bayfront MRT → The Shoppes at MBS | inside | 0 | 1.3 min | 0.0 | 0.0 | 1.3 | 60 m / 17 m |  |
| Bayfront MRT → The Shoppes at MBS | inside | 6 | 1.3 min | 0.0 | 0.0 | 1.3 | 60 m / 17 m |  |
| Bugis MRT → Bugis Junction | street | 0 | 1.9 min | 1.9 | 0.0 | 0.0 | 30 m / 18 m |  |
| Bugis MRT → Bugis Junction | street | 6 | 1.9 min | 1.9 | 0.0 | 0.0 | 30 m / 18 m |  |
| Bugis MRT → Bugis Junction | inside | 0 | 2.9 min | 2.9 | 0.0 | 0.0 | 82 m / 18 m |  |
| Bugis MRT → Bugis Junction | inside | 6 | 2.9 min | 2.8 | 0.0 | 0.0 | 82 m / 18 m |  |

Legs ≥ 15 m (P/C/E = tier):

- **Raffles Place MRT → Suntec City** (street, k=6): P 192 m footway/tunnel › footway/indoor › steps/tunnel → P 23 m footway/layer → E 107 m Robinson Road › Collyer Quay › service → C 27 m service/covered → E 903 m service › Collyer Quay › Fullerton Road › footway → P 735 m footway/tunnel › CityLink Mall › Esplanade Xchange › steps/tunnel
- **Raffles Place MRT → Suntec City** (inside, k=6): P 192 m footway/tunnel › footway/indoor › steps/tunnel → P 23 m footway/layer → E 107 m Robinson Road › Collyer Quay › service → C 27 m service/covered → E 903 m service › Collyer Quay › Fullerton Road › footway → P 735 m footway/tunnel › CityLink Mall › Esplanade Xchange › steps/tunnel
- **Bugis Junction → Suntec City** (street, k=6): E 20 m Bugis Street → C 134 m Hylam Street › Malay Street → E 159 m Malay Street › footway › service → C 121 m cycleway/covered → E 83 m footway → C 283 m footway/covered › steps/covered → P 37 m Suntec City › corridor/corridor
- **Bugis Junction → Suntec City** (inside, k=6): E 20 m Bugis Street → C 134 m Hylam Street › Malay Street → E 159 m Malay Street › footway › service → C 121 m cycleway/covered → E 83 m footway → C 283 m footway/covered › steps/covered → P 37 m Suntec City › corridor/corridor
- **Raffles Place → Marina Bay Sands** (street, k=6): P 582 m footway/tunnel › path/tunnel › steps/tunnel → E 1175 m path › Marina Boulevard › cycleway › pedestrian
- **Raffles Place → Marina Bay Sands** (inside, k=6): P 582 m footway/tunnel › path/tunnel › steps/tunnel → E 1025 m path › Marina Boulevard › cycleway › pedestrian → P 60 m footway/tunnel
- **City Hall MRT → Suntec City** (street, k=6): E 167 m Stamford Road › service › footway → P 27 m corridor/corridor › Raffles City → P 712 m Raffles City › Esplanade Xchange › steps/tunnel › corridor/corridor
- **City Hall MRT → Suntec City** (inside, k=6): P 33 m footway/tunnel → C 56 m footway/covered → E 250 m footway › Stamford Road › service → P 27 m corridor/corridor › Raffles City → P 712 m Raffles City › Esplanade Xchange › steps/tunnel › corridor/corridor
- **Esplanade MRT → Suntec City** (street, k=6): E 144 m trunk_link › footway › Drop Off → C 67 m Drop Off → E 36 m Drop Off › footway → P 424 m footway/layer › Suntec City › corridor/corridor
- **Esplanade MRT → Suntec City** (inside, k=6): P 377 m Esplanade Xchange › steps/tunnel › corridor/corridor › Suntec City
- **Promenade MRT → Suntec City** (street, k=6): E 76 m footway → C 98 m footway/covered → C 25 m footway/covered → P 756 m steps/layer › footway/tunnel › footway/layer › Suntec City
- **Promenade MRT → Suntec City** (inside, k=6): P 554 m footway/layer › Suntec City › Fountain Court › corridor/corridor
- **Bayfront MRT → Marina Bay Sands** (street, k=6): E 287 m footway › service
- **Bayfront MRT → Marina Bay Sands** (inside, k=6): P 32 m corridor/corridor → E 323 m Garden Bay Bridge › footway › path › Bayfront Avenue → P 60 m footway/tunnel
- **Bayfront MRT → The Shoppes at MBS** (street, k=6): E 158 m footway › Garden Bay Bridge → P 138 m corridor/corridor
- **Bayfront MRT → The Shoppes at MBS** (inside, k=6): P 107 m corridor/corridor
- **Bugis MRT → Bugis Junction** (street, k=6): E 150 m footway › Bugis Street
- **Bugis MRT → Bugis Junction** (inside, k=6): E 227 m steps › footway › Bugis Street
