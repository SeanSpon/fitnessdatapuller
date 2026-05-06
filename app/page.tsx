import { auth } from "@/lib/auth";
import { goDashboard, login } from "./actions";

export default async function Home() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-ink px-6 py-10 text-white">
      <section className="mx-auto flex max-w-5xl flex-col gap-8 rounded-3xl border border-white/10 bg-panel/80 p-8 shadow-2xl shadow-emerald-500/10 md:p-12">
        <div className="max-w-3xl space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-glow">SeanOS Health Hub</p>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">One simple read-only home for your health data.</h1>
          <p className="text-lg text-slate-300">
            Start with Vercel, Postgres, manual Samsung sync, Cronometer CSV import, Hevy-ready workout tables, and a daily JSON endpoint I can read when you say “check my health data.”
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            "POST /api/sync/samsung",
            "POST /api/import/cronometer",
            "GET /api/health/today",
          ].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 font-mono text-sm text-emerald-100">
              {item}
            </div>
          ))}
        </div>

        {session?.user ? (
          <form action={goDashboard}>
            <button className="rounded-full bg-glow px-6 py-3 font-bold text-ink">Open dashboard</button>
          </form>
        ) : (
          <form action={login} className="grid max-w-md gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
            <input name="email" type="email" placeholder="Private email" className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none" required />
            <input name="password" type="password" placeholder="Admin password" className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none" required />
            <button className="rounded-xl bg-glow px-4 py-3 font-bold text-ink">Login</button>
          </form>
        )}
      </section>
    </main>
  );
}
