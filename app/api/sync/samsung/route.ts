import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, startOfUtcDay } from "@/lib/dates";
import { requireSyncUserId } from "@/lib/api-auth";
import {
  getSamsungSourceAvailability,
  normalizeSamsungPayload,
  type SamsungSyncPayload,
  toJsonObject,
  toSamsungSyncLogPayload,
} from "@/lib/samsung-sync";

export async function POST(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const payload = (await request.json()) as SamsungSyncPayload;
    const normalizedPayload = normalizeSamsungPayload(payload);
    const sourceAvailability = getSamsungSourceAvailability(normalizedPayload);
    const rawPayload = toJsonObject(payload);
    const syncLogPayload = toSamsungSyncLogPayload(payload, normalizedPayload);
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
        sourcePayload: syncLogPayload,
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
        sourcePayload: syncLogPayload,
        sourceUpdatedAt: normalizedPayload.sourceUpdatedAt,
        syncedAt,
        aiSummary: normalizedPayload.aiSummary,
      },
    });

    await Promise.all([
      normalizedPayload.sleepHours !== null
        ? prisma.sleepSession.create({ data: { userId, date: normalizedPayload.date, hours: normalizedPayload.sleepHours, quality: normalizedPayload.sleepQuality, raw: rawPayload, sourceUpdatedAt: normalizedPayload.sourceUpdatedAt, syncedAt } })
        : Promise.resolve(),
      normalizedPayload.weightLbs !== null || normalizedPayload.restingHr !== null
        ? prisma.bodyMetric.create({ data: { userId, date: normalizedPayload.date, weightLbs: normalizedPayload.weightLbs, restingHr: normalizedPayload.restingHr, raw: rawPayload, sourceUpdatedAt: normalizedPayload.sourceUpdatedAt, syncedAt } })
        : Promise.resolve(),
      prisma.syncLog.create({ data: { userId, source: "samsung", status: "success", payload: syncLogPayload } }),
    ]);

    return NextResponse.json({
      ok: true,
      snapshotId: snapshot.id,
      snapshot,
      source_availability: sourceAvailability,
      debug: {
        sync_user_id: userId,
        admin_email: process.env.ADMIN_EMAIL?.toLowerCase() ?? null,
        sync_date: formatDateOnly(normalizedPayload.date),
        dashboard_current_date: formatDateOnly(startOfUtcDay()),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized or invalid payload" }, { status: 400 });
  }
}
