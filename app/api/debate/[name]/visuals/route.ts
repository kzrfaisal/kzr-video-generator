import { NextResponse } from 'next/server';
import fs from 'fs';
import { createJob, hasActiveJob, startJob } from '@/src/infrastructure/jobs/jobManager';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { scriptPath } from '@/src/shared/filesystem/paths';
import { readVisualPlan } from '@/src/features/visuals/visualScenes';
import { updateVisualSceneRanges } from '@/src/features/visuals/visualScenes';
import { invalidateProjectStages } from '@/src/infrastructure/storage/localPipelineStore';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  return NextResponse.json({
    configured: !!process.env.PEXELS_API_KEY?.trim(),
    plan: readVisualPlan(name),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  if (!fs.existsSync(scriptPath(name))) return NextResponse.json({ error: 'Generate the script first.' }, { status: 409 });
  if (!process.env.PEXELS_API_KEY?.trim()) {
    return NextResponse.json({ error: 'PEXELS_API_KEY is missing. Add a free Pexels API key to .env.' }, { status: 409 });
  }
  if (hasActiveJob()) return NextResponse.json({ error: 'Another render is already running.' }, { status: 409 });

  const job = createJob({ debateName: name, kind: 'visuals' });
  startJob(job, ['visuals', name]);
  return NextResponse.json({ jobId: job.id, attempt: job.attempt });
}

export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.ranges)) return NextResponse.json({ error: 'Picture ranges are required.' }, { status: 400 });
  try {
    const plan = updateVisualSceneRanges(name, body.ranges);
    invalidateProjectStages(name, ['video', 'reels', 'publishing'], 'Picture timing changed.');
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save picture timing.' }, { status: 400 });
  }
}
