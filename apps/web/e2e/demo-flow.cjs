// End-to-end walk through the whole Pakka demo, as both the candidate and the company.
// Usage: node e2e/demo-flow.cjs [baseUrl] [screenshotDir]
// Needs a running app (with contracts deployed and demo mode on) and Playwright.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const OUT = process.argv[3] ?? path.join(__dirname, "screenshots");
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
let step = 0;
async function shot(page, name) {
  step++;
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${String(step).padStart(2, "0")}-${name}.png`), fullPage: true });
  console.log(`  ✓ ${name}`);
}

async function persona(page, who) {
  await page.getByRole("group", { name: "Demo role" }).getByRole("button", { name: who }).click();
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`));
  page.setDefaultTimeout(60_000);

  console.log("Candidate checks emails");
  await page.goto(BASE);
  await shot(page, "home");

  await page.getByRole("button", { name: "Lookalike scam" }).click();
  await page.locator('[data-verdict="danger"]').waitFor();
  await shot(page, "scam-detected");
  await page.getByRole("button", { name: "Check another email" }).click();

  await page.getByRole("button", { name: "Salary edited" }).click();
  await page.locator('[data-verdict="danger"]').waitFor();
  await page.getByText("changed after it was sent").waitFor();
  await shot(page, "tampered-detected");
  await page.getByRole("button", { name: "Check another email" }).click();

  await page.getByRole("button", { name: "Genuine offer" }).click();
  await page.locator('[data-verdict="verified"]').waitFor();
  await shot(page, "genuine-verified");

  console.log("Candidate records the offer");
  await page.getByRole("button", { name: "Connect to record" }).click();
  await page.getByRole("button", { name: /Instant guest wallet/ }).click();
  await page.getByRole("button", { name: "Record this offer on Pakka" }).click();
  await page.getByText("Recorded onchain.").waitFor();
  await shot(page, "offer-recorded");

  console.log("Candidate records a postponement email from the same company");
  const postponed = await page.evaluate(async () => (await fetch("/api/demo-email?company=nimbus&kind=POSTPONED")).text());
  await page.getByRole("button", { name: "Check another email" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "postponed.eml", mimeType: "message/rfc822", buffer: Buffer.from(postponed) });
  await page.locator('[data-verdict="verified"]').waitFor();
  await page.getByRole("combobox").waitFor();
  await page.getByRole("button", { name: "Record the postponement" }).click();
  await page.getByText("Recorded onchain.").waitFor();
  await shot(page, "postponement-recorded");

  console.log("Company verifies its domain");
  await persona(page, "Company");
  await page.goto(`${BASE}/employer`);
  await page.getByRole("button", { name: /Use demo company Nimbus/ }).click();
  await page.locator('[data-verdict="verified"]').waitFor();
  await shot(page, "company-verify-email");
  await page.getByRole("button", { name: "Link this wallet to nimbus.demo" }).click();
  await page.getByText("This wallet speaks for").waitFor({ timeout: 45_000 });

  console.log("Company makes a guaranteed offer");
  await page.getByRole("button", { name: "Demo candidate" }).click();
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').fill(soon);
  await shot(page, "create-offer-form");
  await page.getByRole("button", { name: "Lock guarantee and send offer" }).click();
  await page.waitForURL(/\/guarantee\/\d+/, { timeout: 60_000 });
  await page.getByText("Awaiting acceptance").waitFor();
  await shot(page, "guarantee-offered");

  console.log("Candidate accepts and time passes");
  await persona(page, "Candidate");
  await page.getByRole("button", { name: /Accept offer/ }).click();
  await page.getByText("Accepted", { exact: true }).waitFor();
  await page.getByRole("button", { name: "+1 month" }).click();
  // Wait for the time-travel transaction to confirm and the stipend to start (slower on a real chain).
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-testid="earned"]')?.textContent ?? "";
    return t !== "" && t !== "$0.00";
  }, null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  const a = await page.getByTestId("earned").innerText();
  await page.waitForTimeout(2500);
  const b = await page.getByTestId("earned").innerText();
  if (a === b || a === "$0.00") throw new Error(`Stipend ticker not moving: ${a} → ${b}`);
  console.log(`    stipend ticking: ${a} → ${b}`);
  await shot(page, "stipend-streaming");
  await page.getByRole("button", { name: "Claim stipend" }).click();
  await page.getByText(/Paid so far: \$[1-9]/).waitFor();
  await shot(page, "stipend-claimed");

  console.log("Company postpones, then revokes");
  await persona(page, "Company");
  await page.getByRole("button", { name: "Postpone", exact: true }).click();
  await page.getByText("Announced joining").waitFor();
  await page.getByRole("button", { name: "Revoke offer" }).click();
  await page.getByText("revoked the offer").waitFor();
  await shot(page, "revoked-payout");

  console.log("Public record");
  await page.goto(`${BASE}/companies`);
  await page.getByText("nimbus.demo").first().waitFor();
  await shot(page, "leaderboard");
  await page.goto(`${BASE}/companies/nimbus.demo`);
  await page.getByText("Offers on record").waitFor();
  await shot(page, "company-score");

  await persona(page, "Candidate");
  await page.goto(`${BASE}/me`);
  await page.getByRole("heading", { name: "Verified offers" }).waitFor();
  await page.getByText("Delayed").first().waitFor();
  await shot(page, "my-offers");

  console.log("Phone layout");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const m = await phone.newPage();
  await m.goto(BASE);
  await m.getByRole("button", { name: "Genuine offer" }).click();
  await m.locator('[data-verdict="verified"]').waitFor();
  await shot(m, "phone-verified");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) throw new Error(`Phone layout scrolls sideways by ${overflow}px`);
  await m.goto(`${BASE}/guarantee/0`);
  await m.getByTestId("earned").waitFor();
  await shot(m, "phone-guarantee");

  await browser.close();
  // Browsers log failed requests twice (as a response and as a console line); keep the URL lines.
  const real = [...new Set(errors.filter((e) => !/Download the React DevTools|favicon|^Failed to load resource/.test(e)))];
  if (real.length) {
    console.log("Console errors:\n" + real.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("No console errors. All steps passed.");
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  if (errors.length) console.error("Console errors:\n" + errors.join("\n"));
  process.exit(1);
});
