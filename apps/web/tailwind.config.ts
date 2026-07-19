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
        // Football theme
        pitch: {
          50: '#ecfdf5',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          900: '#064e3b',
          950: '#022c22',
        },
        gold: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
        },
        night: {
          800: '#0f1a2e',
          900: '#0a1122',
          950: '#060b16',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'Arial Narrow', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(16, 185, 129, 0.45)',
        'glow-gold': '0 0 24px -4px rgba(251, 191, 36, 0.4)',
        'glow-sky': '0 0 24px -4px rgba(56, 189, 248, 0.45)',
        floodlight: '0 0 60px -10px rgba(226, 250, 239, 0.25)',
      },
      keyframes: {
        'kickoff-pop': {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '60%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'ball-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'led-flicker': {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '94%': { opacity: '0.85' },
          '96%': { opacity: '1' },
        },
      },
      animation: {
        'kickoff-pop': 'kickoff-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'ball-spin': 'ball-spin 14s linear infinite',
        'led-flicker': 'led-flicker 7s steps(1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
