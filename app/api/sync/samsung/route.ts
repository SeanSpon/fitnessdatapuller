import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly, parseOptionalDateTime, startOfUtcDay } from "@/lib/dates";
import { requireSyncUserId } from "@/lib/api-auth";

type WorkoutItem = {
  title?: string | null;
  exerciseType?: number;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  source?: string;
};

type NutritionBlock = {
  calories?: number | null;
  proteinG?: number | null;
  protein_g?: number | null;
  carbsG?: number | null;
  carbs_g?: number | null;
  fatG?: number | null;
  fat_g?: number | null;
  sugarG?: number | null;
  fiberG?: number | null;
  sodiumMg?: number | null;
};

type SamsungSyncPayload = {
  date?: string;
  steps?: number;
  active_calories?: number;
  activeCalories?: number;
  totalCalories?: number;
  total_calories?: number;
  distanceMiles?: number;
  floorsClimbed?: number;
  exerciseMinutes?: number;
  workoutCount?: number;
  workouts?: WorkoutItem[];
  nutrition?: NutritionBlock | null;
  hydrationLiters?: number;
  sleep_hours?: number;
  sleepHours?: number;
  sleep_quality?: string;
  sleepQuality?: string;
  weight_lbs?: number;
  weightLbs?: number;
  resting_hr?: number;
  restingHr?: number;
  avgHr?: number;
  hrvRmssdMs?: number;
  oxygenSaturationPct?: number;
  respiratoryRate?: number;
  sources?: string[];
  source_updated_at?: string;
  sourceUpdatedAt?: string;
  ai_summary?: string;
  aiSummary?: string;
  activity?: {
    steps?: number;
    active_calories?: number;
    activeCalories?: number;
  };
  sleep?: {
    hours?: number;
    sleep_hours?: number;
    sleepHours?: number;
    quality?: string;
    sleep_quality?: string;
    sleepQuality?: string;
  };
  body?: {
    weight_lbs?: number;
    weightLbs?: number;
    resting_hr?: number;
    restingHr?: number;
  };
};

type NormalizedNutrition = {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
};

type NormalizedSamsungSyncPayload = {
  date: Date;
  steps?: number;
  activeCalories?: number;
  totalCalories?: number;
  sleepHours?: number;
  sleepQuality?: string;
  weightLbs?: number;
  restingHr?: number;
  sourceUpdatedAt?: Date;
  aiSummary?: string;
  workouts: WorkoutItem[];
  nutrition: NormalizedNutrition;
};

function cleanJson(value: unknown): Prisma.InputJsonObject {
  if (!value || typeof value !== "object") {
    return {} as Prisma.InputJsonObject;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined),
  ) as Prisma.InputJsonObject;
}

function parseSyncDate(value?: string) {
  if (!value) {
    return startOfUtcDay();
  }
  const parsedDate = parseDateOnly(value);
  return Number.isNaN(parsedDate.getTime()) ? startOfUtcDay() : parsedDate;
}

function pickNumber(...values: Array<number | null | undefined>): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function normalizeNutrition(n: NutritionBlock | null | undefined): NormalizedNutrition {
  if (!n) return {};
  return {
    calories: pickNumber(n.calories ?? undefined),
    proteinG: pickNumber(n.proteinG ?? undefined, n.protein_g ?? undefined),
    carbsG: pickNumber(n.carbsG ?? undefined, n.carbs_g ?? undefined),
    fatG: pickNumber(n.fatG ?? undefined, n.fat_g ?? undefined),
  };
}

