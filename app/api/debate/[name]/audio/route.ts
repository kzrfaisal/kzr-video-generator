import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createJob, hasActiveJob, startJob } from '@/src/infrastructure/jobs/jobManager';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { scriptPath } from '@/src/shared/filesystem/paths';
import { parseDebateFile } from '@/src/shared/utils';
import { buildRenderCaptions } from '@/src/domain/projects/captions';
import { hasAudio } from '@/src/features/rendering/videoFiles';

export const runtime = 'nodejs';

function durationSeconds(file: string): number {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ], { encoding: 'utf-8' });
  if (result.status !== 0) return 0;
  return Number.parseFloat(result.stdout.trim()) || 0;
}

// GET /api/debate/<name>/audio — list playable subtitle clips.
// GET /api/debate/<name>/audio?segment=1 — stream one generated MP3.
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  const source = scriptPath(name);
  if (!fs.existsSync(source) || !hasAudio(name)) {
    return NextResponse.json({ current: false, segments: [] });
  }

  const files = fs.readdirSync(`output/audios/${name}`).filter(file => file.endsWith('.mp3')).sort();
  const captions = buildRenderCaptions(parseDebateFile(source));
  const segmentParam = new URL(req.url).searchParams.get('segment');
  if (segmentParam !== null) {
    const segment = Number.parseInt(segmentParam, 10);
    const file = files[segment - 1];
    if (!Number.isInteger(segment) || segment < 1 || !file) {
      return new Response('Audio segment not found.', { status: 404 });
    }
    const absolute = path.resolve(`output/audios/${name}`, file);
    return new Response(fs.readFileSync(absolute), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(fs.statSync(absolute).size),
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({
    current: true,
    segments: files.map((file, index) => ({
      number: index + 1,
      sourceLineIndex: captions[index]?.sourceLineIndex ?? index,
      speaker: captions[index]?.speaker ?? 'HOST',
      text: captions[index]?.text ?? '',
      durationSeconds: durationSeconds(path.join(`output/audios/${name}`, file)),
      url: `/api/debate/${name}/audio?segment=${index + 1}`,
    })),
  });
}

// POST /api/debate/<name>/audio — generate per-line TTS audio (uses the saved voice/TTS config).
export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!fs.existsSync(scriptPath(name))) {
    return NextResponse.json({ error: 'Generate the script first.' }, { status: 409 });
  }
  if (hasActiveJob()) {
    return NextResponse.json({ error: 'Another render is already running.' }, { status: 409 });
  }

  const job = createJob({ debateName: name, kind: 'audio' });
  startJob(job, ['audio', name]);
  return NextResponse.json({ jobId: job.id, attempt: job.attempt });
}
