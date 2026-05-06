import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly, parseOptionalDateTime } from "@/lib/dates";
import { requireSyncUserId } from "@/lib/api-auth";

type SamsungSyncPayload = {
  date: string;
  steps?: number;
  active_calories?: number;
  sleep_hours?: number;
  sleep_quality?: string;
  weight_lbs?: number;
  resting_hr?: number;
  source_updated_at?: string;
  ai_summary?: string;
};

function cleanJson(value: object): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Prisma.InputJsonObject;
}

export async function POST(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const payload = (await request.json()) as SamsungSyncPayload;
    const date = parseDateOnly(payload.date);
    const cleanPayload = cleanJson(payload);
    const sourceUpdatedAt = parseOptionalDateTime(payload.source_updated_at);
    const syncedAt = new Date();

    const snapshot = await prisma.dailyHealthSnapshot.upsert({
      where: { userId_date: { userId, date } },
      update: {
        steps: payload.steps,
        activeCalories: payload.active_calories,
        sleepHours: payload.sleep_hours,
        sleepQuality: payload.sleep_quality,
        weightLbs: payload.weight_lbs,
        restingHr: payload.resting_hr,
        sourcePayload: cleanPayload,
        sourceUpdatedAt,
        syncedAt,
        aiSummary: payload.ai_summary,
      },
      create: {
        userId,
        date,
        steps: payload.steps,
        activeCalories: payload.active_calories,
        sleepHours: payload.sleep_hours,
        sleepQuality: payload.sleep_quality,
        weightLbs: payload.weight_lbs,
        restingHr: payload.resting_hr,
        sourcePayload: cleanPayload,
        sourceUpdatedAt,
        syncedAt,
        aiSummary: payload.ai_summary,
      },
    });

    await Promise.all([
      payload.sleep_hours
        ? prisma.sleepSession.create({ data: { userId, date, hours: payload.sleep_hours, quality: payload.sleep_quality, raw: cleanPayload, sourceUpdatedAt, syncedAt } })
        : Promise.resolve(),
      payload.weight_lbs || payload.resting_hr
        ? prisma.bodyMetric.create({ data: { userId, date, weightLbs: payload.weight_lbs, restingHr: payload.resting_hr, raw: cleanPayload, sourceUpdatedAt, syncedAt } })
        : Promise.resolve(),
      prisma.syncLog.create({ data: { userId, source: "samsung", status: "success", payload: cleanPayload } }),
    ]);

    return NextResponse.json({ ok: true, snapshotId: snapshot.id });
  } catch {
    return NextResponse.json({ error: "Unauthorized or invalid payload" }, { status: 400 });
  }
}
