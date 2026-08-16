import { NextResponse } from 'next/server';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { jobs, hasActiveJob, startJob, type Job } from '@/lib/jobs';
import { isValidDebateName } from '@/lib/stage';
import { scriptPath } from '@/src/paths';
import { readVisualPlan } from '@/src/visualScenes';

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

  const id = randomUUID();
  const job: Job = {
    id, debateName: name, kind: 'visuals', status: 'running', stage: 'visuals',
    logs: [], reelPaths: [], createdAt: Date.now(),
  };
  jobs.set(id, job);
  startJob(job, ['visuals', name]);
  return NextResponse.json({ jobId: id });
}
