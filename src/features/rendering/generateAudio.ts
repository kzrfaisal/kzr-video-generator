import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { ensureDir, parseDebateFile } from '@/src/shared/utils';
import { config } from '@/config';
import { buildRenderCaptions } from '@/src/domain/projects/captions';
import { audioManifestPath } from './videoFiles';

let client: OpenAI | null = null;

function openAIClient(): OpenAI {
  return client ?? (client = new OpenAI());
}

const TTS_COST_PER_CHAR = 15 / 1_000_000;

function renderCaptions(debateName: string) {
  return buildRenderCaptions(parseDebateFile(`output/debates/${debateName}.txt`));
}

function audioSignature(debateName: string): string {
  return createHash('sha256').update(JSON.stringify({
    captions: renderCaptions(debateName),
    voices: config.voices,
    model: config.ttsModel,
    speed: config.ttsSpeed,
  })).digest('hex');
}

export function audioIsCurrent(debateName: string): boolean {
  const outputDir = `output/audios/${debateName}`;
  const manifestPath = audioManifestPath(debateName);
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { signature?: string };
    const mp3Count = fs.readdirSync(outputDir).filter(file => file.endsWith('.mp3')).length;
    return manifest.signature === audioSignature(debateName)
      && mp3Count === renderCaptions(debateName).length;
  } catch {
    return false;
  }
}

async function generateTts(text: string, mp3File: string, voice: string, attempt = 1): Promise<void> {
  const MAX_ATTEMPTS = 4;
  try {
    const response = await openAIClient().audio.speech.create({
      model: config.ttsModel as 'tts-1' | 'tts-1-hd',
      voice: voice as 'alloy' | 'echo' | 'ash' | 'onyx',
      input: text,
      response_format: 'mp3',
      speed: config.ttsSpeed,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(mp3File, buffer);
  } catch (err: any) {
    // Retry transient failures (rate limits, 5xx, network) — OpenAI TTS occasionally 500s.
    const status = err?.status;
    const retryable = status === undefined || status === 429 || status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      const waitMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      console.warn(`TTS attempt ${attempt}/${MAX_ATTEMPTS} failed (${err.message}); retrying in ${waitMs}ms…`);
      await new Promise(r => setTimeout(r, waitMs));
      return generateTts(text, mp3File, voice, attempt + 1);
    }
    throw err;
  }
}

export async function run(debateName: string): Promise<{ characters: number; audioCost: number }> {
  const outputDir = `output/audios/${debateName}`;

  ensureDir('output');
  ensureDir('output/audios');
  fs.rmSync(outputDir, { recursive: true, force: true });
  ensureDir(outputDir);

  const lines = renderCaptions(debateName);
  let counter = 1;
  let totalChars = 0;

  for (const { speaker, text } of lines) {
    const voice = config.voices[speaker] ?? 'alloy';
    const mp3File = path.join(outputDir, `${String(counter).padStart(3, '0')}_${speaker}.mp3`);

    console.log(`Generating: ${mp3File} using ${voice}`);
    totalChars += text.length;
    await generateTts(text, mp3File, voice);
    counter++;
  }

  console.log('All audio generated successfully.');
  fs.writeFileSync(audioManifestPath(debateName), JSON.stringify({
    signature: audioSignature(debateName),
    segments: lines.length,
  }, null, 2));

  const audioCost = totalChars * TTS_COST_PER_CHAR;
  return { characters: totalChars, audioCost };
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: npm run audio -- <debate_name>');
    process.exit(1);
  }
  run(debateName).then(({ characters, audioCost }) => {
    console.log(`Audio cost: ${characters} characters, $${audioCost.toFixed(6)}`);
  }).catch(err => { console.error(err.message); process.exit(1); });
}
