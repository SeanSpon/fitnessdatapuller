import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";
import { requireUserId } from "@/lib/session";

type HevySet = {
  exercise_name: string;
  set_number: number;
  reps?: number;
  weight_lbs?: number;
  rpe?: number;
};

type HevyWorkout = {
  date: string;
  name: string;
  duration_m?: number;
  sets?: HevySet[];
};

function cleanJson(value: object) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = (await request.json()) as HevyWorkout;
    const date = parseDateOnly(payload.date);
    const sets = payload.sets ?? [];
    const cleanPayload = cleanJson(payload);
    const volumeLbs = sets.reduce((total, set) => total + (set.weight_lbs ?? 0) * (set.reps ?? 0), 0);

    const workout = await prisma.workoutSession.create({
      data: {
        userId,
        date,
        name: payload.name,
        durationM: payload.duration_m,
        volumeLbs,
        raw: cleanPayload,
        sets: {
          create: sets.map((set) => ({
            exerciseName: set.exercise_name,
            setNumber: set.set_number,
            reps: set.reps,
            weightLbs: set.weight_lbs,
            rpe: set.rpe,
          })),
        },
      },
      include: { sets: true },
    });

    await Promise.all([
      prisma.dailyHealthSnapshot.upsert({
        where: { userId_date: { userId, date } },
        update: { workoutName: payload.name, totalSets: sets.length, volumeLbs },
        create: { userId, date, workoutName: payload.name, totalSets: sets.length, volumeLbs },
      }),
      prisma.syncLog.create({ data: { userId, source: "hevy", status: "success", message: `Imported ${payload.name}`, payload: cleanPayload } }),
    ]);

    return NextResponse.json({ ok: true, workout });
  } catch {
    return NextResponse.json({ error: "Unauthorized or invalid Hevy payload" }, { status: 400 });
  }
}
