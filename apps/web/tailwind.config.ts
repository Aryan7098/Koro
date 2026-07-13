import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Confidence bands
        rumor: '#94a3b8',      // slate-400
        probable: '#f59e0b',   // amber-500
        confirmed: '#10b981',  // emerald-500
        // Severity
        low: '#64748b',        // slate-500
        med: '#eab308',        // yellow-500
        high: '#f97316',       // orange-500
        critical: '#dc2626',   // red-600
      },
    },
  },
  plugins: [],
};

export default config;
