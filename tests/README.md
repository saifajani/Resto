# Tests

## `npm test`

Vitest unit tests next to the code (`src/**/*.test.ts`), for the "what to order" summary and the visited-restaurants grouping.

## `npm run test:e2e`

Builds the app and drives it in a phone-sized Chromium using Playwright, in demo mode, with map responses mocked. It runs twice, once with Google Places and once with OpenStreetMap, and checks that Google calls send the key, use the cache and close each search session with one Place Details call. It covers signing in, nearby and search, logging visits with several dishes and people, the "what to order" summary, deleting, the People and Profile tabs, reloads, dark mode and denied location.

Set `CHROMIUM_PATH` if Chromium isn't at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, and `SCREENSHOT_DIR` to save a screenshot of each step.

## `npm run test:db`

Runs the real Supabase backend code (`src/lib/supabaseBackend.ts`) against Postgres and [PostgREST](https://postgrest.org), the same pieces Supabase uses, with every file in `supabase/migrations/` applied. It plays three users (an owner, a companion who redeems an invite, and a stranger) and checks every sharing rule, including who can see, add and remove dish photos.

Plain PostgREST has no Storage API, so `setup-db.sh` creates a minimal `storage` schema (`buckets` and `objects`, with row-level security on) and exposes it, and the test's proxy fakes the few Storage calls the app makes. Each fake call reads or writes `storage.objects` as the signed-in user, so the bucket policies from the migrations decide, just as in Supabase. The proxy can also fail uploads on purpose, to test the retry path.

The test leaves data behind, so run `setup-db.sh` again before each `npm run test:db`.

Start the database first. This needs Postgres 15+ and the PostgREST binary, and has to run as a user that can run `initdb` (not root):

```sh
tests/setup-db.sh /usr/lib/postgresql/16/bin /path/to/postgrest
npm run test:db
```

On macOS with Homebrew: `brew install postgresql@16 postgrest`, then `tests/setup-db.sh "$(brew --prefix postgresql@16)/bin" "$(which postgrest)"`.
