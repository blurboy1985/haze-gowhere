/**
 * MRT/LRT stations whose platforms are open-air (elevated or at-grade, roofed but not enclosed).
 * Waiting on these platforms is Covered, not Protected. Riding the train itself stays Protected.
 * Hand-curated from the network as of 2026. All NEL, CCL, DTL and TEL stations are underground.
 */
const OPEN_AIR_MRT = new Set<string>([
  // North South Line: Jurong East to Bishan (NS17 is at-grade). Braddell onward is underground.
  "NS1", "NS2", "NS3", "NS4", "NS5", "NS7", "NS8", "NS9", "NS10", "NS11",
  "NS12", "NS13", "NS14", "NS15", "NS16", "NS17",
  // East West Line: Pasir Ris to Kallang; Redhill to Tuas Link. Lavender to Tiong Bahru is underground.
  "EW1", "EW2", "EW3", "EW4", "EW5", "EW6", "EW7", "EW8", "EW9", "EW10",
  "EW18", "EW19", "EW20", "EW21", "EW22", "EW23", "EW24", "EW25", "EW26",
  "EW27", "EW28", "EW29", "EW30", "EW31", "EW32", "EW33",
  // Changi Airport branch: Expo is elevated; Changi Airport (CG2) is underground.
  "CG1",
]);

/** Every LRT station (Bukit Panjang, Sengkang, Punggol) is elevated. */
const LRT_CODE = /^(BP|SE|SW|PE|PW|STC|PTC)\d*$/;

export function isOpenAirStation(stopCode: string | undefined): boolean {
  if (!stopCode) return false;
  const code = stopCode.trim().toUpperCase();
  return OPEN_AIR_MRT.has(code) || LRT_CODE.test(code);
}
