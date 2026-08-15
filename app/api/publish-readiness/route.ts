import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const YOUTUBE_REQUIRED = [
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
];
const INSTAGRAM_REQUIRED = [
  'INSTAGRAM_USER_ID',
  'INSTAGRAM_ACCESS_TOKEN',
];

// Checks configuration only; secret values never leave the server.
export async function GET(req: Request) {
  const platform = new URL(req.url).searchParams.get('platform') || 'all';
  const required = platform === 'youtube'
    ? YOUTUBE_REQUIRED
    : platform === 'instagram'
      ? INSTAGRAM_REQUIRED
      : [...YOUTUBE_REQUIRED, ...INSTAGRAM_REQUIRED];
  const missing = required.filter(name => !process.env[name]?.trim());
  return NextResponse.json({ ready: missing.length === 0, missing });
}
