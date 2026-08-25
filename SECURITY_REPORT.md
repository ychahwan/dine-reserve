# 🔒 Security Scan Report — Kamix

**Scan Date:** August 25, 2026  
**Tools Used:** npm audit, Trivy, manual code analysis  
**Scanner Version:** Trivy v0.74.0, npm audit

---

## 📊 Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 **Critical** | 2 | Requires immediate action |
| 🟠 **High** | 5 | Should be fixed soon |
| 🟡 **Moderate** | 4 | Should be addressed |
| ⚪ **Low** | 0 | — |

---

## 🔴 CRITICAL Vulnerabilities (2)

### 1. `@auth/core` ≤ 0.41.2 — Multiple Auth Bypass Vulnerabilities

| Field | Detail |
|-------|--------|
| **Package** | `@auth/core` (dependency of `@convex-dev/auth`) |
| **Severity** | CRITICAL |
| **Versions Affected** | ≤ 0.41.2 |
| **Impact** | Auth bypass, session hijacking |

**Advisories:**
- **GHSA-7rqj-j65f-68wh**: Email normalizer validates before Unicode normalization — allows account takeover
- **GHSA-xmf8-cvqr-rfgj**: `getToken()` throws uncaught exception on malformed Bearer authorization
- **GHSA-x445-f3h2-j279**: OAuth state/nonce/PKCE cookies not bound to provider — CSRF bypass

**Fix:**
```bash
npm update @auth/core @convex-dev/auth
# or
npm install @convex-dev/auth@latest
```

### 2. `@convex-dev/auth` ≤ 0.0.93

| Field | Detail |
|-------|--------|
| **Package** | `@convex-dev/auth` |
| **Severity** | CRITICAL |
| **Impact** | Inherits vulnerabilities from `@auth/core` |

**Fix:** Update to latest version:
```bash
npm install @convex-dev/auth@latest
```

---

## 🟠 HIGH Vulnerabilities (5)

### 3. `brace-expansion` ≤ 1.1.17 / 4.0.0–5.0.8 — DoS

| Field | Detail |
|-------|--------|
| **Package** | `brace-expansion` |
| **Severity** | HIGH |
| **Advisories** | GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 |
| **Impact** | Denial of Service via exponential-time regex |

**Fix:**
```bash
npm update brace-expansion
```

### 4. `js-yaml` 4.0.0–4.3.0 — Quadratic CPU

| Field | Detail |
|-------|--------|
| **Package** | `js-yaml` |
| **Severity** | HIGH |
| **Advisory** | GHSA-5p4m-2wfm-xmqj |
| **Impact** | DoS via `!!omap` resolution |

**Fix:**
```bash
npm update js-yaml
```

### 5. `nanoid` ≤ 3.3.17 — Infinite Loop

| Field | Detail |
|-------|--------|
| **Package** | `nanoid` |
| **Severity** | HIGH |
| **Advisories** | GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8 |
| **Impact** | Infinite loop in non-secure generators |

**Fix:**
```bash
npm update nanoid
```

### 6. `postcss` ≤ 8.5.22 — Path Traversal

| Field | Detail |
|-------|--------|
| **Package** | `postcss` |
| **Severity** | HIGH |
| **Advisories** | GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 |
| **Impact** | Path traversal via sourceMappingURL |

**Fix:**
```bash
npm update postcss
```

### 7. `react-router` 7.12.0–7.18.1 — CSRF Bypass

| Field | Detail |
|-------|--------|
| **Package** | `react-router` |
| **Severity** | HIGH |
| **Advisory** | GHSA-qwww-vcr4-c8h2 |
| **Impact** | RSC Mode CSRF bypass allows action execution |

**Fix:**
```bash
npm update react-router
```

---

## 🟡 MODERATE Vulnerabilities (4)

### 8. `@capacitor/cli` — Nightly Build Issues

| Field | Detail |
|-------|--------|
| **Package** | `@capacitor/cli` |
| **Severity** | MODERATE |
| **Impact** | Build tool vulnerabilities |

### 9. `hono` ≤ 4.12.33 — Multiple Issues

