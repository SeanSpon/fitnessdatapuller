import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/dates";
import { toDailyHealthJson } from "@/lib/health-json";
import { requireSyncUserId } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const today = startOfUtcDay();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() - (6 - index));
      return date;
    });

    const [snapshots, notes] = await Promise.all([
      prisma.dailyHealthSnapshot.findMany({ where: { userId, date: { in: days } } }),
      prisma.dailyNote.findMany({ where: { userId, date: { in: days } } }),
    ]);

    return NextResponse.json({
      days: days.map((date) => {
        const snapshot = snapshots.find((item) => item.date.getTime() === date.getTime()) ?? null;
        const note = notes.find((item) => item.date.getTime() === date.getTime()) ?? null;
        return toDailyHealthJson(snapshot ? { ...snapshot, note } : null, date);
      }),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
