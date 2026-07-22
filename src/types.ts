export type PoolsideApiModel = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  max_completion_tokens?: unknown;
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
    input_cache_read?: unknown;
    input_cache_write?: unknown;
  };
  supported_features?: unknown;
  input_modalities?: unknown;
};

export type PoolsideModelsResponse = { data?: unknown };
