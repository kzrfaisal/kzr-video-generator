import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ensureDir } from './utils';
import { config } from '../config';

const client = new OpenAI();

const OUTRO_DIR = 'assets/audios/reels';

/**
 * HOST closer line spoken at the end of each reel (opening / rebuttals / closing).
 * Each string maps 1:1 with the reel part index (0, 1, 2).
 */
export const HOST_OUTRO_TEXT: [string, string, string] = [
  'Which opening hit harder? Tell me in the comments.',
  'Whose rebuttal wins? Drop it below.',
  'Your verdict — comment your side.',
];

/**
 * Generate the outro mp3 for a reel part if it isn't already cached.
 * Returns the absolute path to the cached mp3. Idempotent + safe to call every run.
 */
export async function ensureOutroAudio(partIndex: 0 | 1 | 2): Promise<string> {
  ensureDir(OUTRO_DIR);
  const mp3File = path.resolve(`${OUTRO_DIR}/host_outro_part${partIndex + 1}.mp3`);
  if (fs.existsSync(mp3File)) return mp3File;

  const voice = config.voices.HOST ?? 'alloy';
  console.log(`Generating cached outro audio: ${mp3File} using ${voice}`);
  const response = await client.audio.speech.create({
    model: config.ttsModel as 'tts-1' | 'tts-1-hd',
    voice: voice as 'alloy' | 'echo' | 'ash' | 'onyx',
    input: HOST_OUTRO_TEXT[partIndex],
    response_format: 'mp3',
    speed: config.ttsSpeed,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(mp3File, buffer);
  return mp3File;
}