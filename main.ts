import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { run as generateScript } from './src/generateScript';
import { run as generateAudio } from './src/generateAudio';
import { run as makeVideo } from './src/makeVideo';

function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(message, () => { rl.close(); resolve(); }));
}

async function main(): Promise<void> {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx main.ts "<topic>"');
    process.exit(1);
  }

  const { debateName, promptTokens, completionTokens, scriptCost } = await generateScript(topic);

  console.log(`\nUsing script: ${debateName}.txt`);
  await waitForEnter(`\nReview the script before continuing:\noutput/debates/${debateName}.txt\n\nPress ENTER when ready to generate video...`);

  const { characters, audioCost } = await generateAudio(debateName);
  makeVideo(debateName);

  const total = scriptCost + audioCost;

  console.log(`
╔══════════════════════════════════════╗
║            Cost Summary              ║
╠══════════════════════════════════════╣
║ Script  (gpt-4o-mini)                ║
║   Input tokens:  ${String(promptTokens).padEnd(18)}║
║   Output tokens: ${String(completionTokens).padEnd(18)}║
║   Cost: $${scriptCost.toFixed(6).padEnd(27)}║
╠══════════════════════════════════════╣
║ Audio   (tts-1)                      ║
║   Characters:    ${String(characters).padEnd(18)}║
║   Cost: $${audioCost.toFixed(6).padEnd(27)}║
╠══════════════════════════════════════╣
║ Total:  $${total.toFixed(6).padEnd(27)}║
╚══════════════════════════════════════╝`);

  const logEntry = {
    date: new Date().toISOString(),
    debateName,
    topic,
    script: { promptTokens, completionTokens, cost: scriptCost },
    audio: { characters, cost: audioCost },
    totalCost: total,
  };
  fs.appendFileSync('output/cost_log.jsonl', JSON.stringify(logEntry) + '\n', 'utf-8');
}

main().catch(err => { console.error(err.message); process.exit(1); });
