'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Me, login, logout } from '../lib/api';

// Language → seeded fan mapping. To the user this is just "pick a language".
// The backing user carries language + accessibility metadata used by the
// rendering pipeline. Anonymous mode (no persona) is still supported.
const LANGUAGES: {
  code: string;
  flag: string;
  name: string;
  nativeName: string;
  seededUsername: string | null;    // null = anonymous mode
  accessibilityNote?: string;
}[] = [
  { code: 'en', flag: '🇺🇸', name: 'English',    nativeName: 'English',    seededUsername: null },
  { code: 'es', flag: '🇪🇸', name: 'Spanish',    nativeName: 'Español',    seededUsername: 'fan_maria' },
  { code: 'fr', flag: '🇫🇷', name: 'French',     nativeName: 'Français',   seededUsername: 'fan_luc' },
  { code: 'pt', flag: '🇧🇷', name: 'Portuguese', nativeName: 'Português',  seededUsername: 'fan_ana',  accessibilityNote: 'sensory' },
  { code: 'ar', flag: '🇸🇦', name: 'Arabic',     nativeName: 'العربية',    seededUsername: 'fan_jamil', accessibilityNote: 'wheelchair' },
  { code: 'ko', flag: '🇰🇷', name: 'Korean',     nativeName: '한국어',     seededUsername: 'fan_wei' },
];

type Props = {
  me: Me | null;
  currentLang: string;
  onChange: (me: Me | null, lang: string) => void;
};

export default function LanguagePicker({ me, currentLang, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // On first mount, try to auto-detect browser language.
  useEffect(() => {
    if (me) return;
    const guess = (typeof navigator !== 'undefined' ? navigator.language : 'en')
      .split('-')[0]
      .toLowerCase();
    const match = LANGUAGES.find((l) => l.code === guess);
    if (match && match.code !== currentLang) {
      // Fire-and-forget: don't block first render on this
      pick(match.code).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(code: string) {
    const lang = LANGUAGES.find((l) => l.code === code);
    if (!lang) return;
    setBusy(code);
    setErr(null);
    try {
      if (lang.seededUsername) {
        const r = await login(lang.seededUsername);
        onChange(r.user, r.user.language);
      } else {
        logout();
        onChange(null, code);
      }
      setOpen(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  const current = LANGUAGES.find(
    (l) => (me ? l.seededUsername === me.username : l.code === currentLang)
  ) || LANGUAGES[0];

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen((v) => !v)}
        className="text-sm px-3 py-2 rounded-full border border-slate-700 hover:border-emerald-500 bg-slate-900/60 flex items-center gap-2"
      >
        <span className="text-lg">{current.flag}</span>
        <span className="hidden sm:inline">{current.nativeName}</span>
        {current.accessibilityNote && (
          <span className="text-xs text-emerald-400">
            {current.accessibilityNote === 'wheelchair' ? '♿' : '🎧'}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur shadow-2xl z-30 p-1 overflow-hidden"
          >
            <div className="text-xs text-slate-500 px-3 pt-2 pb-1">
              Choose your language. Some options include accessibility hints so you
              can see how the app re-plans routes.
            </div>
            {LANGUAGES.map((l) => {
              const isActive =
                (me && l.seededUsername === me.username) ||
                (!me && l.code === currentLang);
              return (
                <motion.button
                  key={l.code}
                  whileHover={{ x: 4 }}
                  onClick={() => pick(l.code)}
                  disabled={busy === l.code}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition ${
                    isActive
                      ? 'bg-emerald-950/60 border border-emerald-700/50'
                      : 'hover:bg-slate-800/60'
                  }`}
                >
                  <span className="text-2xl leading-none">{l.flag}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{l.nativeName}</div>
                    <div className="text-xs text-slate-500">
                      {l.name}
                      {l.accessibilityNote && ` · ${l.accessibilityNote}`}
                    </div>
                  </div>
                </motion.button>
              );
            })}
            {err && <div className="text-xs text-red-400 mt-2 px-3">{err}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
