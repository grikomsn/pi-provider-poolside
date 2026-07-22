export function nonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function displayName(id: string): string {
  return id
    .replace(/^poolside\//i, "")
    .split("-")
    .map((part) => /^(xs|s|m)(?:\.|$)/i.test(part)
      ? part.toUpperCase()
      : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
