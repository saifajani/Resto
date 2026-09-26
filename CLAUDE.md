# Resto

An app for remembering what you and the people you eat with ordered at restaurants. The owner is setting it up on a Mac for personal and family use, and hasn't done this kind of setup before. Explain each step plainly, do the Terminal work for them, and tell them exactly what to click whenever a step has to happen in a browser.

## Layout

- `web/`: the main app. Vite + React + TypeScript, deployed to Vercel with Root Directory `web`.
- `supabase/migrations/0001_init.sql`: the entire database, shared by both apps. It covers tables, row-level security, and the RPC functions `get_or_create_restaurant`, `create_visit`, `create_invite`, `claim_invite` and `set_display_name`.
- `Resto/`, `project.yml`, `Config/`: the iPhone app (SwiftUI, XcodeGen). It's parked for later and has never been compiled.

## Commands (run in `web/`)

```sh
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run test:e2e     # Playwright UI test, run once with Google Places and once with OpenStreetMap (mocked)
npm run test:db      # needs tests/setup-db.sh first, see web/tests/README.md
npm run build
```

## Configuration

`web/.env.local` (gitignored; copy from `web/.env.example`):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: if unset, the app runs in demo mode, with data kept in localStorage.
- `VITE_GOOGLE_MAPS_API_KEY`: a browser key for Places API (New). If unset, the app falls back to OpenStreetMap.

Set the same three values as Environment Variables in Vercel.

## First-time setup checklist

Do these in order. Check what's already done before redoing anything.

1. Tools: Homebrew, Node LTS (`brew install node`), GitHub CLI (`brew install gh`, then `gh auth login`), Supabase CLI (`brew install supabase/tap/supabase`), Google Cloud CLI (`brew install --cask google-cloud-sdk`), Vercel CLI (`npm i -g vercel`).
2. Demo run: `cd web && npm install && npm run dev`.
3. Supabase:
   - The user creates the project in the browser (Canada region) and saves the database password.
   - Apply `supabase/migrations/0001_init.sql`. The easiest route is `supabase login`, then `supabase link --project-ref <ref>`, then `supabase db push`. The alternative is pasting the file into the dashboard's SQL Editor.
   - In the dashboard, change the Magic Link email template body to include `{{ .Token }}`, because the app signs in with a 6-digit code, not a link.
   - Put the Project URL and anon key into `.env.local`.
4. Google Places:
   - The user creates a Cloud project and links billing in the browser (a card is required).
   - Then run `gcloud auth login`, `gcloud config set project <id>` and `gcloud services enable places.googleapis.com apikeys.googleapis.com`.
   - Create a key restricted to `places.googleapis.com` and to the referrer `http://localhost:5173/*` with `gcloud services api-keys create`. Later, add the Vercel URL as a second referrer.
   - In the browser, set per-day quotas under APIs & Services > Places API (New) > Quotas: about 150 a day for Search Nearby (5,000 free a month), and about 300 a day each for Autocomplete and Get Place. Add a $5 budget alert under Billing.
5. Merge the working branch into `main` (use `gh pr create`, then `gh pr merge`).
6. Vercel:
   - `vercel login`, then `vercel link` from `web/`.
   - Add the three env vars with `vercel env add ... production`, then `vercel --prod`.
   - Afterwards, add the Vercel URL to the Google key's referrers and to Supabase's Auth Site URL.
7. Phone: open the URL in Safari, then Share > Add to Home Screen.

Never print or commit secrets. `.env.local` and `Config/Secrets.xcconfig` are gitignored.

## Conventions

- All reads and writes go through the `Backend` interface (`web/src/lib/backend.ts`). There are two implementations: `supabaseBackend.ts` and `demoBackend.ts`. Keep them in step with each other.
- Places providers live in `web/src/lib/places/` (`google.ts` and `osm.ts`). Place IDs carry a prefix: `google:...` or `osm:node/...`.
- Google's terms only allow storing place IDs. Keep Nearby results in memory, never in localStorage.
- Access control belongs in Postgres row-level security, not in the client. A new policy with `INSERT ... RETURNING` needs an inline owner check (see the comments in the migration file).
- After a UI change, run `npm run typecheck` and `npm run test:e2e`.
