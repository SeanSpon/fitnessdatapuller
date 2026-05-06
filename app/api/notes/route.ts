import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";
import { requireUserId } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = await request.json();
    const date = parseDateOnly(payload.date);

    const note = await prisma.dailyNote.upsert({
      where: { userId_date: { userId, date } },
      update: {
        weed: Boolean(payload.weed),
        acne: payload.acne,
        mood: payload.mood,
        soreness: payload.soreness,
        note: payload.note,
      },
      create: {
        userId,
        date,
        weed: Boolean(payload.weed),
        acne: payload.acne,
        mood: payload.mood,
        soreness: payload.soreness,
        note: payload.note,
      },
    });

    return NextResponse.json({ ok: true, note });
  } catch {
    return NextResponse.json({ error: "Unauthorized or invalid note" }, { status: 400 });
  }
}
