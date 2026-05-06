import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const request = await prisma.syncRequest.findFirst({ where: { userId, status: "pending" }, orderBy: { requestedAt: "desc" } });
    return NextResponse.json({ pending: Boolean(request), request });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST() {
  try {
    const userId = await requireUserId();
    const request = await prisma.syncRequest.create({ data: { userId } });
    return NextResponse.json({ ok: true, request });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
