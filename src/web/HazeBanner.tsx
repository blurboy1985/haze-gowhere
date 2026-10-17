import { BAND_DESCRIPTOR, psiDescriptor } from "../domain/haze";
import type { HazeReading, Pm25Band } from "../domain/types";

const ADVICE: Record<Pm25Band, string> = {
  1: "Air is normal. Fastest routes are recommended.",
  2: "Elevated PM2.5. Routes favour trains and buses over long outdoor walks.",
  3: "High PM2.5. Outdoor walking is kept to a minimum, even if the trip takes longer.",
  4: "Very high PM2.5. Avoid outdoor walking; consider an enclosed taxi.",
};

const BANDS: Pm25Band[] = [1, 2, 3, 4];

interface Props {
  haze: HazeReading | null;
  tripBand: Pm25Band | null;
  minimise?: boolean;
  error: string | null;
}

export function HazeBanner({ haze, tripBand, minimise = false, error }: Props) {
  if (error) {
    return (
      <div className="haze haze-error" role="status">
        <span className="haze-status-dot" aria-hidden />
        <span>Haze readings unavailable: {error}</span>
      </div>
    );
  }
  if (!haze) {
    return (
      <div className="haze haze-loading" role="status">
        <span className="haze-status-dot pulse" aria-hidden />
        <span>Reading live NEA air quality…</span>
      </div>
    );
  }

  const worstBand = (tripBand ?? Math.max(...haze.regions.map((r) => r.band))) as Pm25Band;
  const worstPsi = Math.max(...haze.regions.map((r) => r.psi24));
  const worstPm25 = Math.max(...haze.regions.map((r) => r.pm25));
  const time = new Date(haze.timestamp).toLocaleTimeString("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });

  return (
    <section className={`haze band-${worstBand}`} aria-label="Haze reading">
      {haze.simulated && (
        <div className="haze-simulated">Simulated PM2.5 (HAZE_OVERRIDE_PM25) · Not a live NEA reading</div>
      )}
      <div className="haze-head">
        <div className="haze-main">
          <div className="haze-eyebrow">
            <span className="haze-live-dot" aria-hidden />
            <span>{tripBand ? "Trip Band" : "Singapore Air Quality"}</span>
            <span aria-hidden>·</span>
            <span>{worstPm25} µg/m³ peak</span>
          </div>
          <div className="haze-title">
            PM2.5 Band {worstBand} · {BAND_DESCRIPTOR[worstBand]}
            {tripBand && <span className="haze-scope"> on this trip</span>}
          </div>
          <div className="haze-advice">{ADVICE[worstBand]}</div>
        </div>
        <div className="haze-psi" title="Highest regional 24-hr PSI">
          <span className="haze-psi-val">{worstPsi}</span>
          <small>
            24-hr PSI
            <br />
            <strong>{psiDescriptor(worstPsi)}</strong>
          </small>
        </div>
      </div>

      <div className="haze-gauge" role="img" aria-label={`PM2.5 severity scale: Band ${worstBand} of 4 (${BAND_DESCRIPTOR[worstBand]})`}>
        {BANDS.map((b) => (
          <div key={b} className={`haze-gauge-seg seg-${b} ${b === worstBand ? "current" : b < worstBand ? "passed" : ""}`}>
            <span className="haze-gauge-bar" />
            <span className="haze-gauge-label">
              B{b} {BAND_DESCRIPTOR[b]}
            </span>
          </div>
        ))}
      </div>

      {minimise && (
        <div className="haze-minimise-pill">
          <span aria-hidden>🛡️</span>
          <span>Max protection active — routing as Band 4 to minimise outdoor air</span>
        </div>
      )}

      <details className="haze-regions">
        <summary>
          <span>Regional readings · {time}</span>
          <span className="haze-summary-hint">NEA 5 regions ▾</span>
        </summary>
        <table>
          <thead>
            <tr>
              <th>Region</th>
              <th>1-hr PM2.5</th>
              <th>Band</th>
              <th>24-hr PSI</th>
            </tr>
          </thead>
          <tbody>
            {haze.regions.map((r) => (
              <tr key={r.region}>
                <td>{r.region[0]!.toUpperCase() + r.region.slice(1)}</td>
                <td className="num">{r.pm25} µg/m³</td>
                <td>
                  <span className={`region-band-pill band-${r.band}`}>
                    {r.band} · {BAND_DESCRIPTOR[r.band]}
                  </span>
                </td>
                <td className="num">{r.psi24}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="source">
          Source: NEA /{" "}
          <a href="https://www.haze.gov.sg/" target="_blank" rel="noopener">
            haze.gov.sg
          </a>
        </p>
      </details>
    </section>
  );
}
