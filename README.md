# Resto

An app for remembering what you and the people you eat with ordered at restaurants, and whether it was worth ordering again.

- **Where are you?:** restaurants around you (from Google Places), with places you've been before pinned to the top. It answers "which of these am I sitting in", rather than being a search. Search by name too.
- **Restaurant page:** a "what to order" summary for each person (latest rating, reorder flag, how many times ordered), then the full visit history.
- **Log a visit:** pick who was there, then add dishes with 1 to 5 stars, a "would order again" toggle, notes and an optional photo (take one or pick from the library). Dishes from past visits autocomplete.
- **People:** your circle. The people you eat with don't need an account. When they sign up, send them an invite code and they'll see every visit you logged with them, including future ones (read only).

It's a mobile web app you add to your iPhone Home Screen. It's built with Vite, React, TypeScript and Supabase, deployed on Vercel, and laid out like Schedule1. See [CLAUDE.md](CLAUDE.md) for the architecture and the day-to-day workflow (`push` and `ship it`).

```
src/                    the app
supabase/migrations/    database schema, security rules and functions
scripts/db-push.sh      applies migrations to the Resto Supabase project (checks the project ref first)
tests/                  UI tests (Playwright) and database tests (Postgres + PostgREST)
ios/                    a native iPhone app for later (SwiftUI, never compiled yet)
```

## Getting started (Terminal + Claude Code)

This assumes Claude Code, Node.js and the GitHub CLI are already set up, as they are for Schedule1.

### 1. Get the code and run the demo

Put it in your Code folder, next to Schedule1:

```sh
cd ~/Code
gh repo clone saifajani/Resto resto
cd resto
git checkout claude/restaurant-meal-memory-app-azgvzk    # until it's merged to main
npm i
npm run dev
```

Open **http://localhost:8081**. It uses port 8081 so it can run alongside Schedule1 on 8080. With no `.env`, it runs in **demo mode**: everything works, but data stays in that browser and restaurants come from OpenStreetMap.

Then start Claude Code in the folder with `claude`. It reads `CLAUDE.md` automatically.

### 2. Create the Supabase project

In the browser, create a new project in your Supabase account called `resto`, in the **Canada (Central)** region. Keep it separate from Schedule1's projects. Supabase's free plan limits how many active free projects you can have. If it won't let you create one, it will say so, and you can pause an unused project or put Resto on a paid plan.

Then, in Claude Code:

> Set up Supabase for Resto: create .env from .env.example with my project's URL, publishable key and project ref, then run the db push script. Then walk me through changing the Magic Link email template to send a 6-digit code.

The template body just needs to include the code:

```html
<h2>Your Resto sign-in code</h2>
<p>Enter this code in Resto: <strong>{{ .Token }}</strong></p>
```

Two things to know before you try this:

- **On the free plan you must connect custom SMTP first.** Supabase refuses to change email templates on a free project that is still using its built-in sender. Custom SMTP also lifts the 2-emails-an-hour limit and the rule that the built-in sender only delivers to people on the project team, which otherwise blocks family entirely. A dedicated Gmail account is enough: turn on 2-Step Verification, generate a 16-character app password, and put `smtp.gmail.com`, port `465`, the full address as the username and that app password into **Project Settings > Authentication > SMTP Settings**.
- **There are three templates, not one.** Confirm signup goes to a brand new address, Magic Link to a returning one, and Reset password to a recovery. Change all three, or a first-time sign-in still arrives as a link.

### 3. Set up Google Places

In the browser, at [console.cloud.google.com](https://console.cloud.google.com), create a project called `Resto` and link a billing account. Google requires a card even within the free usage.

Then, in Claude Code:

> Set up Google Places for Resto with gcloud: enable Places API (New), create an API key restricted to places.googleapis.com and to http://localhost:8081/*, and add it to .env. Then walk me through setting daily quotas and a $5 budget alert.

The quotas and budget alert are clicks in the Cloud Console, and Claude Code will point you to them. Suggested daily limits:
- **Search Nearby:** 150 a day, which keeps you under the 5,000 free a month
- **Text Search:** 150 a day, a guard rail on a call the app doesn't currently make
- **Autocomplete:** 300 a day
- **Get Place:** 300 a day

What's free each month, as of September 2026 (Google gives each type of call its own allowance):

| What the app does | Google API | Free per month |
|---|---|---|
| Nearby list | Nearby Search (Pro tier) | 5,000, then US$32 per 1,000 |
| Typing in search | Autocomplete (Essentials tier) | Free when the search ends in a pick, which is how the app uses it |
| Picking a search result | Place Details (Essentials tier) | 10,000 |

Check [Google's pricing page](https://developers.google.com/maps/billing-and-pricing/pricing) for current numbers. The app caches nearby results in memory for 15 minutes per spot, so a family uses a few hundred calls a month.

### 4. Try it for real

Restart `npm run dev`. The "Demo mode" banner should be gone. Sign in with your email and the 6-digit code you're sent.

### 5. Move to `main` and deploy on Vercel

In Claude Code:

> Merge the claude/restaurant-meal-memory-app-azgvzk branch into a new main branch, make main the default branch on GitHub, and push.

Then in the browser at [vercel.com](https://vercel.com): **Add New > Project**, import `saifajani/Resto`, and add the four variables from `.env` under **Environment Variables**. The default settings are right, because the app is at the repo root. Click **Deploy**.

Then, in Claude Code:

> Add my Vercel URL to the Google key's allowed referrers and set it as the Site URL in Supabase Auth.

From here on, **push** means live: every push to `main` redeploys automatically.

### 6. Put it on your phone

Open the Vercel address in **Safari**, then tap **Share > Add to Home Screen**. For family, send them the address, then tap **Invite** next to their name on the People tab and send them the code.

## How sharing works

- Every account has its own circle of people, starting with you.
- Each dish is attributed to a person in the circle of whoever logged the visit.
- **Invite** creates a 6-character code for a person in your circle. When someone redeems it, their account is linked to that person.
- Linked accounts can read every visit their person was on (all dishes and photos on those visits, not just their own), now and in future. They can't edit or delete them.
- All of this is enforced by Postgres row-level security, not just in the app.

## Restaurant data

- **With a Google key**, the app uses Google Places API (New): Nearby Search for the list, and Autocomplete plus Place Details for search, with session tokens so the typing is free.
- **Without a key**, it falls back to [OpenStreetMap](https://www.openstreetmap.org) (free and open): Overpass for nearby and Photon for search. Demo mode uses this.
- **A note on Google's terms:** Google's terms only allow storing its place IDs long term. Nearby results are kept in memory only. The app does save the name and address of restaurants you actually log a visit at, as your own record. If this ever becomes a product for other people, that's worth a proper look.

## Tests

```sh
npm run lint
npm run typecheck
npm test            # unit tests (Vitest)
npm run test:e2e    # UI in a phone-sized browser, once with Google and once with OpenStreetMap (mocked)
npm run test:db     # the real Supabase code against Postgres + PostgREST, see tests/README.md
```

## The iPhone app (later)

`ios/` holds a native SwiftUI version that uses the same Supabase project, with Apple Maps and Sign in with Apple. It needs a Mac with Xcode 16+, XcodeGen (`brew install xcodegen`) and a paid Apple Developer account. It has never been compiled, so expect some fixes on the first build.

```sh
cd ios
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # fill in host, key, bundle ID, team ID
xcodegen generate
open Resto.xcodeproj
```

In Supabase, go to **Authentication > Sign In / Providers > Apple**, enable it and add the bundle ID under **Client IDs**.
