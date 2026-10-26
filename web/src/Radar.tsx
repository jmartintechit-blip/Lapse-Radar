import { useState } from 'react';
import { useI18n } from './i18n';

// Decorative radar: the rings are the alert thresholds (30, 14, 7 and 1 days), a dot is an item and
// the nearer the centre, the sooner it expires. The sweep stops under prefers-reduced-motion (CSS).
const RINGS = [
  { r: 190, label: '30d' },
  { r: 140, label: '14d' },
  { r: 90, label: '7d' },
  { r: 40, label: '1d' },
];
const BLIPS = [
  { x: 236, y: 168, tone: 'critical' },
  { x: 120, y: 120, tone: 'soon' },
  { x: 250, y: 90, tone: 'soon' },
  { x: 310, y: 260, tone: 'ok' },
  { x: 90, y: 290, tone: 'ok' },
];

export function Radar() {
  const [paused, setPaused] = useState(false);
  const { t } = useI18n();
  return (
    <div className="radar-box">
      <svg className="radar" viewBox="0 0 400 400" aria-hidden="true" data-paused={paused}>
        <defs>
          <linearGradient id="sweep-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        {RINGS.map(({ r }) => (
          <circle key={r} className="radar-line" cx="200" cy="200" r={r} />
        ))}
        <line className="radar-line" x1="10" y1="200" x2="390" y2="200" />
        <line className="radar-line" x1="200" y1="10" x2="200" y2="390" />
        {RINGS.map(({ r, label }) => (
          <text key={r} className="radar-label" x="206" y={200 - r + 14}>
            {label}
          </text>
        ))}
        <g className="radar-sweep">
          <path d="M200 200 L390 200 A190 190 0 0 0 340 66 Z" fill="url(#sweep-fade)" />
        </g>
        {BLIPS.map(({ x, y, tone }) => (
          <circle key={`${x}-${y}`} className={`blip blip-${tone}`} cx={x} cy={y} r="6" />
        ))}
      </svg>
      <button type="button" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
        {paused ? t.playRadar : t.pauseRadar}
      </button>
    </div>
  );
}
