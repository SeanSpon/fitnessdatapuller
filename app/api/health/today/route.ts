import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/dates";
import { toDailyHealthJson } from "@/lib/health-json";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const date = startOfUtcDay();
    const [snapshot, note] = await Promise.all([
      prisma.dailyHealthSnapshot.findUnique({ where: { userId_date: { userId, date } } }),
      prisma.dailyNote.findUnique({ where: { userId_date: { userId, date } } }),
    ]);

    return NextResponse.json(toDailyHealthJson(snapshot ? { ...snapshot, note } : null, date));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
