# Haze GoWhere

Pick a starting point and destination in Singapore and get the route that keeps you out of haze-filled air. Routes come from OneMap. Live haze readings come from NEA (the same figures as [haze.gov.sg](https://www.haze.gov.sg/)).

- Domain language: [GLOSSARY.md](GLOSSARY.md)
- Decisions: [docs/adr](docs/adr)
- Build plan and known limitations: [PLAN.md](PLAN.md)

## How a route is chosen

1. Ask OneMap for a walking route and up to 3 public-transport routes.
2. Give each leg an **Exposure Tier**:
   - **Protected**: bus or train ride, waiting at an MRT/LRT station.
   - **Covered**: waiting at a bus stop, walking along an LTA covered linkway.
   - **Exposed**: all other walking.
3. Look up the 1-hr PM2.5 band for each region the trip touches, using the worst one (the **Trip Band**). This sets the avoidance strength K:

   | Band | K |
   |---|---|
   | 1 | 0 |
   | 2 | 1 |
   | 3 | 3 |
   | 4 | 6 |

   If "Always minimise exposure" is on, K = 6.
4. Score each route as **minutes + K × Exposed min + K/4 × Covered min**, drop any route taking more than twice as long as the fastest, and recommend the lowest score.
5. At Trip Band 3 or higher, also show a taxi suggestion with the drive time.

## Running locally

```bash
npm install
```

```bash
npm run dev
```

This starts the API on :8787 and the web app on http://localhost:5173.

- **Without OneMap credentials** the server uses **mock routing** (straight-line routes made to look like OneMap's). Haze readings and place search still use live data.
- **For real routing**, register a free OneMap account at https://www.onemap.gov.sg/apidocs/register. Copy `.env.example` to `.env`, fill in `ONEMAP_EMAIL` and `ONEMAP_PASSWORD`, and set `MOCK_ROUTING=0`. The server fetches and refreshes the 3-day access token itself.

```bash
npm test
```

```bash
npm run build
```

## Covered linkway data

`server/data/covered-linkways.geojson` is committed: the LTA **Covered Linkway** dataset (Sep 2026 edition, about 7,200 polygons) converted to WGS84. A walk that passes inside a linkway, or within 12 m of its outline, counts as **Covered**.

LTA updates the dataset quarterly. To refresh it:

1. Download the latest **Covered Linkway** zip from [LTA DataMall](https://datamall.lta.gov.sg/content/datamall/en/static-data.html) → Static Datasets → Geospatial → Whole Island, and unzip it.
2. Run the converter (SVY21 → WGS84, no GDAL needed):

```bash
npm run convert:linkways -- path/to/CoveredLinkWay.shp Dec2026
```

> Contains information from Covered Linkway accessed from LTA DataMall, made available under the terms of the [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence).

## Container

```bash
docker build -t haze-gowhere .
```

```bash
docker run -p 8080:8080 --env-file .env haze-gowhere
```

The container serves the built web app and the API together on port 8080. It is ready for a container platform such as Airbase.
