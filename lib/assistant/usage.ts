export type AssistantUsage = {
  input: number | null;
  output: number | null;
  cost: number | null;
};
export function parseUsage(value: unknown): AssistantUsage {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const number = (n: unknown, integer = false) =>
    typeof n === "number" &&
    Number.isFinite(n) &&
    n >= 0 &&
    (!integer || Number.isInteger(n))
      ? n
      : null;
  return {
    input: number(v.prompt_tokens, true),
    output: number(v.completion_tokens, true),
    cost: number(v.cost),
  };
}
export function sumUsage(values: AssistantUsage[]): AssistantUsage {
  const sum = (key: keyof AssistantUsage) =>
    values.some((v) => v[key] === null)
      ? null
      : values.reduce((total, v) => total + (v[key] ?? 0), 0);
  return { input: sum("input"), output: sum("output"), cost: sum("cost") };
}
export function usageText(usage: AssistantUsage) {
  const tokens = (n: number | null) =>
    n === null ? "unavailable" : n.toLocaleString();
  const cost =
    usage.cost === null
      ? "unavailable"
      : usage.cost === 0
        ? "$0.00"
        : usage.cost < 0.000001
          ? "<$0.000001"
          : `$${usage.cost.toFixed(6)}`;
  return `In: ${tokens(usage.input)} · Out: ${tokens(usage.output)} tokens · Cost: ${cost} USD`;
}
