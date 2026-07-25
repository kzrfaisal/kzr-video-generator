import { NextResponse } from 'next/server';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { jobs, hasActiveJob, startJob, type Job } from '@/lib/jobs';
import { isValidDebateName } from '@/lib/stage';
import { reelsPartsPath } from '@/src/paths';

export const runtime = 'nodejs';

// POST /api/debate/<name>/reels — build the 3 reel videos from the extracted parts.
export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!fs.existsSync(reelsPartsPath(name))) {
    return NextResponse.json({ error: 'Extract the reel scripts first.' }, { status: 409 });
  }
  if (hasActiveJob()) {
    return NextResponse.json({ error: 'Another render is already running.' }, { status: 409 });
  }

  const id = randomUUID();
  const job: Job = {
    id, debateName: name, kind: 'reels',
    status: 'running', stage: 'reels', logs: [], reelPaths: [], createdAt: Date.now(),
  };
  jobs.set(id, job);
  // Reels render in style3 (portrait 9:16), loaded in the child's own config.
  startJob(job, ['reels-build', name, '--style=style3']);
  return NextResponse.json({ jobId: id });
}
