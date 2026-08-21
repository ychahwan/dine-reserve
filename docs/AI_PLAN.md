# Kamix AI Agent Plan

## 1. Vision

Turn Kamix from a booking ledger into a *personalized dining companion*. A single
AI layer (built on **Google ADK** + **Gemini**) sits on top of the existing Convex
data and drives three products:

1. **Diner concierge** — proposes a dinner (restaurant + dishes) tuned to each
   diner's history and preferences.
2. **Diner notifications** — proactive, relevant nudges about restaurants and
   menu items the diner is likely to want.
3. **Restaurant coach** — tells a restaurant *what to fix*, backed by its own
   operational data (orders, diner requests, and how fast it resolves them).

## 2. The Three Agents

### 2.1 Diner Concierge ("Where should I eat tonight?")

**Inputs (all already in Convex):** past bookings (restaurant, date, time, party
size, occasion, status), dine-in orders (menu items, customizations, spend),
dining prefs (`users.prefs`: dietary / seating / occasions), favorites, reviews
they wrote, location/city, and time of day.

**Outputs:** a short ranked list of restaurants + specific dishes, each with a
one-line "why" grounded in the diner's history (e.g. *"You ordered the omakase at
Sakura House twice and rated it 5★ — its new Thursday kaiseki matches your
anniversary preference."*).

**Guardrails:** only suggest restaurants with real availability for the requested
party/time; never fabricate — every claim must reference a stored booking, order,
or review; respect dietary prefs as hard filters (allergy tags are never violated).

### 2.2 Diner Notifications (re-engagement)

**Trigger events:** a favorite restaurant adds a menu item matching the diner's
dietary tags; a previously-booked restaurant releases a table at a time the diner
usually books; a cuisine the diner orders repeatedly gets a new restaurant.

**Channel:** SMS first (Twilio is already integrated); web push / FCM later. Every
notification is **opt-in** and frequency-capped (max 1–2/week), with a deep link
straight to the restaurant/dish.

### 2.3 Restaurant Coach ("How do I run better?")

**Inputs:** dine-in orders (item popularity, customizations, cancellations),
diner requests (`assistRequests`, `menuRequests`) and **time-to-resolve**
(`resolvedAt - createdAt`), reviews + ratings, no-show/cancellation rates
(already in `bookings.stats`), busiest seatings, and waitlist conversion.

**Outputs:** prioritized, concrete improvements, e.g. *"Your 8:30 PM seating has a
14% no-show rate — require card holds after 8 PM."* or *"Kitchen takes 22 min
median to serve the 'burger' — it's your most-ordered item; add a second station."*

**Feedback loop:** the restaurant marks a suggestion as "done / rejected", which
feeds back into future suggestions (the agent learns what a given restaurant acts on).

## 3. Architecture (Google ADK + Gemini)

```
Convex (source of truth)
   │  aggregation queries (below)
   ▼
Convex ACTION "ai:recommendDinner" / "ai:restaurantInsights"
   │  builds a JSON "context pack" (no PII, bounded size)
   ▼
Google ADK agent (Node/TypeScript, runs in the Convex action)
   │  tool set: search restaurants, read diner history, check availability
   ▼
Gemini (model)  →  structured JSON response
   │
   ▼
Post-process: re-validate against live Convex data (availability, dietary),
render in the app.
```

- **Why ADK:** it gives us tool-calling, a typed agent loop, and traceability,
  so the agent *queries Convex via tools* instead of us hand-feeding a giant prompt.
- **Why an Action:** Convex actions can call external HTTP (Gemini) safely; the
  heavy, async model call never blocks a mutation.
- **Deterministic fallback:** when `GEMINI_API_KEY` is absent, the action returns
  a rule-based recommendation (top-rated + dietary-matched + previously-visited),
  so the feature never breaks in dev.
- **Caching:** cache results keyed by (userId, inputs hash, 24h) in a table so
  repeated renders don't re-bill the model.

## 4. Data Foundation (build first, before any model call)

New admin/aggregation queries that both the admin app and the agents consume:

- `dinerProfile(userId)` → bookings, order items (with tags/allergens), prefs,
  favorites, reviews, spend, top cuisines, usual times.
- `restaurantIntelligence(restaurantId)` → order-item frequency, customization
  frequency, `assistRequests`/`menuRequests` counts + median/avg time-to-resolve,
  reviews sentiment, no-show/cancellation rates, busiest seatings.
- `recommendationContext(userId, {party, date, time})` → the bounded JSON pack
  handed to the model.

These are **pure queries over existing tables** — no schema change needed for v1.
(The `reviews`, `dineOrders`, `assistRequests`, `menuRequests`, `notifications`,
`bookings.stats` tables/functions already exist.)

## 5. Innovative Ideas (to differentiate)

1. **"Dinner in one tap"** — the concierge returns a *complete* plan (restaurant +
   specific table time + dishes), and a single tap books all of it atomically
   through the existing FIFO queue. The agent proposes; the ledger still enforces.
2. **Allergy-safe ranking** — dietary/allergen tags are *hard constraints* ranked
   by a safety score, not soft suggestions. The agent can *explain* why an item
   is safe ("no nuts in any of the 3 ingredients you'd get").
3. **Occasion memory** — it learns birthdays/anniversaries from `prefs.occasions`
   and past `occasion` fields, then nudges *before* the date with a ready plan.
4. **Restaurant "AI sous-chef"** — from order-item frequency + customizations
   (e.g. "no onions" × 40%), it suggests menu changes ("split the onion-free
   variant into its own item") and demand forecasting per seating.
5. **SLA coaching** — time-to-resolve per `assistRequests` type becomes a weekly
   score; the coach targets the slowest request type with a concrete playbook.
6. **Churn rescue** — a diner with a 5★ review but no booking in 60 days gets a
   personalized "we miss you" nudge with a real incentive (their favorite dish).
7. **Live-ops copilot (later)** — during service, the agent watches incoming
   `assistRequests` and suggests which to route/prioritize when the kitchen is
   backed up (needs a real-time trigger, phase 2).
8. **Menu-item push precision** — only notify when a *new* item matches the
   diner's exact dietary tags + a cuisine they've actually ordered (not just viewed).

## 6. Phased Rollout

| Phase | Scope | Needs key? |
|---|---|---|
| 0 | Aggregation queries + admin app + reviews surfacing | No |
| 1 | `ai:recommendDinner` + `ai:restaurantInsights` actions with deterministic fallback | No (fallback) |
| 2 | Wire Gemini via ADK; add `GEMINI_API_KEY` env; caching + guardrails | Yes |
| 3 | Diner re-engagement notifications (SMS) + restaurant coach UI | Yes |
| 4 | One-tap booking from a recommendation; web push / FCM; live-ops copilot | Yes |

## 7. Env / Config

- `GEMINI_API_KEY` — set via `npx convex env set` (never committed).
- `AI_ENABLED` — kill-switch (default `false` until the key is present), mirroring
  the existing `TWILIO_ENABLED` pattern.
- `AI_CACHE_HOURS` — recommendation cache TTL.

> **Note:** the actual Gemini integration (Phase 2+) is deferred until the
> `GEMINI_API_KEY` is provided. Phases 0–1 are implemented without it.
