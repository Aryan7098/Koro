'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

// Ambient decoration for the landing page: slowly drifting radial gradient
// blobs (green/blue/purple — a nod to a stadium light rig) plus a small
// flock of floating soccer balls. All motion is CSS/framer-driven and
// pointer-events-none so it never interferes with the UI.

type Ball = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
};

export default function AmbientBackground() {
  const balls = useMemo<Ball[]>(() => {
    // Deterministic seed so SSR + first client render match.
    const seed = [7, 23, 41, 59, 83, 97, 113, 131];
    return seed.map((s, i) => ({
      id: i,
      x: (s * 137) % 100,           // %
      y: (s * 71) % 100,            // %
      size: 22 + ((s * 13) % 28),   // px
      duration: 18 + ((s * 5) % 22),
      delay: (s % 7) * -1.5,
    }));
  }, []);

  return (
    <div className="absolute inset-0 -z-0 overflow-hidden pointer-events-none">
      {/* Gradient blobs */}
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

      {/* Floating soccer balls */}
      {balls.map((b) => (
        <motion.div
          key={b.id}
          className="absolute text-2xl select-none opacity-40"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            fontSize: `${b.size}px`,
            filter: 'drop-shadow(0 4px 8px rgba(16, 185, 129, 0.2))',
          }}
          animate={{
            y: ['0%', '-30%', '0%'],
            x: ['0%', '15%', '0%'],
            rotate: [0, 360],
          }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          ⚽
        </motion.div>
      ))}

      {/* Grass field grid line effect at the bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 opacity-20"
        style={{
          background:
            'repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(16, 185, 129, 0.15) 60px, rgba(16, 185, 129, 0.15) 62px), linear-gradient(180deg, transparent, rgba(6, 78, 59, 0.4))',
        }}
      />
    </div>
  );
}
