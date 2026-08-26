# Kamix Production Action Plan

## Phase 1: Deploy & Fix
- [x] 1.1 Run `npm run convex:deploy` and fix any deployment errors
- [x] 1.2 Fix the admin Customers page error (OwnerCustomersTab)
- [x] 1.3 Verify all admin pages load without errors

## Phase 2: Production Cleanup
- [x] 2.1 Remove test/debug scripts from `scripts/` (keep only seed.sh, wipe.sh, deploy-render.sh, mobile-*.sh)
- [x] 2.2 Remove `testScenario.ts` from convex (demoRules.ts kept — used by seed.ts)
- [x] 2.3 Remove `admin-results-mobile.html` and other debug artifacts
- [x] 2.4 Clean up `package.json` — remove debug/test scripts
- [x] 2.5 Review and clean unused imports across the codebase

## Phase 3: Mobile Packaging
- [x] 3.1 Build the web app for production
- [x] 3.2 Sync Capacitor with `npx cap sync`
- [x] 3.3 Build Android APK (`./gradlew assembleDebug` or release)
- [ ] 3.4 Build iOS app (Xcode archive)

## Phase 4: Stress Test Seed
- [x] 4.1 Review existing seed.ts structure
- [x] 4.2 Create `stressSeed.ts` with 100k users + 1000 restaurants
- [x] 4.3 Add `npm run seed:stress` script to package.json
- [x] 4.4 Test stress seed runs without errors

## Phase 5: README Update
- [x] 5.1 Update README with current project structure
- [x] 5.2 Document all new features (Socialize controls, soft gate, admin filters)
- [x] 5.3 Add stress test instructions
- [x] 5.4 Update deployment instructions

## Progress
| Phase | Status |
|-------|--------|
| 1. Deploy & Fix | ✅ Done |
| 2. Cleanup | ✅ Done |
| 3. Mobile | ✅ Android done, iOS pending |
| 4. Stress Seed | ✅ Done |
| 5. README | ✅ Done |
| 6. Audit log stats | ✅ Done |
| 7. Socialize security | ✅ Done |
