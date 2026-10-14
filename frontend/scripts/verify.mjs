import { chromium } from "playwright-core";
import fs from "node:fs";

const shot = (name) => `/home/user/speech-local/shots/${name}.png`;
fs.mkdirSync("/home/user/speech-local/shots", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chromium-headless-shell" });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
const checks = [];
const ok = (name, pass, extra = "") => checks.push(`${pass ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);
const statusResponse = await fetch("http://localhost:5173/api/status");
const api = await statusResponse.json();
if (!statusResponse.ok || api.stt_ready !== true || api.tts_ready !== true) {
  await browser.close();
  throw new Error(`Local ML backend is not ready; Playwright verification requires real Whisper and Piper. API status: ${JSON.stringify(api)}`);
}

ok("real Whisper and Piper models are ready", api.stt_ready === true && api.tts_ready === true);
ok("page title describes Forma", (await page.title()).includes("Local Voice Studio"));
ok("status identifies local models", await page.locator(".model-status").innerText().then((t) => t.includes("LOCAL MODELS")));
ok("desktop side navigation has all destinations", (await page.locator(".sidebar-link").count()) === 5);
ok("capture and transcript start on the studio page", (await page.locator("#capture").isVisible()) && (await page.locator("#transcript").isVisible()));
ok("voice output is on the studio page", await page.locator("#speech").isVisible());
ok("marketing sections are removed from the main page", (await page.locator(".arc-band,.marquee-mask,.bento-grid,footer").count()) === 0);
ok("live animated audio wave renders", (await page.locator("#capture canvas[data-wave]").count()) === 1);
const wave = page.locator("#capture canvas[data-wave]");
const waveA = await wave.evaluate((canvas) => canvas.toDataURL());
await page.waitForTimeout(260);
const waveB = await wave.evaluate((canvas) => canvas.toDataURL());
ok("idle wave animates", waveA !== waveB);
await page.screenshot({ path: shot("08-redesign-desktop"), fullPage: true });

await page.getByRole("button", { name: "Light mode" }).click();
ok("light theme still works", (await page.locator("html").getAttribute("data-theme")) === "light");
await page.getByRole("button", { name: "Dark mode" }).click();

await page.locator(".sidebar-link").filter({ hasText: "Settings" }).click();
await page.waitForTimeout(250);
ok("Gemini settings has stable model choices", (await page.locator("#gemini-model option").count()) === 4);
ok("key input does not expose a saved secret", (await page.locator("#gemini-key").getAttribute("type")) === "password");
ok("Tavily free search needs no key or account", (await page.getByText(/Tavily keyless/i).count()) > 0 && (await page.getByText(/no account, API key, or payment card/i).count()) > 0);
ok("Tavily free-search limit and Gemini token/data-retention disclosure are visible", (await page.getByText(/rate-limited/i).count()) > 0 && (await page.getByText(/does not call Search grounding/i).count()) > 0 && (await page.getByText(/55-day retention/i).count()) > 0);
await page.screenshot({ path: shot("10-settings"), fullPage: true });
const settingsModel = await page.locator("#gemini-model").inputValue();
await page.locator("#gemini-model").selectOption("gemini-3.8-flash");
ok("user can switch model", (await page.locator("#gemini-model").inputValue()) === "gemini-3.8-flash");
await page.locator("#gemini-model").selectOption(settingsModel);

await page.locator(".sidebar-link").filter({ hasText: "Terms & privacy" }).click();
ok("terms page is separate and visible", await page.getByRole("heading", { name: /Terms & privacy/i }).isVisible());
ok("terms explain local audio, Tavily search, and optional Gemini summary", (await page.getByText(/audio is not uploaded/i).count()) > 0 && (await page.getByText(/Tavily's keyless search service/i).count()) > 0);
await page.locator(".sidebar-link").filter({ hasText: "Voice search" }).click();
ok("voice search is a separate page", await page.getByRole("heading", { name: /Ask the web/i }).isVisible());
ok("search uses a typed query input", await page.getByLabel("Search query").isVisible());
ok("search engine selector switches free results and Gemini summary", (await page.getByLabel("Search engine").locator("option").count()) === 2);
const geminiSettings = await (await fetch("http://localhost:5173/api/gemini/settings")).json();
await page.getByLabel("Search query").fill("local no-key fixture");
await page.getByLabel("Search engine").selectOption("tavily");
ok("Tavily search is available without a Gemini key", !(await page.getByRole("button", { name: /Search the web/i }).isDisabled()));
await page.getByLabel("Search engine").selectOption("gemini");
if (!geminiSettings.configured) {
  ok("Gemini summary stays disabled until Gemini is configured", await page.getByRole("button", { name: /Search the web/i }).isDisabled());
}

await page.locator(".sidebar-link").filter({ hasText: "Voice studio" }).click();
const transcript = page.getByLabel("Editable transcript");
const historyText = "A readable local session that can be reopened and exported.";
await transcript.fill(historyText);
await page.waitForTimeout(400);
await page.locator(".sidebar-link").filter({ hasText: "Session history" }).click();
ok("session autosaves into readable history", (await page.getByText(historyText, { exact: false }).count()) > 0);
ok("history supports reopening a transcript", await page.getByRole("button", { name: "Open in studio" }).isVisible());
await page.getByRole("button", { name: "Open in studio" }).click();
ok("history reopens transcript text", (await page.getByLabel("Editable transcript").inputValue()) === historyText);

const formatSelect = page.locator("#transcript select[aria-label='Export format']");
await formatSelect.selectOption("txt");
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Export", exact: true }).click();
const download = await downloadPromise;
ok("transcript export produces a chosen file", download.suggestedFilename().endsWith(".txt"), download.suggestedFilename());
page.once("dialog", (dialog) => dialog.accept());
await page.getByRole("button", { name: /Restart session/i }).click();
ok("restart clears the editor", (await page.getByLabel("Editable transcript").inputValue()) === "");
await page.locator(".sidebar-link").filter({ hasText: "Session history" }).click();
ok("restart kept the old session in history", (await page.getByText(historyText, { exact: false }).count()) > 0);
page.once("dialog", (dialog) => dialog.accept());
await page.getByRole("button", { name: "Clear all" }).click();
ok("history can be cleared", await page.getByText("Your archive is ready").isVisible());

// Mobile has no sidepane; the compact bottom navigation is the only navigation rail.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await mobile.waitForTimeout(300);
ok("mobile sidepane is removed", await mobile.locator(".sidebar").evaluate((el) => getComputedStyle(el).display === "none"));
ok("mobile bottom navigation works", await mobile.locator(".mobile-nav").isVisible());
ok("mobile layout has no horizontal overflow", await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
await mobile.screenshot({ path: shot("09-redesign-mobile"), fullPage: false });
await mobile.locator(".mobile-nav-link").filter({ hasText: "Settings" }).click();
ok("mobile settings remains navigable", await mobile.getByRole("heading", { name: /^Settings/i }).isVisible());
await mobile.close();

// UI plumbing fixture only: this synthetic response is never shown by the app or saved as real search output.
const searchTest = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await searchTest.route("**/api/gemini/settings", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ configured: true, vault_available: true, key_source: "credential-vault", model_default: "gemini-3.5-flash-lite" }),
}));
let tavilySearchCount = 0;
await searchTest.route("**/api/tavily/search", (route) => {
  const body = route.request().postDataJSON();
  tavilySearchCount++;
  const direct = String(body.query).includes("direct");
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      provider: "tavily-keyless",
      query: body.query,
      total: 1,
      results: [{
        title: direct ? "Direct Tavily fixture" : "Fixture source",
        uri: direct ? "https://example.com/direct" : "https://example.com/fixture",
        snippet: direct ? "Clean Tavily snippet fixture." : "Tavily snippet fixture.",
      }],
    }),
  });
});
let mockSummaryCount = 0;
await searchTest.route("**/api/gemini/summarize-search", (route) => {
  if (mockSummaryCount++ === 0) return route.fulfill({
    status: 429,
    contentType: "application/json",
    body: JSON.stringify({ detail: "Google Gemini returned HTTP 429 (RESOURCE_EXHAUSTED). Quota details: fixture_gemini_requests (limit 0). Google suggests retrying in about 3 seconds." }),
  });
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ text: "Playwright fixture answer [1].", model: "gemini-3.5-flash-lite" }),
  });
});
await searchTest.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await searchTest.waitForTimeout(250);
await searchTest.locator(".sidebar-link").filter({ hasText: "Voice search" }).click();
await searchTest.getByLabel("Search engine").selectOption("gemini");
await searchTest.getByLabel("Search query").fill("fixture query");
await searchTest.getByRole("button", { name: "Search the web" }).click();
const rateAlert = searchTest.getByRole("alert");
await rateAlert.waitFor({ timeout: 5000 });
ok("Gemini summary 429 shows the Gemini quota metric", (await rateAlert.innerText()).includes("fixture_gemini_requests"));
ok("Gemini summary 429 links to rate-limit documentation", await searchTest.getByText("Gemini rate-limit details").isVisible());
ok("Tavily results remain visible when Gemini summary is rate-limited", await searchTest.getByText("Tavily snippet fixture.").isVisible());
await searchTest.getByRole("button", { name: "Search the web" }).click();
await searchTest.getByText("Playwright fixture answer", { exact: false }).waitFor({ timeout: 5000 });
ok("Gemini summary fixture shows a citation linked to a Tavily source", await searchTest.locator(".source-citation[href='#search-source-1']").isVisible());
ok("Gemini summary fixture renders the original Tavily source", await searchTest.locator("#search-source-1").getByText("Fixture source").isVisible());
await searchTest.locator("select[aria-label='Export format']").selectOption("json");
const resultDownloadPromise = searchTest.waitForEvent("download");
await searchTest.getByRole("button", { name: "Export result" }).click();
ok("search result can be exported", (await resultDownloadPromise).suggestedFilename().endsWith(".json"));
await searchTest.getByLabel("Search engine").selectOption("tavily");
await searchTest.getByLabel("Search query").fill("direct fixture query");
await searchTest.getByRole("button", { name: "Search the web" }).click();
await searchTest.getByText("Direct Tavily fixture", { exact: false }).waitFor({ timeout: 5000 });
ok("Tavily parses direct result title and snippet", await searchTest.getByText("Clean Tavily snippet fixture.").isVisible());
ok("search engine switch selects free Tavily results", (await searchTest.getByRole("heading", { name: "direct fixture query" }).isVisible()) && (await searchTest.getByText("TAVILY WEB RESULTS").isVisible()));
ok("Tavily results do not trigger another Gemini request", mockSummaryCount === 2 && tavilySearchCount === 3);
await searchTest.locator("select[aria-label='Export format']").selectOption("csv");
const directDownloadPromise = searchTest.waitForEvent("download");
await searchTest.getByRole("button", { name: "Export result" }).click();
ok("Tavily result cards export with the selected format", (await directDownloadPromise).suggestedFilename().endsWith(".csv"));
await searchTest.locator(".sidebar-link").filter({ hasText: "Session history" }).click();
ok("Gemini summaries and Tavily results are not added to session history", (await searchTest.getByText("Playwright fixture answer", { exact: false }).count()) === 0 && (await searchTest.getByText("Direct Tavily fixture", { exact: false }).count()) === 0);
await searchTest.close();

// End-to-end local Piper→Whisper audio round trip; no cloud speech APIs are used.
const synth = await fetch("http://localhost:5173/api/synthesize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Hello, this is a test of the local speech engine.", voice: "lessac", length_scale: 1 }),
});
if (!synth.ok) {
  const detail = await synth.text();
  ok("local Piper synthesis endpoint responds", false, `HTTP ${synth.status}: ${detail.slice(0, 120)}`);
} else {
  const wav1 = "/tmp/forma-verify-one.wav";
  fs.writeFileSync(wav1, Buffer.from(await synth.arrayBuffer()));
  await page.locator(".sidebar-link").filter({ hasText: "Voice studio" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.locator("#capture input[type=file]").setInputFiles(wav1);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("#capture button")].find((item) => item.textContent?.includes("Transcribe 1 new part"));
    return Boolean(button && !button.hasAttribute("disabled"));
  }, null, { timeout: 5000 });
  await page.getByRole("button", { name: "Transcribe 1 new part" }).click();
  let got = "";
  for (let attempt = 0; attempt < 80 && !(got = await page.getByLabel("Editable transcript").inputValue()).trim(); attempt++) await page.waitForTimeout(500);
  ok("local Whisper transcribes Piper-generated audio", /hello,? this is a test of (a|the) local speech engine/i.test(got), got.slice(0, 75));

  const synth2 = await fetch("http://localhost:5173/api/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Add more words to this session.", voice: "lessac", length_scale: 1 }),
  });
  if (!synth2.ok) {
    const detail = await synth2.text();
    ok("second local Piper synthesis succeeds", false, `HTTP ${synth2.status}: ${detail.slice(0, 120)}`);
  } else {
    fs.writeFileSync("/tmp/forma-verify-two.wav", Buffer.from(await synth2.arrayBuffer()));
    await page.getByRole("button", { name: "Choose another audio file" }).click();
    await page.locator("#capture input[type=file]").setInputFiles("/tmp/forma-verify-two.wav");
    await page.waitForFunction(() => [...document.querySelectorAll("#capture button")].some((item) => item.textContent?.includes("Transcribe 1 new part") && !item.hasAttribute("disabled")), null, { timeout: 5000 });
    await page.getByRole("button", { name: "Transcribe 1 new part" }).click();
    let appended = "";
    for (let attempt = 0; attempt < 80; attempt++) {
      appended = await page.getByLabel("Editable transcript").inputValue();
      if (appended.length > got.length) break;
      await page.waitForTimeout(500);
    }
    ok("second audio part appends instead of replacing", appended.length > got.length, appended.slice(-60));
  }
}

console.log(checks.join("\n"));
console.log("console/page errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
process.exit(checks.some((check) => check.startsWith("FAIL")) || errors.length ? 1 : 0);
