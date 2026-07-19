'use client';

import SoccerBall from './SoccerBall';

// Loading state with personality: a match ball bouncing on its shadow.
// Falls back to a static ball + text under prefers-reduced-motion
// (the bounce keyframes are neutralized globally).

export default function BallLoader({ label = 'Warming up…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8" role="status" aria-live="polite">
      <div className="relative h-14 flex items-end">
        <div className="animate-ball-bounce">
          <SoccerBall size={30} surface="#e2e8f0" panel="#1e293b" />
        </div>
      </div>
      <div
        className="w-8 h-1.5 rounded-full bg-black/60 blur-[2px] animate-ball-shadow"
        aria-hidden="true"
      />
      <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}
