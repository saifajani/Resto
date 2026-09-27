# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Resto is a personal and family app for remembering what everyone ordered at restaurants, and whether it was worth ordering again. It's a mobile-first web app (installable to the iPhone Home Screen) built with React, TypeScript and Supabase, with Google Places for restaurant lookup.

**Screens:**
- **Restaurants** (`/`): nearby restaurants (places you've visited are pinned to the top), search, and your restaurants
- **Restaurant** (`/r/:id`): a "what to order" summary per person, plus the visit history
- **Log a visit** (`/r/:id/log`): who was there, and each dish with 1 to 5 stars, a "would order again" toggle and notes
- **People** (`/people`): your circle, plus invite codes so companions can see the visits they were on
- **Profile** (`/profile`): your display name, redeem an invite code, sign out

**Parked:** a native iPhone app in `ios/` (SwiftUI, XcodeGen) that uses the same database. It has never been compiled, and nothing in `ios/` is part of the web build.

## Current Status and Decisions (September 2026)

Decisions from the planning conversation that aren't obvious from the code:

- **Where things are:**
  - `main` is the branch and the GitHub default (created 26 September 2026 from `claude/restaurant-meal-memory-app-azgvzk`, which is kept only as history). The "commit directly to main" rule below applies from here on.
  - The owner's local clone is `~/Code/resto` (Schedule1 is at `~/Code/schedule1`).
- **Tested so far:**
  - Demo mode ran on the owner's Mac. Nearby and search (live OpenStreetMap), logging visits and the People tab all worked.
  - After that test, the dish editor was reworked into a clear separate sheet with an "Add dish" button at the bottom.
- **Supabase is set up** (26 September 2026): project `resto` (ref in `.env`) in Canada (Central), in its own **free** org, separate from the paid org holding the Schedule1 projects. It was moved there because a paid org bills about $10 a month per project. `20260926000000_init.sql` is applied and `site_url` is `http://localhost:8081`, which has to change to the Vercel URL at deploy time.
- **Sign-in codes need SMTP.** A free project on Supabase's built-in email sender **cannot have custom email templates** (the API rejects it with "Email template modification is not available for free tier projects using the default email provider"), so the emails are Supabase's default links, not the `{{ .Token }}` code the app's sign-in screen asks for. `mailer_otp_length = 6` is set and survives, but connecting custom SMTP is what makes the 6-digit code flow work. It also lifts the 2-emails-an-hour cap and the rule that the built-in sender only delivers to project team members, which is what currently stops family from signing in at all. Note that a project transfer between orgs **resets the email templates**, so they have to be re-applied after one.
- **v0.1 is deliberately free of charge**: a dedicated Gmail account over SMTP for sign-in emails (500 a day, sender is that Gmail address), the free `.vercel.app` domain, and the free Supabase org. A bought domain plus Resend was priced up and **deferred**, not rejected: it is the upgrade when the app outgrows a Gmail sender. Swapping it in is Supabase settings only, with no app changes.
- **Vercel is live** (26 September 2026): https://resto-reminder.vercel.app, built from `main` on every push. Renaming the Vercel project renames the `.vercel.app` domain and the **old one stops resolving**, so Supabase `site_url` has to move with it. The two `VITE_` variables are set there as **Config** (not Secret), because Vite inlines them into the browser bundle: marking them secret would be a false sense of security, and both are public by design. `site_url` points at this URL, with `http://localhost:8081/**` kept in `uri_allow_list` so local dev still works.
- **Not set up yet:** the Google Cloud key, so the deployed app uses OpenStreetMap for restaurants. The step-by-step is in README.md.
- **Structure:**
  - The owner does **not** need Resto to mirror Schedule1. They want whatever structure is best for a mobile web app that runs cleanly on iPhones.
  - The agreed answer is to keep Vite + React + TypeScript + Supabase on Vercel. Don't switch to Next.js or React Native.
  - The Schedule1-style workflow pieces (the `push` / `ship it` verbs, `scripts/db-push.sh`, lint config, port 8081) can stay, since they're generic good practice.
- **Agreed next work, in order** (the owner still has to say go):
  1. A service worker (`vite-plugin-pwa`) for instant load, an offline app shell and auto-update.
  2. Saving visits with no signal: queue locally, then sync to Supabase when back online.
  3. TanStack Query for data caching.
  4. iPhone polish: launch screens, no overscroll bounce, and status bar handling in standalone mode.
  5. Regroup `src/` by feature (`features/restaurants`, `features/visits`, `features/people`, `features/auth`).
- **Optional:** moving the styling from plain CSS to Tailwind is fine. It only touches `styles.css` and the component class names. If it's done, do it in the same pass as the feature regrouping.
- **Likely future:** if the App Store, push notifications or geofenced "you've been here" alerts are ever needed, wrap this web app with Capacitor rather than reviving `ios/`. `ios/` will probably be deleted.
- **Places:** Google Places was chosen over OpenStreetMap for data quality. The owner confirmed they're comfortable with Google billing within the free caps. Before building on it, suggest an "add this place yourself" fallback for restaurants that are missing.
- **Working with the owner:**
  - They're a founder, not a day-to-day developer. Explain steps plainly and give exact commands and clicks.
  - Start answers with a short summary.
  - In any user-facing copy, never use em dashes.

## Development Commands

```bash
# Install dependencies
npm i

# Start development server (Vite, http://localhost:8081; 8080 is left free for Schedule1)
npm run dev

# Build for production (typecheck + Vite build)
npm run build

# Lint / typecheck
npm run lint
npm run typecheck

# Unit tests (Vitest, src/**/*.test.ts)
npm test
npx vitest run src/lib/summary.test.ts     # one file
npx vitest run -t "puts you first"         # one test by name
npx vitest                                 # watch mode

# UI tests: builds, then drives the app in a phone-sized Chromium, once with Google Places and once with OpenStreetMap (mocked)
npm run test:e2e
npx tsx tests/e2e.ts                       # Google pass only
PLACES=osm npx tsx tests/e2e.ts            # OpenStreetMap pass only
SCREENSHOT_DIR=/tmp/shots npx tsx tests/e2e.ts   # save a screenshot per step

# Database tests: the real Supabase code against local Postgres + PostgREST.
# Start the database FIRST; it is not started for you (see tests/README.md):
#   brew install postgresql@16 postgrest
#   tests/setup-db.sh "$(brew --prefix postgresql@16)/bin" "$(which postgrest)"
npm run test:db

# Apply pending migrations to the Resto Supabase project
npm run db:push

# Regenerate the Home Screen icons in public/ from public/icon.svg
npm run icons
```

With no `.env`, the app runs in **demo mode**: the data layer is `demoBackend.ts` (localStorage) and places come from OpenStreetMap. This is useful for UI work without touching real data.

## Environments & Database Changes

There is one Supabase project for Resto, used for both local development and production. It's a personal app with no staging project yet. The ref is in `.env` as `VITE_SUPABASE_PROJECT_ID`. It is a **separate project from Schedule1's**: never run Resto migrations against a Schedule1 ref, and vice versa.

**Env files:** `.env` (git-ignored, copy from `.env.example`) holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` and `VITE_GOOGLE_MAPS_API_KEY`. Vercel has the same variables under Project Settings > Environment Variables.

**Deploy model:** Vercel builds and publishes the frontend on every push to `main`, and is fully automatic. DB schema changes are applied separately with the Supabase CLI via `scripts/db-push.sh`, which links the Resto ref and hard-verifies it before `db push --linked`. Frontend and DB deploys are decoupled.

**Every schema change:**

```
1. Author a migration FILE:   supabase migration new <name>   (then edit the .sql)
2. Test locally:              tests/setup-db.sh + npm run test:db   (add checks for the change)
3. Apply (on "ship it"):      ./scripts/db-push.sh   (or: npm run db:push)
4. Commit the migration file + push to main (Vercel publishes the frontend).
```

**The two verbs:**
- **"push"**: commit and `git push origin main`. This repo deploys from `main`, so commit **directly to main, with no feature branches**. Vercel goes live on its own within a minute or two.
- **"ship it"**: apply all not-yet-applied migration files to the Supabase project with `./scripts/db-push.sh`. `git push` is never a signal to apply migrations.

**Other rules:** a rollback is a **new forward migration**, never a manual revert. The initial schema is `supabase/migrations/20260926000000_init.sql`.

**Standing RLS check:** row-level security *is* the sharing model, so `npm run test:db` plays three users (owner, invited companion, stranger) and must stay green before any policy change ships.

## Architecture Overview

### Frontend Structure

- **Router:** React Router v7 (`src/App.tsx`). Signed out shows `SignIn`. A first sign-in with no name set shows `Welcome`. Otherwise the tabbed shell.
- **Session:** `src/session.ts` (`useUserId()`), fed by `backend.onAuthChange`.
- **UI:** plain CSS with design tokens and dark mode in `src/styles.css`, plus small shared components in `src/components/ui.tsx`. No Tailwind or shadcn here, unlike Schedule1.
- **Theme:** Light / Dark / Automatic, chosen on the Profile tab. `src/lib/theme.ts` stores the choice in localStorage under `resto:theme` and resolves it to `<html data-theme="light|dark">`, which the dark palette at the top of `styles.css` keys off. The inline script in `index.html` applies it before the first paint and duplicates that resolution, so change both together.
- **Helpers:** `src/lib/format.ts` (dates, error messages) and `src/lib/summary.ts` (the "what to order" grouping).
- **Imports:** `@/` is an alias for `src/` (set in `vite.config.ts` and `tsconfig.json`). Pages import siblings relatively; `@/` is mostly used for `@/integrations/supabase/client`.
- **Home Screen install:** `index.html` carries the Apple meta tags and links `public/manifest.webmanifest`. There is no service worker yet, so the app needs a connection to start.

### Data Layer

Every read and write goes through the `Backend` interface (`src/lib/backend.ts`), chosen in `src/lib/config.ts`:
- `supabaseBackend.ts`: the real one. Uses `src/integrations/supabase/client.ts`.
- `demoBackend.ts`: localStorage, single user, and invites are disabled.

Keep the two implementations in step with each other when changing the interface.

### Authentication Flow

Supabase Auth with **emailed 6-digit codes** (`signInWithOtp` + `verifyOtp`), not magic links. Links open in Safari rather than the Home Screen app. The Supabase "Magic Link" email template must include `{{ .Token }}`. A trigger on `auth.users` creates a `profiles` row and the user's own "me" row in `people`.

### Sharing Model (enforced in Postgres RLS)

- Every user owns a circle (`people`, with one `is_me` row). Visits and dishes belong to whoever logged them, and each dish is attributed to a person in that circle.
- `create_invite(person_id)` makes a 6-character code. `claim_invite(code)` sets `people.linked_user_id`, which gives that account **read-only** access to every visit the person was on, including future ones.
- Helper functions (`can_view_visit`, `can_view_person`, `can_view_profile`, `owns_visit`, `owns_person`) are `SECURITY DEFINER` so that policies don't recurse.
- Writes that must be atomic go through RPCs: `create_visit` (visit, people and dishes in one transaction), `get_or_create_restaurant`, `set_display_name`.

### Places (restaurant lookup)

`src/lib/places/`: `google.ts` (Places API (New)) when `VITE_GOOGLE_MAPS_API_KEY` is set, otherwise `osm.ts` (Overpass + Photon). IDs are prefixed with their source: `google:ChIJ...` or `osm:node/123`.

Google billing (per-SKU free caps): Nearby Search is **Pro, 5,000 free a month**. Search uses Autocomplete with a session token, closed by a single Place Details call for Essentials fields only (`id,location,shortFormattedAddress`), which makes the typing free. The key is restricted by referrer and to Places API (New), with daily quotas set in Cloud Console.

`get_or_create_restaurant` reuses an existing restaurant with the same name within about 75 m, so a place found through Google, OpenStreetMap or Apple Maps (iOS) shares one history.

## Common Pitfalls

1. **INSERT ... RETURNING under RLS:** a `SECURITY DEFINER` helper can't see a row inserted by the same statement. Select policies on tables the app inserts into (`visits`, `people`) need an inline `owner_id = auth.uid()` check before the helper call. Both apps once failed on this.
2. **Google terms:** only place IDs may be stored long term. Keep Nearby results in memory (the 15-minute cache in `google.ts`), never in localStorage. Saving the name and address of restaurants the user actually visited is the user's own record.
3. **Google field masks decide the price.** Adding a field to a request can move it to a more expensive tier. Check before changing the `X-Goog-FieldMask` values.
4. **Demo vs real:** if the "Demo mode" banner shows when it shouldn't, `.env` is missing or the variable names are wrong (they need the `VITE_` prefix, and the dev server has to be restarted after editing).
5. **Supabase CLI link:** `db push` targets whatever is in `supabase/.temp/project-ref`. Always go through `scripts/db-push.sh`, which verifies the ref.
6. **Email limits:** Supabase's built-in email sender only sends a few emails an hour. Connect SMTP (for example Resend) if sign-in codes stop arriving.
7. **`npm run test:e2e` needs `CHROMIUM_PATH` on a Mac.** The default in `tests/e2e.ts` is a Linux CI path (`/opt/pw-browsers/...`). On this Mac the browser is under `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` (the version in the folder name changes). The run also needs port 4179 free, and it always runs in demo mode with the map APIs mocked, so it never touches Supabase or Google.
8. **`npm run test:db` fails fast if the local database isn't up.** It talks to PostgREST on `http://127.0.0.1:3900` (override with `TEST_POSTGREST_URL`); `tests/setup-db.sh` starts Postgres on port 5499 plus PostgREST and applies every migration, and must not run as root.

## Adding New Features

- UI change: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`.
- Data change: update the `Backend` interface and both implementations, add a migration, and extend `tests/db-integration.ts`.
- New places field: check its Google pricing tier first (see Pitfall 3).
