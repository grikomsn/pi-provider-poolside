import assert from "node:assert/strict";
import test from "node:test";
import { readPersistedProviderModels } from "../src/store.ts";
import { withAgentDir } from "./helpers.ts";

const row = {
  id: "poolside/laguna-live",
  name: "Laguna Live",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 262_144,
  maxTokens: 32_768,
};

test("reads the persisted catalog for a provider", async () => {
  await withAgentDir({ poolside: { models: [row], checkedAt: 1 } }, () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), [row]);
  });
});

test("returns [] when no store has been written yet", async () => {
  await withAgentDir(undefined, () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), []);
  });
});

test("returns [] for a malformed store instead of throwing", async () => {
  await withAgentDir("{not json", () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), []);
  });
});

test("returns [] for a non-object store", async () => {
  await withAgentDir("[1,2,3]", () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), []);
  });
});

test("tolerates a UTF-8 byte-order mark like pi's own store reader", async () => {
  await withAgentDir(`﻿${JSON.stringify({ poolside: { models: [row] } })}`, () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), [row]);
  });
});

test("returns [] when the provider has no entry or no model list", async () => {
  await withAgentDir({ other: { models: [row] } }, () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), []);
  });
  await withAgentDir({ poolside: { checkedAt: 1 } }, () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), []);
  });
  await withAgentDir({ poolside: { models: "nope" } }, () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), []);
  });
});

test("drops junk rows, blank ids, and corrupt limits", async () => {
  await withAgentDir({
    poolside: {
      models: [
        row, "junk", null, [row], { name: "no id" }, { id: "   " }, { id: 7 },
        { id: "poolside/zero-context", contextWindow: 0 },
        { id: "poolside/bad-max", maxTokens: "lots" },
      ],
    },
  }, () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), [row]);
  });
});

test("keeps only chat rows", async () => {
  const image = { id: "poolside/image", type: "image" };
  const chat = { ...row, id: "poolside/explicit-chat", type: "chat" };
  await withAgentDir({ poolside: { models: [row, image, chat] } }, () => {
    assert.deepEqual(readPersistedProviderModels("poolside"), [row, chat]);
  });
});

test("baseUrl is optional unless the provider requires it per row", async () => {
  const withBase = { ...row, id: "poolside/with-base", baseUrl: "https://inference.poolside.ai/v1" };
  const nullBase = { ...row, id: "poolside/null-base", baseUrl: null };
  const badBase = { ...row, id: "poolside/bad-base", baseUrl: 7 };
  const emptyBase = { ...row, id: "poolside/empty-base", baseUrl: "" };
  await withAgentDir({ poolside: { models: [row, withBase, nullBase, badBase, emptyBase] } }, () => {
    // null falls back to the provider-level baseUrl in pi; a present-but-unusable
    // value would shadow it, so it is dropped.
    assert.deepEqual(
      readPersistedProviderModels("poolside", { requireBaseUrl: false }).map((model) => model.id),
      [row.id, withBase.id, nullBase.id],
    );
    assert.deepEqual(
      readPersistedProviderModels("poolside", { requireBaseUrl: true }).map((model) => model.id),
      [withBase.id],
    );
  });
});

test("drops rows whose api would not fall back to the provider api", async () => {
  const withApi = { ...row, id: "poolside/with-api", api: "openai-completions" };
  const nullApi = { ...row, id: "poolside/null-api", api: null };
  const emptyApi = { ...row, id: "poolside/empty-api", api: "" };
  const numericApi = { ...row, id: "poolside/numeric-api", api: 7 };
  await withAgentDir({ poolside: { models: [row, withApi, nullApi, emptyApi, numericApi] } }, () => {
    assert.deepEqual(
      readPersistedProviderModels("poolside").map((model) => model.id),
      [row.id, withApi.id, nullApi.id],
    );
  });
});
