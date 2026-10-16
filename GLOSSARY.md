# Haze GoWhere

Helps a commuter in Singapore get from a Starting Point to a Destination during haze while breathing as little outdoor air as practical.

## Trip

**Starting Point**:
Where the Trip begins: the commuter's current location, a searched address or building, or a pin placed on the map.
_Avoid_: Origin, source, from, current location (that is only one way to set it)

**Destination**:
Where the Trip ends, set by search or by a pin placed on the map.
_Avoid_: Target, end point, to

**Trip**:
One journey from a Starting Point to a Destination, by walking, public transport, or both.
_Avoid_: Journey, itinerary

**Route**:
One candidate way to make a Trip, made up of Legs.
_Avoid_: Path, option, itinerary

**Leg**:
A continuous part of a Route on one mode: walking, waiting, bus, or train. Each Leg has one Exposure Tier.
_Avoid_: Segment, step

**Recommended Route**:
The Route with the lowest Exposure Cost for the current PM2.5 Band. The others are shown as alternatives.
_Avoid_: Best route, optimal route, fastest route

**Taxi Suggestion**:
A prompt to consider a taxi or private-hire car, which is Protected door to door. It is offered at high PM2.5 Bands and is never ranked against the Routes.
_Avoid_: Taxi route, car option

## Exposure

**Exposure Tier**:
How much outdoor air a commuter breathes on part of a Trip. There are three tiers: Protected, Covered, or Exposed.

**Protected**:
Enclosed space where the commuter is not breathing outdoor air, such as a train, a bus, or an enclosed underground link or station.
_Avoid_: Indoor, sheltered

**Covered**:
Open-air space with a roof, such as a covered linkway, void deck, or bus-stop shelter. It keeps out sun and rain but not haze.
_Avoid_: Sheltered, indoor, protected

**Exposed**:
Open-air space with no roof, such as a pavement, crossing, or open plaza.
_Avoid_: Outdoor (ambiguous, since Covered is outdoor too)

**Exposure Cost**:
A Route's travel time plus a penalty for its Exposed minutes (full weight) and Covered minutes (quarter weight), scaled by the Avoidance Strength.
_Avoid_: Score, haze score

**Avoidance Strength**:
How many minutes of extra travel the commuter will accept to save one Exposed minute. It is set by the Trip's PM2.5 Band, or held at maximum when the commuter asks to always minimise exposure.
_Avoid_: Weight, K, haze mode

## Haze

**Haze Reading**:
NEA's latest regional air-quality figures for one of five regions (North, South, East, West, Central): the 24-hr PSI and the 1-hr PM2.5.

**24-hr PSI**:
NEA's Pollutant Standards Index averaged over 24 hours. Shown for context and health advice. It does not decide routing.
_Avoid_: PSI (unqualified), AQI

**PM2.5 Band**:
NEA's banding of the 1-hr PM2.5 concentration: 1 Normal (≤55 µg/m³), 2 Elevated (56–150), 3 High (151–250), 4 Very High (≥251). This is the reading that decides how strongly a Trip avoids Exposed air.
_Avoid_: Haze level, pollution level

**Trip Band**:
The worst PM2.5 Band among the regions touched by the Starting Point, the Destination, and the Exposed Legs of every candidate Route. This is the band that sets the Avoidance Strength.
_Avoid_: Current band, local band
