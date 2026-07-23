import fs from 'fs';
import path from 'path';
import { runs } from '@/lib/runs';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = runs.get(id);
  if (!state?.videoPath) {
    return new Response('Video not ready.', { status: 404 });
  }

  // Guard: only ever serve from the publish folder.
  const abs = path.resolve(state.videoPath);
  const publishRoot = path.resolve('output', 'publish');
  if (!abs.startsWith(publishRoot) || !fs.existsSync(abs)) {
    return new Response('Video not found.', { status: 404 });
  }

  const size = fs.statSync(abs).size;
  const range = req.headers.get('range');

  // Range request → 206 partial, so the browser can seek and (on Safari) play at all.
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    const chunk = fs.readFileSync(abs).subarray(start, end + 1);
    return new Response(chunk, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunk.length),
      },
    });
  }

  return new Response(fs.readFileSync(abs), {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
    },
  });
}
