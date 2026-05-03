import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ensureDir, parseDebateFile } from './utils';

const client = new OpenAI();

const VOICE_MAP: Record<string, string> = {
  HOST: 'alloy',
  A: 'echo',
  B: 'onyx',
};

const TTS_COST_PER_CHAR = 15 / 1_000_000;

async function generateTts(text: string, mp3File: string, voice: string): Promise<void> {
  const response = await client.audio.speech.create({
    model: 'tts-1',
    voice: voice as 'alloy' | 'echo' | 'onyx',
    input: text,
    response_format: 'mp3',
    speed: 1.0,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(mp3File, buffer);
}

export async function run(debateName: string): Promise<{ characters: number; audioCost: number }> {
  const outputDir = `output/audios/${debateName}`;

  ensureDir('output');
  ensureDir('output/audios');
  ensureDir(outputDir);

  const lines = parseDebateFile(`output/debates/${debateName}.txt`);
  let counter = 1;
  let totalChars = 0;

  for (const { speaker, text } of lines) {
    const voice = VOICE_MAP[speaker] ?? 'alloy';
    const mp3File = path.join(outputDir, `${String(counter).padStart(3, '0')}_${speaker}.mp3`);

    console.log(`Generating: ${mp3File} using ${voice}`);
    totalChars += text.length;
    await generateTts(text, mp3File, voice);
    counter++;
  }

  console.log('All audio generated successfully.');

  const audioCost = totalChars * TTS_COST_PER_CHAR;
  return { characters: totalChars, audioCost };
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: tsx src/generateAudio.ts <debate_name>');
    process.exit(1);
  }
  run(debateName).then(({ characters, audioCost }) => {
    console.log(`Audio cost: ${characters} characters, $${audioCost.toFixed(6)}`);
  }).catch(err => { console.error(err.message); process.exit(1); });
}
