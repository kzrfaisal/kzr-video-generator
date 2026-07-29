import { NextResponse } from 'next/server';
import fs from 'fs';
import { STYLES, VIDEO_STYLES } from '@/config';
import { VOICES } from '@/lib/voices';

export const runtime = 'nodejs';

/** .ttf fonts bundled under assets/fonts, as {label, value} where value is the path. */
function listFonts() {
  try {
    return fs.readdirSync('assets/fonts')
      .filter(f => f.toLowerCase().endsWith('.ttf'))
      .map(f => ({ label: f.replace(/\.ttf$/i, ''), value: `assets/fonts/${f}` }));
  } catch { return []; }
}

// GET /api/options — choices for the config panel, derived from config.ts so they stay in sync.
export async function GET() {
  return NextResponse.json({
    voices: [...VOICES],
    ttsModels: ['tts-1', 'tts-1-hd'],
    subtitleStyles: Object.keys(STYLES),
    videoStyles: Object.keys(VIDEO_STYLES).filter(s => s !== 'style3'), // style3 = reels, chosen automatically
    fonts: listFonts(),
    positions: ['top', 'bottom', 'center'],
    defaults: {
      voices: { HOST: 'alloy', A: 'echo', B: 'ash' },
      ttsModel: 'tts-1',
      ttsSpeed: 1.0,
      subtitleStyle: 'top-classic',
      videoStyle: 'style1',
    },
  });
}
