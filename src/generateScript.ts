import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import { ensureDir } from './utils';
import { config } from '../config';

const client = new OpenAI();

const SCRIPT_INPUT_COST_PER_TOKEN  = 0.150 / 1_000_000;
const SCRIPT_OUTPUT_COST_PER_TOKEN = 0.600 / 1_000_000;

export async function run(topic: string): Promise<{
  debateName: string;
  promptTokens: number;
  completionTokens: number;
  scriptCost: number;
}> {
  ensureDir('output/debates');

  const promptTemplate = fs.readFileSync('source/debate_prompt.txt', 'utf-8');
  const prompt = promptTemplate.replace('{topic}', topic);

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

  const usage = response.usage!;
  const scriptCost =
    usage.prompt_tokens * SCRIPT_INPUT_COST_PER_TOKEN +
    usage.completion_tokens * SCRIPT_OUTPUT_COST_PER_TOKEN;

  return { debateName, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, scriptCost };
}

if (require.main === module) {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx src/generateScript.ts <topic>');
    process.exit(1);
  }
  run(topic).then(({ debateName, promptTokens, completionTokens, scriptCost }) => {
    console.log(`[${debateName}] Script cost: input ${promptTokens} tokens, output ${completionTokens} tokens, $${scriptCost.toFixed(6)}`);
  }).catch(err => { console.error(err.message); process.exit(1); });
}
