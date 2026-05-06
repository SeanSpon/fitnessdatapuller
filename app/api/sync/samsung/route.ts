import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";
import { requireUserId } from "@/lib/session";

type SamsungSyncPayload = {
  date: string;
  steps?: number;
  active_calories?: number;
  sleep_hours?: number;
  sleep_quality?: string;
  weight_lbs?: number;
  resting_hr?: number;
};

function cleanJson(value: object) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = (await request.json()) as SamsungSyncPayload;
    const date = parseDateOnly(payload.date);
    const cleanPayload = cleanJson(payload);

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
      },
    });

    await Promise.all([
      payload.sleep_hours
        ? prisma.sleepSession.create({ data: { userId, date, hours: payload.sleep_hours, quality: payload.sleep_quality, raw: cleanPayload } })
        : Promise.resolve(),
      payload.weight_lbs || payload.resting_hr
        ? prisma.bodyMetric.create({ data: { userId, date, weightLbs: payload.weight_lbs, restingHr: payload.resting_hr, raw: cleanPayload } })
        : Promise.resolve(),
      prisma.syncLog.create({ data: { userId, source: "samsung", status: "success", payload: cleanPayload } }),
    ]);

    return NextResponse.json({ ok: true, snapshotId: snapshot.id });
  } catch {
    return NextResponse.json({ error: "Unauthorized or invalid payload" }, { status: 400 });
  }
}
