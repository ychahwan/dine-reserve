# Kamix — Improvements Tracker

Status legend: **Todo** (not started) · **In progress** (being built) · **Done** (shipped & verified) · **Planned** (scoped, not started — needs API keys or future work)

## Tier 1 — Core enrichment (no external services)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| I-01 | Reviews & ratings | Verified-booking 1–5 star reviews + text on restaurant pages; average rating shown on search cards and detail; review entry from My Bookings. | **Done** |
| I-02 | Diner dining profile | Dietary preferences, seating vibe, occasions and favorite restaurants saved to the profile; pre-fills bookings; "For you" section in Explore. | **Done** |
| I-03 | No-show mitigation | Per-restaurant cancellation policy ("free until X hours before"), SMS reminder the day before the booking, no-show tracking. | **Done** |
| I-04 | Owner analytics / insights | Occupancy, covers, no-show & cancellation rates, busiest times, waitlist conversion — new Insights tab. | **Done** |
| I-05 | Dietary search | Filter restaurants by menu tags (vegetarian, vegan, gluten-free, halal…) — search uses the menu attribute data. | **Done** |
| I-06 | Group invites | Share a booking link; friends confirm their seat and the party grows atomically (never overbooks). | **Done** |
| I-07 | Solo-friendly flag + bar-seat shortcut | "Solo-friendly" amenity with filter, plus a one-tap "Book a bar seat" quick action. | **Done** |
| I-08 | Dine-in: confirm arrival | Diner taps "I'm here" on the day of the booking; `checkedInAt` recorded (idempotent); owner's Bookings tab shows the party as **Checked in** live. | **Done** |
| I-09 | At-the-table ordering | Diner orders from the restaurant's live menu inside the booking — no assistant needed. Kitchen status flow (open → preparing → served → completed) with live owner view. | **Done** |
| I-10 | Waiter/manager ping with templates | One-tap request templates (water, bill, order, other) + free text ping the restaurant; owner sees it live and marks it resolved (with timestamp). | **Done** |
| I-11 | Off-menu / special requests | Diner asks for anything not on the menu; the restaurant sees it in a dedicated Requests tab and can mark it fulfilled. | **Done** |
| I-12 | Itemized bill at the table | Persistent itemized bill per booking (lines, quantities, totals, paid flag). Payment via Stripe is the Tier-2 I-20 item — the bill is already shaped for it. | **Done** |
| I-13 | Journey continuity (date carry-over) | Selected date + party size carry over from search into the restaurant detail booking sheet — the date is never asked twice. | **Done** |

## Tier 2 — Needs API keys (payments / notifications / AI)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| I-20 | Pay-at-table & deposits (Stripe) | Diner pays the itemized bill at the table; owner-configurable deposits or prepaid seatings (Tock-style) with refunds; kills no-shows. | Planned |
| I-21 | Push notifications | Booking reminders, waitlist alerts, and dine-in pings beyond SMS (web push / app push). | Planned |
| I-22 | AI dining concierge | Chat-to-book assistant ("table for 4 near Duomo, no shellfish") + owner AI daily brief. | Planned |

## Tier 3 — Later roadmap

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| I-30 | QR menu at the table | Menu at the table via QR, live updates (specials, sold-out items). | Planned |
| I-31 | Loyalty program | Points per visit, rewards, and repeat-diner perks. | Planned |
| I-32 | Private dining & events | Large-party and private-room booking requests. | Planned |
| I-33 | Table floor plans | Visual table map with per-table booking. | Planned |
| I-34 | Multi-language (i18n) | UI + booking flows in multiple languages. | Planned |
| I-35 | POS integration | Two-way sync with restaurant POS systems. | Planned |

## Production readiness — realtime & scale

| ID | Decision | Rationale | Status |
|----|----------|-----------|--------|
| I-40 | Realtime event service = Convex reactive queries | Every live surface (availability, bookings, orders, waiter pings, off-menu requests, notifications) already streams through Convex's built-in realtime subscriptions — the app's event bus. **Socket.io was evaluated and rejected**: it would add a second transport + auth surface with no benefit, fights Convex's optimistic-concurrency model, and cannot scale the write side (atomic no-overbooking guarantees stay in Convex mutations). | **Done** (architecture) |
| I-41 | Scale path to millions of users | Convex serverless autoscaling + regional deployments; DB sharding by city/region (restaurants are naturally partitionable); CDN for static assets; rate limiting + abuse protection on public endpoints; background job queues (SMS/push/email via Convex cron + queue); read replicas for search; pagination + `withIndex` discipline already in place. See the load-test scenario in `tests.md` for the 100-seat concurrent-booking guarantee. | Planned |
| I-42 | Observability | Structured logging per request, error tracking, latency alerts on booking mutations, dashboard for slot-consistency (no-overbooking) enforcement. | Planned |
