import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly, parseOptionalDateTime, startOfUtcDay } from "@/lib/dates";
import { requireSyncUserId } from "@/lib/api-auth";

type SamsungSyncPayload = {
  date?: string;
  steps?: number;
  active_calories?: number;
  activeCalories?: number;
  sleep_hours?: number;
  sleepHours?: number;
  sleep_quality?: string;
  sleepQuality?: string;
  weight_lbs?: number;
  weightLbs?: number;
  resting_hr?: number;
  restingHr?: number;
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

type NormalizedSamsungSyncPayload = {
  date: Date;
  steps?: number;
  activeCalories?: number;
  sleepHours?: number;
  sleepQuality?: string;
  weightLbs?: number;
  restingHr?: number;
  sourceUpdatedAt?: Date;
  aiSummary?: string;
};

function cleanJson(value: object): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Prisma.InputJsonObject;
}

function parseSyncDate(value?: string) {
  if (!value) {
    return startOfUtcDay();
  }

  const parsedDate = parseDateOnly(value);
  return Number.isNaN(parsedDate.getTime()) ? startOfUtcDay() : parsedDate;
}

function normalizeSamsungPayload(payload: SamsungSyncPayload): NormalizedSamsungSyncPayload {
  return {
    date: parseSyncDate(payload.date),
    steps: payload.steps ?? payload.activity?.steps,
    activeCalories: payload.active_calories ?? payload.activeCalories ?? payload.activity?.active_calories ?? payload.activity?.activeCalories,
    sleepHours: payload.sleep_hours ?? payload.sleepHours ?? payload.sleep?.hours ?? payload.sleep?.sleep_hours ?? payload.sleep?.sleepHours,
    sleepQuality: payload.sleep_quality ?? payload.sleepQuality ?? payload.sleep?.quality ?? payload.sleep?.sleep_quality ?? payload.sleep?.sleepQuality,
    weightLbs: payload.weight_lbs ?? payload.weightLbs ?? payload.body?.weight_lbs ?? payload.body?.weightLbs,
    restingHr: payload.resting_hr ?? payload.restingHr ?? payload.body?.resting_hr ?? payload.body?.restingHr,
    sourceUpdatedAt: parseOptionalDateTime(payload.source_updated_at ?? payload.sourceUpdatedAt),
    aiSummary: payload.ai_summary ?? payload.aiSummary,
  };
}

export async function POST(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const payload = (await request.json()) as SamsungSyncPayload;
    const normalizedPayload = normalizeSamsungPayload(payload);
    const cleanPayload = cleanJson(payload);
    const syncedAt = new Date();

    const snapshot = await prisma.dailyHealthSnapshot.upsert({
      where: { userId_date: { userId, date: normalizedPayload.date } },
      update: {
        steps: normalizedPayload.steps,
        activeCalories: normalizedPayload.activeCalories,
        sleepHours: normalizedPayload.sleepHours,
        sleepQuality: normalizedPayload.sleepQuality,
        weightLbs: normalizedPayload.weightLbs,
        restingHr: normalizedPayload.restingHr,
        sourcePayload: cleanPayload,
        sourceUpdatedAt: normalizedPayload.sourceUpdatedAt,
        syncedAt,
        aiSummary: normalizedPayload.aiSummary,
      },
      create: {
        userId,
        date: normalizedPayload.date,
        steps: normalizedPayload.steps,
        activeCalories: normalizedPayload.activeCalories,
        sleepHours: normalizedPayload.sleepHours,
        sleepQuality: normalizedPayload.sleepQuality,
        weightLbs: normalizedPayload.weightLbs,
        restingHr: normalizedPayload.restingHr,
        sourcePayload: cleanPayload,
        sourceUpdatedAt: normalizedPayload.sourceUpdatedAt,
        syncedAt,
        aiSummary: normalizedPayload.aiSummary,
      },
    });

    await Promise.all([
      normalizedPayload.sleepHours !== undefined
        ? prisma.sleepSession.create({ data: { userId, date: normalizedPayload.date, hours: normalizedPayload.sleepHours, quality: normalizedPayload.sleepQuality, raw: cleanPayload, sourceUpdatedAt: normalizedPayload.sourceUpdatedAt, syncedAt } })
        : Promise.resolve(),
      normalizedPayload.weightLbs !== undefined || normalizedPayload.restingHr !== undefined
        ? prisma.bodyMetric.create({ data: { userId, date: normalizedPayload.date, weightLbs: normalizedPayload.weightLbs, restingHr: normalizedPayload.restingHr, raw: cleanPayload, sourceUpdatedAt: normalizedPayload.sourceUpdatedAt, syncedAt } })
        : Promise.resolve(),
      prisma.syncLog.create({ data: { userId, source: "samsung", status: "success", payload: cleanPayload } }),
    ]);

    return NextResponse.json({ ok: true, snapshotId: snapshot.id });
  } catch {
    return NextResponse.json({ error: "Unauthorized or invalid payload" }, { status: 400 });
  }
}
