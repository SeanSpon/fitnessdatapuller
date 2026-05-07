import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/dates";
import { toDailyHealthJson } from "@/lib/health-json";
import { requireSyncUserId } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const today = startOfUtcDay();
    const [todaySnapshot, latestSnapshot] = await Promise.all([
      prisma.dailyHealthSnapshot.findFirst({ where: { userId, date: today }, orderBy: { syncedAt: "desc" } }),
      prisma.dailyHealthSnapshot.findFirst({ where: { userId }, orderBy: [{ date: "desc" }, { syncedAt: "desc" }] }),
    ]);
    const snapshot = todaySnapshot ?? latestSnapshot;
    const date = snapshot?.date ?? today;
    const note = await prisma.dailyNote.findUnique({ where: { userId_date: { userId, date } } });

    return NextResponse.json(toDailyHealthJson(snapshot ? { ...snapshot, note } : null, date));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
