'use client';

import { useState } from 'react';
import { Me, patchMe } from '../lib/api';
import { AccessibilityIcon, HeadsetIcon } from './icons';

type Props = {
  me: Me | null;
  onUpdate: (me: Me) => void;
};

export default function AccessibilityDrawer({ me, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);

  if (!me) {
    return (
      <div className="text-xs text-slate-500">
        Log in as a fan to set an accessibility profile — anonymous fans can't
        yet receive personalized re-planned routes.
      </div>
    );
  }

  async function toggle(key: 'mobility' | 'sensory') {
    if (!me) return;
    setBusy(true);
    const next = {
      mobility: !!me.accessibility_profile?.mobility,
      sensory: !!me.accessibility_profile?.sensory,
      [key]: !me.accessibility_profile?.[key],
    };
    try {
      const patched = await patchMe({ accessibility_profile: next });
      onUpdate({ ...me, accessibility_profile: patched.accessibility_profile as any });
    } finally {
      setBusy(false);
    }
  }

  const mob = !!me.accessibility_profile?.mobility;
  const sen = !!me.accessibility_profile?.sensory;

  return (
    <div className="flex gap-3">
      <button
        onClick={() => toggle('mobility')}
        disabled={busy}
        className={`flex-1 p-3 rounded-lg border text-left transition ${
          mob ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500'
        }`}
      >
        <AccessibilityIcon size={20} className={mob ? 'text-emerald-300' : 'text-slate-400'} />
        <div className="text-sm font-medium mt-1">Mobility</div>
        <div className="text-xs text-slate-500">step-free routes only</div>
      </button>
      <button
        onClick={() => toggle('sensory')}
        disabled={busy}
        className={`flex-1 p-3 rounded-lg border text-left transition ${
          sen ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500'
        }`}
      >
        <HeadsetIcon size={20} className={sen ? 'text-emerald-300' : 'text-slate-400'} />
        <div className="text-sm font-medium mt-1">Sensory</div>
        <div className="text-xs text-slate-500">low-stimulus routes</div>
      </button>
    </div>
  );
}
