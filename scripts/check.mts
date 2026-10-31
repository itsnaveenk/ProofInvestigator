// Runnable sanity check: node scripts/check.mts  (synthetic fixtures, not live data)
import assert from "node:assert/strict";
import { excerptInSource, validateReport } from "../src/lib/analyze.ts";
import { assertPublicUrl } from "../src/lib/safeUrl.ts";

const policy = "## Cancellations\n\nFares are **non-refundable**. Cancel within 24 hours of [booking](https://x.test) for a full refund.";
assert.ok(excerptInSource("Cancel within 24 hours of booking for a full refund.", policy));
assert.ok(!excerptInSource("Cancel any time for a full refund.", policy));

const { report, rejected } = validateReport(
  {
    status: "QUALIFIED", advertisedClaim: "x", claimFoundOnOffer: true, policyFinding: "y", explanation: "z",
    importantConditions: [], unansweredQuestions: [], nextSteps: [],
    evidence: [{ source: "policy", excerpt: "Invented fee of $50 applies." }],
  },
  [{ role: "offer", url: "https://o.test", markdown: "offer" }, { role: "policy", url: "https://p.test", markdown: policy }],
);
assert.equal(rejected, 1);
assert.equal(report.status, "UNVERIFIED"); // verdict without verified policy evidence is downgraded
assert.equal(report.claimFoundOnOffer, false);

for (const bad of ["http://localhost:3000", "http://127.0.0.1", "http://169.254.169.254/latest", "http://10.0.0.5", "file:///etc/passwd", "http://[::1]/", "https://example.com:8080"]) {
  await assert.rejects(assertPublicUrl(bad, "URL"), bad);
}
assert.ok(await assertPublicUrl("https://example.com/terms", "URL"));
console.log("check: all assertions passed");
