# Kamix — Architecture

> Companion to `docs/REQUIREMENTS.md` (product SRS). This document describes *how* the system is built, not *what* it must do.

## 1. Overview

Kamix is a restaurant discovery, booking, and in-venue dining experience app with two user roles (customer, owner) plus admin. It ships as:

- A web app (Vite + React + TypeScript, deployed as static assets behind nginx)
- A native Android/iOS shell (Capacitor) wrapping the same web bundle
- A Convex backend (reactive serverless functions + database) as the single source of truth and realtime transport

There is **no separate REST/GraphQL API layer and no Redux/Zustand store** — Convex's `useQuery`/`useMutation`/`useAction` hooks provide both data fetching and realtime subscriptions, and this reactivity is deliberately used as the app's entire event bus (see §7, decision I-40 in `improvements.md`).

```
┌─────────────────────────┐        ┌─────────────────────────┐
│   Web (Vite/React/TS)   │        │  Native shell (Capacitor)│
│   served by nginx       │        │  Android (+ iOS)          │
└────────────┬─────────────┘        └────────────┬─────────────┘
             │            same web bundle          │
             └───────────────────┬──────────────────┘
                                  │ useQuery/useMutation/useAction
                                  ▼
                    ┌───────────────────────────┐
                    │   Convex backend           │
                    │   (src/convex/)             │
                    │  - schema.ts (DB)           │
                    │  - queries/mutations/actions│
                    │  - cron jobs                │
                    │  - auth (@convex-dev/auth)  │
                    └──────────┬──────────┬───────┘
                               │          │
                       Twilio SMS   @vly-ai/integrations
                     (bookings/     (Freebuff platform:
                      reminders)     AI/email/payments —
                                     wired, not yet used
                                     in domain code)
```

## 2. Tech Stack

**Frontend**
- Vite 7 + React 19 + TypeScript 5.9
- React Router v7 (`react-router`, not `react-router-dom`), all routes lazy-loaded
- Tailwind CSS v4 via `@tailwindcss/vite` plugin
- Shadcn UI ("new-york" style, `components.json`), ~54 primitives in `src/components/ui/`, built on Radix UI
- react-hook-form + zod for forms/validation, recharts for charts, framer-motion for animation, sonner for toasts

