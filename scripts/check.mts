// Runnable sanity check: node scripts/check.mts  (synthetic fixtures, not live data)
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// App code uses extensionless imports (bundler style); resolve them to .ts for plain Node.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith(".")) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
const { excerptInSource, validateReport } = await import("../src/lib/analyze.ts");
const { assertPublicUrl } = await import("../src/lib/safeUrl.ts");
const { llmConfig, parseJsonObject } = await import("../src/lib/llm.ts");

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
// Local models wrap JSON in fences or prose.
assert.deepEqual(parseJsonObject('Sure:\n```json\n{"status":"QUALIFIED"}\n```'), { status: "QUALIFIED" });
assert.equal(parseJsonObject("no json here"), null);

// Provider selection: GenieX wins when configured, else hosted keys.
for (const k of ["GENIEX_AGENT_MODEL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "LLM_MODEL", "GENIEX_BASE_URL"]) delete process.env[k];
process.env.OPENROUTER_API_KEY = "sk-or-test";
assert.match(llmConfig().url, /openrouter\.ai/);
assert.equal(llmConfig().local, false);
process.env.GENIEX_AGENT_MODEL = "unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0";
assert.equal(llmConfig().url, "http://127.0.0.1:18181/v1/chat/completions");
assert.equal(llmConfig().local, true);

console.log("check: all assertions passed");
