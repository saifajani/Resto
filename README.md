# Resto

An app for remembering what you and the people you eat with ordered at restaurants, and whether it was worth ordering again.

- **Nearby:** restaurants around you, with places you've been before pinned to the top. Search by name too.
- **Restaurant page:** a "what to order" summary per person (latest rating, reorder flag, how many times ordered), then the full visit history.
- **Log a visit:** pick who was there, then add dishes with 1 to 5 stars, a "would order again" toggle and notes. Dishes from past visits autocomplete.
- **People:** your circle. The people you eat with don't need an account. When they do sign up, send them an invite code and they'll see every visit you logged with them, including future ones (read only).

There are two front ends on one shared database:

| | Web app (`web/`) | iPhone app (`Resto/`) |
|---|---|---|
| Status | **Start here.** Tested end to end. | Later, once the web version has proven itself. Not yet compiled. |
| Runs on | Any phone browser, add to Home Screen | iPhone, via Xcode and TestFlight |
| Restaurants | OpenStreetMap (free, no key) | Apple Maps (free, no key) |
| Sign in | Emailed 6-digit code | Sign in with Apple |
| Cost | $0 | US$99/year Apple Developer account |

Both use the same Supabase project, so your history carries over if you move to the iPhone app later. Restaurants found through either map source are matched by name and location so they share one history.

```
supabase/migrations/0001_init.sql  Database schema, security rules and functions (shared)
web/                               Web app: Vite + React + TypeScript
Resto/, project.yml, Config/       iPhone app: SwiftUI, generated with XcodeGen
```

## Try it in 1 minute (no setup)

```sh
cd web
npm install
npm run dev
```

Open the URL it prints. With no Supabase keys configured, the app runs in **demo mode**: everything works, but data stays in that browser and invites are off.

## Set up for real

### 1. Supabase (about 10 minutes in the browser)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste all of `supabase/migrations/0001_init.sql` and click **Run**.
3. Go to **Authentication > Emails > Templates > Magic Link** and replace the body with something like the text below. The app signs in with a code instead of a link, because links opened from email don't reach a web app saved to your Home Screen.

   ```html
   <h2>Your Resto sign-in code</h2>
   <p>Enter this code in Resto: <strong>{{ .Token }}</strong></p>
   ```

4. Go to **Project Settings > API** and copy the **Project URL** and the **anon** (or **publishable**) key.

Supabase's built-in email sender only allows a few emails an hour. That's fine for a family, but if you invite more people, connect a free sender like [Resend](https://resend.com) under **Authentication > Emails > SMTP Settings**.

### 2. Put the web app online (Vercel, free)

1. Sign in at [vercel.com](https://vercel.com) with GitHub and click **Add New > Project**.
2. Import `saifajani/resto`.
3. Set **Root Directory** to `web`. Vercel detects Vite automatically.
4. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
5. Click **Deploy**. You'll get a URL like `resto-yourname.vercel.app`.
6. Back in Supabase, open **Authentication > URL Configuration** and set **Site URL** to that address.

Every push to GitHub redeploys the app automatically. Vercel also gives each branch its own preview URL, so you can try changes before they go live.

### 3. Put it on your phone

1. Open your Vercel URL in **Safari** on your iPhone.
2. Tap **Share > Add to Home Screen**.
3. Open it from the new icon, enter your email, then the code you're sent. Allow location when asked.

For family: send them the URL, then tap **Invite** next to their name on the People tab and send them the code. They enter it on their Profile tab after signing in.

## How sharing works

- Every account has its own circle of people, starting with you.
- Each dish is attributed to a person in the circle of whoever logged the visit.
- **Invite** creates a 6-character code for a person in your circle. When someone redeems it, their account is linked to that person.
- Linked accounts can read every visit their person was on (all dishes on those visits, not just their own), now and in future. They can't edit or delete them.
- All of this is enforced by Postgres row-level security, not just in the app.

## Restaurant data

The web app uses [OpenStreetMap](https://www.openstreetmap.org), which is open data and free:

- **Nearby** comes from the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).
- **Search by name** comes from [Photon](https://photon.komoot.io) by Komoot.

Neither needs an API key or account. Both ask for light, reasonable use, which a personal app is well within. Coverage in Toronto is good. If a place is missing or wrong, anyone can fix it at [openstreetmap.org](https://www.openstreetmap.org), and it shows up in the app within minutes.

## Tests

```sh
cd web
npm run typecheck
npm run test:e2e   # drives the app in a phone-sized browser (demo mode, map responses mocked)
npm run test:db    # runs the real Supabase code against Postgres + PostgREST, see web/tests/README.md
```

## The iPhone app (later)

Building it needs a Mac with Xcode 16+, [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) and a paid Apple Developer account, because Sign in with Apple doesn't work on the free tier.

1. In Supabase, go to **Authentication > Sign In / Providers > Apple**, enable it and add your bundle ID (for example `com.yourname.resto`) under **Client IDs**.
2. Build on your Mac:

   ```sh
   cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # fill in host, key, bundle ID, team ID
   xcodegen generate
   open Resto.xcodeproj
   ```

3. Pick your iPhone or a simulator and press **Run**. Run `xcodegen generate` again whenever files are added or removed.
4. Use **Product > Archive** and TestFlight to share it with family.

## Ideas for v2

- Dish photos (Supabase Storage)
- A notification when you arrive at a place you've been before (iPhone app)
- Editing a past visit (today you can delete and re-log)
- Offline logging that syncs later
