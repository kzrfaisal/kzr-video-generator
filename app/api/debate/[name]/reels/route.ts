import { NextResponse } from 'next/server';
import fs from 'fs';
import { createJob, hasActiveJob, startJob } from '@/src/infrastructure/jobs/jobManager';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { reelsPartsPath } from '@/src/shared/filesystem/paths';

export const runtime = 'nodejs';

// POST /api/debate/<name>/reels — build all duration-balanced Reel videos.
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

  const job = createJob({ debateName: name, kind: 'reels' });
  // Reels render in style3 (portrait 9:16), loaded in the child's own config.
  startJob(job, ['reels-build', name, '--style=style3']);
  return NextResponse.json({ jobId: job.id, attempt: job.attempt });
}
