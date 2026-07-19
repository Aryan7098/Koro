'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import SoccerBall from './SoccerBall';

// Goal celebration! Not a library — coloured ribbons and a few mini match
// balls launched from centre-top with random angle + gravity. Fires once
// per trigger and cleans up after itself.

type Piece = {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rot: number;
  ball: boolean;
  drift: number;
};

const COLORS = ['#10b981', '#38bdf8', '#fbbf24', '#a78bfa', '#f43f5e', '#f8fafc'];

export default function Confetti({ trigger }: { trigger: unknown }) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (trigger !== undefined && trigger !== null) setKey((k) => k + 1);
  }, [trigger]);

  const pieces = useMemo<Piece[]>(() => {
    // Reseed every trigger
    void key;
    return Array.from({ length: 44 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 900,
      y: 220 + Math.random() * 420,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 7,
      rot: Math.random() * 720 - 360,
      ball: i % 11 === 0, // a few mini soccer balls in the shower
      drift: (Math.random() - 0.5) * 120,
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
            transition={{ delay: 1.7, duration: 0.6 }}
          >
            {pieces.map((p) => (
              <motion.div
                key={p.id}
                className="absolute top-8 left-1/2"
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: [0, p.x * 0.7 + p.drift, p.x],
                  y: [0, p.y * 0.55, p.y],
                  rotate: p.rot,
                  opacity: [1, 1, 0],
                  scale: p.ball ? 1 : [1, 1, 0.8],
                }}
                transition={{ duration: 1.5, ease: 'easeOut', times: [0, 0.55, 1] }}
              >
                {p.ball ? (
                  <SoccerBall size={16 + p.size} surface="#f8fafc" panel="#0b1120" />
                ) : (
                  <div
                    className="rounded-sm"
                    style={{
                      width: p.size,
                      height: p.size * 1.6,
                      background: p.color,
                      boxShadow: `0 0 6px ${p.color}88`,
                    }}
                  />
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
