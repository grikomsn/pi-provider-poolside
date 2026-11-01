/**
 * Reads pi's persisted provider catalogs (`<agentDir>/models-store.json`).
 *
 * pi restores a discovered catalog only on an asynchronous cache-only
 * refresh, but resolves the startup model (`defaultProvider` /
 * `defaultModel`, or a resumed session's model) before that pass lands. A
 * saved default on a model outside the bundled fallback list then misses and
 * pi silently starts on another provider's default. Registering the persisted
 * catalog up front closes that gap; `refreshModels` stays authoritative.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ProviderModelConfig } from "@earendil-works/pi-coding-agent";

type ChatModelConfig = Extract<ProviderModelConfig, { type?: "chat" }>;

export interface ReadPersistedOptions {
  /**
   * Require a per-row `baseUrl`. Only needed when the provider registers no
   * provider-level `baseUrl`: pi rejects such rows at registration, which
   * would fail the whole extension load.
   */
  requireBaseUrl?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUsableRow(row: unknown, requireBaseUrl: boolean): row is ChatModelConfig {
  if (!isRecord(row)) return false;
  if (typeof row.id !== "string" || row.id.trim().length === 0) return false;
  if (row.type !== undefined && row.type !== "chat") return false;
  // A present-but-unusable baseUrl would override the provider-level one.
  if (row.baseUrl !== undefined && (typeof row.baseUrl !== "string" || row.baseUrl.length === 0)) return false;
  if (requireBaseUrl && row.baseUrl === undefined) return false;
  // pi validates these at registration; a corrupt row must not fail the load.
  for (const key of ["contextWindow", "maxTokens"] as const) {
    if (row[key] !== undefined && !(typeof row[key] === "number" && Number.isFinite(row[key]) && row[key] > 0)) {
      return false;
    }
  }
  return true;
}

/**
 * Usable chat rows of a persisted catalog. Shared by the registration seed and
 * the cache-only refresh so one corrupt row never fails either path.
 */
export function usablePersistedModels(models: unknown, { requireBaseUrl = false }: ReadPersistedOptions = {}): ChatModelConfig[] {
  return Array.isArray(models) ? models.filter((row): row is ChatModelConfig => isUsableRow(row, requireBaseUrl)) : [];
}

/**
 * The chat catalog pi persisted for `providerId`, or `[]` when nothing usable
 * has been discovered yet (no store, unreadable or malformed store, no entry).
 * Never throws: it runs inside the extension factory.
 */
export function readPersistedProviderModels(
  providerId: string,
  { requireBaseUrl = false }: ReadPersistedOptions = {},
): ChatModelConfig[] {
  try {
    const raw = readFileSync(join(getAgentDir(), "models-store.json"), "utf8");
    const store: unknown = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    if (!isRecord(store)) return [];
    const entry = store[providerId];
    return isRecord(entry) ? usablePersistedModels(entry.models, { requireBaseUrl }) : [];
  } catch {
    return [];
  }
}
