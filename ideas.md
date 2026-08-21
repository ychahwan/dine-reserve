# Ideas — Kamix Feature Roadmap

Innovative features and improvements, organized by impact and implementation complexity.

**Status legend:** ✅ Done · 🚧 In progress · ⏳ Deferred (needs external infra / bigger milestone)

---

## 🔥 High Impact, Medium Effort

### 1. AI-Powered Smart Reservations — ✅ DONE
**What:** An AI concierge that suggests the best time, restaurant, and seating based on the diner's history, preferences, and real-time availability.

**Implemented:**
- `src/convex/ai.ts` → `ai.recommendDinner` action: reads the diner's bookings/orders/reviews/favorites/prefs + all restaurants, builds a bounded context pack (<8k tokens, no PII), calls Gemini, returns ranked recommendations with one-line "why"
- `src/components/AiConcierge.tsx`: floating concierge on Explore with quick prompts + recommendation cards
- Live test script: `scripts/test-ai-concierge.mjs` (8/8 checks)
- **Needs:** a valid `GEMINI_API_KEY` (`AIza...` format) in `.env` + deployed to Convex. The key currently in `.env` (`AQ.Ab8R...`) is the wrong format.

**Tech:** Google ADK agent + Convex real-time queries. The agent reads `bookings`, `reviews`, `restaurants`, `slots`, `users.prefs` and generates personalized recommendations.

---

### 2. Socialize 2.0 — Diner-to-Diner Matchmaking — ✅ DONE (Taste Twins)
**What:** Beyond gifting — help diners connect with others who share their tastes.

