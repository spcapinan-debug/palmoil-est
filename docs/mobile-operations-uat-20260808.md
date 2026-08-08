# Mobile operations UAT — 2026-08-08

## Automated gates

- `npm run build`: pass
- `npm run lint`: pass
- `npm test`: pass, 144/144 tests
- `git diff --check`: pass

## Browser evidence

Playwright exercised the local web application with external API routes mocked after initial inspection. No authenticated session or credential was available, so no production mutation, upload, approval, dispatch, daily submission, or scheduler execution was attempted.

| Viewport | Notification layout | Horizontal overflow | Minimum control target |
|---|---|---:|---:|
| 360 × 800 | Full-screen | No | 44 px |
| 390 × 844 | Full-screen | No | 44 px |
| 412 × 915 | Full-screen | No | 44 px |
| 820 × 1180 | 460 px drawer | No | 44 px |
| 1440 × 900 | 460 px drawer | No | 44 px |

The four filters changed active state correctly. Escape and desktop backdrop close both restored focus to the notification bell. Visual inspection confirmed the mobile full-screen center and desktop drawer.

## UAT fixes made

- Counteracted the existing global `body { zoom: .8 }` for the fixed notification layer so its rendered dimensions and touch targets match the intended CSS pixels.
- Added Escape handling, focus restoration and Tab wrapping for the modal notification center.

## Environment limitations

- The static local server cannot execute `/api/farm-session`, `/api/farm-tables`, signed evidence endpoints, Supabase migrations or the Vercel Cron handler.
- Authenticated Dispatch/Daily browser flows, signed private evidence upload/download and recipient-scoped notification reads still require a configured preview with test credentials.
- No local `supabase` or `psql` executable was available, so the migration was verified statically and by focused tests rather than a local database reset.
- The scheduler and all seeded notification rules remain disabled by default.
- The Vercel project is on the Hobby plan, so the single scheduler runs daily at `00:00 UTC` (`07:00 Asia/Bangkok`). Before activating minute-sensitive rules such as `WORK_STARTING_SOON`, upgrade the plan and explicitly increase the cadence.

## Preview verification

- Deployment: `https://palmoil-ihv917qfh-spc-est.vercel.app`
- Vercel deployment ID: `dpl_3pk98u8FJGEveXGtWTkHGi4tbjLn`
- State: `READY`, Preview target only; no production promotion was performed.
- `/`, `/farm/dispatch`, `/farm/daily` and `/notifications`: HTTP 200 with the SPA entry point.
- `/api/farm-session` and `/api/farm-tables?tables=app_notifications`: expected HTTP 401 without a user session.
- `/api/work-notifications-cron?dryRun=1`: expected HTTP 401 without `CRON_SECRET`; notification generation was not executed.
