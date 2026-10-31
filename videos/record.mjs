// ScreenStudio-style demo recorder: the real app in an iframe inside a stage
// page (wallpaper + window chrome + drawn cursor), captured frame by frame at
// 2x and encoded with ffmpeg.
//
//   node videos/record.mjs --take videos/demos/promiseproof.mjs --out out/social/promiseproof [--still]
//
// Options: --width 1600 --height 900 --pad 40 --fps 30 --out-width 1920 --seed 1 --keep-frames
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
const takePath = resolve(arg("take"));
const out = resolve(arg("out", "out/social/demo"));
const W = Number(arg("width", 1600));
const H = Number(arg("height", 900));
const PAD = Number(arg("pad", 40));
const FPS = Number(arg("fps", 30));
const OUT_W = Number(arg("out-width", 1920));
const STILL = arg("still", false) === true;
const KEEP = arg("keep-frames", false) === true;
let seed = Number(arg("seed", 1));
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ---------- playwright ----------
function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_CORE, "playwright-core", "playwright"].filter(Boolean);
  for (const c of candidates) {
    try {
      return req(c);
    } catch {}
  }
  const npx = `${process.env.HOME}/.npm/_npx`;
  for (const d of existsSync(npx) ? readdirSync(npx) : []) {
    const p = `${npx}/${d}/node_modules/playwright-core`;
    if (existsSync(p)) return req(p);
  }
  throw new Error("Playwright not found. Set PLAYWRIGHT_CORE or run: npx -y playwright@latest install chromium");
}
const { chromium } = loadPlaywright();

const take = await import(pathToFileURL(takePath).href);
const TITLE = 36;
const appBox = PAD > 0 ? { x: PAD, y: PAD + TITLE, w: W - 2 * PAD, h: H - 2 * PAD - TITLE } : { x: 0, y: 0, w: W, h: H };

// ---------- stage ----------
const stage = `<!doctype html><html><head><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
  body{background:${PAD > 0 ? "radial-gradient(120% 120% at 15% 10%, #fde7d3 0%, #f6d6e6 40%, #d9def7 75%, #cfe7ec 100%)" : "#fff"};font-family:-apple-system,system-ui,sans-serif}
  #win{position:absolute;left:${PAD}px;top:${PAD}px;width:${W - 2 * PAD}px;height:${H - 2 * PAD}px;border-radius:${PAD > 0 ? 14 : 0}px;overflow:hidden;background:#fff;
       box-shadow:${PAD > 0 ? "0 30px 80px rgba(30,30,60,.25),0 0 0 1px rgba(0,0,0,.06)" : "none"}}
  #bar{height:${PAD > 0 ? TITLE : 0}px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#f3f3f2;border-bottom:1px solid #e5e5e3;box-sizing:border-box}
  #bar i{width:12px;height:12px;border-radius:50%;display:block}
  #url{flex:1;text-align:center;font-size:12.5px;color:#6b7280;margin-right:60px}
  iframe{display:block;border:0;width:100%;height:${appBox.h}px}
  #cur{position:absolute;left:0;top:0;width:32px;height:32px;pointer-events:none;z-index:10;transform-origin:0 0}
  #rip{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(15,23,42,.18);pointer-events:none;z-index:9;opacity:0}
  #badge{position:absolute;right:${PAD + 18}px;top:${PAD + TITLE + 16}px;z-index:11;padding:6px 12px;border-radius:999px;background:rgba(15,23,42,.82);color:#fff;font-size:13px;font-weight:600;letter-spacing:.02em;opacity:0}
</style></head><body>
<div id="win"><div id="bar">${PAD > 0 ? '<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><div id="url"></div>' : ""}</div>
<iframe id="app"></iframe></div>
<div id="rip"></div><div id="badge"></div><div id="cur"></div>
</body></html>`;

