import Link from 'next/link';

const roles = [
  {
    href: '/fan',
    title: 'Fan',
    desc: 'One-tap report + multilingual nudges in your language.',
    accent: 'border-sky-700 hover:border-sky-500',
  },
  {
    href: '/volunteer',
    title: 'Volunteer',
    desc: 'Verify queue + do-this-say-this scripts.',
    accent: 'border-emerald-700 hover:border-emerald-500',
  },
  {
    href: '/staff',
    title: 'Staff',
    desc: 'Dispatch queue, evidence lineage, and the Authorize queue for safety-critical events.',
    accent: 'border-amber-700 hover:border-amber-500',
  },
  {
    href: '/organizer',
    title: 'Organizer',
    desc: 'Live venue map, headline metrics, and emergent patterns.',
    accent: 'border-purple-700 hover:border-purple-500',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-12 max-w-3xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-bold mb-2">EchoStand</h1>
        <p className="text-slate-400">
          Real-time crowd-sourced ground truth for FIFA World Cup 2026 — MetLife Stadium.
        </p>
        <p className="text-slate-500 text-sm mt-2">
          Pick a role to try, or head to the{' '}
          <Link href="/control" className="text-emerald-400 hover:text-emerald-300 underline">
            control panel
          </Link>{' '}
          to run the demo narrative for a live judge.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {roles.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className={`block p-5 rounded-lg border-2 transition ${r.accent}`}
          >
            <div className="text-xl font-semibold">{r.title}</div>
            <div className="text-sm text-slate-400 mt-1">{r.desc}</div>
          </Link>
        ))}
      </div>

      <section className="mb-8 p-5 rounded-lg border border-slate-800 bg-slate-900/30">
        <div className="text-sm font-semibold mb-2">Fastest way to see the loop:</div>
        <ol className="list-decimal ml-5 text-sm text-slate-400 space-y-1">
          <li>
            Open <Link href="/fan" className="text-emerald-400 underline">/fan</Link> in one
            window, log in as <code className="text-slate-300">María</code> (es) or
            <code className="text-slate-300"> Jamil</code> (ar + mobility).
          </li>
          <li>
            Open <Link href="/staff" className="text-emerald-400 underline">/staff</Link> in a
            second window as <code className="text-slate-300">Ops Control</code>.
          </li>
          <li>
            In a third, open <Link href="/control" className="text-emerald-400 underline">/control</Link>{' '}
            as <code className="text-slate-300">Match Organizer</code> and run{' '}
            <code className="text-slate-300">demo_full_narrative</code>.
          </li>
          <li>Watch the rumor → probable → confirmed progression, the multi-lingual nudges,
            the wheelchair-safe reroute, and the RUMOR/CRITICAL medical event landing in the
            Authorize queue immediately.
          </li>
        </ol>
      </section>

      <div className="text-xs text-slate-500">
        Languages: EN · ES · FR · AR · PT · KO ·{' '}
        <span className="text-slate-600">v1 → M13 (all milestones landed)</span>
      </div>
    </main>
  );
}
