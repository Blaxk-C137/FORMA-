import { chromium } from "playwright-core";
import fs from "node:fs";

fs.mkdirSync("/home/user/speech-local/shots", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: "chromium-headless-shell",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
const errors = [];
const checks = [];
const ok = (name, pass, extra = "") => checks.push(`${pass ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /Start recording/i }).click();
await page.waitForTimeout(2500);

ok("recording badge is visible", (await page.getByText("RECORDING").count()) >= 1);
const timer = await page.locator("#capture .timer").textContent();
ok("recording timer ticks", /00:0[2-9]\./.test(timer ?? ""), timer ?? "");
ok("recording live treatment appears", (await page.locator("#capture.recording-live").count()) === 1);
const wave = page.locator("#capture canvas[data-wave]");
ok("mic wave is present", (await wave.count()) === 1);
const energy = await wave.evaluate((canvas) => {
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  for (let i = 3; i < data.length; i += 4) sum += data[i];
  return sum / (data.length / 4);
});
ok("fake microphone energizes the waveform", energy > 8, `mean alpha ${energy.toFixed(1)}`);
await page.locator("#capture").screenshot({ path: "/home/user/speech-local/shots/05-wave-live.png" });

await page.getByRole("button", { name: /Stop this segment/i }).click();
await page.waitForTimeout(900);
ok("first segment is saved", await page.getByText("1 PART", { exact: true }).isVisible());
ok("playback appears after stop", await page.locator("#capture audio").isVisible());
ok("add-more action is clear", await page.getByRole("button", { name: /Add more audio · part 2/i }).isVisible());
await page.locator("#capture").screenshot({ path: "/home/user/speech-local/shots/06-wave-playback.png" });

await page.getByRole("button", { name: /Add more audio · part 2/i }).click();
await page.waitForTimeout(1500);
ok("second recording can be started without clearing part one", await page.getByText("LISTENING · PART 2").isVisible());
await page.getByRole("button", { name: /Stop this segment/i }).click();
await page.waitForTimeout(900);
ok("second segment appends to the queue", await page.getByText("2 PARTS", { exact: true }).isVisible());
ok("both uncaptured parts are pending", await page.getByRole("button", { name: /Transcribe 2 new parts/i }).isVisible());

page.once("dialog", (dialog) => dialog.accept());
await page.getByRole("button", { name: /Restart session/i }).click();
await page.waitForTimeout(250);
ok("restart resets captured audio", await page.getByText("READY", { exact: true }).isVisible());
ok("restart resets part count", (await page.getByText(/0 audio parts/).count()) >= 1);

console.log(checks.join("\n"));
console.log("page errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
process.exit(checks.some((check) => check.startsWith("FAIL")) || errors.length ? 1 : 0);
