'use client';

import { useState } from 'react';
import { uploadMedia } from '../lib/api';
import { CameraIcon } from './icons';

type Props = {
  attached: string[];
  onChange: (ids: string[]) => void;
};

export default function MediaAttach({ attached, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await uploadMedia(file);
      onChange([...attached, r.media_id]);
    } catch (ex: any) {
      setErr(ex.message);
    } finally {
      setBusy(false);
      // reset the input so the same file can be re-picked
      e.target.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <label
        className={`px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 cursor-pointer transition inline-flex items-center gap-1.5 ${
          busy ? 'opacity-50' : ''
        }`}
      >
        {busy ? (
          'uploading…'
        ) : (
          <>
            <CameraIcon size={14} /> attach photo
          </>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFile}
          disabled={busy}
          className="hidden"
        />
      </label>
      {attached.length > 0 && (
        <div className="text-slate-400">
          {attached.length} attached
          <button
            className="ml-2 text-slate-500 hover:text-slate-300 underline"
            onClick={() => onChange([])}
          >
            clear
          </button>
        </div>
      )}
      {err && <div className="text-red-400">{err}</div>}
    </div>
  );
}
