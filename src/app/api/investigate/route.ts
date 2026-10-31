import { scrape, type ScrapeResult } from "@/lib/anakin";
import { analyze, type Report } from "@/lib/analyze";
import { assertPublicUrl } from "@/lib/safeUrl";

export const maxDuration = 300;

export type SourceStatus = { role: "offer" | "policy" | "page"; url: string; ok: boolean; chars?: number; usedBrowser?: boolean; error?: string };
export type InvestigateResponse =
  | { ok: true; report: Report; sources: SourceStatus[]; rejectedEvidence: number; retrievalFailure: boolean; model?: string }
  | { ok: false; error: string; sources?: SourceStatus[] };

const json = (body: InvestigateResponse, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  let body: { offerUrl?: unknown; policyUrl?: unknown; claim?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }
  const claim = typeof body.claim === "string" ? body.claim.trim() : "";
  if (claim.length < 5) return json({ ok: false, error: "Please describe the claim or question (at least a few words)." }, 400);
  if (claim.length > 2000) return json({ ok: false, error: "Claim is too long (max 2000 characters)." }, 400);

  let offerUrl: string, policyUrl: string;
  try {
    [offerUrl, policyUrl] = await Promise.all([
      assertPublicUrl(String(body.offerUrl ?? ""), "Offer URL"),
      assertPublicUrl(String(body.policyUrl ?? ""), "Policy URL"),
    ]);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
  if (!process.env.ANAKIN_API_KEY) return json({ ok: false, error: "Server is missing ANAKIN_API_KEY." }, 500);

  const [offer, policy] = await Promise.all([scrape(offerUrl), scrape(policyUrl)]);
  const status = (role: SourceStatus["role"], r: ScrapeResult): SourceStatus =>
    r.ok
      ? { role, url: r.url, ok: true, chars: r.markdown.length, usedBrowser: r.usedBrowser }
      : { role, url: r.url, ok: false, error: r.error };
  const sources = [status("offer", offer), status("policy", policy)];

  // Without the policy there is nothing to verify against: report honestly, no LLM guesswork.
  if (!policy.ok) {
    return json({
      ok: true,
      retrievalFailure: true,
      rejectedEvidence: 0,
      sources,
      report: {
        status: "UNVERIFIED",
        advertisedClaim: claim,
        claimFoundOnOffer: false,
        policyFinding: `The policy page could not be retrieved: ${policy.error}`,
        explanation: "PromiseProof only reports what published terms say. Because the terms page could not be read, the claim cannot be checked.",
        importantConditions: [],
        evidence: [],
        unansweredQuestions: ["What do the provider's published cancellation and refund terms actually say?"],
        nextSteps: [
          "Check that the policy URL is correct and publicly accessible without logging in.",
          "Try the provider's dedicated cancellation/refund policy page instead of a general page.",
          "Ask the provider to confirm the cancellation terms in writing before you pay.",
        ],
      },
    });
  }

  try {
    const { report, rejected, model } = await analyze(claim, [
      { role: "offer", url: offerUrl, markdown: offer.ok ? offer.markdown : null },
      { role: "policy", url: policyUrl, markdown: policy.markdown },
    ]);
    return json({ ok: true, report, sources, rejectedEvidence: rejected, retrievalFailure: !offer.ok, model });
  } catch (e) {
    return json({ ok: false, error: `Analysis failed: ${(e as Error).message}`, sources }, 502);
  }
}
