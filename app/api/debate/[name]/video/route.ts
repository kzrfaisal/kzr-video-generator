import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createJob, hasActiveJob, startJob } from '@/src/infrastructure/jobs/jobManager';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { findMainVideo, findReelVideos, hasAudio } from '@/src/features/rendering/videoFiles';

export const runtime = 'nodejs';

// POST /api/debate/<name>/video — render the landscape video from existing audio.
export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!hasAudio(name)) {
    return NextResponse.json({ error: 'Generate the audio first.' }, { status: 409 });
  }
  if (hasActiveJob()) {
    return NextResponse.json({ error: 'Another render is already running.' }, { status: 409 });
  }

  const job = createJob({ debateName: name, kind: 'video' });
  startJob(job, ['video', name]);
  return NextResponse.json({ jobId: job.id, attempt: job.attempt });
}

// GET /api/debate/<name>/video[?reel=<n>] — stream a finished video file (with range support).
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return new Response('Invalid debate name.', { status: 400 });
  }

  const reelParam = new URL(req.url).searchParams.get('reel');
  const target = reelParam !== null
    ? findReelVideos(name)[Number(reelParam)]
    : findMainVideo(name);
  if (!target || !fs.existsSync(target)) {
    return new Response('Video not found.', { status: 404 });
  }

  const abs = path.resolve(target);
  const size = fs.statSync(abs).size;
  const range = req.headers.get('range');

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
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
  });
}
