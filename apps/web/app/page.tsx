import Link from 'next/link';

const roles = [
  { href: '/fan', title: 'Fan', desc: 'Report what you see. Get help in your language.' },
  { href: '/volunteer', title: 'Volunteer', desc: 'Verify events. Follow do-this-say-this scripts.' },
  { href: '/staff', title: 'Staff', desc: 'Dispatch queue. Authorize consequential actions.' },
  { href: '/organizer', title: 'Organizer', desc: 'Live venue map. Emergent patterns.' },
  { href: '/control', title: 'Control (Demo)', desc: 'Run simulator scenarios for the judge demo.' },
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-16 max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold mb-2">EchoStand</h1>
      <p className="text-slate-400 mb-10">
        Real-time crowd-sourced ground truth for FIFA World Cup 2026. Pick a role to begin.
      </p>
      <div className="grid gap-4">
        {roles.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="block p-5 rounded-lg border border-slate-700 hover:border-slate-500 transition"
          >
            <div className="text-xl font-semibold">{r.title}</div>
            <div className="text-sm text-slate-400 mt-1">{r.desc}</div>
          </Link>
        ))}
      </div>
      <div className="mt-12 text-xs text-slate-500">
        MetLife Stadium (demo venue) · Languages: EN · ES · FR · AR · PT · KO
      </div>
    </main>
  );
}
