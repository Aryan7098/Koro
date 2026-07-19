// Hand-drawn 24×24 stroke icon set (Phosphor-style: 1.8 stroke, round caps).
// One consistent family instead of emojis so icons scale, theme, and align.

import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

export function UsersIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="7.5" r="3.2" />
      <path d="M3.5 19.5c0-3.1 2.5-5.3 5.5-5.3s5.5 2.2 5.5 5.3" />
      <path d="M15.5 4.9a3 3 0 110 5.4" />
      <path d="M16.6 14.4c2.3.5 3.9 2.4 3.9 5.1" />
    </svg>
  );
}

export function VestIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M8.2 3.5 12 6.4l3.8-2.9 2.4 3.4-1.7 2.4v9.2a1 1 0 0 1-1 1H8.5a1 1 0 0 1-1-1V9.3L5.8 6.9l2.4-3.4z" />
      <path d="M7.5 14.5h9" />
      <path d="M12 6.4v13.1" />
    </svg>
  );
}

export function HeadsetIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3.2" y="13.4" width="4" height="5.6" rx="1.6" />
      <rect x="16.8" y="13.4" width="4" height="5.6" rx="1.6" />
      <path d="M20 19v.4a2.2 2.2 0 0 1-2.2 2.2H13.8" />
    </svg>
  );
}

export function RadarIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.4" opacity="0.55" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <path d="m12 12 5.6-6.4" />
    </svg>
  );
}

export function DropletIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.5c3.6 4.1 6 7 6 10.1a6 6 0 1 1-12 0c0-3.1 2.4-6 6-10.1z" />
      <path d="M9.5 14.5a2.6 2.6 0 0 0 2 2.6" opacity="0.6" />
    </svg>
  );
}

export function RestroomIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="7.5" cy="5.2" r="1.9" />
      <path d="M7.5 9.4c-1.8 0-3 1.3-3 3.2v3h1.2v4.9h3.6v-4.9h1.2v-3c0-1.9-1.2-3.2-3-3.2z" />
      <circle cx="16.5" cy="5.2" r="1.9" />
      <path d="M16.5 9.4 13.6 16h1.9v4.5h2v-4.5h1.9l-2.9-6.6z" />
    </svg>
  );
}

export function BurgerIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4.5 10.2c0-3.2 3.4-5.7 7.5-5.7s7.5 2.5 7.5 5.7z" />
      <path d="M4.5 13.6h15" />
      <path d="M4.5 17h15v.4a2.4 2.4 0 0 1-2.4 2.4H6.9a2.4 2.4 0 0 1-2.4-2.4z" />
    </svg>
  );
}

export function GateIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3.5 20.5h17" />
      <path d="M6 20.5V10a6 6 0 0 1 12 0v10.5" />
      <path d="M12 20.5v-6" opacity="0.6" />
    </svg>
  );
}

export function CompassIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15 9-1.9 4.4L8.7 15l1.9-4.4z" />
    </svg>
  );
}

export function FogIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 8.5c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0 3.3-1.6 5 0" />
      <path d="M4 12.5c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0 3.3-1.6 5 0" opacity="0.7" />
      <path d="M4 16.5c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0 3.3-1.6 5 0" opacity="0.4" />
    </svg>
  );
}

export function MedicalIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="6.5" width="17" height="13.5" rx="2" />
      <path d="M9 6.5V5a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 5v1.5" />
      <path d="M12 10.5v5M9.5 13h5" />
    </svg>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m12 3 7 2.7v5.4c0 4.6-3 7.9-7 9.9-4-2-7-5.3-7-9.9V5.7z" />
    </svg>
  );
}

export function ShieldCheckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m12 3 7 2.7v5.4c0 4.6-3 7.9-7 9.9-4-2-7-5.3-7-9.9V5.7z" />
      <path d="m9 12 2.2 2.2 4-4.4" />
    </svg>
  );
}

export function FlameIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 12h16M13.5 5.5 20 12l-6.5 6.5" />
    </svg>
  );
}

export function ArrowLeftIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M20 12H4m6.5-6.5L4 12l6.5 6.5" />
    </svg>
  );
}

export function WhistleIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M13.6 9.5h6.9v3.4l-5.6 1.7a5.4 5.4 0 1 1-5.1-5.1z" />
      <circle cx="9.6" cy="14.9" r="1.5" opacity="0.7" />
    </svg>
  );
}

export function TrophyIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M7 4h10v5.5a5 5 0 0 1-10 0z" />
      <path d="M7 5.5H4.2v.8A3.2 3.2 0 0 0 7.4 9.5M17 5.5h2.8v.8a3.2 3.2 0 0 1-3.2 3.2" />
      <path d="M12 14.5v3" />
      <path d="M8.5 20.5h7l-.8-3h-5.4z" />
    </svg>
  );
}

export function ZapIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M13 2.5 5 13.5h5.5L11 21.5l8-11h-5.5z" />
    </svg>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function ChartIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4.5 4v15.5H20" />
      <path d="M8.5 16v-4.5M12.5 16V8M16.5 16v-2.5" />
    </svg>
  );
}

export function LockIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function ChatIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 19.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5z" />
      <path d="M8.5 8.5h7M8.5 11.8h4.5" opacity="0.7" />
    </svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function XIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m6.5 6.5 11 11m0-11-11 11" />
    </svg>
  );
}

export function MapPinIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 21s-6.5-5.1-6.5-10.3a6.5 6.5 0 0 1 13 0C18.5 15.9 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </svg>
  );
}

export function GlobeIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.2-3.9-8.5s1.3-6.2 3.9-8.5z" />
    </svg>
  );
}

export function RadioIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path d="M8.6 15.4a4.8 4.8 0 0 1 0-6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8" />
      <path d="M6 18a8.5 8.5 0 0 1 0-12M18 6a8.5 8.5 0 0 1 0 12" opacity="0.55" />
    </svg>
  );
}

export function SendIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 3 10 14" />
      <path d="M21 3l-7 18-4-7-7-4z" />
    </svg>
  );
}

export function AccessibilityIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="16" cy="4.5" r="1.6" />
      <path d="m18 19 1-7-5.9.9" />
      <path d="m5 8 3-3 5.5 3-2.4 3.5" />
      <path d="M4.2 14.5a5 5 0 0 0 6.9 6" />
      <path d="M13.8 17.5a5 5 0 0 0-6.9-6" />
    </svg>
  );
}

export function CameraIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3.5 9a2 2 0 0 1 2-2h2l1.4-2.3a1 1 0 0 1 .9-.5h4.4a1 1 0 0 1 .9.5L16.5 7h2a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </svg>
  );
}
