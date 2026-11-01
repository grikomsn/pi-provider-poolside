import { appendFile } from "node:fs/promises";

// Loaded only by the isolated packed-extension test host. No request can reach
// a real service: every call is answered locally and recorded.
export default function installTestFetch(): void {
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const log = process.env.POOLSIDE_TEST_FETCH_LOG!;
    if (url.origin !== "https://inference.poolside.ai" || url.pathname !== "/v1/chat/completions") {
      await appendFile(log, `unexpected ${url.origin}${url.pathname}\n`);
      return new Response("unexpected request", { status: 599 });
    }
    const payload = JSON.parse(String(init?.body)) as { model: string };
    await appendFile(log, `chat ${payload.model}\n`);
    const chunk = {
      id: "poolside-test", object: "chat.completion.chunk", created: 1,
      model: payload.model,
      choices: [{ index: 0, delta: { role: "assistant", content: `PACKED_POOLSIDE_OK ${payload.model}` }, finish_reason: null }],
    };
    const end = {
      ...chunk,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  };
}
