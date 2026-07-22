import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

export const POOLSIDE_BASE_URL = "https://inference.poolside.ai/v1";

export const STANDARD_THINKING_LEVELS = {
  off: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: null,
} as const;

// Laguna S 2.1 exposes only off and max thinking. The API calls its highest
// wire-level effort `xhigh`, while Pi presents that mode as `max`.
export const MAX_ONLY_THINKING_LEVELS = {
  off: "none",
  minimal: null,
  low: null,
  medium: null,
  high: null,
  xhigh: null,
  max: "xhigh",
} as const;

export const POOLSIDE_COMPAT = {
  supportsDeveloperRole: false,
  supportsUsageInStreaming: true,
  maxTokensField: "max_completion_tokens",
  thinkingFormat: "openrouter",
} as const;

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

/** Current Poolside Platform models, available before authenticated refresh. */
export const FALLBACK_MODELS: ProviderModelConfig[] = [
  {
    id: "poolside/laguna-s-2.1",
    name: "Laguna S 2.1",
    reasoning: true,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 262_144,
    maxTokens: 32_768,
    thinkingLevelMap: MAX_ONLY_THINKING_LEVELS,
    compat: POOLSIDE_COMPAT,
  },
  {
    id: "poolside/laguna-m.1",
    name: "Laguna M.1",
    reasoning: true,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 262_144,
    maxTokens: 32_768,
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    compat: POOLSIDE_COMPAT,
  },
  {
    id: "poolside/laguna-xs-2.1",
    name: "Laguna XS 2.1",
    reasoning: true,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 262_144,
    maxTokens: 32_768,
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    compat: POOLSIDE_COMPAT,
  },
];