**Backend**
- Convex 1.30 (reactive DB + serverless functions), functions located at `src/convex/` (overridden via `convex.json`'s `"functions": "src/convex/"`, not the Convex default `convex/`)
- `@convex-dev/auth` for authentication
- `schemaValidation: false` set intentionally in `schema.ts`

**Mobile**
- Capacitor 8 (`@capacitor/core`, `android`, `ios`, `cli`) — appId `com.kamix.app`
- No native plugins beyond core Capacitor (no camera/push packages present yet)

**Tooling:** ESLint 9 flat config + typescript-eslint, Prettier 3.7

## 3. Directory Layout

```
src/
├── main.tsx                # Router + ConvexAuthProvider + error boundaries (real entry point)
├── convex/                 # ALL backend code lives here (not top-level convex/)
│   ├── schema.ts            # DB schema (source of truth, see §4)
│   ├── auth.ts, auth.config.ts, auth/emailOtp.ts   # DO NOT MODIFY (per README)
│   ├── restaurants.ts, bookings.ts, availability.ts, slotRules.ts,
│   │   dining.ts, waitlist.ts, notifications.ts, reviews.ts, socialize.ts,
│   │   queue.ts, demoRules.ts, reminders.ts, sms.ts, seed.ts, users.ts,
│   │   uploads.ts, validation.ts, helpers.ts, http.ts
│   └── _generated/          # Convex codegen
├── pages/                   # Route-level screens
├── components/              # Feature components (OwnerXTab, DiningDialog, SocializeDialog, shells)
│   └── ui/                  # Shadcn primitives
├── hooks/                   # use-auth.ts, use-mobile.ts
├── lib/                     # format.ts, menu.ts, seating.ts, slotgen.ts, utils.ts, vly-integrations.ts
└── assets/

android/    # Capacitor-generated native Android project
apk/        # Checked-in build artifact (kamix-debug.apk)
docker/     # convex-entrypoint.sh, render-entrypoint.sh, supervisord.conf
scripts/    # seed.sh, wipe.sh, deploy-render.sh, mobile-local.sh, mobile-hosted.sh
docs/       # REQUIREMENTS.md (SRS), ARCHITECTURE.md (this file)
```

Root-level companion docs (outside `docs/`): `README.md` (setup/build instructions), `integrations.md` (Vly usage guide), `tests.md` (acceptance test suite/status), `improvements.md` (roadmap + architecture decisions).

## 4. Data Model (`src/convex/schema.ts`)

| Table | Purpose | Key indexes |
|---|---|---|
| `users` | Extends Convex Auth's `authTables`; role (admin/user/member/customer/owner), phone, onboarded flag, prefs, favorites | `email` |
| `restaurants` | Venue profile: owner, name, cuisine, address/city/neighborhood, features, cancellation policy | `by_owner`, `by_city`, full-text `search_name` |
| `sections` | Seating zones (inside/outside/bar, smoking, capacity) | `by_restaurant` |
| `hours` | Weekly opening-hours template | `by_restaurant` |
| `slots` | Atomic capacity ledger (date/time/total/remaining/closed) — booking-engine core | `by_restaurant_date`, `by_section_date` |
| `slotRules` | Owner-defined recurring service windows | `by_restaurant` |
| `customSlots` | One-off event slots | `by_restaurant`, `by_restaurant_date` |
| `menus` / `menuItems` | Menu structure, pricing, tags/allergens, image storage | by menu/restaurant |
| `bookings` | Reservation record (status, code, guests, check-in) | `by_user`, `by_restaurant`, `by_restaurant_date`, `by_code` |
| `bookingQueue` | FIFO queue that prevents overbooking | `by_user`, `by_slot` |
| `waitlist` | Waitlist entries | `by_restaurant_date`, `by_user` |
| `notifications` | Booking/dining event notifications | 4 indexes |
| `reviews` | 1–5 rating tied to a booking | `by_restaurant`, `by_user`, `by_booking` |
| `dineOrders` | Dine-in ordering | 3 indexes |
| `assistRequests` | Waiter-call pings (water/bill/help/etc.) | 3 indexes |
| `menuRequests` | Off-menu item requests | 3 indexes |
| `giftTypes`, `dinerPresence`, `giftDeliveries` | "Socialize" diner-to-diner gifting feature | various |

## 5. Backend Functions (by file)

- **restaurants.ts** — search/get/listMine/create/update/remove, sections CRUD, hours, menu/menuItem CRUD, demo claiming
- **bookings.ts** — createBooking, byCode, myBookings, byRestaurant, stats, cancelBooking, updateStatus, confirmGuest
- **availability.ts** — `SLOT_STEP_MINUTES = 30`; ensureForDate/forDate/summary/setSlotClosed
- **slotRules.ts** — list/previewWeek/saveRule/deleteRule, custom slots
- **waitlist.ts** — join/myWaitlist/cancel/byRestaurant
- **notifications.ts** — sendForBooking, myAlerts, forRestaurant, unreadCount, markRead(All)
- **dining.ts** — checkIn, placeOrder, order status, billForBooking, assist requests, menu requests, `openCounts`
- **socialize.ts** — presence/visibility, gift catalog, sendGift, deliveries
- **reviews.ts** — create/listForRestaurant/myReviewable
- **queue.ts** — `enqueue` + `processSlot` (internal mutation) — the FIFO no-overbooking engine
- **sms.ts** — Twilio actions: booking confirmation, reminder, waitlist SMS
- **demoRules.ts** / **seed.ts** — demo-data lifecycle (seed, retrofit, wipe, reset)
- **users.ts** — currentUser, onboard, updateProfile, favorites
- **uploads.ts** — `generateUploadUrl` (Convex file storage action)
- **validation.ts** — zod schemas for all mutation/action args
- **http.ts** — wires `auth.addHttpRoutes()`

**⚠️ Known gap:** `reminders.ts` is currently a 0-byte empty file, but the daily cron job (`booking-reminders`, 10:00 UTC) targets `reminders:sendTomorrowReminders`. This cron is effectively broken/unimplemented until that file is filled in.

## 6. Auth

- `@convex-dev/auth` with two sign-in paths:
  1. **Anonymous** provider
  2. **Email OTP** (`src/convex/auth/emailOtp.ts`) — 6-digit code, 15 min expiry, delivered via `https://auth.freebuff.app/send_otp`
- **Federated auth**: `auth.config.ts` also trusts RS256 JWTs issued by `freebuff.com` (JWKS at `/api/web/.well-known/jwks.json`), so a user already signed into the Freebuff/Vly platform can carry identity into Kamix without a separate login. Issuer overridable via `VLY_CONVEX_AUTH_ISSUER`.
- `auth.ts`, `auth.config.ts`, and `auth/emailOtp.ts` are explicitly flagged **do-not-modify** in the README/file comments.

## 7. Realtime / Event Bus Design Decision

Documented in `improvements.md` (I-40): Socket.io was evaluated and **rejected**. Convex's reactive `useQuery` subscriptions serve as the entire realtime transport — introducing Socket.io would add a redundant auth/transport surface and conflict with Convex's optimistic-concurrency model, which is required to preserve the atomic no-overbooking guarantee (see §8).

## 8. Booking Engine — No-Overbooking Guarantee

The core architectural invariant of the app: `slots` acts as an atomic capacity ledger, and `bookingQueue` + `queue.ts` (`enqueue` / `processSlot`) implement a FIFO queue so concurrent booking requests for the same slot cannot exceed remaining capacity. This is verified in `tests.md` (test C-5: 4 simultaneous requests for 1 remaining seat → exactly 2 succeed, 2 fail).

## 9. Frontend Routing (`src/main.tsx`, react-router v7, all lazy-loaded)

| Route | Screen | Access |
|---|---|---|
| `/` | Landing | public |
| `/auth` | Auth (redirects to `/dashboard`) | public |
| `/dashboard` | Dashboard (role router → customer/owner workspace) | protected |
| `/explore` | Explore (search/discovery) | protected |
| `/restaurant/:id` | RestaurantDetail | protected |
| `/bookings` | MyBookings | protected |
| `/account` | Account | protected |
| `/owner` | OwnerDashboard | protected |
| `/owner/restaurant/:id` | OwnerRestaurant | protected |
| `/invite/:code` | Invite (group-booking confirm flow) | protected |
| `*` | NotFound | — |

All protected routes wrapped by `<RequireAuth>`, which redirects to `/auth?returnTo=...`.

## 10. Mobile (Capacitor)

- `capacitor.config.ts`: appId `com.kamix.app`, `webDir: dist`, local-vs-hosted mode toggled by `KAMIX_LOCAL` (http+mixed-content for local dev vs https for hosted backend). The same web bundle runs in-browser and in the native shell; `VITE_CONVEX_URL` is baked in at build time.
- `android/` is a standard Capacitor-generated Gradle project with only the core Capacitor Android plugin wired — no camera/push/etc. native plugins yet.
- iOS build requires macOS/Xcode (no Docker/Linux path, per Apple licensing).
- Some referenced build scripts (`build-apk.sh`, `build-ios.sh`, `build-mobile.sh`) are documented in README but not present in `scripts/` — treat as a known gap.

## 11. Deployment Topologies

Three surfaces are defined, serving different purposes:

1. **`docker-compose.yml`** — local/self-hosted stack: `convex` service (self-hosted Convex via `Dockerfile.convex`, port 3210), `web` service (nginx-served production build, port 5173→80, depends on convex health), `dev` profile (hot-reload Vite dev server, port 5174).
2. **`render.yaml`** — Render Blueprint deploying *only* the Convex backend (`Dockerfile.convex`) as `convex-kamix`, with `VLY_CONVEX_AUTH_ISSUER=https://freebuff.com`.
3. **`Dockerfile.render`** — combined single-container image (frontend build + Convex backend + nginx), orchestrated by `docker/supervisord.conf` and `docker/render-entrypoint.sh`.

**Important:** the Dockerfiles primarily serve the frontend. The production backend is expected to be a hosted Convex deployment reachable via `VITE_CONVEX_URL`; the Docker/Render Convex services exist mainly for self-hosting/dev, not as the primary production backend path.

`nginx.conf`: SPA fallback (`try_files … /index.html`), gzip, long-cache immutable headers for hashed `/assets/`.

## 12. External Integrations

| Integration | Where | Status |
|---|---|---|
| Twilio SMS | `src/convex/sms.ts` (actions) | Active — booking confirmations, day-before reminders, waitlist notices. No-ops gracefully if env vars unset. |
| `@vly-ai/integrations` (Freebuff/Vly platform: AI completions, email, Stripe-like payments) | documented in `integrations.md`, available via `VLY_INTEGRATION_KEY` | Wired but **not used** in any domain code yet — reserved for Tier 2 roadmap (Stripe payments, AI concierge). Must only be called from Convex actions with `"use node"`; key never exposed client-side. |
| Freebuff auth federation | `auth.config.ts` | Active — see §6 |
| Email OTP delivery | `src/convex/auth/emailOtp.ts` → `https://auth.freebuff.app/send_otp` | Active, do-not-modify |

## 13. Environment Variables

```
VITE_CONVEX_URL          # Convex deployment URL (client, build-time)
TWILIO_ACCOUNT_SID       # Twilio SMS
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
VLY_INTEGRATION_KEY      # Optional Vly/Freebuff gateway key (AI/email/payments)
CONVEX_SITE_URL          # Auth issuer self-reference (docker-compose/render)
VLY_CONVEX_AUTH_ISSUER   # Federated auth issuer, defaults to https://freebuff.com
VLY_APP_NAME             # Optional, used in OTP email template
KAMIX_LOCAL              # Capacitor build-time flag: local vs hosted backend
KAMIX_RELEASE, KAMIX_KEYSTORE_FILE, KAMIX_KEYSTORE_PASS,
KAMIX_KEY_ALIAS, KAMIX_KEY_PASS   # Android release signing
KAMIX_IOS_DEST           # iOS build destination override
```
Convex-managed auth env vars (JWKS, JWT_PRIVATE_KEY, SITE_URL) are set by the Convex deployment itself, not `.env`.

## 14. Known Gaps / Flags

1. `src/convex/reminders.ts` is empty but wired into a daily cron — day-before SMS reminders likely silently fail.
2. Several build/test scripts referenced in README/`tests.md` (`build-apk.sh`, `build-ios.sh`, `build-mobile.sh`, `test-backend.mjs`, `test-ui-flows.mjs`) are not present in `scripts/`.
3. `@vly-ai/integrations` is available infrastructure but unused in domain code — active only when Tier 2 features (payments, AI concierge) are built.
4. Root-level stray files (`main.ts`, `vly-toolbar-readonly.tsx`) are dev-tool artifacts, unrelated to the real entry point `src/main.tsx`.

## 15. Related Documents

- `docs/REQUIREMENTS.md` — full SRS: personas, functional/non-functional requirements
- `README.md` — setup and build instructions
- `integrations.md` — Vly/Freebuff integration usage guide
- `tests.md` — acceptance test suite and pass/fail status
- `improvements.md` — feature roadmap and architecture decision log (Tier 1/2/3)
