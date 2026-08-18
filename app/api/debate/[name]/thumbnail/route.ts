import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { runStage, isValidDebateName } from '@/src/infrastructure/process/runStage';
import { publishMetadata, publishThumbnail } from '@/src/shared/filesystem/paths';

export const runtime = 'nodejs';

// POST — render the thumbnail from the metadata hook (quick, ffmpeg only).
export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!fs.existsSync(publishMetadata(name))) {
    return NextResponse.json({ error: 'Generate metadata first (the thumbnail uses its hook).' }, { status: 409 });
  }

  const result = await runStage(['thumbnail', name]);
  if (!result.ok || !fs.existsSync(publishThumbnail(name))) {
    return NextResponse.json(
      { error: 'Thumbnail generation failed.', detail: result.output.slice(-600) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

// GET — serve the thumbnail JPG.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) return new Response('Invalid debate name.', { status: 400 });

  const abs = path.resolve(publishThumbnail(name));
  if (!fs.existsSync(abs)) return new Response('Thumbnail not found.', { status: 404 });

  return new Response(fs.readFileSync(abs), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' },
  });
}
