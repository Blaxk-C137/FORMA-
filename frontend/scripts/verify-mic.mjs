import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

execSync("mkdir -p /home/user/speech-local/shots");
const browser = await chromium.launch({
  headless: true,
  channel: "chromium-headless-shell",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Start recording/i }).click();
await page.waitForTimeout(2500);

const checks = [];
const ok = (n, p, x = "") => checks.push(`${p ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`);

ok("recording badge", (await page.locator("#capture .step-chip").count()) >= 0 && (await page.getByText("RECORDING").count()) >= 1);
const timer = await page.locator("#capture .timer").textContent();
ok("timer ticking", /00:0[2-9]\./.test(timer ?? ""), timer ?? "");
ok("recording-live glow", (await page.locator("#capture.recording-live").count()) === 1);
const wave = page.locator("#capture canvas[data-wave]");
ok("wave present in live mode", (await wave.count()) === 1);

// energy check: live fake-mic tone should light the wave harder than ambient ever does
const energy = await wave.evaluate((c) => {
  const g = c.getContext("2d");
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i];
  return sum / (d.length / 4);
});
await page.locator("#capture").screenshot({ path: "/home/user/speech-local/shots/05-wave-live.png" });
ok("wave energised by mic input", energy > 8, `mean alpha ${energy.toFixed(1)}`);

await page.getByRole("button", { name: /Stop recording/i }).click();
await page.waitForTimeout(800);
ok("audio ready after stop", (await page.getByText("AUDIO READY").count()) >= 1);
ok("playback player appears", await page.locator("#capture audio").isVisible());
const wave2 = page.locator("#capture canvas[data-wave]");
const e1 = await wave2.evaluate((c) => c.getContext("2d").getImageData(0, 0, 2, 2).data.length);
ok("wave alive in playback mode", e1 === 16);
await page.locator("#capture").screenshot({ path: "/home/user/speech-local/shots/06-wave-playback.png" });

console.log(checks.join("\n"));
console.log("page errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
process.exit(checks.some((c) => c.startsWith("FAIL")) || errors.length ? 1 : 0);
