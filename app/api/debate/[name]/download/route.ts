import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { isValidDebateName } from '@/lib/stage';
import { findMainVideo, findReelVideos } from '@/lib/videos';
import { publishMetadata, publishThumbnail } from '@/src/paths';

export const runtime = 'nodejs';

// GET — package the finished, shareable files into one local ZIP download.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }

  const candidates = [
    findMainVideo(name),
    ...findReelVideos(name),
    publishThumbnail(name),
    publishMetadata(name),
  ];
  const files = candidates.filter((file): file is string => !!file && fs.existsSync(file));
  if (files.length === 0) {
    return NextResponse.json({ error: 'No finished outputs are available yet.' }, { status: 409 });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debate-pack-'));
  const archive = path.join(tempDir, `${name}.zip`);
  try {
    execFileSync('zip', ['-j', '-q', archive, ...files.map(file => path.resolve(file))]);
    const body = new Uint8Array(fs.readFileSync(archive));
    return new Response(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${name}.zip"`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown ZIP error.';
    return NextResponse.json({ error: 'Could not create the download pack.', detail }, { status: 500 });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
