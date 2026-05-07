import type { Prisma } from "@prisma/client";
import { parseDateOnly, parseOptionalDateTime, startOfUtcDay } from "@/lib/dates";

type PayloadRecord = Record<string, unknown>;
type NumericPayloadValue = number | string | null;

type SamsungMetricContainer = {
  steps?: NumericPayloadValue;
  step_count?: NumericPayloadValue;
  stepCount?: NumericPayloadValue;
  count?: NumericPayloadValue;
  active_calories?: NumericPayloadValue;
  activeCalories?: NumericPayloadValue;
  active_calories_burned?: NumericPayloadValue;
  activeCaloriesBurned?: NumericPayloadValue;
  calories?: NumericPayloadValue;
  sleep_hours?: NumericPayloadValue;
  sleepHours?: NumericPayloadValue;
  hours?: NumericPayloadValue;
  duration_hours?: NumericPayloadValue;
  durationHours?: NumericPayloadValue;
  sleep_quality?: string | null;
  sleepQuality?: string | null;
  quality?: string | null;
  weight_lbs?: NumericPayloadValue;
  weightLbs?: NumericPayloadValue;
  weight?: NumericPayloadValue;
  weight_kg?: NumericPayloadValue;
  weightKg?: NumericPayloadValue;
  resting_hr?: NumericPayloadValue;
  restingHr?: NumericPayloadValue;
  resting_heart_rate?: NumericPayloadValue;
  restingHeartRate?: NumericPayloadValue;
  heart_rate?: NumericPayloadValue;
  heartRate?: NumericPayloadValue;
} | null;

export type SamsungSyncPayload = SamsungMetricContainer & {
  date?: string | null;
  source_updated_at?: string | null;
  sourceUpdatedAt?: string | null;
  ai_summary?: string | null;
  aiSummary?: string | null;
  activity?: SamsungMetricContainer;
  sleep?: SamsungMetricContainer;
  body?: SamsungMetricContainer;
  data?: SamsungMetricContainer;
  metrics?: SamsungMetricContainer;
  daily?: SamsungMetricContainer;
  health?: SamsungMetricContainer;
  payload?: SamsungMetricContainer;
  records?: SamsungMetricContainer;
};

export type NormalizedSamsungSyncPayload = {
  date: Date;
  steps: number | null;
  activeCalories: number | null;
  sleepHours: number | null;
  sleepQuality: string | null;
  weightLbs: number | null;
  restingHr: number | null;
  sourceUpdatedAt: Date | null;
  aiSummary: string | null;
};

export type SamsungSourceAvailability = {
  steps: boolean;
  active_calories: boolean;
  sleep: boolean;
  heart_rate: boolean;
  weight: boolean;
};

const POUND_PER_KILOGRAM = 2.2046226218;

function parseSyncDate(value?: string | null) {
  if (!value) {
    return startOfUtcDay();
  }

  const parsedDate = parseDateOnly(value);
  return Number.isNaN(parsedDate.getTime()) ? startOfUtcDay() : parsedDate;
}

function toRecord(value: unknown): PayloadRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PayloadRecord : null;
}

function payloadContainers(payload: SamsungSyncPayload): PayloadRecord[] {
  const root = toRecord(payload) ?? {};
  const containers = [
    root,
    toRecord(root.activity),
    toRecord(root.data),
    toRecord(root.metrics),
    toRecord(root.daily),
    toRecord(root.health),
    toRecord(root.payload),
    toRecord(root.records),
    toRecord(root.sleep),
    toRecord(root.body),
  ];

  return containers.filter((container): container is PayloadRecord => Boolean(container));
}

function firstRaw(containers: PayloadRecord[], aliases: string[]) {
  for (const container of containers) {
    for (const alias of aliases) {
      if (alias in container) {
        const value = container[alias];

        if (value !== undefined && value !== null && value !== "") {
          return value;
        }
      }
    }
  }

  return null;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstNumber(containers: PayloadRecord[], aliases: string[]) {
  return toNumber(firstRaw(containers, aliases));
}

function firstString(containers: PayloadRecord[], aliases: string[]) {
  const value = firstRaw(containers, aliases);
  return typeof value === "string" ? value : null;
}

export function normalizeSamsungPayload(payload: SamsungSyncPayload): NormalizedSamsungSyncPayload {
  const containers = payloadContainers(payload);
  const weightLbs = firstNumber(containers, ["weight_lbs", "weightLbs", "weight"]);
  const weightKg = firstNumber(containers, ["weight_kg", "weightKg"]);

  return {
    date: parseSyncDate(typeof payload?.date === "string" ? payload.date : null),
    steps: firstNumber(containers, ["steps", "step_count", "stepCount", "count"]),
    activeCalories: firstNumber(containers, ["active_calories", "activeCalories", "active_calories_burned", "activeCaloriesBurned", "calories"]),
    sleepHours: firstNumber(containers, ["sleep_hours", "sleepHours", "hours", "duration_hours", "durationHours"]),
    sleepQuality: firstString(containers, ["sleep_quality", "sleepQuality", "quality"]),
    weightLbs: weightLbs ?? (weightKg !== null ? weightKg * POUND_PER_KILOGRAM : null),
    restingHr: firstNumber(containers, ["resting_hr", "restingHr", "resting_heart_rate", "restingHeartRate", "heart_rate", "heartRate"]),
    sourceUpdatedAt: parseOptionalDateTime(payload?.source_updated_at ?? payload?.sourceUpdatedAt) ?? null,
    aiSummary: firstString(containers, ["ai_summary", "aiSummary"]),
  };
}

export function getSamsungSourceAvailability(payload: NormalizedSamsungSyncPayload): SamsungSourceAvailability {
  return {
    steps: payload.steps !== null,
    active_calories: payload.activeCalories !== null,
    sleep: payload.sleepHours !== null,
    heart_rate: payload.restingHr !== null,
    weight: payload.weightLbs !== null,
  };
}

export function toSamsungSyncLogPayload(rawPayload: SamsungSyncPayload, normalizedPayload: NormalizedSamsungSyncPayload) {
  return toJsonObject({
    raw: rawPayload,
    normalized: {
      date: normalizedPayload.date.toISOString(),
      steps: normalizedPayload.steps,
      active_calories: normalizedPayload.activeCalories,
      sleep_hours: normalizedPayload.sleepHours,
      sleep_quality: normalizedPayload.sleepQuality,
      weight_lbs: normalizedPayload.weightLbs,
      resting_hr: normalizedPayload.restingHr,
      source_updated_at: normalizedPayload.sourceUpdatedAt?.toISOString() ?? null,
      ai_summary: normalizedPayload.aiSummary,
    },
    source_availability: getSamsungSourceAvailability(normalizedPayload),
  });
}

export function toJsonObject(value: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
