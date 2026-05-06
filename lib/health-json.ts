import type { DailyHealthSnapshot, DailyNote } from "@prisma/client";
import { formatDateOnly } from "@/lib/dates";

type SnapshotWithNote = DailyHealthSnapshot & { note?: DailyNote | null };

export function toDailyHealthJson(snapshot: SnapshotWithNote | null, date: Date) {
  return {
    date: formatDateOnly(date),
    nutrition: {
      calories: snapshot?.calories ?? null,
      protein_g: snapshot?.proteinG ?? null,
      carbs_g: snapshot?.carbsG ?? null,
      fat_g: snapshot?.fatG ?? null,
    },
    activity: {
      steps: snapshot?.steps ?? null,
      active_calories: snapshot?.activeCalories ?? null,
    },
    sleep: {
      hours: snapshot?.sleepHours ?? null,
      quality: snapshot?.sleepQuality ?? null,
    },
    body: {
      weight_lbs: snapshot?.weightLbs ?? null,
      resting_hr: snapshot?.restingHr ?? null,
    },
    training: {
      workout_name: snapshot?.workoutName ?? null,
      total_sets: snapshot?.totalSets ?? null,
      volume_lbs: snapshot?.volumeLbs ?? null,
    },
    ai_summary: snapshot?.aiSummary ?? null,
    metadata: {
      source_updated_at: snapshot?.sourceUpdatedAt?.toISOString() ?? null,
      synced_at: snapshot?.syncedAt?.toISOString() ?? null,
    },
    notes: {
      weed: snapshot?.note?.weed ?? false,
      acne: snapshot?.note?.acne ?? null,
      mood: snapshot?.note?.mood ?? null,
      soreness: snapshot?.note?.soreness ?? null,
      note: snapshot?.note?.note ?? null,
    },
  };
}
