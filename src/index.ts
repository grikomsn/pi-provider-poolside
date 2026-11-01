import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FALLBACK_MODELS, POOLSIDE_BASE_URL } from "./constants.ts";
import { refreshModels } from "./models.ts";
import { readPersistedProviderModels } from "./store.ts";

export const PROVIDER_ID = "poolside";

export default function poolsideProvider(pi: ExtensionAPI): void {
  // Seed the catalog pi persisted on a previous run so a saved default on a
  // live-only model resolves at startup (pi selects the initial model before
  // its first cache-only refresh lands). The provider-level baseUrl covers
  // persisted rows, so none is required per row.
  const persisted = readPersistedProviderModels(PROVIDER_ID, { requireBaseUrl: false });
  pi.registerProvider(PROVIDER_ID, {
    name: "Poolside",
    baseUrl: POOLSIDE_BASE_URL,
    apiKey: "$POOLSIDE_API_KEY",
    api: "openai-completions",
    authHeader: true,
    models: persisted.length ? persisted : FALLBACK_MODELS,
    refreshModels,
  });
}

export { FALLBACK_MODELS, POOLSIDE_BASE_URL } from "./constants.ts";
export type { ChatModelConfig } from "./constants.ts";
export { fetchModels, fetchWithRetry, isTransientNetworkError, parseModelsResponse, refreshModels, retryDelayMs } from "./models.ts";
export { readPersistedProviderModels } from "./store.ts";