| Field | Detail |
|-------|--------|
| **Package** | `hono` |
| **Severity** | MODERATE |
| **Advisories** | GHSA-8j4g-w8fx-2239, GHSA-f23p-vx2j-j53r, GHSA-79qm-7rj5-m7r9, GHSA-54fx-42gc-7vw4 |
| **Impact** | ReDoS, SSR data leak, header leak, DoS |

### 10. `uuid` < 11.1.1 — Buffer Bounds Check

| Field | Detail |
|-------|--------|
| **Package** | `uuid` |
| **Severity** | MODERATE |
| **Impact** | Missing buffer bounds check |

### 11. `xcode` ≥ 0.9.2

| Field | Detail |
|-------|--------|
| **Package** | `xcode` |
| **Severity** | MODERATE |
| **Impact** | iOS build tool vulnerability |

---

## 🏗️ Code-Level Security Findings

### 12. 🔴 Hardcoded Keystore Passwords

| Field | Detail |
|-------|--------|
| **File** | `android/app/build.gradle` |
| **Severity** | CRITICAL |
| **Lines** | 22, 24 |
| **Issue** | `storePassword 'kamix123'` and `keyPassword 'kamix123'` hardcoded |

**Impact:** Anyone with repo access can sign APKs as your app.

**Fix:**
```gradle
// Use environment variables instead
signingConfigs {
    release {
        storeFile file('../keystores/kamix-release.jks')
        storePassword System.getenv("KAMIX_KEYSTORE_PASS")
        keyAlias System.getenv("KAMIX_KEY_ALIAS")
        keyPassword System.getenv("KAMIX_KEY_PASS")
    }
}
```

### 13. 🟡 XSS in Chart Component

| Field | Detail |
|-------|--------|
| **File** | `src/components/ui/chart.tsx:83` |
| **Severity** | LOW |
| **Issue** | `dangerouslySetInnerHTML` usage |

**Risk:** Low — this is from Shadcn UI and only renders trusted CSS content.

### 14. ✅ No eval/Function Usage

No `eval()` or `new Function()` found — good.

### 15. ✅ No SQL Injection

Convex uses typed queries — no SQL injection risk.

### 16. ✅ No Unsafe Redirects

`window.location` usage is safe and context-appropriate.

### 17. ✅ Secrets Not in Source Code

No hardcoded API keys, tokens, or passwords found in TypeScript source files.

### 18. ✅ .env Protected

`.env` is properly listed in `.gitignore` and not tracked in git.

---

## 🛠️ Remediation Plan

### Priority 1: Immediate (Critical)

```bash
# 1. Update auth packages
npm install @convex-dev/auth@latest

# 2. Move keystore passwords to environment variables
# Edit android/app/build.gradle to use System.getenv()

# 3. Rotate keystore passwords
keytool -changealias -alias kamix -newalias kamix-new \
  -keystore android/keystores/kamix-release.jks
```

### Priority 2: This Week (High)

```bash
# Update all vulnerable packages
npm update brace-expansion js-yaml nanoid postcss react-router
# or
npm audit fix
```

### Priority 3: This Month (Moderate)

```bash
# Update remaining packages
npm update hono uuid @capacitor/cli
```

---

## ✅ Security Strengths

| Area | Status |
|------|--------|
| **Auth** | Convex Auth with OTP — properly implemented |
| **Environment** | `.env` protected from git |
| **Backend** | Convex typed queries — no SQL injection |
| **Frontend** | No eval/Function, minimal dangerouslySetInnerHTML |
| **Secrets** | No hardcoded API keys in source |
| **Dependencies** | Most packages up to date |
| **Android** | Signing config present, APK signed |

---

## 📝 Recommendations

1. **Rotate keystore passwords** — Change from `kamix123` to strong passwords
2. **Set up Dependabot** — Auto-PRs for vulnerable dependencies
3. **Add security headers** — CSP, X-Frame-Options, etc.
4. **Enable ProGuard** — Obfuscate Android APK code
5. **Add rate limiting** — Already have `rateLimits` table — ensure it's enforced
6. **Review Convex permissions** — Ensure all mutations validate `userId`

---

*Report generated by: npm audit + Trivy v0.74.0 + manual code analysis*