**Implemented (Taste Twins):**
- `src/convex/socialize.ts` → `socialize.tasteTwins` query: among visible diners at the same restaurant, scores pref overlap (dietary/seating/occasions) 0–100, returns top matches with shared tags
- `src/components/SocializeDialog.tsx`: "Your taste twins" section in the room tab with match % badges
- Same privacy model as the room (only visible diners at a restaurant you're attending today)

**Not yet built (needs design decisions):** Table Talk (anonymous pre-dinner chat), Group Builder (solo diners posting for company).

**Privacy:** All interactions are opt-in, ephemeral, and restaurant-scoped.

---

### 3. Real-Time Wait Time Intelligence — ✅ DONE
**What:** Show diners the actual current wait time at each restaurant, not just availability.

**Implemented:**
- `src/convex/analytics.ts`:
  - `analytics.waitTimes` (owner): avg late-arrival minutes, avg seat time (check-in → completed), no-show rate, friendly summary
  - `analytics.publicWaitSignal` (diner): "~75 min visits" label on Explore cards (only when ≥3 samples — never guesses)
- `src/pages/Explore.tsx`: pace chip on every restaurant card
- `src/components/OwnerInsightsTab.tsx`: "Pace & punctuality" card

**Data source:** The `bookings` table already has all the timestamps needed (`checkedInAt`, `updatedAt` on completion).

---

### 4. Smart Notifications — Contextual Push — ✅ DONE (in-app inbox)
**What:** Contextual, personalized nudges built from real Kamix activity, delivered to an in-app inbox (bell + unread badge) with an optional SMS mirror for time-sensitive types (waitlist freed, booking reminder).

**Built:** `dinerNotifications` table + `dinerNotify` module with 6 nudge types (`favorite_story`, `reengage`, `guest_joined`, `review_nudge`, `waitlist_freed`, `booking_reminder`), deduped by stable key. Hooks fire from `stories.post`, `confirmGuest`, booking completion, `releaseBooking`, plus a daily cron (`dailyNudges`) for lapsed-diner re-engagement and review nudges. UI: `/notifications` feed page + bell with unread badge in the customer shell.

**Remaining for real push:** device push (FCM/APNs via Capacitor) — the inbox engine is the data layer it would hook into.

**Examples:**
- "Trullo is 10 min walk from your office — book for 12:30..."
- "It's been 3 weeks since you last dined at Sakura — they have a new tasting menu"
- "Your friend Alex just booked at Trullo for Saturday — want to join?"

---

### 5. Restaurant Analytics Dashboard 2.0 — ✅ DONE
**What:** Transform the basic Insights tab into a full business intelligence tool.

**Implemented:** `src/convex/analytics.ts` → `analytics.analytics2` + expanded `OwnerInsightsTab`:
- **Revenue projection:** covers × avg spend per cover (from dine-in orders)
- **Peak hour heatmap:** day-of-week × hour density grid
- **Customer lifetime value:** top 10 diners by visits + spend ("Your regulars" + VIP badge)
- **Repeat visit rate:** % of diners returning in the window
- **AI sentiment/review analysis:** folded into the AI operations advisor (Idea #12)
- **Competitive positioning:** not yet (needs cross-restaurant city aggregates)

---

## 💡 Medium Impact, Low Effort

### 6. Booking Confirmation Receipt (PDF) — ✅ DONE
**What:** Auto-generate a professional booking confirmation as a downloadable PDF with QR code.

**Implemented:** `src/components/BookingReceipt.tsx` — printable receipt dialog from My Bookings ("Receipt" button) with:
- QR code (encodes the public invite/confirmation URL) generated client-side via the `qrcode` package
- Restaurant, date, time, party, table, confirmation code
- Print button (`window.print`) — the dialog hides chrome in print CSS
- Works offline (QR generated in-browser, no network dependency)

---

### 7. Waitlist Priority for VIP Diners — ✅ DONE
**What:** Give priority to diners who have booked frequently, left good reviews, or have high spend.

**Implemented:** `src/convex/waitlist.ts`:
- `vipScore(userId)`: completed bookings ×3 + 4★ reviews ×2 − no-shows ×5
- `notifyWaitlistForFreedSeats` now sorts candidates by (score desc, joined asc) — repeat diners get alerted before casual waiters for the same freed table; everyone else keeps strict FIFO

**Not yet:** 15-minute delayed general notification (needs scheduler timing) and spend-based scoring (needs dine-order linking to waitlist entries).

---

### 8. Restaurant "Story" — Behind-the-Scenes Content — ✅ DONE
**What:** Let owners post short stories/photos about their restaurant.

**Implemented:**
- New `stories` table (restaurantId, text ≤240, emoji, createdAt)
- `src/convex/stories.ts`: `post` / `remove` / `mine` (owner) + `recent` / `forRestaurant` (public feed)
- `src/components/OwnerStoriesTab.tsx`: composer + list, wired as a "Stories" tab in the owner console
- `src/pages/Explore.tsx`: "Fresh from the kitchens" horizontal feed
- `src/pages/RestaurantDetail.tsx`: stories strip on the restaurant page

**Not yet:** image upload, favorited-diner push notifications.

---

### 9. Multi-Language Support (i18n) — ✅ DONE (v1: EN/AR/FR diner app)
**Built:** i18next + react-i18next; `en.json` / `ar.json` / `fr.json` (407 keys each), auto-detect (localStorage → browser) with English default, full **RTL flip** for Arabic (`dir=rtl`), and a language switcher (globe menu) on the Landing nav, Auth header, and customer shell. Translated the whole diner surface: Landing, Auth (phone→OTP→password→reset), onboarding, customer nav, Notifications, Set-password, Explore (filters/quick-find/cards), Account (profile/security/prefs/points), MyBookings (cards/statuses/5 dialogs), and RestaurantDetail (booking panel/menu/reviews/waitlist).

**Remaining:** owner console, admin panel, AI concierge strings, and SMS copy (all English-only for now).
**What:** Arabic + English + French (Lebanon's three main languages).

**Why deferred:** touches every page + RTL layout; best done as a dedicated milestone with a translation pass. High value — doubles the addressable market.

---

### 10. Offline Mode for Booking Codes — ✅ DONE
**What:** Cache the last 5 booking confirmations so diners can show their code even without network.

**Implemented:** `src/pages/MyBookings.tsx`:
- Last 5 confirmed bookings (code, restaurant, date, time) cached in `localStorage` (`kamix:offline-bookings`)
- If the live query is unavailable (offline/loading) and cache exists, an amber "You're offline — showing saved confirmation codes" banner renders the codes

---

## 🚀 High Impact, High Effort

### 11. AI Agent — Diner Personal Concierge — ✅ DONE (via Idea #1)
**What:** A persistent AI agent that knows the diner's full history.

**Status:** the full context-aware recommendation engine is live as the AiConcierge (Idea #1). Remaining: persistent memory across sessions, dietary-goal tracking, auto gift suggestions.

---

### 12. AI Agent — Restaurant Operations Optimizer — ✅ DONE (code, needs key)
**What:** An AI that analyzes the restaurant's data and proposes actionable improvements.

**Implemented:** `src/convex/ai.ts` → `ai.ownerInsights` action:
- Reads real stats, analytics2, wait times, recent orders and review samples for the restaurant
- Sends a bounded data pack to Gemini; returns `{ summary, insights[] }` with priority levels
- `OwnerInsightsTab` "AI operations advisor" card: run button, priority badges, action copy
- Fails gracefully with a clear message when `GEMINI_API_KEY` is missing
- **Needs:** valid `GEMINI_API_KEY` in `.env` + deployed (same key as Idea #1)

---

### 13. Smart Pricing (Dynamic Cover Charges) — ⏳ DEFERRED
**What:** Let restaurants set dynamic pricing based on demand.

**Why deferred:** no billing/payment layer exists yet; cover-charge pricing needs a payment provider integration first. The `slotRules` table is ready to host per-window pricing deltas once billing lands.

---

### 14. Gift Marketplace — ⏳ DEFERRED
**What:** Expand Socialize gifts beyond the restaurant's catalog to a city-wide gift marketplace.

**Why deferred:** needs partner onboarding (florists, chocolatiers, wine shops) + delivery logistics + merchant payouts.

---

### 15. Reservation Marketplace (Resale) — ✅ DONE
**What:** Let diners transfer or release their confirmed reservations when plans change.

**Implemented:**
- `src/convex/bookings.ts` → `bookings.releaseBooking`: diner releases a confirmed booking → seats return to the pool + waitlist is notified instantly (SMS), owner sees "Diner released the table back to the pool"
- `src/pages/MyBookings.tsx`: amber "Release" button on upcoming bookings with a confirm dialog
- Transfer-to-friend already exists via the invite link (`confirmGuest`)

---

## 🧪 Experimental / Moonshot

### 16. AR Restaurant Preview — ⏳ DEFERRED
**What:** Use AR (via the mobile app) to preview a restaurant's ambiance before booking.

**Why deferred:** needs 360° photo capture pipeline + AR rendering; a moonshot.

---

### 17. Voice Booking via WhatsApp/SMS — ⏳ DEFERRED
**What:** Book a table by sending a WhatsApp message to a Kamix bot.

**Why deferred:** needs WhatsApp Business API access + approval; the NLU side can reuse Google ADK once available.

---

### 18. Loyalty Program — Kamix Points — ✅ DONE
**What:** Earn points for bookings, reviews, and Socialize activity.

**Implemented:**
- `users.points` field + new `loyaltyLedger` table (idempotent per-source credits — a booking can never be double-awarded)
- `src/convex/loyalty.ts`: `awardPoints` (shared), `myBalance` (points + activity feed), `leaderboard` (admin)
- Points awarded: +50 completed booking (bookings.updateStatus), +20 review (reviews.create), +10 gift sent (socialize.sendGift), +5 check-in (dining.checkIn)
- `src/pages/Account.tsx`: "Kamix Points" card with balance + recent activity

**Not yet:** redemption catalog (priority waitlist, discounts) — the ledger is ready to back it.

---

### 19. Restaurant Collaboration Events — ⏳ DEFERRED
**What:** Enable two restaurants to co-host events.

**Why deferred:** needs cross-restaurant event + revenue-split model; multi-restaurant booking flow.

---

### 20. Predictive Availability — ✅ DONE
**What:** Show "Predicted availability" for dates 2+ weeks out based on historical patterns.

**Implemented:** `src/convex/analytics.ts` → `analytics.predict`:
- Looks at the same weekday over the past 12 weeks (booked covers / capacity)
- Returns `likelySoldOut` % + a human message ("85% likely to sell out — book early")
- `src/pages/RestaurantDetail.tsx`: prediction banner on far-out dates (beyond the 14-day slot window), color-coded by risk
- Honest heuristic — clearly labeled as a prediction based on N past weeks

---

*Each idea is scoped for a specific milestone. Prioritize by user impact and implementation complexity.*