function normalizeSamsungPayload(payload: SamsungSyncPayload): NormalizedSamsungSyncPayload {
  const nutrition = normalizeNutrition(payload.nutrition);
  return {
    date: parseSyncDate(payload.date),
    steps: pickNumber(payload.steps, payload.activity?.steps),
    activeCalories: pickNumber(
      payload.activeCalories,
      payload.active_calories,
      payload.activity?.activeCalories,
      payload.activity?.active_calories,
    ),
    totalCalories: pickNumber(payload.totalCalories, payload.total_calories),
    sleepHours: pickNumber(
      payload.sleepHours,
      payload.sleep_hours,
      payload.sleep?.hours,
      payload.sleep?.sleepHours,
      payload.sleep?.sleep_hours,
    ),
    sleepQuality:
      payload.sleepQuality ??
      payload.sleep_quality ??
      payload.sleep?.quality ??
      payload.sleep?.sleepQuality ??
      payload.sleep?.sleep_quality,
    weightLbs: pickNumber(
      payload.weightLbs,
      payload.weight_lbs,
      payload.body?.weightLbs,
      payload.body?.weight_lbs,
    ),
    restingHr: pickNumber(
      payload.restingHr,
      payload.resting_hr,
      payload.body?.restingHr,
      payload.body?.resting_hr,
    ),
    sourceUpdatedAt: parseOptionalDateTime(payload.sourceUpdatedAt ?? payload.source_updated_at),
    aiSummary: payload.aiSummary ?? payload.ai_summary,
    workouts: Array.isArray(payload.workouts) ? payload.workouts : [],
    nutrition,
  };
}

function workoutExternalId(userId: string, w: WorkoutItem): string | null {
  if (!w.startTime) return null;
  const src = w.source ?? "unknown";
  return `${userId}:${src}:${w.startTime}`;
}

