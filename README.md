# PromiseProof

**Know the fine print before you pay.**

Ask about a travel deal in plain English — "Delta's site says no change fees; if I cancel my Basic Economy ticket in 3 days, do I get my money back?" — and PromiseProof's agent finds the provider's official cancellation/refund terms, reads the live pages with [Anakin](https://anakin.io), and returns a verdict backed by quotes that are checked word-for-word against those pages.

Verdicts:

| Status | Meaning |
|---|---|
| `SUPPORTED` | Published terms clearly back the claim. |
| `QUALIFIED` | True only with meaningful conditions, fees, or deadlines. |
| `CONTRADICTED` | Published terms conflict with the claim. |
| `UNVERIFIED` | Relevant official terms couldn't be found, read, or verified. |

Each report includes the overall finding, promise vs. fine print, important conditions, verified source excerpts with links, open questions, and practical next steps.

## Quick start

```bash
cp .env.example .env.local   # then fill in keys
npm install
npm run dev                  # http://localhost:3000
```

Environment (server-side only, never exposed to the browser):

| Variable | Required | Notes |
|---|---|---|
| `ANAKIN_API_KEY` | Yes | Anakin URL Scraper + Search API. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | One of them | Anthropic preferred if set. `sk-or-…` keys are routed to OpenRouter automatically. |
| `LLM_MODEL` | No | Model override. Defaults: `claude-sonnet-5-5`, `gpt-4.1`, `openai/gpt-4.1` (OpenRouter). |

## Using it

**Ask the agent** (default tab) — one free-text box, links optional. Works with system-wide dictation (e.g. Wispr Flow) since it's a plain native textarea. The page streams each agent step live (searches, pages read, failures), then shows the report. Typical run: 20–40s.

**Compare two pages** — supply an offer URL, a policy URL, and the claim. Both pages are scraped concurrently and compared directly. Use this when you already know exactly which pages matter.

Both tabs include clickable examples using real public Delta and Booking.com pages.

## Architecture

```
src/
  app/
    page.tsx                  UI: both modes, live agent trace, report view
    api/agent/route.ts        POST {query} → NDJSON stream of agent events
    api/investigate/route.ts  POST {offerUrl, policyUrl, claim} → JSON report
  lib/
    agent.ts                  Tool-calling agent loop
    analyze.ts                Excerpt selection, LLM schema, evidence validation
    anakin.ts                 Anakin scrape (+ polling) and search clients
    safeUrl.ts                SSRF guard
scripts/check.mts             Sanity check (synthetic fixtures)
test-results/                 Raw responses from live runs
```

### Agent (`src/lib/agent.ts`)

An OpenAI-compatible tool-calling loop (works with OpenRouter, OpenAI, and Anthropic's compatibility endpoint) with three tools:

- `web_search(query)` → Anakin Search API (`POST /v1/search`). Results are leads only, never evidence.
- `fetch_page(url, focus)` → Anakin URL Scraper. Returns the parts of the page relevant to `focus`; the full text is kept server-side for evidence checks. Same page under a different `#fragment` is reused.
- `submit_report(...)` → final structured report; ends the run.

Limits: 10 model turns, 5 page reads. Independent tool calls run in parallel. On the last turn the model is forced to submit. Events streamed to the UI: `step`, `step_done`, `note`, `result`, `error`.

### Scraping (`src/lib/anakin.ts`)

- `POST /v1/url-scraper/scrape` with `X-API-Key`. Job `status` is checked explicitly — failed jobs can return HTTP 200.
- `202` / non-terminal status → polls `GET /v1/url-scraper/{id}` within a time budget (170s manual, 90s per agent fetch).
- Thin or empty content → one retry with `useBrowser: true` (needed for JS-heavy sites).
- Target HTTP ≥ 400, empty pages, and timeouts are reported as retrieval failures — never replaced with mock data.

### Grounding and safety

- **Evidence must be real.** Every excerpt is matched (whitespace/markdown-normalized) against the full scraped text of the page it cites; non-matching excerpts are discarded and counted in the report.
- **No verdict without proof.** Any status other than `UNVERIFIED` without at least one verified policy excerpt is downgraded to `UNVERIFIED`.
- **Claim provenance.** `claimFoundOnOffer` is true only when a verified excerpt from an offer page backs it; otherwise the advertised claim is labeled unverified.
- **Missing policy.** In manual mode, if the policy page can't be retrieved, the API returns `UNVERIFIED` without calling the LLM.
- **Prompt injection.** Scraped pages and search results are wrapped as untrusted data; the system prompt forbids following instructions inside them.
- **SSRF.** User and agent-chosen URLs must be http(s), standard ports, no credentials, and resolve only to public IPs. Anakin's reported `finalUrl` is re-checked to catch unsafe redirects.

## Testing

```bash
node scripts/check.mts   # evidence matching, verdict downgrade, SSRF rejections
npm run build            # type-check + production build
```

Live scenarios run against real public pages (raw output in `test-results/`):

| File | Mode | Scenario | Result |
|---|---|---|---|
| `s1.json` | Compare | Delta "no change fees" vs. Main Cabin refund | `QUALIFIED` |
| `s2.json` | Compare | Basic Economy "full cash refund any time" | `CONTRADICTED` |
| `s3.json`, `s3b.json` | Compare | Policy URL is a soft-404 (Delta, Booking.com) | `UNVERIFIED` |
| `a1.ndjson` | Agent | Delta Basic Economy refund after 3 days | `QUALIFIED` |
| `a2.ndjson` | Agent | Booking.com "free cancellation" | `QUALIFIED` |
| `a3.ndjson` | Agent | Off-topic (weather) | `UNVERIFIED`, scope explained |

## Known limitations

- Scope is travel cancellation/refund claims.
- The agent tends to use its full 5-page budget, so runs take 20–40s.
- Some sites serve "page not found" with HTTP 200; these are caught by the LLM (→ `UNVERIFIED`), not the scraper.
- Requests are synchronous within one HTTP call (`maxDuration` 300s); no job queue.
- No accounts, history, or database by design. GenieX integration not yet implemented.

PromiseProof summarizes published terms. It isn't legal advice.
