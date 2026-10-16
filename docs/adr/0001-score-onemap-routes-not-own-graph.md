# Score OneMap's routes instead of routing over our own pedestrian graph

We pick the Recommended Route by asking OneMap for a walking Route plus up to three public-transport Routes, giving each Leg an Exposure Tier (bus and train are Protected, walking along an LTA covered linkway is Covered, other walking is Exposed), and ranking the Routes by Exposure Cost. We do not build and route over our own pedestrian network. Most Protected time in Singapore comes from buses and trains, which OneMap already plans well. A custom graph would mostly find more Covered walkways, and those do not stop haze. Indoor and underground pedestrian links, which would be the real gain, have no reliable public dataset.

## Consequences

- We can only choose among Routes that OneMap proposes. A Route that ducks through an enclosed underground link will never appear unless OneMap suggests it.
- Revisit this ADR (build our own graph from OSM plus LTA linkways) if a usable dataset of indoor or underground links becomes available.
