import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/dates";
import { toDailyHealthJson } from "@/lib/health-json";
import { requireSyncUserId } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const date = startOfUtcDay();
    const [snapshot, note] = await Promise.all([
      prisma.dailyHealthSnapshot.findFirst({ where: { userId, date }, orderBy: { syncedAt: "desc" } }),
      prisma.dailyNote.findUnique({ where: { userId_date: { userId, date } } }),
    ]);

    return NextResponse.json(toDailyHealthJson(snapshot ? { ...snapshot, note } : null, date));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