const CURSORS = {
  arrow: `<svg width="32" height="32" viewBox="0 0 32 32"><path d="M6 3 L6 25 L11.5 19.8 L15.2 28 L18.8 26.4 L15.2 18.4 L22.5 18.4 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hand: `<svg width="32" height="32" viewBox="0 0 32 32" style="transform:translate(-9px,-2px)"><path d="M12 4.5c0-1.4 2.6-1.4 2.6 0V14l.2-2.2c.2-1.3 2.5-1.2 2.5.2v2.6l.3-1.7c.3-1.2 2.4-1 2.4.3v2.4l.3-1.1c.4-1 2.2-.8 2.2.4v6.2c0 3.6-2.5 6.4-6 6.4h-1.6c-2.2 0-3.5-1-4.8-2.8L6 18.8c-.8-1.1.7-2.6 1.9-1.6L12 20.4Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  text: `<svg width="32" height="32" viewBox="0 0 32 32" style="transform:translate(-8px,-12px)"><path d="M12 4h2.5c.9 0 1.5.4 1.5 1 0-.6.6-1 1.5-1H20M12 28h2.5c.9 0 1.5-.4 1.5-1 0 .6.6 1 1.5 1H20M16 5v22" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M12 4h2.5c.9 0 1.5.4 1.5 1 0-.6.6-1 1.5-1H20M12 28h2.5c.9 0 1.5-.4 1.5-1 0 .6.6 1 1.5 1H20M16 5v22" fill="none" stroke="#111" stroke-width="1.5"/></svg>`,
};

// ---------- run ----------
const framesDir = `${out}-frames`;
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
if (take.prepare) await take.prepare(page);
await page.setContent(stage);
await page.evaluate((u) => {
  const el = document.getElementById("url");
  if (el) el.textContent = new URL(u).host;
}, take.url);
await page.evaluate((u) => (document.getElementById("app").src = u), take.url);
const frameLocator = page.frameLocator("#app");
let app;
for (let i = 0; i < 100 && !app; i++) {
  app = page.frames().find((f) => f.url().startsWith(take.url.replace(/\/$/, "")));
  if (!app) await page.waitForTimeout(100);
}
await app.waitForLoadState("networkidle");
await app.addStyleTag({ content: `*{caret-color:transparent!important;scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}${take.css ?? ""}` });

let n = 0;
let posterAt = -1;
const cur = { x: W * 0.55, y: H * 0.6, shape: "arrow" };
let ripple = null; // { x, y, f }

async function shapeAt(x, y) {
  const ax = x - appBox.x, ay = y - appBox.y;
  if (ax < 0 || ay < 0 || ax > appBox.w || ay > appBox.h) return "arrow";
  return app
    .evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return "arrow";
      if (el.closest("textarea,input:not([type=file]):not([type=checkbox])")) return el.closest(":disabled") ? "arrow" : "text";
      const c = el.closest("a,button,label,[role=tab],[role=button],summary,select");
      return c && !c.matches(":disabled") && !c.closest("[aria-disabled=true]") ? "hand" : "arrow";
    }, [ax, ay])
    .catch(() => "arrow");
}

async function frame() {
  const shape = await shapeAt(cur.x, cur.y);
  const rp = ripple ? { ...ripple, t: ripple.f / 10 } : null;
  await page.evaluate(
    ([x, y, svg, rp]) => {
      const c = document.getElementById("cur");
      c.style.transform = `translate(${x}px,${y}px)`;
      if (c.dataset.svg !== svg) (c.innerHTML = svg), (c.dataset.svg = svg);
      const r = document.getElementById("rip");
      if (rp) Object.assign(r.style, { left: `${rp.x}px`, top: `${rp.y}px`, opacity: String(0.9 * (1 - rp.t)), transform: `scale(${0.4 + rp.t * 1.1})` });
      else r.style.opacity = "0";
    },
    [cur.x, cur.y, CURSORS[shape], rp],
  );
  if (ripple && ++ripple.f > 10) ripple = null;
  await page.screenshot({ path: `${framesDir}/${String(n++).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const t = {
  page,
  frame: frameLocator,
  app,
  width: W,
  height: H,
  pad: PAD,
  fps: FPS,
  random,
  get position() {
    return { x: cur.x, y: cur.y };
  },
  poster: () => (posterAt = n),
  async hold(ms) {
    for (let i = 0; i < Math.round((ms / 1000) * FPS); i++) await frame();
  },
  async moveTo(x, y, { ms, bow = 0.12 } = {}) {
    const sx = cur.x, sy = cur.y;
    const dist = Math.hypot(x - sx, y - sy);
    const dur = ms ?? Math.min(900, 280 + dist * 0.55);
    const steps = Math.max(1, Math.round((dur / 1000) * FPS));
    // perpendicular bow so the path curves like a hand
    const nx = -(y - sy) / (dist || 1), ny = (x - sx) / (dist || 1);
    const b = dist * bow * (random() < 0.5 ? -1 : 1);
    for (let i = 1; i <= steps; i++) {
      const p = ease(i / steps);
      const arc = Math.sin(Math.PI * p) * b;
      cur.x = sx + (x - sx) * p + nx * arc;
      cur.y = sy + (y - sy) * p + ny * arc;
      await page.mouse.move(cur.x, cur.y);
      await frame();
    }
  },
  async box(target) {
    const loc = typeof target === "string" ? frameLocator.locator(target) : target;
    if (loc && typeof loc.boundingBox === "function") {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const b = await loc.boundingBox();
      if (!b) throw new Error("target not visible");
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    return target;
  },
  aim(b, fx = 0.5, fy = 0.5) {
    const j = () => (random() - 0.5) * 0.08;
    return { x: b.x + b.w * Math.min(0.95, Math.max(0.05, fx + j())), y: b.y + b.h * Math.min(0.9, Math.max(0.1, fy + j())) };
  },
  async hover(target, { fx, fy, dwell = 360, ms } = {}) {
    const p = t.aim(await t.box(target), fx, fy);
    await t.moveTo(p.x, p.y, { ms });
    await t.hold(dwell);
  },
  async click() {
    ripple = { x: cur.x, y: cur.y, f: 0 };
    await page.mouse.down();
    await frame();
    await page.mouse.up();
  },
  async clickOn(target, { fx, fy, dwell = 160, settle = 180, ms } = {}) {
    await t.hover(target, { fx, fy, dwell, ms });
    await t.click();
    await t.hold(settle);
  },
  async sweep(items, { within, max = 6, dwell = 380, fx, fy } = {}) {
    for (const b of await t.visibleBoxes(items, { within, max })) await t.hover(b, { fx, fy, dwell });
  },
  async visibleBoxes(items, { within, max = 6 } = {}) {
    const wb = within ? await within.boundingBox() : { x: appBox.x, y: appBox.y, width: appBox.w, height: appBox.h };
    const out = [];
    for (const loc of await items.all()) {
      const b = await loc.boundingBox();
      if (b && b.y >= wb.y && b.y + b.height <= wb.y + wb.height) out.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      if (out.length >= max) break;
    }
    return out;
  },
  async type(text, { perChar = 1 } = {}) {
    for (const ch of text) {
      await page.keyboard.type(ch);
      for (let i = 0; i < perChar; i++) await frame();
    }
  },
  async wheel(dy, { ms = 600 } = {}) {
    const steps = Math.max(1, Math.round((ms / 1000) * FPS));
    let done = 0;
    for (let i = 1; i <= steps; i++) {
      const target = Math.round(dy * ease(i / steps));
      await page.mouse.wheel(0, target - done);
      done = target;
      await frame();
    }
  },
  /** Keep capturing while waiting on real work; the gap is time-lapsed and labeled. */
  async until(check, { label = "Sped up", timeout = 240_000 } = {}) {
    await page.evaluate((l) => {
      const b = document.getElementById("badge");
      b.textContent = l;
      b.style.opacity = "1";
    }, label);
    const end = Date.now() + timeout;
    while (!(await check().catch(() => false))) {
      if (Date.now() > end) throw new Error("until(): timed out");
      await frame();
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => (document.getElementById("badge").style.opacity = "0"));
  },
};

if (take.ready) await take.ready(t);
else await page.waitForTimeout(1500);

if (STILL) {
  if (take.still) await take.still(t);
  await frame();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${framesDir}/00000.jpg`, `${out}.png`]);
  console.log(`still: ${out}.png`);
} else {
  await take.default(t);
  const poster = posterAt >= 0 ? posterAt : Math.floor(n / 2);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${framesDir}/%05d.jpg`,
    "-vf", `scale=${OUT_W}:-2:flags=lanczos`, "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${out}.mp4`,
  ]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${framesDir}/${String(poster).padStart(5, "0")}.jpg`, "-vf", `scale=${OUT_W}:-2`, `${out}.png`]);
  console.log(`video: ${out}.mp4 (${n} frames, ${(n / FPS).toFixed(1)}s) poster: ${out}.png`);
}
await browser.close();
if (!KEEP) rmSync(framesDir, { recursive: true, force: true });
