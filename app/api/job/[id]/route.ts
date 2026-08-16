import { NextResponse } from 'next/server';
import { getJob, publicJob } from '@/lib/jobs';

export const runtime = 'nodejs';

// GET /api/job/<id> — poll a long-running stage's progress.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  return NextResponse.json(publicJob(job));
}
