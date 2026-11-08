import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import poolsideProvider, {
  FALLBACK_MODELS,
  POOLSIDE_BASE_URL,
  fetchModels,
  parseModelsResponse,
} from "../src/index.ts";
import { withAgentDir, withFetch } from "./helpers.ts";

type RefreshContext = Parameters<NonNullable<ProviderConfig["refreshModels"]>>[0];

function register(): { name?: string; config?: ProviderConfig } {
  const registration: { name?: string; config?: ProviderConfig } = {};
  poolsideProvider({
    registerProvider(name: string, config: ProviderConfig) {
      registration.name = name;
      registration.config = config;
    },
  } as ExtensionAPI);
  return registration;
}

test("registers an authenticated OpenAI-compatible provider", async () => {
  await withAgentDir(undefined, () => {
    const registration = register();
    assert.equal(registration.name, "poolside");
    assert.equal(registration.config?.baseUrl, POOLSIDE_BASE_URL);
    assert.equal(registration.config?.apiKey, "$POOLSIDE_API_KEY");
    assert.equal(registration.config?.api, "openai-completions");
    assert.equal(registration.config?.authHeader, true);
    // No persisted catalog yet: the bundled fallback is registered.
    assert.equal(registration.config?.models, FALLBACK_MODELS);
    assert.equal(typeof registration.config?.refreshModels, "function");
  });
});

test("registration seeds pi's persisted catalog so a live-only default resolves at startup", async () => {
  const live = { id: "poolside/laguna-live", name: "Laguna Live", contextWindow: 262_144, maxTokens: 32_768 };
  await withAgentDir({ poolside: { models: [live], checkedAt: 1 }, other: { models: [{ id: "x" }] } }, () => {
    assert.deepEqual(register().config?.models, [live]);
  });
});

test("registration falls back to the bundled catalog when the store is unusable", async () => {
  for (const store of ["{not json", { poolside: { models: [] } }, { poolside: { models: [{ name: "no id" }] } }]) {
    await withAgentDir(store, () => {
      assert.equal(register().config?.models, FALLBACK_MODELS);
    });
  }
});

test("fallback metadata matches current documented models", () => {
  const models = new Map(FALLBACK_MODELS.map((model) => [model.id, model]));
  // Live-served limits (verified 2026-11-09): both Laguna models advertise a
  // 262,144-token context and 32,768 max completion tokens. laguna-m.1 is
  // not in the served catalog nor the sister bridge's bundle; live discovery
  // still lists it for accounts that see it.
  assert.equal(models.size, 2);
  assert.equal(models.get("poolside/laguna-s-2.1")?.contextWindow, 262_144);
  assert.equal(models.get("poolside/laguna-s-2.1")?.maxTokens, 32_768);
  assert.equal(models.get("poolside/laguna-xs-2.1")?.contextWindow, 262_144);
  assert.equal(models.get("poolside/laguna-xs-2.1")?.maxTokens, 32_768);
  assert.ok(!models.has("poolside/laguna-m.1"));
  assert.deepEqual(models.get("poolside/laguna-s-2.1")?.thinkingLevelMap, {
    off: "none", minimal: null, low: null, medium: null, high: null, xhigh: null, max: "xhigh",
  });
  assert.deepEqual(models.get("poolside/laguna-xs-2.1")?.thinkingLevelMap, {
    off: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: null,
  });
  const compat = models.get("poolside/laguna-xs-2.1")?.compat as Record<string, unknown>;
  assert.equal(compat.thinkingFormat, "openrouter");
  assert.equal(compat.maxTokensField, "max_completion_tokens");
});

