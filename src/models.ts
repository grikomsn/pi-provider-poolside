import type { ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import {
  FALLBACK_MODELS,
  MAX_ONLY_THINKING_LEVELS,
  POOLSIDE_BASE_URL,
  POOLSIDE_COMPAT,
  STANDARD_THINKING_LEVELS,
} from "./constants.ts";
import type { PoolsideApiModel, PoolsideModelsResponse } from "./types.ts";
import { displayName, nonNegativeNumber, positiveNumber, strings } from "./utils.ts";

/** Convert the rich Poolside /models response into Pi's model metadata. */
export function parseModelsResponse(payload: PoolsideModelsResponse): ProviderModelConfig[] {
  if (!Array.isArray(payload.data)) return [];

  const known = new Map(FALLBACK_MODELS.map((item) => [item.id, item]));
  return payload.data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as PoolsideApiModel;
    if (typeof item.id !== "string" || item.id.length === 0) return [];

    const fallback = known.get(item.id);
    const features = strings(item.supported_features);
    const modalities = strings(item.input_modalities);
    const reasoning = Array.isArray(item.supported_features)
      ? features.includes("reasoning")
      : (fallback?.reasoning ?? true);
    const input = (["text", "image"] as const).filter((kind) => modalities.includes(kind));
    const pricing = item.pricing;

    return [{
      id: item.id,
      name: typeof item.name === "string" && item.name ? item.name : (fallback?.name ?? displayName(item.id)),
      reasoning,
      input: input.length ? [...input] : (fallback?.input ?? ["text"]),
      cost: {
        input: nonNegativeNumber(pricing?.prompt, fallback?.cost.input ?? 0),
        output: nonNegativeNumber(pricing?.completion, fallback?.cost.output ?? 0),
        cacheRead: nonNegativeNumber(pricing?.input_cache_read, fallback?.cost.cacheRead ?? 0),
        cacheWrite: nonNegativeNumber(pricing?.input_cache_write, fallback?.cost.cacheWrite ?? 0),
      },
      contextWindow: positiveNumber(item.context_length, fallback?.contextWindow ?? 262_144),
      maxTokens: positiveNumber(item.max_completion_tokens, fallback?.maxTokens ?? 32_768),
      thinkingLevelMap: reasoning
        ? (item.id === "poolside/laguna-s-2.1" ? MAX_ONLY_THINKING_LEVELS : STANDARD_THINKING_LEVELS)
        : undefined,
      compat: POOLSIDE_COMPAT,
    } satisfies ProviderModelConfig];
  });
}

export async function fetchModels(apiKey: string, signal?: AbortSignal): Promise<ProviderModelConfig[]> {
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch(`${POOLSIDE_BASE_URL}/models`, {
    headers: {
      Accept: "application/json, application/problem+json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`Poolside /models returned HTTP ${response.status}`);

  const models = parseModelsResponse(await response.json() as PoolsideModelsResponse);
  if (!models.length) throw new Error("Poolside /models returned no models");
  return models;
}

export const refreshModels: NonNullable<ProviderConfig["refreshModels"]> = async (context) => {
  const stored = await context.store.read();
  const cached = Array.isArray(stored?.models) && stored.models.length
    ? stored.models as ProviderModelConfig[]
    : FALLBACK_MODELS;
  const apiKey = context.credential?.type === "api_key" ? context.credential.key : undefined;
  if (!context.allowNetwork || context.signal?.aborted || !apiKey) return cached;

  try {
    const models = await fetchModels(apiKey, context.signal);
    await context.store.write({ models: models as never, checkedAt: Date.now() });
    return models;
  } catch {
    // Keep the last successful account-specific catalog through transient failures.
    return cached;
  }
};
