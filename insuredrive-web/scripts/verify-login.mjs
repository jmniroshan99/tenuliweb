// UI regression only. All remote Auth/API requests are intercepted with synthetic
// responses; this does not verify real credentials or hosted Supabase policies.
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const cwd = fileURLToPath(new URL("../", import.meta.url));
const out =
  process.env.TENULI_QA_DIR ||
  fileURLToPath(new URL("../../tmp/login-qa/", import.meta.url));
const production = process.argv.includes("--production");
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    ...(production ? ["preview"] : []),
    "--host",
    "127.0.0.1",
    "--port",
    "4187",
  ],
  { cwd, stdio: ["ignore", "pipe", "pipe"] },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (b) => {
      if (String(b).includes("4187")) resolve();
    });
    server.on("exit", reject);
  });
  await mkdir(out, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: JSON.parse(process.env.CHROMIUM_ARGS_JSON || "[]"),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let attempts = 0,
    mode = "invalid",
    finishPending, logoutFails = false, inactive = false, anonymous = false;
  const profile = {
    id: "00000000-0000-4000-8000-000000009013",
    full_name: "Synthetic Login Staff",
    role: "officer",
    account_status: "active",
    is_active: true,
  };
  const user = {
    id: profile.id,
    aud: "authenticated",
    role: "authenticated",
    email: "login-test@example.invalid",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`;
  await page.routeWebSocket("wss://**", (ws) => ws.close());
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "x-supabase-api-version": "2024-01-01",
          "access-control-expose-headers": "X-Supabase-Api-Version",
        },
        body: JSON.stringify(body),
      });
    if (url.pathname === "/auth/v1/token") {
      attempts++;
      const payload = request.postDataJSON();
      assert.equal(payload.email, "login-test@example.invalid");
      assert.equal(payload.password, " synthetic-ui-password "); // Password whitespace must survive.
      if (mode === "pending")
        await new Promise((resolve) => {
          finishPending = resolve;
        });
      if (mode === "network") return route.abort("failed");
      if (mode !== "success")
        return json(
          {
            code:
              mode === "rate"
                ? "over_request_rate_limit"
                : "invalid_credentials",
            message: "Synthetic test response",
          },
          400,
        );
      return json({
        access_token: token,
        refresh_token: "synthetic-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      });
    }
    if (url.pathname === "/auth/v1/user") return json({...user, is_anonymous: anonymous});
    if (url.pathname === "/auth/v1/logout") return logoutFails ? json({message:"Offline synthetic logout"},503) : json({});
    if (url.pathname === "/rest/v1/profiles")
      return json(
        request.headers().accept?.includes("vnd.pgrst.object")
          ? {...profile, account_status: inactive ? "suspended" : "active"}
          : [profile],
      );
    if (url.pathname === "/rest/v1/rpc/get_effective_permissions")
      return json([{ permission_key: "view_all_vehicles" }]);
    if (url.pathname.startsWith("/rest/v1/")) return json([]);
    return route.abort();
  });
  const response=await page.goto("http://127.0.0.1:4187/?demo=true#demo");
  if(production){
    const headers=response.headers();assert.match(headers["content-security-policy"],/script-src 'self'/);assert.match(headers["content-security-policy"],/frame-ancestors 'none'/);assert.equal(headers["x-content-type-options"],"nosniff");
  }
  assert.equal(await page.getByRole("button",{name:/demo/i}).count(),0);
  assert.equal(await page.locator(".app-layout").count(),0);
  await page.locator(".auth-card").waitFor();
  await page.evaluate(() => document.fonts.ready);
  const email = page.getByLabel("Email address", { exact: true }),
    password = page.getByLabel("Password", { exact: true }),
    submit = page.getByRole("button", { name: "Sign in", exact: true });
  await submit.click();
  assert.equal(attempts, 0);
  assert.equal(await email.evaluate((e) => e.validity.valueMissing), true);
  await email.fill("invalid");
  await password.fill(" synthetic-ui-password ");
  await submit.click();
  assert.equal(attempts, 0);
  assert.equal(await email.evaluate((e) => e.validity.typeMismatch), true);
  await email.fill("login-test@example.invalid");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  assert.equal(await password.getAttribute("type"), "text");
  assert.equal(await password.inputValue(), " synthetic-ui-password ");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  assert.equal(await password.getAttribute("type"), "password");
  await password.press("Enter");
  await page.getByRole("alert").waitFor({ timeout: 10000 });
  await page
    .getByRole("alert")
    .filter({ hasText: "email or password is incorrect" })
    .waitFor({ timeout: 1000 });
  assert.equal(attempts, 1);
  await page
    .getByRole("button", { name: "Switch to Sinhala", exact: true })
    .click();
  assert.match(await page.getByRole("alert").innerText(), /වැරදියි/);
  await page
    .getByRole("button", { name: "Switch to English", exact: true })
    .click();
  mode = "rate";
  await submit.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Too many attempts" })
    .waitFor();
  mode = "pending";
  await submit.click();
  await page
    .getByRole("button", { name: "Signing in…", exact: true })
    .waitFor();
  assert.equal(await email.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: /Open synthetic demo/ }).count(), 0);
  await page.locator("form").evaluate((e) => {
    e.requestSubmit();
    e.requestSubmit();
  });
  assert.equal(attempts, 3);
  mode = "invalid";
  finishPending();
  await page
    .getByRole("alert")
    .filter({ hasText: "email or password is incorrect" })
    .waitFor();
  // Never save a raw password or put it in the URL.
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }).includes(
        "synthetic-ui-password",
      ),
    ),
    false,
  );
  assert.equal(page.url().includes("password"), false);
  await email.fill("");
  await password.fill("");
  await page.getByText("Need help signing in?", { exact: true }).click();
  assert.equal(
    await page
      .getByText("Use your existing Tenuli Auto Care email and password.", {
        exact: false,
      })
      .isVisible(),
    true,
  );
  await page.getByText("Need help signing in?", { exact: true }).click();
  await page
    .getByRole("button", { name: "Toggle workspace theme", exact: true })
    .click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({ path: `${out}/desktop-en.png`, fullPage: true });
  for (const language of ["en", "si"]) {
    if (language === "si")
      await page
        .getByRole("button", { name: "Switch to Sinhala", exact: true })
        .click();
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${language} overflow at ${width}`,
      );
      assert.equal(await page.locator(".auth-submit").isVisible(), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${out}/mobile-${language}.png`,
      fullPage: true,
    });
  }
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("lang"), "si");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page
    .getByRole("button", { name: "Switch to English", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 900 });
  mode = "success";
  await email.fill("login-test@example.invalid");
  await password.fill(" synthetic-ui-password ");
  await submit.click();
  await page.locator(".app-layout").waitFor();
  assert.equal(await page.locator(".auth-page").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Access & audit", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Shop Costs & Profit", exact: true })
      .count(),
    0,
  );
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes("auth-token"))), false);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.includes("auth-token"))), true);
  await page.reload();
  await page.locator(".app-layout").waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.locator(".auth-card").waitFor();
  assert.equal(await password.inputValue(), "");
  assert.equal(await password.getAttribute("type"), "password");
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.includes("auth-token"))),false);
  for (const denied of ["suspended", "anonymous"]) {
    inactive=denied==="suspended"; anonymous=denied==="anonymous";
    await email.fill("login-test@example.invalid");await password.fill(" synthetic-ui-password ");await submit.click();
    await page.getByRole("alert").filter({hasText:denied==="suspended"?/inactive or suspended/:/staff account/}).waitFor();
    assert.equal(await page.locator(".app-layout").count(),0);
  }
  inactive=false;anonymous=false;
  await email.fill("login-test@example.invalid");await password.fill(" synthetic-ui-password ");await submit.click();
  await page.locator(".app-layout").waitFor();
  logoutFails=true;
  await page.getByRole("button",{name:"Sign out",exact:true}).click();
  await page.waitForURL(/signedout=unconfirmed/);
  await page.getByRole("status").filter({hasText:"Server session revocation could not be confirmed"}).waitFor();
  assert.equal(await page.locator(".app-layout").count(),0);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.includes("auth-token"))),false);
  await page.reload();await page.locator(".auth-card").waitFor();assert.equal(await page.locator(".app-layout").count(),0);
  if(production){
    await page.evaluate(()=>{window.__inlineProbe=false;const script=document.createElement("script");script.textContent="window.__inlineProbe=true";document.head.append(script)});
    assert.equal(await page.evaluate(()=>window.__inlineProbe),false,"CSP must block inline script execution");
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS production login UI: validation, masked/revealed password, translated Auth errors, rate-limit message, loading/double-submit guard, keyboard Enter, help, theme/language persistence, 320–1440 px EN/SI layouts, mocked sign-in/sign-out, failed-revocation local cleanup, suspended/anonymous rejection, no demo URL bypass, tab-only auth storage, CSP inline-script blocking and permission-filtered navigation. No real Auth requests or credentials used.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
