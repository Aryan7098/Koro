// Top-down football pitch, drawn with SVG strokes. With `animate`, every
// marking draws itself in (stroke-dashoffset technique) in a staggered
// sequence — boundary first, then boxes, then circles and spots.
// All elements use pathLength={100} so one CSS rule times every shape.

type Props = {
  className?: string;
  animate?: boolean;
  strokeWidth?: number;
};

export default function PitchLines({ className, animate = true, strokeWidth = 3 }: Props) {
  // Staggered draw: className + per-element delay
  const draw = (delay: number) =>
    animate
      ? { className: 'pitch-line', style: { animationDelay: `${delay}s` } }
      : {};

  return (
    <svg
      viewBox="0 0 1050 680"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Outer boundary */}
      <path d="M25 25 H1025 V655 H25 Z" pathLength={100} {...draw(0)} />
      {/* Halfway line */}
      <path d="M525 25 V655" pathLength={100} {...draw(0.5)} />
      {/* Centre circle + spot */}
      <path
        d="M525 250 a90 90 0 1 0 0.01 0 Z"
        pathLength={100}
        {...draw(0.7)}
      />
      <circle cx="525" cy="340" r="3.5" fill="currentColor" stroke="none" opacity={animate ? 0 : 1}>
        {animate && (
          <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.6s" fill="freeze" />
        )}
      </circle>

      {/* Left penalty area + goal area */}
      <path d="M25 139 H190 V541 H25" pathLength={100} {...draw(0.9)} />
      <path d="M25 249 H80 V431 H25" pathLength={100} {...draw(1.1)} />
      {/* Left penalty arc + spot */}
      <path d="M190 268.7 A90 90 0 0 1 190 411.3" pathLength={100} {...draw(1.3)} />
      <circle cx="135" cy="340" r="3.5" fill="currentColor" stroke="none" opacity={animate ? 0 : 1}>
        {animate && (
          <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.8s" fill="freeze" />
        )}
      </circle>
      {/* Left goal */}
      <path d="M25 303 H13 V377 H25" pathLength={100} {...draw(1.5)} />

      {/* Right penalty area + goal area */}
      <path d="M1025 139 H860 V541 H1025" pathLength={100} {...draw(0.9)} />
      <path d="M1025 249 H970 V431 H1025" pathLength={100} {...draw(1.1)} />
      {/* Right penalty arc + spot */}
      <path d="M860 268.7 A90 90 0 0 0 860 411.3" pathLength={100} {...draw(1.3)} />
      <circle cx="915" cy="340" r="3.5" fill="currentColor" stroke="none" opacity={animate ? 0 : 1}>
        {animate && (
          <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.8s" fill="freeze" />
        )}
      </circle>
      {/* Right goal */}
      <path d="M1025 303 H1037 V377 H1025" pathLength={100} {...draw(1.5)} />

      {/* Corner arcs */}
      <path d="M25 40 A15 15 0 0 0 40 25" pathLength={100} {...draw(1.7)} />
      <path d="M1010 25 A15 15 0 0 0 1025 40" pathLength={100} {...draw(1.7)} />
      <path d="M1025 640 A15 15 0 0 0 1010 655" pathLength={100} {...draw(1.7)} />
      <path d="M40 655 A15 15 0 0 0 25 640" pathLength={100} {...draw(1.7)} />
    </svg>
  );
}
