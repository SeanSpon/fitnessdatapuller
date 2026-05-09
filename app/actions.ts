"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { signIn, signOut } from "@/lib/auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDateOnly, parseOptionalDateTime } from "@/lib/dates";

export async function login(formData: FormData) {
  await signIn("credentials", {
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: "/dashboard",
  });
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}

export async function goDashboard() {
  redirect("/dashboard");
}

type CronometerRow = Record<string, string>;

function numberFrom(row: CronometerRow, keys: string[]) {
  const key = keys.find((candidate) => row[candidate] !== undefined && row[candidate] !== "");
  const value = key ? Number(row[key]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

export async function uploadCronometerCsv(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    await prisma.syncLog.create({
      data: { userId, source: "cronometer", status: "error", message: "No file selected" },
    });
    revalidatePath("/dashboard");
    return;
  }

  const text = await file.text();
  const parsed = Papa.parse<CronometerRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    await prisma.syncLog.create({
      data: {
        userId,
        source: "cronometer",
        status: "error",
        message: `CSV parse failed: ${parsed.errors[0].message}`.slice(0, 500),
      },
    });
    revalidatePath("/dashboard");
    return;
  }

  const rows = parsed.data.filter((row) => row.Date || row.date);
  if (rows.length === 0) {
    await prisma.syncLog.create({
      data: { userId, source: "cronometer", status: "error", message: "No rows with a Date column found" },
    });
    revalidatePath("/dashboard");
    return;
  }

  try {
    await prisma.$transaction(
      rows.map((row) =>
        prisma.nutritionEntry.create({
          data: {
            userId,
            date: parseDateOnly(row.Date ?? row.date),
            foodName: row.Food ?? row.food ?? row.Name ?? "Cronometer entry",
            calories: numberFrom(row, ["Calories", "Energy (kcal)", "calories"]),
            proteinG: numberFrom(row, ["Protein", "Protein (g)", "protein_g"]),
            carbsG: numberFrom(row, ["Carbs", "Carbs (g)", "Carbohydrates (g)", "carbs_g"]),
            fatG: numberFrom(row, ["Fat", "Fat (g)", "fat_g"]),
            raw: row,
            sourceUpdatedAt: parseOptionalDateTime(row.source_updated_at ?? row.SourceUpdatedAt ?? row["Source Updated At"]),
            syncedAt: new Date(),
          },
        }),
      ),
    );

    const dates = Array.from(new Set(rows.map((row) => row.Date ?? row.date)));
    await Promise.all(
      dates.map(async (dateString) => {
        const date = parseDateOnly(dateString);
        const totals = await prisma.nutritionEntry.aggregate({
          where: { userId, date },
          _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
        });
        await prisma.dailyHealthSnapshot.upsert({
          where: { userId_date: { userId, date } },
          update: {
            calories: totals._sum.calories ? Math.round(totals._sum.calories) : undefined,
            proteinG: totals._sum.proteinG ?? undefined,
            carbsG: totals._sum.carbsG ?? undefined,
            fatG: totals._sum.fatG ?? undefined,
            syncedAt: new Date(),
          },
          create: {
            userId,
            date,
            calories: totals._sum.calories ? Math.round(totals._sum.calories) : undefined,
            proteinG: totals._sum.proteinG ?? undefined,
            carbsG: totals._sum.carbsG ?? undefined,
            fatG: totals._sum.fatG ?? undefined,
          },
        });
      }),
    );

    await prisma.syncLog.create({
      data: {
        userId,
        source: "cronometer",
        status: "success",
        message: `Imported ${rows.length} rows across ${dates.length} day(s)`,
      },
    });

    revalidatePath("/dashboard");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.syncLog.create({
      data: { userId, source: "cronometer", status: "error", message: message.slice(0, 500) },
    });
    revalidatePath("/dashboard");
  }
}
