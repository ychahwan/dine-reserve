# Suggested Followups — Backlog

Ideas and next steps suggested during previous rounds, kept here so they can be picked up later. Cross out or move items to a done list once implemented.

## From Idea #9 (i18n) round
- [ ] **Extend i18n to the owner console + admin panel** — OwnerDashboard, OwnerRestaurant tabs, AdminShell pages are still English-only
- [ ] **Translate the AI concierge + quick prompts** and the SMS/notification copy (in-app copy already localized)
- [ ] **Add RTL-aware polish** — check paddings/icons flipping correctly in Arabic on small screens
- [ ] **Add a locale-aware date/number formatter** (Arabic-Indic numerals, Arabic month names in the date strip)

## From Idea #4 (Smart Notifications) round
- [ ] **Implement Idea #5: Analytics Dashboard 2.0** — revenue projections, peak-hour heatmaps, customer lifetime value (Note: largely built already in the Insights tab; remaining polish listed in ideas.md)
- [ ] **SMS-only booking reminder cron** — text diners the day before their booking via Twilio (in-app reminder exists; SMS mirror is the gap)
- [ ] **Browser-check the notification bell UI** for all profiles (diner, owner, admin)

## From earlier rounds
- [ ] **Test the owner-side AI ops advisor in the browser** — Trullo → Insights → "Run AI analysis" (browser-level coverage for the second AI feature)
- [ ] **Fix the two demo-restaurant ownership quirks** — admin's OTP sign-in landing on a different user; demo owners (Marco, etc.) have no phone-auth accounts so their login creates empty users
- [ ] **Device push (FCM/APNs via Capacitor)** — the real push layer that the in-app inbox engine would plug into

## Backlog of deferred ideas (full detail in ideas.md)
- [ ] **#9 Multi-Language Support (i18n)** — Arabic (RTL) + English + French ← in progress
- [ ] **#13 Smart Pricing (Dynamic Cover Charges)** — demand-based pricing; needs a billing layer
- [ ] **#14 Gift Marketplace** — partner florists/chocolatiers for city-wide gift delivery
- [ ] **#16 AR Restaurant Preview** — see dining areas via mobile AR before booking
- [ ] **#17 Voice Booking via WhatsApp/SMS** — WhatsApp Business API + Google ADK
- [ ] **#19 Restaurant Collaboration Events** — cross-restaurant co-hosted events + revenue split
