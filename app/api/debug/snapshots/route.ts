import { NextResponse } from "next/server";
import { getAdminSyncUser, hasSyncApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    if (!hasSyncApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminUser = await getAdminSyncUser();
    const snapshots = await prisma.dailyHealthSnapshot.findMany({
      where: { userId: adminUser.id },
      orderBy: [{ date: "desc" }, { syncedAt: "desc" }],
      take: 10,
    });

    return NextResponse.json({
      admin_user: {
        id: adminUser.id,
        email: adminUser.email,
      },
      snapshots,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load debug snapshots" }, { status: 400 });
  }
}