test("parses every model and uses live metadata", () => {
  const models = parseModelsResponse({
    data: [
      {
        id: "poolside/future-model",
        name: "Future Model",
        context_length: 500_000,
        max_completion_tokens: 50_000,
        supported_features: ["reasoning"],
        input_modalities: ["text", "image"],
        pricing: {
          prompt: "1.25",
          completion: "2.5",
          input_cache_read: "0.2",
          input_cache_write: "0.3",
        },
      },
      {
        id: "poolside/plain-model",
        supported_features: [],
        input_modalities: ["text"],
      },
      { object: "model-without-id" },
    ],
  });

  assert.equal(models.length, 2);
  assert.deepEqual(models[0], {
    id: "poolside/future-model",
    name: "Future Model",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0.3 },
    contextWindow: 500_000,
    maxTokens: 50_000,
    thinkingLevelMap: {
      off: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: null,
    },
    compat: {
      supportsDeveloperRole: false,
      supportsUsageInStreaming: true,
      maxTokensField: "max_completion_tokens",
      thinkingFormat: "openrouter",
    },
  });
  assert.equal(models[1]?.reasoning, false);
  assert.equal(models[1]?.thinkingLevelMap, undefined);
});

test("keeps known metadata when /models returns the basic OpenAI shape", () => {
  const [model] = parseModelsResponse({ data: [{ id: "poolside/laguna-s-2.1" }] });
  assert.equal(model?.name, "Laguna S 2.1");
  assert.equal(model?.contextWindow, 262_144);
  assert.equal(model?.maxTokens, 32_768);
  assert.equal(model?.reasoning, true);
  assert.equal(model?.cost.input, 0);
});

test("uses live serving limits when /models reports them for a known model", () => {
  const [model] = parseModelsResponse({
    data: [{
      id: "poolside/laguna-s-2.1",
      context_length: 262_144,
      max_completion_tokens: 32_768,
    }],
  });
  assert.equal(model?.contextWindow, 262_144);
  assert.equal(model?.maxTokens, 32_768);
});

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "content-type": "application/json" },
  ...init,
});

test("fetches /models with bearer authentication and refuses redirects", async () => {
  let request: { input: string; init?: RequestInit } | undefined;
  await withFetch((async (input: string | URL | Request, init?: RequestInit) => {
    request = { input: String(input), init };
    return json({ data: [{ id: "poolside/new-model" }] });
  }) as typeof fetch, async () => {
    const models = await fetchModels("secret");
    assert.equal(request?.input, `${POOLSIDE_BASE_URL}/models`);
    assert.equal((request?.init?.headers as Record<string, string>).Authorization, "Bearer secret");
    assert.equal(request?.init?.redirect, "error");
    assert.equal(models[0]?.id, "poolside/new-model");
  });
});

/** A pi ≥ 0.84 refresh context: read-only `stored` snapshot plus `publish()`, no `store`. */
function refreshContext(overrides: Partial<RefreshContext> & { published?: unknown[] } = {}): RefreshContext {
  const { published = [], ...rest } = overrides;
  return {
    allowNetwork: true,
    signal: new AbortController().signal,
    async publish(publication) {
      published.push(publication);
      return true;
    },
    ...rest,
  };
}

async function refreshFn(): Promise<NonNullable<ProviderConfig["refreshModels"]>> {
  let refresh: ProviderConfig["refreshModels"];
  await withAgentDir(undefined, () => {
    refresh = register().config?.refreshModels;
  });
  assert.ok(refresh);
  return refresh;
}

test("refresh works with pi's stored/publish context (no context.store)", async () => {
  const refresh = await refreshFn();
  const stored = { models: [{ id: "poolside/cached", name: "Cached" }], checkedAt: 1 };
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    return json({ data: [] });
  }) as typeof fetch, async () => {
    // Cache-only pass: serve the persisted catalog without touching the network.
    const published: unknown[] = [];
    const cached = await refresh(refreshContext({
      allowNetwork: false,
      credential: { type: "api_key", key: "secret" },
      stored: stored as never,
      published,
    }));
    assert.deepEqual(cached.map((model) => model.id), ["poolside/cached"]);
    assert.equal(published.length, 0);
    assert.equal(calls, 0);

    // Corrupt persisted rows are dropped rather than handed to pi's validator.
    const mixed = { models: [{ id: "poolside/cached" }, { name: "no id" }, { id: "poolside/bad", baseUrl: 7 }] };
    assert.deepEqual(
      (await refresh(refreshContext({ allowNetwork: false, stored: mixed as never }))).map((model) => model.id),
      ["poolside/cached"],
    );
    assert.equal(
      await refresh(refreshContext({ allowNetwork: false, stored: { models: [{ name: "no id" }] } as never })),
      FALLBACK_MODELS,
    );

    // Nothing persisted yet: the bundled fallback.
    assert.equal(await refresh(refreshContext({ allowNetwork: false })), FALLBACK_MODELS);
  });
});

