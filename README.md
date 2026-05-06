# SeanOS Health Hub MVP

Simple read-only health data hub for Samsung Health, Cronometer, and Hevy-style training data.

## Weekend launch plan

1. Create a Postgres database in Supabase or Vercel Postgres.
2. Deploy this Next.js app to Vercel at `health.seezeestudios.com`.
3. Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, and `ADMIN_EMAIL` in Vercel.
4. Run `npx prisma migrate deploy` during deployment once migrations exist, or run `npx prisma db push` for the prototype.
5. Build the Samsung Android connector with a manual **Sync Health Data** button that posts to `POST /api/sync/samsung`.
6. Export Cronometer CSV and upload/post it to `POST /api/import/cronometer`.
7. Send Hevy workout history to `POST /api/import/hevy` when you are ready.
8. Ask for your data via `GET /api/health/today` or `GET /api/health/week`.

## MVP endpoints

### `POST /api/sync/samsung`

Manual phone sync payload:

```json
{
  "date": "2026-05-06",
  "steps": 28000,
  "active_calories": 900,
  "sleep_hours": 7.4,
  "sleep_quality": "good",
  "weight_lbs": 153,
  "resting_hr": 58
}
```

### `POST /api/import/cronometer`

Send Cronometer diary CSV as the raw request body. The importer stores rows as `NutritionEntry` records and rolls daily totals into `DailyHealthSnapshot`.

### `POST /api/import/hevy`

Send a normalized workout payload from Hevy API data or CSV fallback:

```json
{
  "date": "2026-05-06",
  "name": "Push Day",
  "duration_m": 72,
  "sets": [
    { "exercise_name": "Bench Press", "set_number": 1, "reps": 8, "weight_lbs": 185 }
  ]
}
```

### `GET /api/health/today`

Returns the structured daily JSON shape designed for AI review.

### `GET /api/health/week`

Returns seven daily JSON objects for quick trend checks.

## Keep it simple rules

- Read only: never write back to Samsung Health, Cronometer, or Hevy.
- Manual sync first: Android background sync can wait.
- CSV first for Cronometer.
- Hevy import accepts a normalized API/CSV fallback workout payload.
