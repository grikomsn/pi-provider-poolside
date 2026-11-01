import assert from "node:assert/strict";
import test from "node:test";
import { fetchModels, fetchWithRetry, isTransientNetworkError, retryDelayMs } from "../src/models.ts";
import { withFetch } from "./helpers.ts";

const ok = () => new Response(JSON.stringify({ data: [{ id: "poolside/ok" }] }), { status: 200 });

test("retryDelayMs backs off exponentially with a 2s cap", () => {
  assert.equal(retryDelayMs(0), 250);
  assert.equal(retryDelayMs(1), 500);
  assert.equal(retryDelayMs(10), 2_000);
});

test("retryDelayMs honours Retry-After seconds and dates, capped at 5s", () => {
  assert.equal(retryDelayMs(0, "1"), 1_000);
  assert.equal(retryDelayMs(0, "0.5"), 500);
  assert.equal(retryDelayMs(0, "120"), 5_000);
  assert.equal(retryDelayMs(0, new Date(Date.now() - 60_000).toUTCString()), 0);
  assert.ok(retryDelayMs(0, new Date(Date.now() + 60_000).toUTCString()) === 5_000);
  // Garbage and negative hints fall back to backoff.
  assert.equal(retryDelayMs(1, "soon"), 500);
  assert.equal(retryDelayMs(1, "-3"), 500);
  assert.equal(retryDelayMs(1, ""), 500);
});

test("isTransientNetworkError classifies connection failures only", () => {
  assert.ok(isTransientNetworkError(new TypeError("fetch failed", { cause: new Error("connect ECONNRESET") })));
  assert.ok(isTransientNetworkError(new TypeError("fetch failed", { cause: "socket hang up" })));
  assert.ok(!isTransientNetworkError(new DOMException("aborted", "AbortError")));
  assert.ok(!isTransientNetworkError(new DOMException("timed out", "TimeoutError")));
  assert.ok(!isTransientNetworkError(new TypeError("fetch failed", { cause: new Error("unexpected redirect") })));
  assert.ok(!isTransientNetworkError(new Error("boom")));
  assert.ok(!isTransientNetworkError("fetch failed"));
});

test("retries transient statuses, releasing each discarded body", async () => {
  const cancelled: boolean[] = [];
  const statuses = [503, 429];
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    const status = statuses.shift();
    if (status === undefined) return ok();
    const body = new ReadableStream({ cancel() { cancelled.push(true); } });
    return new Response(body, { status, headers: { "retry-after": "0" } });
  }) as typeof fetch, async () => {
    const response = await fetchWithRetry("https://example.invalid/models", {});
    assert.equal(response.status, 200);
    assert.equal(calls, 3);
    assert.equal(cancelled.length, 2);
  });
});

test("stops after three attempts and returns the last response", async () => {
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    return new Response("busy", { status: 502, headers: { "retry-after": "0" } });
  }) as typeof fetch, async () => {
    const response = await fetchWithRetry("https://example.invalid/models", {});
    assert.equal(response.status, 502);
    assert.equal(calls, 3);
  });
});

test("does not retry non-transient statuses", async () => {
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    return new Response("nope", { status: 401 });
  }) as typeof fetch, async () => {
    await assert.rejects(fetchModels("secret"), /HTTP 401/);
    assert.equal(calls, 1);
  });
});

test("retries transient network errors but not other failures", async () => {
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") });
    return ok();
  }) as typeof fetch, async () => {
    assert.equal((await fetchWithRetry("https://example.invalid/models", {})).status, 200);
    assert.equal(calls, 2);
  });

  calls = 0;
  await withFetch((async () => {
    calls += 1;
    throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") });
  }) as typeof fetch, async () => {
    await assert.rejects(fetchWithRetry("https://example.invalid/models", {}), /fetch failed/);
    assert.equal(calls, 1);
  });
});

test("an abort during backoff stops retrying promptly", async () => {
  const controller = new AbortController();
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    setTimeout(() => controller.abort(new Error("cancelled")), 10);
    return new Response("busy", { status: 503, headers: { "retry-after": "5" } });
  }) as typeof fetch, async () => {
    const started = Date.now();
    await assert.rejects(fetchWithRetry("https://example.invalid/models", {}, controller.signal), /cancelled/);
    assert.equal(calls, 1);
    assert.ok(Date.now() - started < 1_000);
  });
});
