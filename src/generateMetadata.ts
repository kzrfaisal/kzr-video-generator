import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import { config } from '../config';

const client = new OpenAI();

const METADATA_INPUT_COST_PER_TOKEN  = 0.150 / 1_000_000;
const METADATA_OUTPUT_COST_PER_TOKEN = 0.600 / 1_000_000;

const METADATA_PROMPT_FILE = 'source/metadata_prompt.txt';

export interface MetadataResult {
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export async function generateMetadata(
  topic: string,
  context: string,
  scriptContent: string,
  debateName: string,
): Promise<MetadataResult> {
  const promptTemplate = fs.readFileSync(METADATA_PROMPT_FILE, 'utf-8');
  const prompt = promptTemplate
    .replace('{topic}', topic)
    .replace('{context}', context)
    .replace('{script}', scriptContent);

  const response = await client.chat.completions.create({
    model: config.scriptModel,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0].message.content ?? '';

  const outFile = `output/debates/${debateName}.metadata.md`;
  fs.writeFileSync(outFile, content, 'utf-8');
  console.log(`Metadata saved to ${outFile}`);

  const usage = response.usage!;
  const cost =
    usage.prompt_tokens * METADATA_INPUT_COST_PER_TOKEN +
    usage.completion_tokens * METADATA_OUTPUT_COST_PER_TOKEN;

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    cost,
  };
}
