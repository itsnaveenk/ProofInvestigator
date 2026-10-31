"use client";

import { useEffect, useState } from "react";
import type { InvestigateResponse } from "./api/investigate/route";
import type { AgentEvent } from "@/lib/agent";
import type { Status } from "@/lib/analyze";

type Ok = Extract<InvestigateResponse, { ok: true }>;
type Step = { id: string; label: string; state: "running" | "ok" | "fail"; summary?: string };

const STATUS_STYLE: Record<Status, { label: string; tone: string; dot: string; blurb: string }> = {
  SUPPORTED: { label: "Supported", tone: "bg-emerald-50 text-emerald-900 ring-emerald-200", dot: "bg-emerald-500", blurb: "The published terms back this claim." },
  QUALIFIED: { label: "Qualified", tone: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-500", blurb: "True only under specific conditions." },
  CONTRADICTED: { label: "Contradicted", tone: "bg-rose-50 text-rose-900 ring-rose-200", dot: "bg-rose-500", blurb: "The published terms conflict with this claim." },
  UNVERIFIED: { label: "Unverified", tone: "bg-slate-100 text-slate-800 ring-slate-300", dot: "bg-slate-400", blurb: "Not enough published evidence to confirm." },
};

// Real public pages, fetched live when run.
const EXAMPLES = [
  {
    label: "Delta “no change fees”",
    offerUrl: "https://www.delta.com/us/en/change-cancel/overview",
    policyUrl: "https://www.delta.com/us/en/change-cancel/cancel-flight",
    claim: "Delta advertises no change fees. If I cancel my Main Cabin ticket, do I get my money back?",
  },
  {
    label: "Basic Economy refund",
    offerUrl: "https://www.delta.com/us/en/change-cancel/overview",
    policyUrl: "https://www.delta.com/us/en/change-cancel/cancel-flight",
    claim: "Delta says there are no change fees, so I can cancel my Basic Economy ticket any time for a full cash refund.",
  },
];

const AGENT_EXAMPLES = [
  { label: "Delta Basic Economy", query: "I'm booking a Delta Basic Economy ticket. Their site says no change fees. If I cancel 3 days later, can I get a full cash refund?" },
  { label: "Booking.com “free cancellation”", query: "Booking.com shows free cancellation on my hotel. Does that mean I always get my money back if I cancel?" },
  { label: "With a link", query: "https://www.delta.com/us/en/change-cancel/overview says no change fees. Does that mean I can cancel my Main Cabin flight for my money back?" },
];

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export default function Home() {
  const [mode, setMode] = useState<"agent" | "manual">("agent");
  const [query, setQuery] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [offerUrl, setOfferUrl] = useState("");
  const [policyUrl, setPolicyUrl] = useState("");
  const [claim, setClaim] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Ok | null>(null);

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [loading]);

  async function investigate(e: React.FormEvent) {
    e.preventDefault();
    start();
    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerUrl, policyUrl, claim }),
      });
      const data = (await res.json().catch(() => null)) as InvestigateResponse | null;
      if (!data) throw new Error(`Server error (HTTP ${res.status}).`);
      if (!data.ok) throw new Error(data.error);
      setResult(data);
      requestAnimationFrame(() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function start() {
    setLoading(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    setSteps([]);
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    start();
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Server error (HTTP ${res.status}).`);
      }
      // Newline-delimited JSON events, rendered as they arrive.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buf += chunk.value ?? "";
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const ev = JSON.parse(line) as AgentEvent;
          if (ev.type === "step") setSteps((s) => [...s, { id: ev.id, label: ev.label, state: "running" }]);
          else if (ev.type === "step_done") setSteps((s) => s.map((x) => (x.id === ev.id ? { ...x, state: ev.ok ? "ok" : "fail", summary: ev.summary } : x)));
          else if (ev.type === "error") throw new Error(ev.error);
          else if (ev.type === "result") {
            const cited = (url: string) => ev.report.evidence.find((x) => x.sourceUrl === url)?.source ?? "page";
            setResult({
              ok: true,
              report: ev.report,
              rejectedEvidence: ev.rejectedEvidence,
              retrievalFailure: false,
              sources: ev.pages.map((p) => ({ role: cited(p.url), url: p.url, ok: true, chars: p.chars })),
            });
            requestAnimationFrame(() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50";

  return (
    <div className="min-h-screen bg-[#fafaf9] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-[13px] font-semibold text-white">P</span>
            <span className="text-[15px] font-semibold tracking-tight">PromiseProof</span>
          </div>
          <span className="hidden text-sm text-slate-500 sm:block">Travel cancellation &amp; refund checks</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <section className="pb-10 pt-14 sm:pt-20">
          <p className="text-sm font-medium text-slate-500">Know the fine print before you pay.</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Check what the offer promises against what the terms actually say.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            Ask about a travel deal in plain English. PromiseProof’s agent finds the provider’s official terms, reads the live pages, and
            shows you where they agree, add conditions, or quietly disagree — with quotes you can verify.
          </p>
        </section>

        <div role="tablist" className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm">
          {([["agent", "Ask the agent"], ["manual", "Compare two pages"]] as const).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              disabled={loading}
              onClick={() => setMode(m)}
              className={`rounded-md px-3.5 py-1.5 font-medium transition-colors ${mode === m ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "agent" ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Try:</span>
              {AGENT_EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  disabled={loading}
                  onClick={() => setQuery(ex.query)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 transition-colors hover:border-slate-400 disabled:opacity-50"
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <form onSubmit={ask} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <label className="block">
                <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-slate-700">
                  What do you want checked?
                  <span className="font-normal text-slate-400">Type or dictate · links optional</span>
                </span>
                <textarea
                  className={`${input} min-h-[132px] resize-y leading-relaxed`}
                  required
                  minLength={5}
                  maxLength={3000}
                  placeholder={'e.g. "I\'m booking a Delta Basic Economy fare. The site says no change fees — can I cancel later and get my money back?"'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                />
              </label>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  {loading ? (
                    <span className="inline-flex items-center gap-2" aria-live="polite">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
                      Agent is researching… {elapsed}s
                    </span>
                  ) : (
                    "The agent searches the web and reads official pages live. Nothing is stored."
                  )}
                </p>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-6 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {loading ? "Investigating…" : "Investigate"}
                </button>
              </div>
            </form>
            {steps.length > 0 && <StepTrace steps={steps} />}
          </>
        ) : (
          <>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Try an example:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              disabled={loading}
              onClick={() => {
                setOfferUrl(ex.offerUrl);
                setPolicyUrl(ex.policyUrl);
                setClaim(ex.claim);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 transition-colors hover:border-slate-400 disabled:opacity-50"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <form onSubmit={investigate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Offer URL</span>
              <input className={input} type="url" required placeholder="https://… the deal or listing page" value={offerUrl} onChange={(e) => setOfferUrl(e.target.value)} disabled={loading} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Terms / policy URL</span>
              <input className={input} type="url" required placeholder="https://… cancellation or refund policy" value={policyUrl} onChange={(e) => setPolicyUrl(e.target.value)} disabled={loading} />
            </label>
          </div>
          <label className="mt-5 block">
            <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-slate-700">
              Claim or question
              <span className="font-normal text-slate-400">Type or dictate</span>
            </span>
            <textarea
              className={`${input} min-h-[112px] resize-y leading-relaxed`}
              required
              minLength={5}
              maxLength={2000}
              placeholder={'e.g. "The ad says free cancellation up to 24 hours before departure. Will I get a full cash refund?"'}
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              disabled={loading}
            />
          </label>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {loading ? (
                <span className="inline-flex items-center gap-2" aria-live="polite">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
                  Reading both pages and comparing terms… {elapsed}s
                  <span className="hidden text-slate-400 md:inline">· usually 20–90s</span>
                </span>
              ) : (
                "Pages are fetched live. Nothing is stored."
              )}
            </p>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-6 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Investigating…" : "Investigate"}
            </button>
          </div>
        </form>
          </>
        )}

        {error && (
          <div role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-[15px] text-rose-900">
            <p className="font-medium">Investigation couldn’t be completed</p>
            <p className="mt-1 text-rose-800">{error}</p>
          </div>
        )}

        {result && <Results data={result} />}

        <footer className="py-16 text-center text-sm text-slate-400">
          PromiseProof summarizes published terms. It isn’t legal advice — always confirm with the provider before you pay.
        </footer>
      </main>
    </div>
  );
}

function Results({ data }: { data: Ok }) {
  const { report, sources } = data;
  const s = STATUS_STYLE[report.status];
  const offerSrc = sources.find((x) => x.role === "offer");
  const policySrc = sources.find((x) => x.role === "policy");

  return (
    <section id="report" className="mt-10 scroll-mt-6 space-y-6">
      {/* Overall finding */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${s.tone}`}>
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            {s.label}
          </span>
          <span className="text-sm text-slate-500">{s.blurb}</span>
        </div>
        <p className="mt-5 text-lg leading-relaxed text-slate-800">{report.explanation}</p>

        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          {sources.map((src) => (
            <span key={src.role} className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 ${src.ok ? "bg-slate-50 text-slate-600 ring-slate-200" : "bg-rose-50 text-rose-800 ring-rose-200"}`}>
              <span className="font-medium capitalize">{src.role}</span>
              {host(src.url)}
              <span className="text-slate-400">·</span>
              {src.ok ? `${src.chars?.toLocaleString()} chars read` : "not retrieved"}
            </span>
          ))}
          {data.rejectedEvidence > 0 && (
            <span className="rounded-md bg-slate-50 px-2 py-1 text-slate-500 ring-1 ring-slate-200">
              {data.rejectedEvidence} unverifiable quote{data.rejectedEvidence > 1 ? "s" : ""} discarded
            </span>
          )}
        </div>
        {sources.filter((x) => !x.ok).map((x) => (
          <p key={x.role} className="mt-3 text-sm text-rose-700">
            <span className="font-medium capitalize">{x.role} page:</span> {x.error}
          </p>
        ))}
      </div>

      {/* Promise vs fine print */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">The promise</h2>
            <span className={`text-xs ${report.claimFoundOnOffer ? "text-emerald-700" : "text-slate-500"}`}>
              {report.claimFoundOnOffer ? "Found on offer page" : "Not found on offer page"}
            </span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-800">{report.advertisedClaim}</p>
          {offerSrc && <SourceLink url={offerSrc.url} />}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">The fine print</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-800">{report.policyFinding}</p>
          {policySrc && <SourceLink url={policySrc.url} />}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ListCard title="Important conditions" items={report.importantConditions} empty="No specific conditions found in the published terms." />
        <ListCard title="Practical next steps" items={report.nextSteps} ordered />
      </div>

      {/* Evidence */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Source excerpts</h2>
        <p className="mt-1 text-sm text-slate-500">Each quote below was checked word-for-word against the page we retrieved.</p>
        {report.evidence.length === 0 ? (
          <p className="mt-4 text-[15px] text-slate-600">No verifiable excerpts available.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {report.evidence.map((e, i) => (
              <li key={i} className="border-l-2 border-slate-300 pl-4">
                <blockquote className="text-[15px] leading-relaxed text-slate-800">“{e.excerpt}”</blockquote>
                <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-sm text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">
                  {e.source === "offer" ? "Offer" : "Policy"} · {host(e.sourceUrl)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {report.unansweredQuestions.length > 0 && (
        <ListCard title="Still unclear — ask the provider" items={report.unansweredQuestions} />
      )}
    </section>
  );
}

function StepTrace({ steps }: { steps: Step[] }) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:px-8" aria-live="polite">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agent activity</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">
              {s.state === "running" ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
              ) : s.state === "ok" ? (
                <span className="text-emerald-600">✓</span>
              ) : (
                <span className="text-rose-600">✕</span>
              )}
            </span>
            <span className="min-w-0 break-words text-slate-700">
              {s.label}
              {s.summary && <span className="text-slate-400"> · {s.summary}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SourceLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block truncate text-sm text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">
      {host(url)} ↗
    </a>
  );
}

function ListCard({ title, items, empty, ordered }: { title: string; items: string[]; empty?: string; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[15px] text-slate-600">{empty}</p>
      ) : (
        <List className={`mt-3 space-y-2.5 text-[15px] leading-relaxed text-slate-800 ${ordered ? "list-decimal" : "list-disc"} pl-5 marker:text-slate-400`}>
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </List>
      )}
    </div>
  );
}
