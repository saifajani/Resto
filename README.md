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
| Restaurants | Google Places (falls back to OpenStreetMap if no key is set) | Apple Maps (free, no key) |
| Sign in | Emailed 6-digit code | Sign in with Apple |
| Cost | $0 within Google's free monthly caps | US$99/year Apple Developer account |

Both use the same Supabase project, so your history carries over if you move to the iPhone app later. Restaurants found through either map source are matched by name and location so they share one history.

```
supabase/migrations/0001_init.sql  Database schema, security rules and functions (shared)
web/                               Web app: Vite + React + TypeScript
Resto/, project.yml, Config/       iPhone app: SwiftUI, generated with XcodeGen
```

## Getting started (step by step, on a Mac)

Plan on about an hour the first time. Steps 1 to 3 get the app running on your computer in demo mode. Steps 4 to 6 connect the real services. Steps 7 and 8 put it online and on your phone.

### 1. Install the tools (once)

1. **Node.js:** download the **LTS** installer from [nodejs.org](https://nodejs.org) and run it.
2. **Git:** open the **Terminal** app and type `git --version`. If macOS offers to install the command line developer tools, click **Install**.
3. **GitHub Desktop:** install it from [desktop.github.com](https://desktop.github.com) and sign in with your GitHub account. It handles logging in to your repo, which is the fiddly part with plain `git`.

Check it worked. In Terminal, `node -v` should print a version like `v22.x`.

### 2. Get the code

1. In GitHub Desktop, choose **File > Clone Repository**, pick `saifajani/Resto`, and note the folder it saves to (by default `~/Documents/GitHub/Resto`).
2. Use the **Current Branch** menu at the top to switch to `claude/restaurant-meal-memory-app-azgvzk`, until it's merged into `main`.
3. Later, when there are new changes, click **Fetch origin**, then **Pull**.

### 3. Run it in demo mode

In Terminal:

```sh
cd ~/Documents/GitHub/Resto/web
npm install        # first time, and whenever package.json changes
npm run dev
```

Open **http://localhost:5173** in Chrome or Safari. With no keys set, the app runs in **demo mode**: everything works, data stays in that browser, invites are off, and restaurants come from OpenStreetMap. Press `Ctrl+C` in Terminal to stop it.

### 4. Supabase: database and sign-in (about 10 minutes)

1. Create a free account and a new project at [supabase.com](https://supabase.com). Pick the **Canada (Central)** region, and save the database password somewhere safe.
2. Open **SQL Editor**, paste all of `supabase/migrations/0001_init.sql` and click **Run**. It should say "Success".
3. Go to **Authentication > Emails > Templates > Magic Link** and replace the body with the text below. The app signs in with a code instead of a link, because links opened from email don't reach a web app saved to your Home Screen.

   ```html
   <h2>Your Resto sign-in code</h2>
   <p>Enter this code in Resto: <strong>{{ .Token }}</strong></p>
   ```

4. Go to **Project Settings > API** and copy the **Project URL** and the **anon** (or **publishable**) key.

Supabase's built-in email sender only allows a few emails an hour. That's fine for a family, but if you invite more people, connect a free sender like [Resend](https://resend.com) under **Authentication > Emails > SMTP Settings**.

### 5. Google Places: restaurant search (about 15 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project called `Resto`.
2. **Billing:** link a billing account. Google requires a card even when you stay within the free usage.
3. **APIs & Services > Library:** search for **Places API (New)** and click **Enable**.
4. **APIs & Services > Credentials > Create credentials > API key.** Then edit the key:
   - **Application restrictions:** choose **Websites** and add `http://localhost:5173/*`. You'll add your Vercel address in step 7.
   - **API restrictions:** choose **Restrict key** and tick only **Places API (New)**.
   - Save and copy the key.
5. **Cap usage so you can't be surprised by a bill.** Go to **APIs & Services > Places API (New) > Quotas & System Limits** and set per-day limits:
   - Search Nearby: **150 per day** (keeps you under the 5,000 free a month)
   - Autocomplete: **300 per day**
   - Get Place: **300 per day**
6. **Billing > Budgets & alerts:** create a budget of $5 with email alerts, as a second safety net.

What's free each month, as of September 2026 (Google charges per API type, not per project):

| What the app does | Google API | Free per month |
|---|---|---|
| Nearby list | Nearby Search (Pro tier) | 5,000, then US$32 per 1,000 |
| Typing in search | Autocomplete (Essentials tier) | Free when the search ends in a pick, which is how the app uses it |
| Picking a search result | Place Details (Essentials tier) | 10,000 |

Check [Google's pricing page](https://developers.google.com/maps/billing-and-pricing/pricing) for current numbers.

The app keeps nearby results in memory for 15 minutes, per spot, so moving between screens doesn't call Google again. A family opening the app a few times a day uses a few hundred calls a month.

### 6. Connect them locally

```sh
cd ~/Documents/GitHub/Resto/web
cp .env.example .env.local
open -e .env.local
```

Fill in the three values (Supabase URL, Supabase anon key, Google key), save, then run `npm run dev` again. The "Demo mode" banner should be gone. Sign in with your email and the 6-digit code you're sent. `.env.local` is never uploaded to GitHub.

### 7. Put it online with Vercel (free)

1. Get the code onto `main` by merging the pull request on GitHub.
2. Sign in at [vercel.com](https://vercel.com) with GitHub and click **Add New > Project**.
3. Import `saifajani/Resto` and set **Root Directory** to `web`. Vercel detects Vite automatically.
4. Under **Environment Variables**, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_MAPS_API_KEY` with the same values as `.env.local`.
5. Click **Deploy**. You'll get an address like `resto-yourname.vercel.app`.
6. In Google Cloud, edit your API key and add `https://resto-yourname.vercel.app/*` to the website restrictions.
7. In Supabase, go to **Authentication > URL Configuration** and set **Site URL** to the same address.

From then on, every push to `main` redeploys the app automatically.

### 8. Put it on your phone

1. Open your Vercel address in **Safari** on your iPhone.
2. Tap **Share > Add to Home Screen**.
3. Open it from the new icon, sign in with your email and code, and allow location when asked.

For family: send them the address. Then tap **Invite** next to their name on the People tab and send them the code, which they enter on their Profile tab after signing in.

## How sharing works

- Every account has its own circle of people, starting with you.
- Each dish is attributed to a person in the circle of whoever logged the visit.
- **Invite** creates a 6-character code for a person in your circle. When someone redeems it, their account is linked to that person.
- Linked accounts can read every visit their person was on (all dishes on those visits, not just their own), now and in future. They can't edit or delete them.
- All of this is enforced by Postgres row-level security, not just in the app.

## Restaurant data

- **With a Google key** (`VITE_GOOGLE_MAPS_API_KEY`), the web app uses Google Places API (New): Nearby Search for the list, and Autocomplete plus Place Details for search. The search uses Google's session tokens, which makes the typing free.
- **Without a key**, it falls back to [OpenStreetMap](https://www.openstreetmap.org), which is open data and free: [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) for nearby and [Photon](https://photon.komoot.io) for search. That's what demo mode uses.
- **A note on Google's terms:** Google's terms only allow storing its place IDs long term. Nearby results are therefore held in memory only, never saved. The app does save the name and address of restaurants you actually log a visit at, since that's your own record. If you ever turn this into a product for other people, that's worth a proper look.

## Tests

```sh
cd web
npm run typecheck
npm run test:e2e   # drives the app in a phone-sized browser, once with Google and once with OpenStreetMap (demo mode, map responses mocked)
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
