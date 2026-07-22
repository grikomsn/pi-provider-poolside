import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import poolsideProvider, {
  FALLBACK_MODELS,
  POOLSIDE_BASE_URL,
  fetchModels,
  parseModelsResponse,
} from "../src/index.ts";

test("registers an authenticated OpenAI-compatible provider", () => {
  let registration: { name: string; config: ProviderConfig } | undefined;
  const pi = {
    registerProvider(name: string, config: ProviderConfig) {
      registration = { name, config };
    },
  } as ExtensionAPI;

  poolsideProvider(pi);
  assert.equal(registration?.name, "poolside");
  assert.equal(registration?.config.baseUrl, POOLSIDE_BASE_URL);
  assert.equal(registration?.config.apiKey, "$POOLSIDE_API_KEY");
  assert.equal(registration?.config.api, "openai-completions");
  assert.equal(registration?.config.authHeader, true);
  assert.equal(registration?.config.models?.length, 3);
  assert.equal(typeof registration?.config.refreshModels, "function");
});

test("fallback metadata matches current documented models", () => {
  const models = new Map(FALLBACK_MODELS.map((model) => [model.id, model]));
  assert.equal(models.get("poolside/laguna-s-2.1")?.contextWindow, 262_144);
  assert.equal(models.get("poolside/laguna-m.1")?.contextWindow, 262_144);
  assert.equal(models.get("poolside/laguna-xs-2.1")?.maxTokens, 32_768);
  assert.deepEqual(models.get("poolside/laguna-s-2.1")?.thinkingLevelMap, {
    off: "none", minimal: null, low: null, medium: null, high: null, xhigh: null, max: "xhigh",
  });
  assert.deepEqual(models.get("poolside/laguna-m.1")?.thinkingLevelMap, {
    off: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: null,
  });
  const compat = models.get("poolside/laguna-m.1")?.compat as Record<string, unknown>;
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
  assert.equal(model?.reasoning, true);
  assert.equal(model?.cost.input, 0);
});

test("fetches /models with bearer authentication", async () => {
  const originalFetch = globalThis.fetch;
  let request: { input: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    request = { input: String(input), init };
    return new Response(JSON.stringify({ data: [{ id: "poolside/new-model" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const models = await fetchModels("secret");
    assert.equal(request?.input, `${POOLSIDE_BASE_URL}/models`);
    assert.equal((request?.init?.headers as Record<string, string>).Authorization, "Bearer secret");
    assert.equal(models[0]?.id, "poolside/new-model");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refresh publishes every discovered model and keeps the last successful catalog", async () => {
  let config: ProviderConfig | undefined;
  poolsideProvider({ registerProvider(_name: string, value: ProviderConfig) { config = value; } } as ExtensionAPI);
  const refresh = config?.refreshModels;
  assert.ok(refresh);

  let entry: { models: readonly unknown[]; checkedAt?: number } | undefined;
  const store = {
    async read() { return entry; },
    async write(value: typeof entry) { entry = value; },
    async delete() { entry = undefined; },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: [{ id: "poolside/account-a" }, { id: "poolside/account-b" }],
  }), { status: 200 })) as typeof fetch;

  try {
    const discovered = await refresh({
      allowNetwork: true,
      credential: { type: "api_key", key: "secret" },
      store: store as never,
    });
    assert.deepEqual(discovered.map((model) => model.id), ["poolside/account-a", "poolside/account-b"]);
    assert.deepEqual(entry?.models.map((model) => (model as { id: string }).id), [
      "poolside/account-a", "poolside/account-b",
    ]);

    globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    const cached = await refresh({
      allowNetwork: true,
      credential: { type: "api_key", key: "secret" },
      store: store as never,
    });
    assert.deepEqual(cached.map((model) => model.id), ["poolside/account-a", "poolside/account-b"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refresh falls back when no resolved credential is available", async () => {
  let config: ProviderConfig | undefined;
  poolsideProvider({ registerProvider(_name: string, value: ProviderConfig) { config = value; } } as ExtensionAPI);
  const refresh = config?.refreshModels;
  assert.ok(refresh);
  const store = { async read() { return undefined; }, async write() {}, async delete() {} };
  const fallback = await refresh({ allowNetwork: true, store: store as never });
  assert.equal(fallback, FALLBACK_MODELS);
});