test("refresh publishes the discovered catalog and keeps the last one through failures", async () => {
  const refresh = await refreshFn();
  const published: Array<{ persist?: { models: Array<{ id: string }>; checkedAt?: number } }> = [];
  const credential = { type: "api_key" as const, key: "secret" };

  await withFetch((async () => json({
    data: [{ id: "poolside/account-a" }, { id: "poolside/account-b" }],
  })) as typeof fetch, async () => {
    const discovered = await refresh(refreshContext({ credential, published }));
    assert.deepEqual(discovered.map((model) => model.id), ["poolside/account-a", "poolside/account-b"]);
    assert.equal(published.length, 1);
    assert.deepEqual(published[0]?.persist?.models.map((model) => model.id), ["poolside/account-a", "poolside/account-b"]);
    assert.equal(typeof published[0]?.persist?.checkedAt, "number");
  });

  const stored = published[0]!.persist!;
  await withFetch((async () => new Response("unavailable", { status: 401 })) as typeof fetch, async () => {
    const kept = await refresh(refreshContext({ credential, stored: stored as never, published }));
    assert.deepEqual(kept.map((model) => model.id), ["poolside/account-a", "poolside/account-b"]);
    // A failed discovery never overwrites the persisted catalog.
    assert.equal(published.length, 1);
  });
});

test("refresh falls back when no resolved credential is available", async () => {
  const refresh = await refreshFn();
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    return json({ data: [] });
  }) as typeof fetch, async () => {
    assert.equal(await refresh(refreshContext()), FALLBACK_MODELS);
    assert.equal(calls, 0);
  });
});

test("refresh rethrows when pi aborts it instead of reporting a stale catalog", async () => {
  const refresh = await refreshFn();
  const controller = new AbortController();
  await withFetch((async () => {
    controller.abort(new Error("superseded"));
    throw new DOMException("aborted", "AbortError");
  }) as typeof fetch, async () => {
    await assert.rejects(refresh(refreshContext({
      credential: { type: "api_key", key: "secret" },
      signal: controller.signal,
    })));
  });
});

test("hostile persisted rows never fail registration in pi's real model runtime", async () => {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const good = { id: "poolside/good", contextWindow: 262_144, maxTokens: 32_768 };
  const rows = [
    good,
    { id: "poolside/null-api", api: null },
    { id: "poolside/null-base", baseUrl: null },
    { id: "poolside/empty-api", api: "" },
    { id: "poolside/numeric-api", api: 7 },
    { id: "poolside/empty-base", baseUrl: "" },
    { id: "poolside/numeric-base", baseUrl: 7 },
    { id: "poolside/zero-context", contextWindow: 0 },
    { id: "poolside/image", type: "image" },
    { name: "no id" },
  ];
  await withAgentDir({ poolside: { models: rows, checkedAt: 1 } }, async () => {
    const dir = process.env.PI_CODING_AGENT_DIR!;
    const runtime = await ModelRuntime.create({
      authPath: `${dir}/auth.json`,
      modelsPath: `${dir}/models.json`,
      modelsStorePath: `${dir}/models-store.json`,
    });
    // pi's real registerProvider runs validateExtensionProvider and composes
    // the provider; a throw here would fail the whole extension load.
    assert.doesNotThrow(() => poolsideProvider({
      registerProvider: (name: string, config: ProviderConfig) => runtime.registerProvider(name, config),
    } as unknown as ExtensionAPI));
    const ids = runtime.getAllModels().filter((model) => model.provider === "poolside").map((model) => model.id);
    assert.deepEqual(ids.sort(), ["poolside/good", "poolside/null-api", "poolside/null-base"]);
    for (const id of ids) {
      const model = runtime.getModel("poolside", id);
      assert.equal(model?.api, "openai-completions");
      assert.equal(model?.baseUrl, POOLSIDE_BASE_URL);
    }
    // Let the cache-only refresh pi schedules on registration settle before the
    // agent directory is removed.
    await runtime.refresh({ allowNetwork: false });
  });
});
