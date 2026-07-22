import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FALLBACK_MODELS, POOLSIDE_BASE_URL } from "./constants.ts";
import { refreshModels } from "./models.ts";

export default function poolsideProvider(pi: ExtensionAPI): void {
  pi.registerProvider("poolside", {
    name: "Poolside",
    baseUrl: POOLSIDE_BASE_URL,
    apiKey: "$POOLSIDE_API_KEY",
    api: "openai-completions",
    authHeader: true,
    models: FALLBACK_MODELS,
    refreshModels,
  });
}

export { FALLBACK_MODELS, POOLSIDE_BASE_URL } from "./constants.ts";
export { fetchModels, parseModelsResponse } from "./models.ts";
