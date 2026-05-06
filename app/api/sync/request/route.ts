import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSyncUserId } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const syncRequest = await prisma.syncRequest.findFirst({ where: { userId, status: "pending" }, orderBy: { requestedAt: "desc" } });
    return NextResponse.json({ pending: Boolean(syncRequest), request: syncRequest });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const syncRequest = await prisma.syncRequest.create({ data: { userId } });
    return NextResponse.json({ ok: true, request: syncRequest });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
