import type { Pm25Band } from "../domain/types";

const BAND_MIST_STOPS: Record<Pm25Band, { left: string; mid: string; right: string; rim: string }> = {
  1: { left: "#6ee7b7", mid: "#cbd5e1", right: "#38bdf8", rim: "#334155" },
  2: { left: "#fbbf24", mid: "#e2e8f0", right: "#d97706", rim: "#785c32" },
  3: { left: "#fb923c", mid: "#fed7aa", right: "#ea580c", rim: "#7c3f23" },
  4: { left: "#f87171", mid: "#fecaca", right: "#dc2626", rim: "#7f2929" },
};

export function LogoMark({ band = 1, size = 38 }: { band?: Pm25Band; size?: number }) {
  const mist = BAND_MIST_STOPS[band];
  const uid = `logo-${band}-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={`logo-mark band-${band}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a2228" />
          <stop offset="58%" stopColor="#232e36" />
          <stop offset="100%" stopColor="#2c2620" />
        </linearGradient>
        <linearGradient id={`${uid}-mist`} x1="6" y1="32" x2="58" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={mist.left} stopOpacity="0.82" />
          <stop offset="50%" stopColor={mist.mid} stopOpacity="0.32" />
          <stop offset="100%" stopColor={mist.right} stopOpacity="0.82" />
        </linearGradient>
        <linearGradient id={`${uid}-path`} x1="19" y1="50" x2="45" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${uid}-bg)`} stroke={mist.rim} strokeWidth="2" />
      {/* Atmospheric haze strata parting around the Protected corridor */}
      <path d="M10 20 H25 M39 20 H54" stroke={`url(#${uid}-mist)`} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M8 32 H21 M43 32 H56" stroke={`url(#${uid}-mist)`} strokeWidth="4" strokeLinecap="round" />
      <path d="M11 44 H24 M40 44 H53" stroke={`url(#${uid}-mist)`} strokeWidth="3.5" strokeLinecap="round" />
      {/* Sheltered tunnel casing */}
      <path d="M21 50 C21 37, 43 31, 43 16" stroke="#064e3b" strokeWidth="11" strokeLinecap="round" opacity="0.68" />
      {/* Protected route core */}
      <path d="M21 50 C21 37, 43 31, 43 16" stroke={`url(#${uid}-path)`} strokeWidth="5.8" strokeLinecap="round" />
      {/* Starting Point & Destination nodes */}
      <circle cx="21" cy="50" r="4.3" fill="#f8fafc" stroke="#059669" strokeWidth="2.4" />
      <circle cx="43" cy="16" r="5.2" fill="#10b981" stroke="#ffffff" strokeWidth="2.4" />
    </svg>
  );
}