export async function POST(request: Request) {
  let userId: string | null = null;
  let payload: SamsungSyncPayload | null = null;

  try {
    userId = await requireSyncUserId(request);
  } catch (err) {
    console.error("[sync/samsung] auth failed", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    payload = (await request.json()) as SamsungSyncPayload;
  } catch (err) {
    console.error("[sync/samsung] invalid JSON", err);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const normalized = normalizeSamsungPayload(payload);
  const cleanPayload = cleanJson(payload);
  const syncedAt = new Date();

  // Pick the workout name + count to also surface on the daily snapshot.
  const firstWorkoutName = normalized.workouts.find((w) => w.title && w.title.trim().length > 0)?.title ?? null;
  const workoutCountToday = normalized.workouts.length;

  // Food calories ONLY come from explicit nutrition.calories (Cronometer / NutritionRecord).
  // totalCalories is TDEE/burn from Health Connect — different number, different column.
  const foodCalories = normalized.nutrition.calories;
  const burnedCalories = normalized.totalCalories;

  try {
    // One-shot cleanup: prior versions of this route wrote totalCalories (burn) into
    // DailyHealthSnapshot.calories. Move those into caloriesBurned and clear calories.
    // Idempotent: only matches rows that still look like the old bug.
    await prisma.$executeRaw`
      UPDATE "DailyHealthSnapshot"
      SET "caloriesBurned" = COALESCE("caloriesBurned", "calories"),
          "calories" = NULL
      WHERE "userId" = ${userId}
        AND "caloriesBurned" IS NULL
        AND "calories" IS NOT NULL
        AND "sourcePayload" IS NOT NULL
        AND ("sourcePayload"->>'totalCalories') IS NOT NULL
        AND ROUND(("sourcePayload"->>'totalCalories')::numeric) = "calories"
    `;

    const snapshot = await prisma.dailyHealthSnapshot.upsert({
      where: { userId_date: { userId, date: normalized.date } },
      update: {
        steps: normalized.steps,
        activeCalories: normalized.activeCalories,
        sleepHours: normalized.sleepHours,
        sleepQuality: normalized.sleepQuality,
        weightLbs: normalized.weightLbs,
        restingHr: normalized.restingHr,
        calories: foodCalories !== undefined ? Math.round(foodCalories) : undefined,
        caloriesBurned: burnedCalories !== undefined ? Math.round(burnedCalories) : undefined,
        proteinG: normalized.nutrition.proteinG,
        carbsG: normalized.nutrition.carbsG,
        fatG: normalized.nutrition.fatG,
        workoutName: firstWorkoutName ?? undefined,
        totalSets: workoutCountToday > 0 ? workoutCountToday : undefined,
        sourcePayload: cleanPayload,
        sourceUpdatedAt: normalized.sourceUpdatedAt,
        syncedAt,
        aiSummary: normalized.aiSummary,
      },
      create: {
        userId,
        date: normalized.date,
        steps: normalized.steps,
        activeCalories: normalized.activeCalories,
        sleepHours: normalized.sleepHours,
        sleepQuality: normalized.sleepQuality,
        weightLbs: normalized.weightLbs,
        restingHr: normalized.restingHr,
        calories: foodCalories !== undefined ? Math.round(foodCalories) : undefined,
        caloriesBurned: burnedCalories !== undefined ? Math.round(burnedCalories) : undefined,
        proteinG: normalized.nutrition.proteinG,
        carbsG: normalized.nutrition.carbsG,
        fatG: normalized.nutrition.fatG,
        workoutName: firstWorkoutName ?? undefined,
        totalSets: workoutCountToday > 0 ? workoutCountToday : undefined,
        sourcePayload: cleanPayload,
        sourceUpdatedAt: normalized.sourceUpdatedAt,
        syncedAt,
        aiSummary: normalized.aiSummary,
      },
    });

    // Workouts — upsert per externalId so retries don't duplicate.
    let workoutsUpserted = 0;
    for (const w of normalized.workouts) {
      const externalId = workoutExternalId(userId, w);
      const start = parseOptionalDateTime(w.startTime);
      const end = parseOptionalDateTime(w.endTime);
      const durationM =
        typeof w.durationMinutes === "number" && Number.isFinite(w.durationMinutes)
          ? Math.round(w.durationMinutes)
          : undefined;
      const data = {
        date: normalized.date,
        name: w.title?.trim() || "Untitled workout",
        source: w.source ?? "health-connect",
        startTime: start,
        endTime: end,
        durationM,
        raw: cleanJson(w),
        sourceUpdatedAt: normalized.sourceUpdatedAt,
        syncedAt,
      } satisfies Prisma.WorkoutSessionUncheckedUpdateInput;

      if (externalId) {
        await prisma.workoutSession.upsert({
          where: { userId_externalId: { userId, externalId } },
          update: data,
          create: { ...data, userId, externalId },
        });
      } else {
        await prisma.workoutSession.create({ data: { ...data, userId } });
      }
      workoutsUpserted += 1;
    }

    // Sleep + body metrics: only insert when we actually got numbers (so we don't spam zeros).
    const tasks: Array<Promise<unknown>> = [];
    if (typeof normalized.sleepHours === "number" && normalized.sleepHours > 0) {
      tasks.push(
        prisma.sleepSession.create({
          data: {
            userId,
            date: normalized.date,
            hours: normalized.sleepHours,
            quality: normalized.sleepQuality,
            raw: cleanPayload,
            sourceUpdatedAt: normalized.sourceUpdatedAt,
            syncedAt,
          },
        }),
      );
    }
    if (
      (typeof normalized.weightLbs === "number" && normalized.weightLbs > 0) ||
      (typeof normalized.restingHr === "number" && normalized.restingHr > 0)
    ) {
      tasks.push(
        prisma.bodyMetric.create({
          data: {
            userId,
            date: normalized.date,
            weightLbs: normalized.weightLbs,
            restingHr: normalized.restingHr,
            raw: cleanPayload,
            sourceUpdatedAt: normalized.sourceUpdatedAt,
            syncedAt,
          },
        }),
      );
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    await prisma.syncLog.create({
      data: {
        userId,
        source: "samsung",
        status: "success",
        message: `snapshot ok · workouts=${workoutsUpserted} · food=${foodCalories ?? "—"} · burned=${burnedCalories ?? "—"} · steps=${normalized.steps ?? "—"}`,
        payload: cleanPayload,
      },
    });

    return NextResponse.json({
      ok: true,
      snapshotId: snapshot.id,
      workoutsUpserted,
      foodCalories: foodCalories ?? null,
      caloriesBurned: burnedCalories ?? null,
      proteinStored: normalized.nutrition.proteinG ?? null,
      stepsStored: normalized.steps ?? null,
      hadNutrition: Boolean(payload.nutrition && Object.values(payload.nutrition).some((v) => v != null)),
    });
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
    console.error("[sync/samsung] save failed", err);
    if (userId) {
      try {
        await prisma.syncLog.create({
          data: {
            userId,
            source: "samsung",
            status: "error",
            message: message.slice(0, 500),
            payload: cleanPayload,
          },
        });
      } catch (logErr) {
        console.error("[sync/samsung] could not record sync error", logErr);
      }
    }
    return NextResponse.json({ error: "Sync failed", detail: message }, { status: 500 });
  }
}
