# SeanOS Health Hub MVP

Simple read-only health data hub for Samsung Health, Cronometer, and Hevy-style training data.

## Weekend launch plan

1. Create a Postgres database in Supabase or Vercel Postgres.
2. Deploy this Next.js app to Vercel at `health.seezeestudios.com`.
3. Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SYNC_API_KEY` in Vercel.
4. Run `npx prisma migrate deploy` during deployment once migrations exist, or run `npx prisma db push` for the prototype.
5. Build the Samsung Android connector with a manual **Sync Health Data** button that posts to `POST /api/sync/samsung` using `Authorization: Bearer $SYNC_API_KEY`.
6. Export Cronometer CSV and upload/post it to `POST /api/import/cronometer`.
7. Send Hevy workout history to `POST /api/import/hevy` when you are ready.
8. Ask for your data via `GET /api/health/today` or `GET /api/health/week`.

## First manual test sync

After login succeeds and `/dashboard` loads, blank metrics usually mean the database tables exist but no health data has been synced yet. Send a manual Samsung test payload with your deployed domain and `SYNC_API_KEY`, then refresh `/dashboard`:

```bash
curl -X POST https://fitnessdatapuller.vercel.app/api/sync/samsung \
  -H "Authorization: Bearer YOUR_SYNC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "steps":28000,
    "active_calories":900,
    "sleep_hours":7.4,
    "sleep_quality":"good",
    "weight_lbs":153,
    "resting_hr":58,
    "ai_summary":"Manual test sync."
  }'
```

Expected dashboard values after refresh:

- Steps: `28000`
- Sleep: `7.4h`
- Weight and resting heart rate in the structured JSON
- Health Connect source availability shows found/missing for steps, active calories, sleep, heart rate, and weight
- A successful Samsung sync log with raw and normalized payload values

## MVP endpoints

### `POST /api/sync/samsung`

Manual phone sync payload. Send it with `Authorization: Bearer $SYNC_API_KEY`; if `date` is omitted, the API writes to the current UTC day:

```json
{
  "steps": 28000,
  "active_calories": 900,
  "sleep_hours": 7.4,
  "sleep_quality": "good",
  "weight_lbs": 153,
  "resting_hr": 58,
  "source_updated_at": "2026-05-06T22:30:00.000Z",
  "ai_summary": "High activity day with solid sleep."
}
```

The response includes the saved `snapshot`, a `source_availability` checklist, and debug fields for the sync user ID and date used. Missing Samsung values are stored as `null` instead of `0`, so a true zero can be distinguished from unavailable Health Connect data. The server accepts top-level values, nested `activity`/`sleep`/`body` values, common wrapper objects like `data` or `metrics`, numeric strings, and Health Connect-style aliases such as `step_count`, `active_calories_burned`, `resting_heart_rate`, and `weight_kg`.

### `GET /api/debug/snapshots`

Temporary persistence debugging endpoint. Send it with `Authorization: Bearer $SYNC_API_KEY` to inspect the latest 10 admin `DailyHealthSnapshot` rows:

```bash
curl https://fitnessdatapuller.vercel.app/api/debug/snapshots \
  -H "Authorization: Bearer YOUR_SYNC_API_KEY"
```

### `POST /api/import/cronometer`

Send Cronometer diary CSV as the raw request body with `Authorization: Bearer $SYNC_API_KEY`. The importer stores rows as `NutritionEntry` records and rolls daily totals into `DailyHealthSnapshot`.

### `POST /api/import/hevy`

Send a normalized workout payload from Hevy API data or CSV fallback with `Authorization: Bearer $SYNC_API_KEY`:

```json
{
  "date": "2026-05-06",
  "name": "Push Day",
  "duration_m": 72,
  "source_updated_at": "2026-05-06T22:30:00.000Z",
  "ai_summary": "Push day volume landed well.",
  "sets": [
    { "exercise_name": "Bench Press", "set_number": 1, "reps": 8, "weight_lbs": 185 }
  ]
}
```

### `GET /api/health/today`

Returns the structured daily JSON shape designed for AI review. Private web session auth works, and bearer `SYNC_API_KEY` also works for API clients.

### `GET /api/health/week`

Returns seven daily JSON objects for quick trend checks. Private web session auth works, and bearer `SYNC_API_KEY` also works for API clients.

## Keep it simple rules

- Read only: never write back to Samsung Health, Cronometer, or Hevy.
- Keep `AUTH_SECRET`, `ADMIN_PASSWORD`, and `SYNC_API_KEY` separate.
- Manual sync first: Android background sync can wait.
- CSV first for Cronometer.
- Hevy import accepts a normalized API/CSV fallback workout payload.
