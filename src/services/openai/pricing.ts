export const USD_TO_INR = 95.6;

const TEXT_PRICING_USD_PER_MILLION: Record<string, {
  input: number;
  cachedInput: number;
  output: number;
}> = {
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.60 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, cachedInput: 0.075, output: 0.60 },
};

const SPEECH_PRICING_USD_PER_MILLION_CHARACTERS: Record<string, number> = {
  'tts-1': 15,
  'tts-1-hd': 30,
};

export function textCostUsd(input: {
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}): number {
  const pricing = TEXT_PRICING_USD_PER_MILLION[input.model];
  if (!pricing) return 0;
  const cached = Math.max(0, Math.min(input.inputTokens, input.cachedInputTokens ?? 0));
  const uncached = Math.max(0, input.inputTokens - cached);
  return (
    uncached * pricing.input
    + cached * pricing.cachedInput
    + Math.max(0, input.outputTokens) * pricing.output
  ) / 1_000_000;
}

export function speechCostUsd(model: string, characters: number): number {
  const price = SPEECH_PRICING_USD_PER_MILLION_CHARACTERS[model] ?? 0;
  return Math.max(0, characters) * price / 1_000_000;
}

export function usdToInr(usd: number): number {
  return usd * USD_TO_INR;
}
