# Resto

An iPhone app for remembering what you and the people you eat with ordered at restaurants, and whether it was worth ordering again.

- **Nearby:** restaurants around you from Apple Maps, with places you've been before marked. Search by name too.
- **Restaurant page:** a "what to order" summary per person (latest rating, reorder flag, how many times ordered), then the full visit history.
- **Log a visit:** pick who was there, then add dishes with 1 to 5 stars, a "would order again" toggle and notes. Names of dishes from past visits autocomplete.
- **People:** your circle. The people you eat with don't need an account. When they do sign up, send them an invite code and they'll see every visit you logged with them, including future ones (read only).

## How it's built

| Piece | Choice |
|---|---|
| App | SwiftUI, iOS 18+ |
| Restaurants | Apple MapKit (free, no API key, stable place IDs) |
| Sign in | Sign in with Apple via Supabase Auth |
| Data | Supabase Postgres with row-level security |
| Xcode project | Generated from `project.yml` by [XcodeGen](https://github.com/yonaskolb/XcodeGen) |

```
project.yml                     XcodeGen spec (generates Resto.xcodeproj)
Config/Secrets.example.xcconfig Template for your keys
supabase/migrations/0001_init.sql  Database schema, security rules, functions
Resto/App        App entry and tab layout
Resto/Models     Codable models
Resto/Services   Supabase client, API calls, auth, location, Apple Maps search
Resto/Views      Screens
```

## Setup

You need a Mac with Xcode 16 or newer and a paid Apple Developer account (US$99/year). Sign in with Apple doesn't work with a free personal team.

### 1. Supabase (about 10 minutes, done in the browser)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste all of `supabase/migrations/0001_init.sql` and run it.
3. Go to **Authentication > Sign In / Providers > Apple** and enable it. Under **Client IDs**, enter your app's bundle ID (for example `com.yourname.resto`). You can leave the secret key empty since the app signs in natively.
4. Go to **Project Settings > API** and copy the project URL and the anon (or publishable) key.

### 2. Apple Developer

1. Sign in to [developer.apple.com](https://developer.apple.com/account) and note your **Team ID** (Membership details).
2. Nothing else is required up front. Xcode registers the bundle ID and the Sign in with Apple capability for you the first time you build.

### 3. Build on your Mac

```sh
# One-time tools
xcode-select --install          # if you haven't already
brew install xcodegen           # needs Homebrew: https://brew.sh

# Get the code
git clone https://github.com/saifajani/resto.git
cd resto
git checkout claude/restaurant-meal-memory-app-azgvzk   # until this is merged to main

# Add your keys
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig
open -e Config/Secrets.xcconfig  # fill in host, key, bundle ID, team ID

# Generate the Xcode project and open it
xcodegen generate
open Resto.xcodeproj
```

In Xcode:

1. Wait for the Supabase package to finish downloading (progress shows in the top bar).
2. Plug in your iPhone, or pick a simulator, from the device menu at the top.
3. Press **Run** (⌘R).

On a real iPhone the first time, you may need to turn on **Developer Mode** (Settings > Privacy & Security) and trust your developer certificate (Settings > General > VPN & Device Management).

In the simulator, sign in to an Apple ID in the simulator's Settings app first, and set a location with **Features > Location > Custom Location** (for example 43.6487, -79.3854 for downtown Toronto).

Whenever you pull new code that adds or removes files, run `xcodegen generate` again. The `.xcodeproj` is generated, so it isn't committed.

### 4. Share it with family (TestFlight)

1. In Xcode choose **Product > Archive**, then **Distribute App > TestFlight & App Store**.
2. In [App Store Connect](https://appstoreconnect.apple.com), open the app's **TestFlight** tab and add your family as internal or external testers.
3. They install the TestFlight app, accept the invite, sign in, and enter the invite code you send them from the People tab.

## How sharing works

- Every account has its own circle of people, starting with you.
- Each dish is attributed to a person in the circle of whoever logged the visit.
- **Invite** on the People tab creates a 6-character code for that person. When someone redeems it on their Profile tab, their account is linked to that person.
- Linked accounts can read every visit their person was on (all dishes on those visits, not just their own), now and in future. They can't edit or delete them.
- All of this is enforced in Postgres row-level security, not just in the app.

## Ideas for v2

- Dish photos (Supabase Storage)
- A notification when you arrive at a place you've been before
- Editing a past visit (today you can delete and re-log)
- Linked people logging visits into a shared household circle
