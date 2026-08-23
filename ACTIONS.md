# Kamix Production Action Plan

## Phase 1: Deploy & Fix
- [x] 1.1 Run `npm run convex:deploy` and fix any deployment errors
- [x] 1.2 Fix the admin Customers page error (OwnerCustomersTab)
- [x] 1.3 Verify all admin pages load without errors

## Phase 2: Production Cleanup
- [ ] 2.1 Remove test/debug scripts from `scripts/` (keep only seed.sh, wipe.sh, deploy-render.sh, mobile-*.sh)
- [ ] 2.2 Remove `testScenario.ts` and `demoRules.ts` from convex (if not used in prod)
- [ ] 2.3 Remove `admin-results-mobile.html` and other debug artifacts
- [ ] 2.4 Clean up `package.json` — remove debug/test scripts
- [ ] 2.5 Review and clean unused imports across the codebase

## Phase 3: Mobile Packaging
- [ ] 3.1 Build the web app for production
- [ ] 3.2 Sync Capacitor with `npx cap sync`
- [ ] 3.3 Build Android APK (`./gradlew assembleDebug` or release)
- [ ] 3.4 Build iOS app (Xcode archive)

## Phase 4: Stress Test Seed
- [ ] 4.1 Review existing seed.ts structure
- [ ] 4.2 Create `stressSeed.ts` with 100k users + 1000 restaurants
- [ ] 4.3 Add `npm run stress` script to package.json
- [ ] 4.4 Test stress seed runs without errors

## Phase 5: README Update
- [ ] 5.1 Update README with current project structure
- [ ] 5.2 Document all new features (Socialize controls, soft gate, admin filters)
- [ ] 5.3 Add stress test instructions
- [ ] 5.4 Update deployment instructions

## Progress
| Phase | Status |
|-------|--------|
| 1. Deploy & Fix | ✅ Done |
| 2. Cleanup | ✅ Done |
| 3. Mobile | ⏳ Needs local build env |
| 4. Stress Seed | ✅ Done |
| 5. README | ✅ Done |
| 6. Audit log stats | ✅ Done |
| 7. Socialize security | ✅ Done |
