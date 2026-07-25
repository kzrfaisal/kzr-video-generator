import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { isValidVoice, SAMPLE_TEXT } from '@/lib/voices';

export const runtime = 'nodejs';

const SAMPLE_DIR = 'output/voice-samples';

// GET /api/voice-sample/<voice> — a short spoken preview of a voice (cached after first gen).
export async function GET(_req: Request, { params }: { params: Promise<{ voice: string }> }) {
  const { voice } = await params;
  if (!isValidVoice(voice)) {
    return new Response('Unknown voice.', { status: 400 });
  }

  const file = path.join(SAMPLE_DIR, `${voice}.mp3`);
  if (!fs.existsSync(file)) {
    try {
      const client = new OpenAI();
      const resp = await client.audio.speech.create({
        model: 'tts-1',
        voice: voice as 'alloy',
        input: SAMPLE_TEXT,
        response_format: 'mp3',
      });
      fs.mkdirSync(SAMPLE_DIR, { recursive: true });
      fs.writeFileSync(file, Buffer.from(await resp.arrayBuffer()));
    } catch (err: any) {
      return new Response(`Could not generate sample: ${err.message}`, { status: 500 });
    }
  }

  const buf = fs.readFileSync(file);
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buf.length),
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
