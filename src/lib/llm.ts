// Single place that decides which LLM serves requests. Every provider is
// called through the OpenAI-compatible chat completions API.

export type LlmConfig = { url: string; key: string; model: string; label: string; local: boolean };

const geniexBase = () => (process.env.GENIEX_BASE_URL || "http://127.0.0.1:18181/v1").replace(/\/$/, "");

/** Text model for the agent and compare mode. GenieX wins when GENIEX_AGENT_MODEL is set. */
export function llmConfig(): LlmConfig {
  const geniexModel = process.env.GENIEX_AGENT_MODEL;
  if (geniexModel) {
    return { url: `${geniexBase()}/chat/completions`, key: "geniex", model: geniexModel, label: `${geniexModel} · GenieX on-device`, local: true };
  }
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic) {
    const model = process.env.LLM_MODEL || "claude-sonnet-5-5";
    return { url: "https://api.anthropic.com/v1/chat/completions", key: anthropic, model, label: model, local: false };
  }
  const key = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("No LLM configured (set GENIEX_AGENT_MODEL, ANTHROPIC_API_KEY, OPENAI_API_KEY or OPENROUTER_API_KEY).");
  if (key.startsWith("sk-or-")) {
    const model = process.env.LLM_MODEL || "openai/gpt-4.1";
    return { url: "https://openrouter.ai/api/v1/chat/completions", key, model, label: `${model} · OpenRouter`, local: false };
  }
  const model = process.env.LLM_MODEL || "gpt-4.1";
  return { url: "https://api.openai.com/v1/chat/completions", key, model, label: model, local: false };
}

/** Vision model for reading screenshots; always local GenieX. */
export function visionConfig(): LlmConfig {
  const model = process.env.GENIEX_VLM_MODEL;
  if (!model) throw new Error("Screenshot reading is not configured (set GENIEX_VLM_MODEL).");
  return { url: `${geniexBase()}/chat/completions`, key: "geniex", model, label: `${model} · GenieX on-device`, local: true };
}

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage = { content: string | null; tool_calls?: ToolCall[] };

export async function chat(
  cfg: LlmConfig,
  body: { messages: unknown[]; tools?: unknown[]; forceTool?: string; max_tokens?: number },
): Promise<ChatMessage> {
  const { forceTool, ...rest } = body;
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
      // CPU-only local inference is far slower than hosted APIs.
      signal: AbortSignal.timeout(cfg.local ? 600_000 : 90_000),
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: rest.max_tokens ?? 4000,
        ...rest,
        // GenieX ignores tool_choice; callers nudge local models via the prompt instead.
        ...(forceTool && !cfg.local ? { tool_choice: { type: "function", function: { name: forceTool } } } : {}),
      }),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError") throw new Error(`${cfg.local ? "Local model" : "LLM"} timed out.`);
    throw new Error(cfg.local ? `Can't reach GenieX at ${geniexBase()}. Is \`geniex serve\` running?` : `LLM request failed: ${err.message}`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`LLM error (${res.status}): ${data?.error?.message ?? "unknown"}`);
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error("LLM returned an empty response.");
  return { content: msg.content ?? null, tool_calls: msg.tool_calls?.length ? msg.tool_calls : undefined };
}

/** Parse a JSON object from a model reply, tolerating ```json fences and surrounding prose. */
export function parseJsonObject(text: string | null | undefined): unknown {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}
