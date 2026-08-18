import { NextResponse } from 'next/server';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { jobs, hasActiveJob, startJob, type Job } from '@/src/infrastructure/jobs/jobManager';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { scriptPath } from '@/src/shared/filesystem/paths';

export const runtime = 'nodejs';

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

  const id = randomUUID();
  const job: Job = {
    id, debateName: name, kind: 'audio',
    status: 'running', stage: 'audio', logs: [], reelPaths: [], createdAt: Date.now(),
  };
  jobs.set(id, job);
  startJob(job, ['audio', name]);
  return NextResponse.json({ jobId: id });
}
