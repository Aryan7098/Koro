'use client';

import { useId } from 'react';

// Classic truncated-icosahedron ball, drawn flat: one centre pentagon, five
// edge pentagons and the seams between them, all computed so it stays
// perfectly symmetric. Pure SVG — scales crisply and takes theme colors.

type Props = {
  size?: number;
  className?: string;
  /** Panel + seam color */
  panel?: string;
  /** Ball surface color */
  surface?: string;
  spinning?: boolean;
};

function pent(cx: number, cy: number, r: number, rotDeg: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 5; k++) {
    const a = ((rotDeg + k * 72 - 90) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

const EDGE_ANGLES = [0, 1, 2, 3, 4].map((k) => -90 + k * 72);

export default function SoccerBall({
  size = 48,
  className,
  panel = '#0b1120',
  surface = '#f1f5f9',
  spinning = false,
}: Props) {
  const uid = useId().replace(/[:]/g, '');
  const shade = `shade-${uid}`;
  const clip = `clip-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`${spinning ? 'animate-ball-spin' : ''} ${className ?? ''}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={shade} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={surface} />
          <stop offset="70%" stopColor={surface} />
          <stop offset="100%" stopColor="#94a3b8" />
        </radialGradient>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="47.5" />
        </clipPath>
      </defs>

      <circle cx="50" cy="50" r="47.5" fill={`url(#${shade})`} stroke={panel} strokeWidth="2.5" />

      <g clipPath={`url(#${clip})`}>
        {/* Seams from the centre pentagon out to each edge pentagon */}
        {EDGE_ANGLES.map((deg) => {
          const a = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={50 + 17 * Math.cos(a)}
              y1={50 + 17 * Math.sin(a)}
              x2={50 + 31 * Math.cos(a)}
              y2={50 + 31 * Math.sin(a)}
              stroke={panel}
              strokeWidth="2.2"
            />
          );
        })}

        {/* Centre pentagon */}
        <polygon points={pent(50, 50, 17, 0)} fill={panel} />

        {/* Edge pentagons, one vertex aimed at the centre */}
        {EDGE_ANGLES.map((deg) => {
          const a = (deg * Math.PI) / 180;
          const cx = 50 + 46 * Math.cos(a);
          const cy = 50 + 46 * Math.sin(a);
          return <polygon key={deg} points={pent(cx, cy, 15, deg + 270)} fill={panel} />;
        })}
      </g>

      {/* Floodlight glint */}
      <ellipse cx="36" cy="27" rx="12" ry="7" fill="#ffffff" opacity="0.28" transform="rotate(-28 36 27)" />
    </svg>
  );
}
