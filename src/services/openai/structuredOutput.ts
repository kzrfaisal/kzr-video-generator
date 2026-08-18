import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { withRetry } from '@/src/shared/utils';

const client = new OpenAI();

export interface StructuredUsage {
  inputTokens: number;
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
}): Promise<StructuredResult<T>> {
  const response = await withRetry(() => client.responses.parse({
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

  if (!response.output_parsed) {
    const detail = response.incomplete_details?.reason
      ? ` Response incomplete: ${response.incomplete_details.reason}.`
      : '';
    throw new Error(`OpenAI returned no structured ${input.label} output.${detail}`);
  }

  return {
    data: response.output_parsed,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    responseId: response.id,
  };
}
