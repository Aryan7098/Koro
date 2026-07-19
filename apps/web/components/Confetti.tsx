'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

// Tiny confetti burst. Not a library — a handful of coloured divs launched
// from centre-top with random angle + gravity. Fires once and cleans up.

type Piece = {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rot: number;
};

const COLORS = ['#10b981', '#38bdf8', '#a78bfa', '#f59e0b', '#f43f5e'];

export default function Confetti({ trigger }: { trigger: unknown }) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (trigger !== undefined && trigger !== null) setKey((k) => k + 1);
  }, [trigger]);

  const pieces = useMemo<Piece[]>(() => {
    // Reseed every trigger
    void key;
    return Array.from({ length: 34 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 800,
      y: 200 + Math.random() * 400,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 6,
      rot: Math.random() * 720 - 360,
    }));
  }, [key]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-start justify-center overflow-hidden">
      <AnimatePresence>
        {key > 0 && (
          <motion.div
            key={key}
            className="relative w-full h-full"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ delay: 1.6, duration: 0.6 }}
            onAnimationComplete={() => {}}
          >
            {pieces.map((p) => (
              <motion.div
                key={p.id}
                className="absolute top-8 left-1/2 rounded-sm"
                style={{
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  boxShadow: `0 0 6px ${p.color}88`,
                }}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{ x: p.x, y: p.y, rotate: p.rot, opacity: 0 }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
