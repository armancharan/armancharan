'use client'

/** Full-bleed hero instrument: a closed loop with a verification gate. */
export const LoopMark = () => {
  return (
    <svg
      className="vl-loop-mark"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="vl-loop-fade" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--vl-ink)" stopOpacity="0.08" />
          <stop offset="55%" stopColor="var(--vl-ink)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--vl-signal)" stopOpacity="0.45" />
        </linearGradient>
        <filter id="vl-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>

      {/* Grid — optical bench, not dashboard chrome */}
      <g stroke="var(--vl-ink)" strokeOpacity="0.06" strokeWidth="1">
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`v${i}`} x1={100 + i * 90} y1="40" x2={100 + i * 90} y2="760" />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`h${i}`} x1="60" y1={80 + i * 90} x2="1140" y2={80 + i * 90} />
        ))}
      </g>

      {/* Outer loop path */}
      <path
        className="vl-loop-stroke"
        d="M280 400
           C280 220, 420 140, 600 140
           C780 140, 920 220, 920 400
           C920 580, 780 660, 600 660
           C420 660, 280 580, 280 400 Z"
        fill="none"
        stroke="url(#vl-loop-fade)"
        strokeWidth="3.5"
        strokeLinecap="round"
        pathLength={1000}
      />

      {/* Inner return path — the agent cycle */}
      <path
        className="vl-loop-stroke-inner"
        d="M380 400
           C380 280, 470 230, 600 230
           C730 230, 820 280, 820 400
           C820 520, 730 570, 600 570
           C470 570, 380 520, 380 400 Z"
        fill="none"
        stroke="var(--vl-ink)"
        strokeOpacity="0.18"
        strokeWidth="1.5"
        strokeDasharray="6 10"
        pathLength={1000}
      />

      {/* Verification gate */}
      <g className="vl-gate" transform="translate(600 140)">
        <rect
          x="-28"
          y="-28"
          width="56"
          height="56"
          rx="2"
          fill="var(--vl-paper)"
          stroke="var(--vl-signal)"
          strokeWidth="2"
        />
        <path
          className="vl-tick"
          d="M-12 2 L-3 12 L14 -10"
          fill="none"
          stroke="var(--vl-signal)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
        />
      </g>

      {/* Telemetry ticks around the loop */}
      <g className="vl-ticks" fill="var(--vl-ink)" fillOpacity="0.35">
        <circle cx="280" cy="400" r="3.5" />
        <circle cx="600" cy="660" r="3.5" />
        <circle cx="920" cy="400" r="3.5" />
      </g>
    </svg>
  )
}
