import { assertPublicUrl } from "./safeUrl";

const BASE = "https://api.anakin.io/v1";
const DEADLINE_MS = 170_000; // whole scrape budget incl. polling
const MIN_CONTENT = 200;

type Job = {
  id?: string;
  status?: string;
  url?: string;
  finalUrl?: string;
  statusCode?: number;
  markdown?: string | null;
  error?: unknown;
};

export type ScrapeResult =
  | { ok: true; url: string; markdown: string; usedBrowser: boolean }
  | { ok: false; url: string; error: string };

function key() {
  const k = process.env.ANAKIN_API_KEY;
  if (!k) throw new Error("ANAKIN_API_KEY is not configured on the server.");
  return k;
}

async function call<T extends { error?: unknown } = Job>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-API-Key": key(), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await res.text();
  let job = {} as T;
  try {
    job = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 401 || res.status === 403) throw new Error("Anakin rejected the API key.");
  if (res.status === 429) throw new Error("Anakin rate limit reached (20/min). Wait a minute and retry.");
  if (res.status >= 400) throw new Error(`Anakin returned HTTP ${res.status}: ${errText(job.error) || text.slice(0, 200)}`);
  return job;
}

function errText(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return JSON.stringify(e);
}

async function scrapeOnce(url: string, useBrowser: boolean, deadline: number): Promise<Job> {
  const remaining = () => deadline - Date.now();
  let job = await call("/url-scraper/scrape", {
    method: "POST",
    body: JSON.stringify({ url, useBrowser, generateJson: false }),
  }, Math.min(120_000, remaining()));

  // 202 / non-terminal: poll GET /v1/url-scraper/{id}
  while (job.status !== "completed" && job.status !== "failed") {
    if (!job.id) throw new Error("Anakin returned an unfinished job without an id.");
    if (remaining() < 4000) throw new Error("Scrape is still processing at Anakin; timed out waiting. Try again.");
    await new Promise((r) => setTimeout(r, 3000));
    job = await call(`/url-scraper/${job.id}`, { method: "GET" }, Math.min(30_000, remaining()));
  }
  return job;
}

export async function scrape(url: string, budgetMs = DEADLINE_MS): Promise<ScrapeResult> {
  const deadline = Date.now() + budgetMs;
  try {
    let usedBrowser = false;
    let job = await scrapeOnce(url, false, deadline);
    // JS-heavy or blocked pages often come back thin without a browser.
    if (job.status !== "completed" || (job.markdown ?? "").trim().length < MIN_CONTENT) {
      if (deadline - Date.now() > 20_000) {
        usedBrowser = true;
        job = await scrapeOnce(url, true, deadline);
      }
    }
    if (job.status === "failed") return { ok: false, url, error: `Page could not be scraped: ${errText(job.error) || "unknown error"}.` };
    // Unsafe redirect check on the final URL Anakin reports.
    if (job.finalUrl && job.finalUrl !== url) await assertPublicUrl(job.finalUrl, "Redirect target");
    if (job.statusCode && job.statusCode >= 400) return { ok: false, url, error: `The page returned HTTP ${job.statusCode} (not found, blocked, or unavailable).` };
    const markdown = (job.markdown ?? "").trim();
    if (markdown.length < MIN_CONTENT) return { ok: false, url, error: "Page returned no meaningful content (possibly blocked, empty, or requires login)." };
    return { ok: true, url, markdown, usedBrowser };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "TimeoutError" ? "Scrape timed out." : e.message) : String(e);
    return { ok: false, url, error: msg };
  }
}

export type SearchHit = { url: string; title: string; snippet: string };

/** Anakin Search API (synchronous). */
export async function search(query: string, limit = 6): Promise<SearchHit[]> {
  const data = await call<{ results?: Partial<SearchHit>[]; error?: unknown }>(
    "/search",
    { method: "POST", body: JSON.stringify({ prompt: query, limit }) },
    45_000,
  );
  return (data.results ?? [])
    .filter((r): r is SearchHit => typeof r.url === "string")
    .map((r) => ({ url: r.url, title: r.title ?? "", snippet: (r.snippet ?? "").slice(0, 400) }));
}
