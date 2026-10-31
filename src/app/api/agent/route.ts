import { runAgent, type AgentEvent } from "@/lib/agent";

export const maxDuration = 300;

// Streams AgentEvent objects as newline-delimited JSON.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length < 5) return Response.json({ type: "error", error: "Please describe what you want checked." }, { status: 400 });
  if (query.length > 3000) return Response.json({ type: "error", error: "Request is too long (max 3000 characters)." }, { status: 400 });
  if (!process.env.ANAKIN_API_KEY) return Response.json({ type: "error", error: "Server is missing ANAKIN_API_KEY." }, { status: 500 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(query, emit);
      } catch (e) {
        emit({ type: "error", error: (e as Error).message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
