import { NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { parseDateOnly, parseOptionalDateTime } from "@/lib/dates";
import { requireSyncUserId } from "@/lib/api-auth";

type CronometerRow = Record<string, string>;

function numberFrom(row: CronometerRow, keys: string[]) {
  const key = keys.find((candidate) => row[candidate] !== undefined);
  const value = key ? Number(row[key]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const userId = await requireSyncUserId(request);
    const csv = await request.text();
    const parsed = Papa.parse<CronometerRow>(csv, { header: true, skipEmptyLines: true });

    if (parsed.errors.length) {
      return NextResponse.json({ error: "Could not parse CSV", details: parsed.errors }, { status: 400 });
    }

    const rows = parsed.data.filter((row) => row.Date || row.date);
    const entries = await prisma.$transaction(
      rows.map((row) => {
        const date = parseDateOnly(row.Date ?? row.date);
        const sourceUpdatedAt = parseOptionalDateTime(row.source_updated_at ?? row.SourceUpdatedAt ?? row["Source Updated At"]);
        return prisma.nutritionEntry.create({
          data: {
            userId,
            date,
            foodName: row.Food || row.food || row.Name || "Cronometer entry",
            calories: numberFrom(row, ["Calories", "Energy (kcal)", "calories"]),
            proteinG: numberFrom(row, ["Protein", "Protein (g)", "protein_g"]),
            carbsG: numberFrom(row, ["Carbs", "Carbs (g)", "Carbohydrates (g)", "carbs_g"]),
            fatG: numberFrom(row, ["Fat", "Fat (g)", "fat_g"]),
            raw: row,
            sourceUpdatedAt,
            syncedAt: new Date(),
          },
        });
      }),
    );

    const dates = [...new Set(rows.map((row) => row.Date ?? row.date))];
    await Promise.all(
      dates.map(async (dateString) => {
        const date = parseDateOnly(dateString);
        const syncedAt = new Date();
        const totals = await prisma.nutritionEntry.aggregate({
          where: { userId, date },
          _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
        });

        await prisma.dailyHealthSnapshot.upsert({
          where: { userId_date: { userId, date } },
          update: {
            calories: Math.round(totals._sum.calories ?? 0),
            proteinG: totals._sum.proteinG,
            carbsG: totals._sum.carbsG,
            fatG: totals._sum.fatG,
            syncedAt,
          },
          create: {
            userId,
            date,
            calories: Math.round(totals._sum.calories ?? 0),
            proteinG: totals._sum.proteinG,
            carbsG: totals._sum.carbsG,
            fatG: totals._sum.fatG,
            syncedAt,
          },
        });
      }),
    );

    await prisma.syncLog.create({ data: { userId, source: "cronometer", status: "success", message: `Imported ${entries.length} rows` } });

    return NextResponse.json({ ok: true, imported: entries.length });
  } catch {
    return NextResponse.json({ error: "Unauthorized or invalid CSV" }, { status: 400 });
  }
}
