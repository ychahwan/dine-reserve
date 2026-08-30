import { test } from "@playwright/test";

const CONVEX_URL = "https://canny-leopard-341.convex.cloud";

test("create customer 2", async ({ page, browser }) => {
  // Login as admin
  await page.goto("/auth");
  const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
  await phoneInput.fill("+96176683661");
  await phoneInput.press("Enter");
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await passwordInput.waitFor({ timeout: 15000 });
  await passwordInput.fill("BeityAdmin2026!");
  const submitBtn = page.getByRole("button", { name: /sign in/i }).first();
  await submitBtn.click();
  await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Extract token from localStorage
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes("convex") || key.includes("auth") || key.includes("Auth"))) {
        try {
          const val = localStorage.getItem(key);
          if (val && val.includes("eyJ")) {
            const parsed = JSON.parse(val);
            return parsed?.state?.accessToken || parsed?.accessToken || null;
          }
        } catch {}
      }
    }
    return null;
  });

  if (!token) throw new Error("No admin token found");

  // Create customer 2
  const resp = await page.evaluate(async ({ url, token }) => {
    const r = await fetch(`${url}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        path: "testHelpers:seedTestUser",
        args: { phone: "+19990002222", name: "Test Customer 2", password: "TestPass123!", role: "customer" },
        format: "json",
      }),
    });
    return r.json();
  }, { url: CONVEX_URL, token });

  console.log("Customer 2 created:", JSON.stringify(resp));
});
