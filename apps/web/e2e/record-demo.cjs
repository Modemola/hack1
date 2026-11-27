// Records a captioned walkthrough of the Pakka demo, following the script in docs/PITCH.md.
// Usage: node e2e/record-demo.cjs [baseUrl] [outDir]
// Produces <outDir>/pakka-demo.webm (convert with ffmpeg for an .mp4).
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const OUT = process.argv[3] ?? path.join(__dirname, "video");
fs.mkdirSync(OUT, { recursive: true });
const SIZE = { width: 1280, height: 800 };

// A visible cursor and a caption bar, injected into every page.
const overlay = () => {
  const install = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.style.cssText =
      "position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(234,88,12,.35);border:2px solid #ea580c;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:transform .12s";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "translate(-50%,-50%) scale(.6)"), true);
    addEventListener("mouseup", () => (c.style.transform = "translate(-50%,-50%)"), true);
    const b = document.createElement("div");
    b.id = "__caption";
    b.style.cssText =
      "position:fixed;z-index:2147483646;left:50%;bottom:28px;transform:translateX(-50%);max-width:900px;padding:14px 22px;border-radius:14px;background:rgba(17,17,17,.88);color:#fff;font:500 21px/1.4 system-ui,sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s";
    document.body.appendChild(b);
    const saved = sessionStorage.getItem("__caption");
    if (saved) { b.textContent = saved; b.style.opacity = "1"; }
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install);
  else install();
};

async function say(page, text, holdMs = 0) {
  await page.evaluate((t) => {
    sessionStorage.setItem("__caption", t);
    const b = document.getElementById("__caption");
    if (b) { b.textContent = t; b.style.opacity = t ? "1" : "0"; }
  }, text);
  if (holdMs) await page.waitForTimeout(holdMs);
}

async function click(page, locator) {
  const el = typeof locator === "string" ? page.getByRole("button", { name: locator }) : locator;
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await page.waitForTimeout(250);
  await el.click();
}

async function persona(page, who) {
  await click(page, page.getByRole("group", { name: "Demo role" }).getByRole("button", { name: who }));
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });
  await ctx.addInitScript(overlay);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90_000);
  const scroll = (y) => page.evaluate((y) => scrollTo({ top: y, behavior: "smooth" }), y);

  await page.goto(BASE);
  await say(page, "Pakka: Infosys, Wipro and TCS postponed joining for 10,000+ freshers, and fake offers keep costing students money.", 4500);

  await say(page, "Here's a fake TCS offer. Validly signed, but by tcs-onboarding, not tcs.com, and it asks for a deposit.");
  await click(page, "Lookalike scam");
  await page.locator('[data-verdict="danger"]').waitFor();
  await page.waitForTimeout(4000);
  await scroll(500);
  await page.waitForTimeout(2500);
  await click(page, "Check another email");

  await say(page, "Someone edited the salary in a real offer. The company's signature no longer matches.");
  await click(page, "Salary edited");
  await page.locator('[data-verdict="danger"]').waitFor();
  await page.waitForTimeout(4000);
  await click(page, "Check another email");

  await say(page, "A genuine offer gets the Pakka stamp, with the role, pay and joining date read out.");
  await click(page, "Genuine offer");
  await page.locator('[data-verdict="verified"]').waitFor();
  await page.waitForTimeout(4500);

  await say(page, "One click records it onchain with a guest wallet: no seed phrase. Only a hash and the dates go public.");
  await click(page, "Connect to record");
  await click(page, page.getByRole("button", { name: /Instant guest wallet/ }));
  await click(page, "Record this offer on Pakka");
  await page.getByText("Recorded onchain.").waitFor();
  await page.waitForTimeout(3000);

  await say(page, "Now the employer side. The company proves its domain the same way: one signed email.");
  await persona(page, "Company");
  await page.goto(`${BASE}/employer`);
  await click(page, page.getByRole("button", { name: /Use demo company Nimbus/ }));
  await page.locator('[data-verdict="verified"]').waitFor();
  await page.waitForTimeout(2000);
  await click(page, "Link this wallet to nimbus.demo");
  await page.getByText("This wallet speaks for").waitFor();
  await page.waitForTimeout(1500);

  await say(page, "It locks a joining guarantee in stablecoins, with a monthly stipend if joining is late.");
  await click(page, "Demo candidate");
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').fill(soon);
  await page.waitForTimeout(2500);
  await click(page, "Lock guarantee and send offer");
  await page.waitForURL(/\/guarantee\/\d+/);
  await page.getByText("Awaiting acceptance").waitFor();
  await page.waitForTimeout(2000);

  await say(page, "The candidate accepts. Now joining slips a month...");
  await persona(page, "Candidate");
  await click(page, page.getByRole("button", { name: /Accept offer/ }));
  await page.getByText("Accepted", { exact: true }).waitFor();
  await page.waitForTimeout(1500);
  await click(page, "+1 month");
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-testid="earned"]')?.textContent ?? "";
    return t !== "" && t !== "$0.00";
  });
  await say(page, "...and the stipend streams to the candidate every second. Postponing doesn't stop it.");
  await page.getByTestId("earned").scrollIntoViewIfNeeded();
  await page.waitForTimeout(6000);
  await click(page, "Claim stipend");
  await page.getByText(/Paid so far: \$[1-9]/).waitFor();
  await page.waitForTimeout(2500);

  await say(page, "If the company revokes, the candidate gets everything left in the guarantee.");
  await persona(page, "Company");
  await click(page, "Revoke offer");
  await page.getByText("revoked the offer").waitFor();
  await page.waitForTimeout(4000);

  await say(page, "And the company's Promise Score drops: publicly, permanently, built only from verified emails.");
  await page.goto(`${BASE}/companies/nimbus.demo`);
  await page.getByText("Offers on record").waitFor();
  await page.waitForTimeout(5000);

  await page.goto(BASE);
  await say(page, "Pakka. Make every offer pakka.", 3500);

  const video = page.video();
  await ctx.close();
  const file = path.join(OUT, "pakka-demo.webm");
  await video.saveAs(file);
  await video.delete();
  await browser.close();
  console.log("Saved", file);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
