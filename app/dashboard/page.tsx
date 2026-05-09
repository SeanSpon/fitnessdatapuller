import { redirect } from "next/navigation";
import { logout, uploadCronometerCsv } from "@/app/actions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, startOfUtcDay } from "@/lib/dates";

export default async function Dashboard() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/");
  }

  // Use the most-recently-synced day as "today" so a 9pm sync (which the phone
  // tags as the local day) doesn't disappear after UTC rolls midnight.
  const latestSnapshot = await prisma.dailyHealthSnapshot.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
  });
  const viewDate = latestSnapshot?.date ?? startOfUtcDay();
  const sevenDaysAgo = new Date(viewDate);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  const [snapshot, note, logs, todayWorkouts, todayNutrition, weekSnapshots] = await Promise.all([
    prisma.dailyHealthSnapshot.findFirst({
      where: { userId, date: viewDate },
      orderBy: { syncedAt: "desc" },
    }),
    prisma.dailyNote.findUnique({ where: { userId_date: { userId, date: viewDate } } }),
    prisma.syncLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.workoutSession.findMany({
      where: { userId, date: viewDate },
      orderBy: { startTime: "asc" },
      include: { sets: true },
    }),
    prisma.nutritionEntry.findMany({
      where: { userId, date: viewDate },
      orderBy: { syncedAt: "desc" },
      take: 30,
    }),
    prisma.dailyHealthSnapshot.findMany({
      where: { userId, date: { gte: sevenDaysAgo, lte: viewDate } },
      orderBy: { date: "asc" },
    }),
  ]);

  const calories = snapshot?.calories ?? null;
  const burned = snapshot?.caloriesBurned ?? null;
  const protein = snapshot?.proteinG ?? null;
  const carbs = snapshot?.carbsG ?? null;
  const fat = snapshot?.fatG ?? null;
  const steps = snapshot?.steps ?? null;
  const activeCal = snapshot?.activeCalories ?? null;
  const sleep = snapshot?.sleepHours ?? null;
  const restingHr = snapshot?.restingHr ?? null;
  const weight = snapshot?.weightLbs ?? null;
  const workoutCount = todayWorkouts.length;

  const hasAnyData = Boolean(snapshot || logs.length || todayWorkouts.length || todayNutrition.length);

  return (
    <main className="min-h-screen bg-ink px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-panel p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-glow">SeanOS Health Hub</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{formatDateOnly(viewDate)}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {snapshot?.syncedAt
                ? `Last sync ${new Date(snapshot.syncedAt).toLocaleString()}`
                : "No data for the most recent day yet."}
            </p>
          </div>
          <form action={logout}>
            <button className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10">
              Logout
            </button>
          </form>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Food calories"
            value={calories !== null ? calories.toLocaleString() : "—"}
            unit="kcal"
          />
          <Metric label="Protein" value={protein !== null ? Math.round(protein).toString() : "—"} unit="g" />
          <Metric label="Steps" value={steps !== null ? steps.toLocaleString() : "—"} />
          <Metric label="Sleep" value={sleep !== null ? sleep.toFixed(1) : "—"} unit="h" />
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Carbs" value={carbs !== null ? Math.round(carbs).toString() : "—"} unit="g" subtle />
          <Metric label="Fat" value={fat !== null ? Math.round(fat).toString() : "—"} unit="g" subtle />
          <Metric
            label="Burned"
            value={burned !== null ? burned.toLocaleString() : "—"}
            unit="kcal"
            subtle
            hint={activeCal !== null ? `${activeCal.toLocaleString()} active` : undefined}
          />
          <Metric label="Workouts" value={workoutCount.toString()} subtle />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-5">
            <Card title="Workouts" subtitle="From Health Connect (Hevy + Samsung Health)">
              {todayWorkouts.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nothing yet. When Hevy writes a session to Health Connect and the phone syncs, it shows up here.
                </p>
              ) : (
                <ul className="space-y-3">
                  {todayWorkouts.map((w) => {
                    const start = w.startTime ? new Date(w.startTime) : null;
                    const end = w.endTime ? new Date(w.endTime) : null;
                    return (
                      <li key={w.id} className="rounded-xl border border-white/5 bg-white/5 p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-base font-semibold text-white">{w.name}</p>
                          <span className="rounded-md bg-glow/15 px-2 py-0.5 text-xs font-medium text-glow">
                            {w.source}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-400">
                          {start ? start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                          {end ? ` → ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                          {w.durationM ? ` · ${w.durationM} min` : ""}
                          {w.volumeLbs ? ` · ${Math.round(w.volumeLbs).toLocaleString()} lb volume` : ""}
                        </p>
                        {w.sets.length > 0 ? (
                          <ul className="mt-3 space-y-1 text-sm">
                            {w.sets.map((s) => (
                              <li key={s.id} className="flex justify-between text-slate-200">
                                <span>{s.exerciseName}</span>
                                <span className="font-mono text-slate-300">
                                  set {s.setNumber} · {s.reps ?? "—"} reps
                                  {s.weightLbs ? ` @ ${s.weightLbs} lb` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">
                            Health Connect doesn&apos;t include sets/reps. Import Hevy CSV via{" "}
                            <code className="font-mono text-slate-300">/api/import/hevy</code> for full set data.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Nutrition entries" subtitle="From Health Connect or Cronometer CSV">
              {todayNutrition.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No nutrition entries today. Upload the Cronometer CSV below — Health Connect doesn&apos;t share food
                  macros.
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {todayNutrition.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                      <span className="font-medium text-white">{n.foodName}</span>
                      <span className="font-mono text-slate-300">
                        {n.calories ? `${Math.round(n.calories)} kcal` : "—"}
                        {n.proteinG ? ` · ${Math.round(n.proteinG)}p` : ""}
                        {n.carbsG ? ` / ${Math.round(n.carbsG)}c` : ""}
                        {n.fatG ? ` / ${Math.round(n.fatG)}f` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form
                action={uploadCronometerCsv}
                encType="multipart/form-data"
                className="mt-4 flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3 sm:flex-row sm:items-center"
              >
                <input
                  type="file"
                  name="csv"
                  accept=".csv,text/csv"
                  required
                  className="text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-glow/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-glow"
                />
                <button
                  type="submit"
                  className="rounded-md bg-glow px-3 py-1.5 text-xs font-semibold text-ink hover:bg-glow/80"
                >
                  Upload CSV
                </button>
              </form>
              <p className="mt-2 text-[11px] text-slate-500">
                Cronometer → Settings → Account → Export Data → daily nutrition CSV.
              </p>
            </Card>

            <Card title="Last 7 days">
              {weekSnapshots.length === 0 ? (
                <p className="text-sm text-slate-400">No daily snapshots yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3 text-right">Food</th>
                        <th className="py-2 pr-3 text-right">Burned</th>
                        <th className="py-2 pr-3 text-right">Protein</th>
                        <th className="py-2 pr-3 text-right">Steps</th>
                        <th className="py-2 pr-3 text-right">Sleep</th>
                        <th className="py-2 pl-3 text-right">Workout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {weekSnapshots.map((s) => (
                        <tr key={s.id} className="text-slate-200">
                          <td className="py-2 pr-3 font-medium">{formatDateOnly(s.date)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{s.calories ?? "—"}</td>
                          <td className="py-2 pr-3 text-right font-mono text-slate-400">
                            {s.caloriesBurned ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {s.proteinG ? Math.round(s.proteinG) : "—"}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {s.steps ? s.steps.toLocaleString() : "—"}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {s.sleepHours ? s.sleepHours.toFixed(1) : "—"}
                          </td>
                          <td className="py-2 pl-3 text-right text-slate-300">{s.workoutName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Body">
              <dl className="space-y-2 text-sm">
                <Row label="Resting HR" value={restingHr ? `${restingHr} bpm` : "—"} />
                <Row label="Weight" value={weight ? `${weight} lb` : "—"} />
                <Row label="Sleep quality" value={snapshot?.sleepQuality ?? "—"} />
              </dl>
            </Card>

            <Card title="Notes" subtitle="Daily check-in">
              <dl className="space-y-2 text-sm">
                <Row label="Mood" value={note?.mood ?? "—"} />
                <Row label="Soreness" value={note?.soreness ?? "—"} />
                <Row label="Acne" value={note?.acne ?? "—"} />
                <Row label="Weed" value={note?.weed ? "yes" : "no"} />
                {note?.note ? <p className="pt-2 text-slate-300">{note.note}</p> : null}
              </dl>
            </Card>

            <Card title="Recent syncs">
              {logs.length === 0 ? (
                <p className="text-sm text-slate-400">No syncs yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {logs.map((log) => {
                    const ok = log.status === "success";
                    return (
                      <li
                        key={log.id}
                        className={`rounded-lg border px-3 py-2 ${
                          ok
                            ? "border-glow/20 bg-glow/5"
                            : "border-rose-500/30 bg-rose-500/10"
                        }`}
                      >
                        <p className={`font-semibold ${ok ? "text-glow" : "text-rose-300"}`}>
                          {log.source} · {log.status}
                        </p>
                        <p className="text-xs text-slate-400">{log.createdAt.toLocaleString()}</p>
                        {log.message ? (
                          <p className="mt-1 text-slate-200">{log.message}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {!hasAnyData ? (
              <Card title="No data yet">
                <p className="text-sm text-slate-300">
                  Open the Android app, hit <span className="font-semibold">Sync Health Data</span>, then refresh
                  this page.
                </p>
              </Card>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  unit,
  subtle,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  subtle?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 p-4 ${
        subtle ? "bg-white/[0.03]" : "bg-panel"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${subtle ? "text-slate-100" : "text-glow"}`}>{value}</span>
        {unit ? <span className="text-sm text-slate-400">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-panel p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-100">{value}</dd>
    </div>
  );
}
