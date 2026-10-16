import { BAND_DESCRIPTOR, psiDescriptor } from "../domain/haze";
import type { HazeReading, Pm25Band } from "../domain/types";

const ADVICE: Record<Pm25Band, string> = {
  1: "Air is normal. Fastest routes are recommended.",
  2: "Elevated PM2.5. Routes favour trains and buses over long outdoor walks.",
  3: "High PM2.5. Outdoor walking is kept to a minimum, even if the trip takes longer.",
  4: "Very high PM2.5. Avoid outdoor walking; consider a taxi.",
};

interface Props {
  haze: HazeReading | null;
  tripBand: Pm25Band | null;
  error: string | null;
}

export function HazeBanner({ haze, tripBand, error }: Props) {
  if (error) return <div className="haze haze-error">Haze readings unavailable: {error}</div>;
  if (!haze) return <div className="haze haze-loading">Loading haze readings…</div>;
  const worstBand = (tripBand ?? Math.max(...haze.regions.map((r) => r.band))) as Pm25Band;
  const worstPsi = Math.max(...haze.regions.map((r) => r.psi24));
  const time = new Date(haze.timestamp).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" });

  return (
    <section className={`haze band-${worstBand}`} aria-label="Haze reading">
      <div className="haze-head">
        <div>
          <div className="haze-title">
            PM2.5 Band {worstBand} · {BAND_DESCRIPTOR[worstBand]}
            {tripBand && <span className="haze-scope"> on this trip</span>}
          </div>
          <div className="haze-advice">{ADVICE[worstBand]}</div>
        </div>
        <div className="haze-psi" title="Highest regional 24-hr PSI">
          <span>{worstPsi}</span>
          <small>24-hr PSI<br />{psiDescriptor(worstPsi)}</small>
        </div>
      </div>
      <details className="haze-regions">
        <summary>Regional readings at {time}</summary>
        <table>
          <thead>
            <tr><th>Region</th><th>1-hr PM2.5</th><th>Band</th><th>24-hr PSI</th></tr>
          </thead>
          <tbody>
            {haze.regions.map((r) => (
              <tr key={r.region}>
                <td>{r.region[0]!.toUpperCase() + r.region.slice(1)}</td>
                <td>{r.pm25} µg/m³</td>
                <td>{r.band}</td>
                <td>{r.psi24}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="source">
          Source: NEA / <a href="https://www.haze.gov.sg/" target="_blank" rel="noopener">haze.gov.sg</a>
        </p>
      </details>
    </section>
  );
}
