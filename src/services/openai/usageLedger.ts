import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { speechCostUsd, textCostUsd, usdToInr, USD_TO_INR } from './pricing';

const USAGE_LEDGER = 'output/usage/openai-usage.jsonl';

export interface OpenAIUsageEvent {
  id: string;
  createdAt: string;
  operation: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  characters: number;
  costUsd: number;
  costInr: number;
}

export interface OpenAIUsageSummary {
  total: Omit<OpenAIUsageEvent, 'id' | 'createdAt' | 'operation' | 'model'> & { calls: number };
  lastCall: OpenAIUsageEvent | null;
  usdToInr: number;
  exchangeRateAsOf: string;
}

function append(event: OpenAIUsageEvent): void {
  fs.mkdirSync(path.dirname(USAGE_LEDGER), { recursive: true });
  fs.appendFileSync(USAGE_LEDGER, `${JSON.stringify(event)}\n`, 'utf-8');
}

export function recordTextUsage(input: {
  operation: string;
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}): OpenAIUsageEvent {
  const cachedInputTokens = Math.max(0, input.cachedInputTokens ?? 0);
  const costUsd = textCostUsd({ ...input, cachedInputTokens });
  const event: OpenAIUsageEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    operation: input.operation,
    model: input.model,
    inputTokens: input.inputTokens,
    cachedInputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.inputTokens + input.outputTokens,
    characters: 0,
    costUsd,
    costInr: usdToInr(costUsd),
  };
  append(event);
  return event;
}

export function recordSpeechUsage(input: {
  operation: string;
  model: string;
  characters: number;
}): OpenAIUsageEvent {
  const costUsd = speechCostUsd(input.model, input.characters);
  const event: OpenAIUsageEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    operation: input.operation,
    model: input.model,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    characters: input.characters,
    costUsd,
    costInr: usdToInr(costUsd),
  };
  append(event);
  return event;
}

export function readUsageSummary(): OpenAIUsageSummary {
  const events: OpenAIUsageEvent[] = [];
  if (fs.existsSync(USAGE_LEDGER)) {
    for (const line of fs.readFileSync(USAGE_LEDGER, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line) as OpenAIUsageEvent); }
      catch { /* Ignore one damaged line without hiding the rest of the usage history. */ }
    }
  }

  const total = events.reduce((sum, event) => ({
    calls: sum.calls + 1,
    inputTokens: sum.inputTokens + event.inputTokens,
    cachedInputTokens: sum.cachedInputTokens + event.cachedInputTokens,
    outputTokens: sum.outputTokens + event.outputTokens,
    totalTokens: sum.totalTokens + event.totalTokens,
    characters: sum.characters + event.characters,
    costUsd: sum.costUsd + event.costUsd,
    costInr: sum.costInr + event.costInr,
  }), {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    characters: 0,
    costUsd: 0,
    costInr: 0,
  });

  return {
    total,
    lastCall: events.at(-1) ?? null,
    usdToInr: USD_TO_INR,
    exchangeRateAsOf: '2026-08-28',
  };
}
