import { chat, parseJsonObject, visionConfig } from "@/lib/llm";

export const maxDuration = 300;

export type ScreenshotResponse =
  | { ok: true; query: string; provider: string | null; offer: string | null; promises: string[]; model: string; ms: number }
  | { ok: false; error: string };

const MAX_DATA_URL = 8_000_000; // ~6 MB image
const json = (body: ScreenshotResponse, status = 200) => Response.json(body, { status });

const SYSTEM = `You read screenshots of travel offers (flights, hotels, rentals, packages).
Extract only text that is visibly present in the image. Do not guess.
Reply with JSON only, no prose:
{"isTravelOffer": boolean, "provider": string|null, "offer": string|null, "promises": string[]}
- provider: the airline, hotel, or booking site name.
- offer: the product shown, e.g. fare type, room type, route, or dates.
- promises: exact wording about cancellation, refunds, changes, or fees (e.g. "Free cancellation", "Fully refundable"). Empty if none.`;

const RELEVANT = /cancel|refund|prepay|pay (at|later)|deposit|change|fee|penalt|credit|non-?refundable/i;
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const image = typeof body?.image === "string" ? body.image : "";
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return json({ ok: false, error: "Please attach a PNG, JPEG, or WebP screenshot." }, 400);
  if (image.length > MAX_DATA_URL) return json({ ok: false, error: "Screenshot is too large (max ~6 MB)." }, 400);

  let cfg;
  try {
    cfg = visionConfig();
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }

  const started = Date.now();
  try {
    const msg = await chat(cfg, {
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the offer details from this screenshot as JSON." },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });
    const raw = parseJsonObject(msg.content) as Record<string, unknown> | null;
    if (!raw) return json({ ok: false, error: "The on-device model couldn't read this screenshot. Try a clearer or tighter crop." }, 422);

    const provider = str(raw.provider, 80);
    const offer = str(raw.offer, 160);
    // Keep only cancellation/refund/payment terms; small VLMs also return urgency copy like "7 left".
    const promises = (Array.isArray(raw.promises) ? raw.promises : [])
      .map((p) => str(p, 160))
      .filter((p): p is string => !!p && RELEVANT.test(p))
      .slice(0, 5);
    if (raw.isTravelOffer === false || (!provider && !promises.length)) {
      return json({ ok: false, error: "No travel offer found in this screenshot." }, 422);
    }

    const subject = [provider, offer].filter(Boolean).join(" — ");
    const query = promises.length
      ? `${subject}. The offer says: ${promises.map((p) => `“${p}”`).join(", ")}. Is that true under their published terms? If I cancel, do I get my money back?`
      : `${subject}. What are the cancellation and refund terms if I need to cancel?`;
    return json({ ok: true, query, provider, offer, promises, model: cfg.label, ms: Date.now() - started });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 502);
  }
}
