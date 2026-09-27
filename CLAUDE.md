# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Resto is a personal and family app for remembering what everyone ordered at restaurants, and whether it was worth ordering again. It's a mobile-first web app (installable to the iPhone Home Screen) built with React, TypeScript and Supabase, with Google Places for restaurant lookup.

**Screens:**
- **Restaurants** (`/`): nearby restaurants (places you've visited are pinned to the top), search, and your restaurants
- **Restaurant** (`/r/:id`): a "what to order" summary per person, plus the visit history
- **Log a visit** (`/r/:id/log`): who was there, and each dish with 1 to 5 stars, a "would order again" toggle, notes and an optional photo
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
  - **End to end on a real iPhone** (26 September 2026): the deployed app installed to the Home Screen, an emailed 6-digit code arrived from the Gmail sender, and signing in worked **inside the installed app**, which is the whole reason the app uses codes rather than magic links. This was the last unproven part of v0.1.
- **Supabase is set up** (26 September 2026): project `resto` (ref in `.env`) in Canada (Central), in its own **free** org, separate from the paid org holding the Schedule1 projects. It was moved there because a paid org bills about $10 a month per project. `20260926000000_init.sql` is applied, and `site_url` points at the Vercel URL (see below).
- **Custom SMTP is connected, and sign-in codes work** (26 September 2026). Sending goes through a dedicated Gmail account on `smtp.gmail.com` port 465, so the From line reads `Resto <that Gmail address>` and the owner's personal address is never shown to family. The address and its 16-character Google app password live only in Supabase's SMTP settings, never in the repo. All three templates (Confirm signup, Magic Link, Reset password) now send `{{ .Token }}`: 6 digits, valid an hour, 30 emails an hour, with a 60-second gap between emails to the same address. Do not re-diagnose this as missing.
  - Connecting SMTP is what unlocked **three** things at once: custom email templates, the rate limit above 2 an hour, and delivery to anyone at all rather than project team members only.
  - Still true and worth keeping: a **free** project on Supabase's **built-in** sender cannot have custom templates ("Email template modification is not available for free tier projects using the default email provider"), and a project transfer between orgs **resets the templates** while `site_url` and `mailer_otp_length = 6` survive. So if SMTP is ever switched off, or the project moves org again, re-apply all three templates.
  - **Confirm signup is a separate template from Magic Link.** A brand new address gets Confirm signup, a returning one gets Magic Link. Changing only Magic Link once left first-time sign-ups receiving a link.
  - The Supabase Management API can return **HTTP 200 without applying a template field**. Read the templates back after a PATCH rather than trusting the status code.
- **v0.1 is deliberately free of charge**, and all three pieces are now in place: the dedicated Gmail account over SMTP for sign-in emails (500 a day, sender is that Gmail address), the free `.vercel.app` domain, and the free Supabase org. A bought domain plus Resend was priced up and **deferred**, not rejected: it is the upgrade when the app outgrows a Gmail sender. Swapping it in is Supabase settings only, with no app changes.
- **Vercel is live** (26 September 2026): https://resto-reminder.vercel.app, built from `main` on every push. Changing the `.vercel.app` name means adding the new domain and, optionally, deleting the old one; deleting it makes the old address 404, so Supabase `site_url` has to move with it. The three `VITE_` Supabase variables (URL, publishable key, project ref) are set there as **Config** (not Secret), because Vite inlines them into the browser bundle: marking them secret would be a false sense of security, and both are public by design. `site_url` points at this URL, with `http://localhost:8081/**` kept in `uri_allow_list` so local dev still works.
- **Dish photos** (26 September 2026). `20260927025536_dish_photos.sql` is **applied** to the live project: the `dish-photos` bucket exists, is private, JPEG only with a 2 MB cap, and has its four storage policies. The migration had to go out **before** the frontend, because the new app calls `create_visit` with `p_id`.
  - The owner's call: photos belong to the visit (stored in the visit's folder, visible to whoever can see the visit). Don't restructure them around the offline queue; the app already picks the visit and dish ids itself, so a queued visit can replay the same save steps later.
  - Free plan storage is **1 GB**. Photos are shrunk on the phone to about 250 KB, so roughly 4,000 photos. Supabase's image resizing is a paid feature, which is why shrinking happens in the app.
