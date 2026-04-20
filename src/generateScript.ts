import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import { ensureDir } from './utils';

const client = new OpenAI();

export async function run(topic: string): Promise<string> {
  ensureDir('output/debates');

  const promptTemplate = fs.readFileSync('source/debate_prompt.txt', 'utf-8');
  const prompt = promptTemplate.replace('{topic}', topic);

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0].message.content ?? '';

  // Validate every line before saving
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (const line of lines) {
    if (!/^(HOST|A|B)\|.+$/.test(line)) {
      throw new Error(`LLM returned an invalid line: "${line}"`);
    }
  }

  const existing = fs.readdirSync('output/debates')
    .filter(f => f.startsWith('debate') && f.endsWith('.txt'))
    .map(f => parseInt(f.replace('debate', '').replace('.txt', ''), 10))
    .filter(n => !isNaN(n));

  const nextNumber = (existing.length > 0 ? Math.max(...existing) : 0) + 1;
  const filename = `output/debates/debate${nextNumber}.txt`;

  fs.writeFileSync(filename, content, 'utf-8');
  console.log(`Script saved to ${filename}`);

  return `debate${nextNumber}`;
}

if (require.main === module) {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx src/generateScript.ts <topic>');
    process.exit(1);
  }
  run(topic).catch(err => { console.error(err.message); process.exit(1); });
}