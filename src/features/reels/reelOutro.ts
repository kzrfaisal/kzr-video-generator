import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ensureDir } from '@/src/shared/utils';
import { config } from '@/config';
import type { ContentMode } from '@/src/features/projects/contentMode';

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

export const EXPLAINER_OUTRO_TEXT: [string, string, string] = [
  'What surprised you most? Tell me in the comments.',
  'Want a deeper breakdown? Let me know below.',
  'Follow for more stories explained simply.',
];

/**
 * Generate the outro mp3 for a reel part if it isn't already cached.
 * Returns the absolute path to the cached mp3. Idempotent + safe to call every run.
 */
export function outroText(partIndex: 0 | 1 | 2, contentMode: ContentMode): string {
  return contentMode === 'narrated-explainer'
    ? EXPLAINER_OUTRO_TEXT[partIndex]
    : HOST_OUTRO_TEXT[partIndex];
}

export async function ensureOutroAudio(partIndex: 0 | 1 | 2, contentMode: ContentMode = 'debate'): Promise<string> {
  ensureDir(OUTRO_DIR);
  const prefix = contentMode === 'narrated-explainer' ? 'explainer' : 'host';
  const mp3File = path.resolve(`${OUTRO_DIR}/${prefix}_outro_part${partIndex + 1}.mp3`);
  if (fs.existsSync(mp3File)) return mp3File;

  const voice = config.voices.HOST ?? 'alloy';
  console.log(`Generating cached outro audio: ${mp3File} using ${voice}`);
  const response = await client.audio.speech.create({
    model: config.ttsModel as 'tts-1' | 'tts-1-hd',
    voice: voice as 'alloy' | 'echo' | 'ash' | 'onyx',
    input: outroText(partIndex, contentMode),
    response_format: 'mp3',
    speed: config.ttsSpeed,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(mp3File, buffer);
  return mp3File;
}
