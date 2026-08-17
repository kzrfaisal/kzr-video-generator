import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import { ensureDir, parseContextFlag, withRetry } from './utils';
import { config } from '../config';
import { generateMetadata, MetadataResult } from './generateMetadata';
import type { ContentMode } from './contentMode';
import { createProjectDocument, saveProjectDocument } from './infrastructure/storage/localProjectStore';

const client = new OpenAI();

const SCRIPT_INPUT_COST_PER_TOKEN  = 0.150 / 1_000_000;
const SCRIPT_OUTPUT_COST_PER_TOKEN = 0.600 / 1_000_000;

const EMPTY_METADATA: MetadataResult = { promptTokens: 0, completionTokens: 0, cost: 0 };

async function generateMetadataIfEnabled(
  topic: string,
  context: string,
  scriptContent: string,
  debateName: string,
  contentMode: ContentMode,
): Promise<MetadataResult> {
  if (!config.generateMetadata) return EMPTY_METADATA;
  try {
    return await generateMetadata(topic, context, scriptContent, debateName, contentMode);
  } catch (err: any) {
    console.warn(`Metadata generation failed (non-fatal): ${err.message}`);
    return EMPTY_METADATA;
  }
}

export async function run(topic: string, context: string = '', contentMode: ContentMode = 'debate'): Promise<{
  debateName: string;
  promptTokens: number;
  completionTokens: number;
  scriptCost: number;
  metadata: MetadataResult;
}> {
  ensureDir('output/debates');

  const promptFile = contentMode === 'narrated-explainer'
    ? 'source/explainer_prompt.txt'
    : config.promptFile;
  const promptTemplate = fs.readFileSync(promptFile, 'utf-8');
  const prompt = promptTemplate
    .replace('{topic}', topic)
    .replace('{context}', context)
    .replace('{videoLength}', config.videoLengthTarget);

  const response = await withRetry(() => client.chat.completions.create({
    model: config.scriptModel,
    messages: [{ role: 'user', content: prompt }],
  }), 'script');

  const content = response.choices[0].message.content ?? '';

  const lines = content.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  for (const line of lines) {
    const valid = contentMode === 'narrated-explainer'
      ? /^HOST\|.+$/.test(line)
      : /^(HOST|A|B)\|.+$/.test(line);
    if (!valid) {
      throw new Error(`LLM returned an invalid line: "${line}"`);
    }
  }

  const existing = fs.readdirSync('output/debates')
    .filter((f: string) => f.startsWith('debate') && f.endsWith('.txt'))
    .map((f: string) => parseInt(f.replace('debate', '').replace('.txt', ''), 10))
    .filter((n: number) => !isNaN(n));

  const nextNumber = (existing.length > 0 ? Math.max(...existing) : 0) + 1;
  const debateName = `debate${nextNumber}`;
  const project = createProjectDocument({
    id: debateName,
    title: topic,
    context,
    contentMode,
    script: content,
  });
  saveProjectDocument(project);
  console.log(`Project saved to output/debates/${debateName}.project.json`);
  console.log(`Text export saved to output/debates/${debateName}.txt`);

  const metadata = await generateMetadataIfEnabled(topic, context, content, debateName, contentMode);

  const usage = response.usage!;
  const scriptCost =
    usage.prompt_tokens * SCRIPT_INPUT_COST_PER_TOKEN +
    usage.completion_tokens * SCRIPT_OUTPUT_COST_PER_TOKEN;

  return { debateName, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, scriptCost, metadata };
}

if (require.main === module) {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx src/generateScript.ts <topic> [--context="<framing>"]');
    process.exit(1);
  }
  const context = parseContextFlag() ?? '';
  const modeArg = process.argv.find(arg => arg.startsWith('--content-mode='))?.split('=')[1];
  const contentMode: ContentMode = modeArg === 'narrated-explainer' ? 'narrated-explainer' : 'debate';
  run(topic, context, contentMode).then(({ debateName, promptTokens, completionTokens, scriptCost, metadata }) => {
    console.log(`[${debateName}] Script cost: input ${promptTokens} tokens, output ${completionTokens} tokens, $${scriptCost.toFixed(6)}`);
    if (metadata.cost > 0) {
      console.log(`[${debateName}] Metadata cost: input ${metadata.promptTokens} tokens, output ${metadata.completionTokens} tokens, $${metadata.cost.toFixed(6)}`);
    }
  }).catch(err => { console.error(err.message); process.exit(1); });
}
