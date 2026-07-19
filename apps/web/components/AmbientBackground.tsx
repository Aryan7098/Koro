'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import SoccerBall from './SoccerBall';
import PitchLines from './PitchLines';

// Ambient stage for the landing page: a stadium at night. Floodlight beams
// sweep from the roofline, light blobs drift like a rig warming up, a few
// match balls float in the air, and the pitch itself sits in perspective at
// the bottom, drawing its own markings on load. Everything is
// pointer-events-none and honors prefers-reduced-motion.

type Ball = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
};

export default function AmbientBackground() {
  const reduceMotion = useReducedMotion();

  const balls = useMemo<Ball[]>(() => {
    // Deterministic seed so SSR + first client render match.
    const seed = [7, 23, 41, 59, 83, 97];
    return seed.map((s, i) => ({
      id: i,
      x: (s * 137) % 100,           // %
      y: 8 + ((s * 71) % 55),       // % — keep balls above the pitch
      size: 20 + ((s * 13) % 26),   // px
      duration: 18 + ((s * 5) % 22),
      delay: (s % 7) * -1.5,
    }));
  }, []);

  return (
    <div className="absolute inset-0 -z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Night-sky wash behind everything */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, rgba(14, 116, 144, 0.12), transparent 55%), radial-gradient(80% 60% at 50% 110%, rgba(6, 78, 59, 0.35), transparent 70%)',
        }}
      />

      {/* Floodlight beams from the roofline */}
      <div
        className="absolute -top-24 left-[8%] w-[46vw] max-w-[560px] h-[75vh] animate-floodlight"
        style={{
          background:
            'linear-gradient(195deg, rgba(226, 250, 239, 0.16), rgba(226, 250, 239, 0.05) 55%, transparent 80%)',
          clipPath: 'polygon(42% 0%, 58% 0%, 100% 100%, 0% 100%)',
          filter: 'blur(14px)',
        }}
      />
      <div
        className="absolute -top-24 right-[8%] w-[46vw] max-w-[560px] h-[75vh] animate-floodlight"
        style={{
          background:
            'linear-gradient(165deg, rgba(186, 230, 253, 0.14), rgba(186, 230, 253, 0.04) 55%, transparent 80%)',
          clipPath: 'polygon(42% 0%, 58% 0%, 100% 100%, 0% 100%)',
          filter: 'blur(14px)',
          animationDelay: '-5.5s',
        }}
      />

      {/* Stadium light-rig blobs */}
      <div
        className="absolute -top-20 -left-20 w-[520px] h-[520px] rounded-full blur-3xl opacity-40 animate-blob"
        style={{ background: 'radial-gradient(circle at 30% 30%, #0d9488, transparent 60%)' }}
      />
      <div
        className="absolute -bottom-24 -right-16 w-[600px] h-[600px] rounded-full blur-3xl opacity-30 animate-blob"
        style={{
          background: 'radial-gradient(circle at 70% 70%, #7c3aed, transparent 60%)',
          animationDelay: '6s',
        }}
      />
      <div
        className="absolute top-1/3 left-1/2 w-[400px] h-[400px] rounded-full blur-3xl opacity-25 animate-blob"
        style={{
          background: 'radial-gradient(circle at 50% 50%, #0284c7, transparent 60%)',
          animationDelay: '12s',
        }}
      />

      {/* Floating match balls */}
      {balls.map((b) => (
        <motion.div
          key={b.id}
          className="absolute opacity-25"
          style={{ left: `${b.x}%`, top: `${b.y}%` }}
          animate={
            reduceMotion
              ? undefined
              : { y: ['0%', '-36%', '0%'], x: ['0%', '14%', '0%'], rotate: [0, 360] }
          }
          transition={{
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <SoccerBall size={b.size} surface="#cbd5e1" panel="#1e293b" />
        </motion.div>
      ))}

      {/* The pitch, laid down in perspective at the bottom of the stage */}
      <div
        className="absolute -bottom-[9%] left-1/2 w-[150%] max-w-[1700px]"
        style={{ transform: 'translateX(-50%) perspective(950px) rotateX(58deg)' }}
      >
        {/* Mow stripes */}
        <div
          className="absolute inset-0 opacity-50 animate-grass-pan"
          style={{
            background:
              'repeating-linear-gradient(90deg, rgba(16, 185, 129, 0.10) 0 120px, rgba(16, 185, 129, 0.045) 120px 240px)',
            maskImage: 'linear-gradient(180deg, transparent, black 30%)',
            WebkitMaskImage: 'linear-gradient(180deg, transparent, black 30%)',
          }}
        />
        <PitchLines
          animate={!reduceMotion}
          strokeWidth={2.5}
          className="w-full text-emerald-400/45 drop-shadow-[0_0_10px_rgba(16,185,129,0.35)]"
        />
      </div>

      {/* Fade the pitch into the page bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-28"
        style={{ background: 'linear-gradient(180deg, transparent, rgba(6, 11, 22, 0.9))' }}
      />
    </div>
  );
}
