import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { withRetry } from '@/src/shared/utils';
import { recordTextUsage } from './usageLedger';

let client: OpenAI | null = null;

function openAIClient(): OpenAI {
  return client ?? (client = new OpenAI());
}

export interface StructuredUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: StructuredUsage;
  responseId: string;
}

export async function generateStructured<T>(input: {
  model: string;
  schema: z.ZodType<T>;
  schemaName: string;
  developerPrompt: string;
  userPrompt: string;
  label: string;
  projectId?: string;
  projectTitle?: string;
}): Promise<StructuredResult<T>> {
  const response = await withRetry(() => openAIClient().responses.parse({
    model: input.model,
    store: false,
    input: [
      { role: 'developer', content: input.developerPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    text: {
      format: zodTextFormat(input.schema, input.schemaName),
    },
  }), input.label);

  const usage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
  recordTextUsage({
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    operation: input.label,
    model: input.model,
    ...usage,
  });

  if (!response.output_parsed) {
    const detail = response.incomplete_details?.reason
      ? ` Response incomplete: ${response.incomplete_details.reason}.`
      : '';
    throw new Error(`OpenAI returned no structured ${input.label} output.${detail}`);
  }

  return {
    data: response.output_parsed,
    usage,
    responseId: response.id,
  };
}
