import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import { ensureDir } from './utils';
import { config } from '../config';
import { generateMetadata, MetadataResult } from './generateMetadata';
import { generateThumbnail } from './generateThumbnail';

const client = new OpenAI();

const SCRIPT_INPUT_COST_PER_TOKEN  = 0.150 / 1_000_000;
const SCRIPT_OUTPUT_COST_PER_TOKEN = 0.600 / 1_000_000;

const EMPTY_METADATA: MetadataResult = { promptTokens: 0, completionTokens: 0, cost: 0 };

async function generateMetadataIfEnabled(
  topic: string,
  scriptContent: string,
  debateName: string,
): Promise<MetadataResult> {
  if (!config.generateMetadata) return EMPTY_METADATA;
  try {
    return await generateMetadata(topic, scriptContent, debateName);
  } catch (err: any) {
    console.warn(`Metadata generation failed (non-fatal): ${err.message}`);
    return EMPTY_METADATA;
  }
}

function generateThumbnailIfEnabled(debateName: string): void {
  if (!config.generateThumbnail) return;
  try {
    generateThumbnail(debateName);
  } catch (err: any) {
    console.warn(`Thumbnail generation failed (non-fatal): ${err.message}`);
  }
}

export async function run(topic: string): Promise<{
  debateName: string;
  promptTokens: number;
  completionTokens: number;
  scriptCost: number;
  metadata: MetadataResult;
}> {
  ensureDir('output/debates');

  const promptTemplate = fs.readFileSync(config.promptFile, 'utf-8');
  const prompt = promptTemplate
    .replace('{topic}', topic)
    .replace('{videoLength}', config.videoLengthTarget);

  const response = await client.chat.completions.create({
    model: config.scriptModel,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0].message.content ?? '';

  const lines = content.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  for (const line of lines) {
    if (!/^(HOST|A|B)\|.+$/.test(line)) {
      throw new Error(`LLM returned an invalid line: "${line}"`);
    }
  }

  const existing = fs.readdirSync('output/debates')
    .filter((f: string) => f.startsWith('debate') && f.endsWith('.txt'))
    .map((f: string) => parseInt(f.replace('debate', '').replace('.txt', ''), 10))
    .filter((n: number) => !isNaN(n));

  const nextNumber = (existing.length > 0 ? Math.max(...existing) : 0) + 1;
  const debateName = `debate${nextNumber}`;
  const filename = `output/debates/${debateName}.txt`;

  fs.writeFileSync(filename, content, 'utf-8');
  console.log(`Script saved to ${filename}`);

  const metadata = await generateMetadataIfEnabled(topic, content, debateName);
  generateThumbnailIfEnabled(debateName);

  const usage = response.usage!;
  const scriptCost =
    usage.prompt_tokens * SCRIPT_INPUT_COST_PER_TOKEN +
    usage.completion_tokens * SCRIPT_OUTPUT_COST_PER_TOKEN;

  return { debateName, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, scriptCost, metadata };
}

if (require.main === module) {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx src/generateScript.ts <topic>');
    process.exit(1);
  }
  run(topic).then(({ debateName, promptTokens, completionTokens, scriptCost, metadata }) => {
    console.log(`[${debateName}] Script cost: input ${promptTokens} tokens, output ${completionTokens} tokens, $${scriptCost.toFixed(6)}`);
    if (metadata.cost > 0) {
      console.log(`[${debateName}] Metadata cost: input ${metadata.promptTokens} tokens, output ${metadata.completionTokens} tokens, $${metadata.cost.toFixed(6)}`);
    }
  }).catch(err => { console.error(err.message); process.exit(1); });
}
