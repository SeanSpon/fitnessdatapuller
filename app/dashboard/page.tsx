import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, startOfUtcDay } from "@/lib/dates";
import { toDailyHealthJson } from "@/lib/health-json";

export default async function Dashboard() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/");
  }

  const today = startOfUtcDay();
  const [snapshot, note, logs] = await Promise.all([
    prisma.dailyHealthSnapshot.findUnique({ where: { userId_date: { userId, date: today } } }),
    prisma.dailyNote.findUnique({ where: { userId_date: { userId, date: today } } }),
    prisma.syncLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const healthJson = toDailyHealthJson(snapshot ? { ...snapshot, note } : null, today);
  const hasSyncedData = Boolean(snapshot || logs.length);
  const manualSyncCurl = String.raw`curl -X POST https://fitnessdatapuller.vercel.app/api/sync/samsung \
  -H "Authorization: Bearer YOUR_SYNC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "date":"2026-05-06",
    "steps":28000,
    "active_calories":900,
    "sleep_hours":7.4,
    "sleep_quality":"good",
    "weight_lbs":153,
    "resting_hr":58,
    "ai_summary":"Manual test sync."
  }'`;

  return (
    <main className="min-h-screen bg-ink px-6 py-8 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-panel p-6 md:flex-row md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-glow">Private dashboard</p>
            <h1 className="mt-2 text-3xl font-black">Today: {formatDateOnly(today)}</h1>
            <p className="mt-2 text-slate-300">Read-only MVP. Sync manually first; background sync can come later.</p>
          </div>
          <form action={logout}>
            <button className="rounded-full border border-white/15 px-5 py-3 font-semibold text-slate-200">Logout</button>
          </form>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Calories" value={healthJson.nutrition.calories ?? "—"} />
          <Metric label="Protein" value={healthJson.nutrition.protein_g ? `${healthJson.nutrition.protein_g}g` : "—"} />
          <Metric label="Steps" value={healthJson.activity.steps ?? "—"} />
          <Metric label="Sleep" value={healthJson.sleep.hours ? `${healthJson.sleep.hours}h` : "—"} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-panel p-6">
            <h2 className="text-xl font-bold">Structured daily JSON</h2>
            <pre className="mt-4 overflow-auto rounded-2xl bg-black/40 p-4 text-sm text-emerald-100">
              {JSON.stringify(healthJson, null, 2)}
            </pre>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-panel p-6">
              <h2 className="text-xl font-bold">Sync flow</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-slate-300">
                <li>Android app reads Samsung Health on your phone.</li>
                <li>Tap Sync Health Data.</li>
                <li>Phone posts to <code className="text-glow">/api/sync/samsung</code>.</li>
                <li>Cronometer CSV posts to <code className="text-glow">/api/import/cronometer</code>.</li>
              </ol>
            </div>

            {!hasSyncedData ? (
              <div className="rounded-3xl border border-glow/30 bg-glow/10 p-6">
                <h2 className="text-xl font-bold">Database is ready — send a test sync</h2>
                <p className="mt-3 text-slate-200">
                  If login redirects to this dashboard but metrics are blank, the app is working and waiting for imported data.
                  Post a manual Samsung payload, then refresh this page.
                </p>
                <pre className="mt-4 overflow-auto rounded-2xl bg-black/50 p-4 text-xs text-emerald-100">
                  {manualSyncCurl}
                </pre>
                <p className="mt-3 text-sm text-slate-300">
                  Expected after refresh: Steps 28000, Sleep 7.4h, body metrics in the JSON, and a Samsung sync log.
                </p>
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-panel p-6">
              <h2 className="text-xl font-bold">Latest sync logs</h2>
              <div className="mt-4 space-y-3">
                {logs.length ? logs.map((log) => (
                  <div key={log.id} className="rounded-2xl bg-white/5 p-3 text-sm">
                    <p className="font-semibold text-glow">{log.source} · {log.status}</p>
                    <p className="text-slate-400">{log.createdAt.toISOString()}</p>
                    {log.message ? <p className="text-slate-300">{log.message}</p> : null}
                  </div>
                )) : <p className="text-slate-400">No syncs yet.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-panel p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-glow">{value}</p>
    </div>
  );
}
