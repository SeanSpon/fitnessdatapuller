import { NextResponse } from "next/server";
import { requireSyncUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await requireSyncUserId(request);

    const [workouts, nutrition] = await Promise.all([
      prisma.workoutSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          sets: {
            orderBy: [{ exerciseName: "asc" }, { setNumber: "asc" }],
          },
        },
      }),
      prisma.nutritionEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({ workouts, nutrition });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
