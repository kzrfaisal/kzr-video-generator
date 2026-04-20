import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { run as generateScript } from './src/generateScript';
import { run as makeVideo } from './src/makeVideo';

function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(message, () => { rl.close(); resolve(); }));
}

function getLatestDebateName(): string {
  const files = fs.readdirSync('output/debates')
    .filter(f => f.startsWith('debate') && f.endsWith('.txt'));

  if (files.length === 0) throw new Error('No debate files found in output/debates/');

  files.sort((a, b) => {
    const numA = parseInt(a.replace('debate', '').replace('.txt', ''), 10);
    const numB = parseInt(b.replace('debate', '').replace('.txt', ''), 10);
    return numA - numB;
  });

  return files[files.length - 1].replace('.txt', '');
}

async function main(): Promise<void> {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx main.ts "<topic>"');
    process.exit(1);
  }

  await generateScript(topic);

  const debateName = getLatestDebateName();
  console.log(`\nUsing script: ${debateName}.txt`);

  await waitForEnter(`\nReview the script before continuing:\noutput/debates/${debateName}.txt\n\nPress ENTER when ready to generate video...`);

  makeVideo(debateName);
}

main().catch(err => { console.error(err.message); process.exit(1); });