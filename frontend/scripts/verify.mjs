import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";

const shot = (n) => `/home/user/speech-local/shots/${n}.png`;
execSync("mkdir -p /home/user/speech-local/shots");

const browser = await chromium.launch({ headless: true, channel: "chromium-headless-shell" });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const checks = [];
const ok = (name, pass, extra = "") => checks.push(`${pass ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);

ok("page title", (await page.title()).includes("Forma"));
const api = await (await fetch("http://localhost:5173/api/status")).json();
const real = !api.stub;
ok("status pill reflects backend", (await page.getByText(real ? "LOCAL MODELS" : "DUMMY MODE").count()) >= 1, real ? "real ML" : "stub");
// studio-first: capture + speech visible without scrolling
ok("capture above the fold", await page.locator("#capture").evaluate((el) => el.getBoundingClientRect().top < window.innerHeight / 2));
ok("speech panel above the fold", await page.locator("#speech").evaluate((el) => el.getBoundingClientRect().bottom < window.innerHeight + 220));
const frame = page.locator(".shader-frame");
ok("shader-frame present", (await frame.count()) === 1);
const bg = page.locator(".shader-frame .threeui-background.predictive-arc");
ok("PredictiveArc host mounted", (await bg.count()) === 1, await bg.getAttribute("class"));
const canvas = page.locator(".shader-frame canvas");
ok("canvas present", (await canvas.count()) === 1);
const size = await canvas.evaluate((c) => ({ w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight }));
ok("canvas sized", size.w > 100 && size.h > 100, JSON.stringify(size));

const px = await canvas.evaluate((c) => {
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let lit = 0, maxB = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r + g + b > 90) lit++;
    if (b > maxB) maxB = b;
  }
  return { lit, maxB, total: d.length / 4 };
});
ok("arc pixels drawing", px.lit > 500 && px.maxB > 120, `lit=${px.lit} maxBlue=${px.maxB}`);
ok("canvas context alive", await canvas.evaluate((c) => c.getContext("2d") !== null));

// arc band lives below the fold (studio-first layout) — bring it into view so its
// IntersectionObserver wakes the renderer, then confirm it animates
await page.locator(".arc-band").scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const before = await canvas.evaluate((c) => c.toDataURL().length + ":" + c.toDataURL().slice(-40));
await page.waitForTimeout(400);
const after = await canvas.evaluate((c) => c.toDataURL().length + ":" + c.toDataURL().slice(-40));
ok("animation ticks", before !== after);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);

await page.screenshot({ path: shot("01-hero-dark"), fullPage: false });

await page.getByRole("button", { name: /Try sample text/i }).first().click();
await page.waitForTimeout(300);
const text = await page.locator("textarea").inputValue();
ok("sample text fills transcript", text.includes("Say the thing"));
await page.screenshot({ path: shot("02-studio-filled"), fullPage: true });

// full pipeline through the vite proxy — upload audio → transcribe → generate speech
const wavPath = "/tmp/verify-test.wav";
if (real) {
  const r = await fetch("http://localhost:5173/api/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Hello, this is a test of the local speech engine.", voice: "lessac", length_scale: 1 }),
  });
  fs.writeFileSync(wavPath, Buffer.from(await r.arrayBuffer()));
} else {
  const sr = 8000, n = sr;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((i / sr) * 2 * Math.PI * 440) * 12000), 44 + i * 2);
  fs.writeFileSync(wavPath, buf);
}
await page.getByRole("tab", { name: /Upload file/i }).click();
await page.setInputFiles("#capture input[type=file]", wavPath);
await page.waitForTimeout(400);
await page.locator("textarea").fill(""); // clean slate so the poll cannot read stale text
await page.getByRole("button", { name: /Transcribe audio/i }).click();
// poll the transcript up to 30s (real whisper may need model warm-up)
let got = "";
for (let i = 0; i < 60 && !(got = await page.locator("textarea").inputValue()).trim(); i++) await page.waitForTimeout(500);
if (real) {
  ok("real transcribe returns speech text", /hello,? this is a test of (a|the) local speech engine/i.test(got), got.slice(0, 60));
} else {
  ok("stub transcribe fills transcript", got.includes("stub transcription"), got.slice(0, 40));
}
await page.getByRole("button", { name: /Generate speech/i }).click();
let played = false;
for (let i = 0; i < 40 && !(played = await page.locator("#speech audio").isVisible()); i++) await page.waitForTimeout(500);
ok("speech audio generated", played);
ok("note honest", (await page.getByText(real ? /Your audio is ready/ : /Dummy tone generated/).count()) >= 1);
ok("notice clutter removed", (await page.locator(".notice").count()) === 0);

await page.getByRole("button", { name: "Light mode" }).first().click();
await page.waitForTimeout(400);
ok("light theme applied", (await page.locator("html").getAttribute("data-theme")) === "light");
await page.screenshot({ path: shot("03-hero-light"), fullPage: false });
await page.getByRole("button", { name: "Dark mode" }).first().click();

await page.getByRole("tab", { name: /Upload file/i }).click();
await page.waitForTimeout(250);
ok("upload dropzone visible", await page.locator(".dropzone").isVisible());
await page.getByRole("tab", { name: /Record audio/i }).click();

// speech wave: present and genuinely animating (idle ambient motion)
const wave = page.locator("#capture canvas[data-wave]");
ok("speech wave present", (await wave.count()) === 1);
const w1 = await wave.evaluate((c) => c.toDataURL().slice(-80));
await page.waitForTimeout(250);
const w2 = await wave.evaluate((c) => c.toDataURL().slice(-80));
ok("speech wave animated", w1 !== w2);
ok("marquee rendered", (await page.locator(".animate-marquee").count()) >= 1);
// traverse the page so scroll reveals fire, then assert real visibility
await page.evaluate(async () => {
  for (let y = 0; y <= document.body.scrollHeight; y += 400) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
});
await page.waitForTimeout(900);
ok("bento features visible", await page.getByText("Runs on your machine").isVisible());
ok("bento card visible", await page.getByText("Measured, not guessed").isVisible());
await page.screenshot({ path: shot("04-full-dark"), fullPage: true });

console.log(checks.join("\n"));
console.log("console errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
process.exit(checks.some((c) => c.startsWith("FAIL")) || errors.length ? 1 : 0);
