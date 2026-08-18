import { NextResponse } from 'next/server';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { jobs, hasActiveJob, startJob, type Job } from '@/src/infrastructure/jobs/jobManager';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { findMainVideo, findReelVideos } from '@/src/features/rendering/videoFiles';
import { publishMetadata } from '@/src/shared/filesystem/paths';

export const runtime = 'nodejs';

// POST /api/debate/<name>/publish — publish the main video/Shorts to YouTube and Reels to Instagram.
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const body = await req.json().catch(() => ({}));
  const target = typeof body.target === 'string' ? body.target : 'all';
  if (!['youtube', 'instagram', 'all'].includes(target)) {
    return NextResponse.json({ error: 'Invalid publishing target.' }, { status: 400 });
  }
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!fs.existsSync(publishMetadata(name)) || !findMainVideo(name) || findReelVideos(name).length !== 3) {
    return NextResponse.json({ error: 'Generate metadata, the main video, and all 3 reels first.' }, { status: 409 });
  }
  if (hasActiveJob()) {
    return NextResponse.json({ error: 'Another background job is already running.' }, { status: 409 });
  }

  const id = randomUUID();
  const kind = target === 'all' ? 'publish' : `publish-${target}` as Job['kind'];
  const job: Job = {
    id, debateName: name, kind, status: 'running', stage: `publishing-${target}`,
    logs: [], reelPaths: [], createdAt: Date.now(),
  };
  jobs.set(id, job);
  startJob(job, ['publish', name, `--target=${target}`]);
  return NextResponse.json({ jobId: id });
}
