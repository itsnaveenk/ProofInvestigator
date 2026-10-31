# PromiseProof — 60-second demo

Cloud LLM for the agent (fast), GenieX on-device for the screenshot.

## Before recording

1. `docker start geniex` (GenieX server, vision model) and `npm run dev`.
2. In `.env.local`, `GENIEX_AGENT_MODEL` must be commented out → agent uses the cloud LLM.
3. Warm up: run both demo inputs once (Anakin caches pages → faster, same verdict on camera).
4. Chrome at `http://localhost:3000`, window ~1280×800, zoom 110%, bookmarks bar hidden, notifications off (Focus mode).
5. Wispr Flow running; screenshot file ready: `test-results/screenshots/booking-paris-live-2026-10-31.jpg`.
6. Record with **⌘⇧5 → Record Selected Portion** (include mic for voice-over, or add VO later).

## Shot list (≤ 60 s after trimming)

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:06 | Hero section | "‘Free cancellation.’ ‘No change fees.’ Travel deals promise a lot. PromiseProof checks the fine print before you pay." |
| 0:06–0:16 | Click the box, hold Wispr Flow hotkey, speak: *"I'm booking a Delta Basic Economy ticket. Their site says no change fees. If I cancel three days later, can I get a full cash refund?"* | (the dictation itself) |
| 0:16–0:28 | Click **Investigate** → Agent activity streams: Anakin search, reading delta.com pages. **Speed up 3–4× in edit.** | "An AI agent searches the web with Anakin, finds Delta's official terms, and reads the live pages." |
| 0:28–0:42 | Verdict badge → Promise vs Fine print → scroll to Source excerpts | "Verdict: qualified. Cash back only within 24 hours; after that, an eCredit. Every quote is checked word-for-word against the live page — the AI can't invent evidence." |
| 0:42–0:54 | Drag the Booking.com screenshot onto **Attach screenshot** → "Read on-device by … GenieX" → question auto-filled. **Cut the wait.** | "Got a screenshot instead? Qualcomm GenieX reads it on-device — your booking details never leave your machine." |
| 0:54–0:60 | Logo / hero, overlay: *Wispr Flow · Anakin · GenieX* | "PromiseProof. Know the fine print before you pay." |

## Editing and upload

- Trim waits / speed up the agent section (iMovie: select clip → speedometer → Fast; or CapCut).
- Export 1080p, check length ≤ 60 s.
- Upload to YouTube as **Unlisted** (or Google Drive → Share → "Anyone with the link") and paste the link in the submission.
