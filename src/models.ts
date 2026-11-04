import type { ProviderConfig } from "@earendil-works/pi-coding-agent";
import {
  type ChatModelConfig,
  FALLBACK_MODELS,
  MAX_ONLY_THINKING_LEVELS,
  POOLSIDE_BASE_URL,
  POOLSIDE_COMPAT,
  STANDARD_THINKING_LEVELS,
} from "./constants.ts";
import type { PoolsideApiModel, PoolsideModelsResponse } from "./types.ts";
import { usablePersistedModels } from "./store.ts";
import { displayName, nonNegativeNumber, positiveNumber, strings } from "./utils.ts";

/** Convert the rich Poolside /models response into Pi's model metadata. */
export function parseModelsResponse(payload: PoolsideModelsResponse): ChatModelConfig[] {
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
    } satisfies ChatModelConfig];
  });
}

/** Transient upstream failures worth another catalog fetch. */
const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

/** Exponential backoff capped at 2s; a `Retry-After` hint wins but is capped at 5s. */
export function retryDelayMs(attempt: number, retryAfter?: string | null): number {
  const hint = retryAfter?.trim();
  if (hint) {
    if (/^\d+(?:\.\d+)?$/.test(hint)) return Math.min(5_000, Number(hint) * 1_000);
    // HTTP-date form only (e.g. "Wed, 21 Oct 2026 07:28:00 GMT"); a bare
    // "-3" would otherwise parse as the year -3.
    const date = /[a-z]/i.test(hint) ? Date.parse(hint) : Number.NaN;
    if (Number.isFinite(date)) return Math.max(0, Math.min(5_000, date - Date.now()));
  }
  return Math.min(2_000, 250 * 2 ** Math.max(0, attempt));
}

function networkCause(error: Error, depth = 0): string {
  const cause = (error as Error & { cause?: unknown }).cause;
  if (depth > 4) return "";
  if (cause instanceof Error) return `${cause.name}: ${cause.message} ${networkCause(cause, depth + 1)}`;
  return typeof cause === "string" ? cause : "";
}

/** Connection-level failures (never aborts or redirect refusals) are retryable. */
export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError" || error.name === "TimeoutError") return false;
  return /fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|socket hang up/i
    .test(`${error.name}: ${error.message} ${networkCause(error)}`)
    && !/redirect/i.test(`${error.message} ${networkCause(error)}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * At most three attempts. Transient statuses and connection failures are
 * retried; the body of a discarded response is released before waiting.
 */
export async function fetchWithRetry(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS - 1 || signal?.aborted || !isTransientNetworkError(error)) throw error;
      await sleep(retryDelayMs(attempt), signal);
      continue;
    }
    if (attempt >= MAX_ATTEMPTS - 1 || !TRANSIENT_STATUS_CODES.has(response.status)) return response;
    const delay = retryDelayMs(attempt, response.headers.get("retry-after"));
    await response.body?.cancel().catch(() => {});
    await sleep(delay, signal);
  }
}

export async function fetchModels(apiKey: string, signal?: AbortSignal): Promise<ChatModelConfig[]> {
  const timeout = AbortSignal.timeout(10_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetchWithRetry(`${POOLSIDE_BASE_URL}/models`, {
    headers: {
      Accept: "application/json, application/problem+json",
      Authorization: `Bearer ${apiKey}`,
    },
    // Never forward the bearer key to wherever a redirect points.
    redirect: "error",
    signal: combined,
  }, combined);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Poolside /models returned HTTP ${response.status}`);
  }

  const models = parseModelsResponse(await response.json() as PoolsideModelsResponse);
  if (!models.length) throw new Error("Poolside /models returned no models");
  return models;
}

/**
 * pi ≥ 0.84 hands refreshes a read-only `stored` snapshot and a
 * `publish()` transaction (the older `context.store` accessor is gone).
 */
export const refreshModels: NonNullable<ProviderConfig["refreshModels"]> = async (context) => {
  const persisted = usablePersistedModels(context.stored?.models);
  const cached = persisted.length ? persisted : FALLBACK_MODELS;
  const apiKey = context.credential?.type === "api_key" ? context.credential.key : undefined;
  if (!context.allowNetwork || context.signal?.aborted || !apiKey) return cached;

  try {
    const models = await fetchModels(apiKey, context.signal);
    await context.publish({ persist: { models: models as never, checkedAt: Date.now() } });
    return models;
  } catch (error) {
    if (context.signal?.aborted) throw error;
    // Keep the last successful account-specific catalog through transient failures.
    return cached;
  }
};