- **Google Cloud is set up** (27 September 2026), so local dev now uses Google Places rather than OpenStreetMap:
  - Project **`resto-reminder`** (display name Resto, number `610506026684`), created with `gcloud`, which is installed via the `gcloud-cli` Homebrew cask. Places API (New) is enabled.
  - It has **its own billing account**, `Resto`, separate from `My Billing Account`, which carries the two `gen-lang-client-*` Gemini projects for Schedule1. Same reasoning as the separate Supabase org: its own card, its own bill, its own alert. Note the account's currency is **CAD**.
  - The key is a **browser key** named `Resto web`, restricted to `places.googleapis.com` and to the referrers `http://localhost:8081/*` and `https://resto-reminder.vercel.app/*`. The app sends it as an `X-Goog-Api-Key` header, so referrer restrictions apply. Verified live: the app's own Nearby field mask returns results, and a request from any other referrer gets 403. **Vercel preview deployments are on different hostnames and will therefore be blocked** until their URL is added.
  - **Daily quota caps are the real spending limit** and are applied as consumer overrides on the `1/d/{project}` limits: Search Nearby **150**, Autocomplete **300**, Get Place **300**. Defaults were 75,000 / 175,000 / 125,000.
  - Budget `Resto monthly cap`, **CAD 5** a month, scoped to this project only, alerting at 50, 90 and 100 per cent. A budget only emails, it never blocks, which is why the quotas above matter.
  - `VITE_GOOGLE_MAPS_API_KEY` is in `.env`. **Vercel still needs it** (as Config, then a redeploy) before the deployed app stops using OpenStreetMap.
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
  - **The owner has asked for ratings, reviews and opening hours.** They sit on dearer tiers, and the free allowance drops as you cross into them (checked 26 September 2026): name, address and location are **Essentials, 10,000 free a month**; the nearby list, cuisine type and display name are **Pro, 5,000**; star rating, rating count, opening hours, phone, website and price level are **Enterprise, 1,000**; review text itself is **Enterprise + Atmosphere, 1,000**. A Nearby Search returns about twenty places in one call and is billed at the tier of the **most expensive field asked for**, so putting `rating` into the nearby field mask moves the whole list to Enterprise. No decision has been made yet.
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
- **Helpers:** `src/lib/format.ts` (dates, error messages), `src/lib/summary.ts` (the "what to order" grouping) and `src/lib/photo.ts` (shrinking photos and their storage path).
- **The nearby list** is always sorted by distance, nearest first, and shows 8 at a time behind a "Show more" row that adds 8 more. Each row carries a `VisitedMark` (`src/components/ui.tsx`): filled when you were there yourself, an outline when only someone in your circle was, nothing when it is new to all of you. Which one it is comes from `groupVisitedRestaurants`, which decides on **attendance, not who logged it**, so a visit you recorded for other people counts as one you haven't been on.
- **"What to order" groups by account, not person row.** The same human is a different `people` row in each circle (your "Sarah", and Sarah's own "me"), so `summarize` groups by `linked_user_id` when there is one and falls back to the person id. The group's name is the one from the viewer's own circle.
- **Imports:** `@/` is an alias for `src/` (set in `vite.config.ts` and `tsconfig.json`). Pages import siblings relatively; `@/` is mostly used for `@/integrations/supabase/client`.
- **Home Screen install:** `index.html` carries the Apple meta tags and links `public/manifest.webmanifest`. There is no service worker yet, so the app needs a connection to start.

### Data Layer

Every read and write goes through the `Backend` interface (`src/lib/backend.ts`), chosen in `src/lib/config.ts`:
- `supabaseBackend.ts`: the real one. Uses `src/integrations/supabase/client.ts`.
- `demoBackend.ts`: localStorage, single user, and invites are disabled.

Keep the two implementations in step with each other when changing the interface.

### Dish photos

One optional photo per dish, in the private `dish-photos` bucket at `<owner id>/<visit id>/<dish id>.jpg`.
- **Taking one:** a plain `<input type="file" accept="image/*">` with no `capture` attribute, so iPhone offers Take Photo or Photo Library. `shrinkPhoto` redraws it on a canvas as a JPEG at most 1600 px on the long edge (about 250 KB), which also drops the location data.
- **Saving:** `createVisit` picks the visit and dish ids, calls `create_visit`, then uploads each photo and sets `dishes.photo_path` for the ones that worked. The visit is always saved; photos that failed come back as `pendingPhotos`, and Log a visit stays on screen explaining which dish's photo didn't upload, with **Try again** (`retryPhotos`) and **Skip**. Never drop a photo silently.
- **Access:** storage policies read the owner and visit from the path. Reading needs `can_view_visit` (or it's your own folder); uploading needs your own folder and `owns_visit`. A check constraint pins `photo_path` to the dish's own visit folder.
- **Showing:** the bucket is private, so the restaurant screen asks `photoUrls` for signed links (an hour) on every load.
- **Deleting:** storage files don't cascade with rows, and Supabase blocks deleting them from SQL, so `deleteVisit` lists and removes the visit's folder itself.
- **Demo mode** keeps photos in IndexedDB (`demoPhotoStore.ts`), since localStorage holds only about 5 MB.

### Authentication Flow

Supabase Auth with **emailed 6-digit codes** (`signInWithOtp` + `verifyOtp`), not magic links. Links open in Safari rather than the Home Screen app, which has its own storage, so a session created in Safari is useless to the installed app. All three Supabase email templates (Confirm signup, Magic Link, Reset password) include `{{ .Token }}` and are live. A trigger on `auth.users` creates a `profiles` row and the user's own "me" row in `people`.

### Sharing Model (enforced in Postgres RLS)

- Every user owns a circle (`people`, with one `is_me` row). Visits and dishes belong to whoever logged them, and each dish is attributed to a person in that circle.
- `create_invite(person_id)` makes a 6-character code. `claim_invite(code)` sets `people.linked_user_id`, which gives that account **read-only** access to everything in that circle.
- **Sharing is circle-wide, not visit-by-visit** (`20260927134618_circle_sharing.sql`, 27 September 2026). Once someone is linked into your circle they see **every visit you log**, with its dishes, ratings, notes and photos, whether or not they were there. Before this you only saw visits you were on, so a companion could never read your feedback on a meal you ate without them, which is most of the point of the app.
  - It is **not transitive**. Two people in your circle see your visits but nothing of each other's, unless they invite each other directly. `tests/db-integration.ts` holds that line with a fourth user who never joins a circle.
  - **The date of a visit you weren't on is hidden by the app, not by RLS.** `visited_at` is still in the API response. `RestaurantPage` prints "Earlier visit" instead of a date, and the restaurant list is dated by `myLastVisit`, the newest visit you were actually on. Treat it as a courtesy, not a privacy boundary: anyone in the circle who opens their browser's network tab can read the real date out of the response. **The owner decided on 27 September 2026 that this is fine** and that no database change is wanted for it, so don't "fix" this with a view or column masking.
- Invites work **both ways**. Right after `claim_invite`, the app shows a "Share back" sheet (`src/components/LinkBackSheet.tsx`) asking which of the redeemer's own people is the inviter (a name match is preselected, or "Not in my list" adds them). That calls `link_back(owner_id, person_id)`, which links the inviter into the redeemer's circle. It only works for someone whose invite you've redeemed, and is a no-op if already linked. Skipping it leaves the link one-way; People > "Circles you're in" then shows a **Share back** button.
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
4. **Demo vs real:** if the "Demo mode" banner shows when it shouldn't, `.env` is missing or the variable names are wrong (they need the `VITE_` prefix, and the dev server has to be restarted after editing). On Vercel, the variables are only read at **build** time, so changing one needs a redeploy with the build cache off, not just a save.
5. **A blank page in a deployed build is usually a bad env value.** `VITE_SUPABASE_URL` pasted without `https://` made `createClient` throw at import time, so React never mounted and the page rendered empty with only a console error. `normalizeSupabaseUrl` in `src/integrations/supabase/client.ts` now repairs a missing scheme, spaces and trailing slashes. To read the value a deploy actually baked in, grep the built bundle for the project ref.
6. **Supabase CLI link:** `db push` targets whatever is in `supabase/.temp/project-ref`. Always go through `scripts/db-push.sh`, which verifies the ref.
7. **Email limits:** custom SMTP is connected (Gmail, see the status section), so the limit is **30 sign-in emails an hour** and 500 a day, not the built-in sender's 2 an hour. If codes stop arriving, check the Gmail account's app password first, then spam (a new sender with no reputation), not the Supabase sender.
8. **Google Cloud CLI gotchas**, both hit on 27 September 2026: `gcloud billing budgets create` fails with a bare `INVALID_ARGUMENT` if `--budget-amount` uses a currency other than the billing account's own (USD on a CAD account), and the quota commands live in `gcloud alpha`, which the Homebrew cask does install through `gcloud components install alpha`.
9. **`npm run test:e2e` needs `CHROMIUM_PATH` on a Mac.** The default in `tests/e2e.ts` is a Linux CI path (`/opt/pw-browsers/...`). On this Mac the browser is under `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` (the version in the folder name changes). The run also needs port 4179 free, and it always runs in demo mode with the map APIs mocked, so it never touches Supabase or Google.
10. **`npm run test:db` fails fast if the local database isn't up, and it needs a fresh one.** It talks to PostgREST on `http://127.0.0.1:3900` (override with `TEST_POSTGREST_URL`); `tests/setup-db.sh` starts Postgres on port 5499 plus PostgREST and applies every migration, and must not run as root. The test leaves its data behind, so **rerun `setup-db.sh` before every `test:db` run**, or dozens of checks fail on the leftovers. Until 27 September 2026 that rerun silently did nothing: the script wiped the data directory, but the old Postgres and PostgREST kept running and kept answering on port 3900, so the "fresh" run still read the previous run's rows. The script now stops the old pair first. The script also stubs the `storage` schema, and the test fakes the Storage API on top of it (see `tests/README.md`).
11. **Photos and the free plan:** storage is capped at 1 GB. Photo links are signed and expire after an hour, so never save them; ask `photoUrls` again. The e2e test sets `globalThis.__restoFailPhotoUploads` to make demo uploads fail, which is how the "didn't upload" screen is tested.

## Adding New Features

- UI change: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`.
- Data change: update the `Backend` interface and both implementations, add a migration, and extend `tests/db-integration.ts`. If it touches photos, remember the storage policies in the migration and the storage stub in `tests/setup-db.sh`.
- New places field: check its Google pricing tier first (see Pitfall 3).
