import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { runs, hasActiveRun, type RunState } from '@/lib/runs';
import { runPhase } from '@/lib/pipeline';

// Force the Node.js runtime (not Edge) — we need child_process and the filesystem.
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';
  const review = Boolean(body.review); // pause after the script for editing?

  if (!topic) {
    return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
  }
  if (hasActiveRun()) {
    return NextResponse.json(
      { error: 'A video is already being generated. Please wait for it to finish.' },
      { status: 409 },
    );
  }

  const id = randomUUID();
  const state: RunState = {
    id,
    topic,
    status: 'running',
    stage: 'starting',
    logs: [],
    reelPaths: [],
    createdAt: Date.now(),
  };
  runs.set(id, state);

  // review → run the script phase and park for review; otherwise run the whole pipeline.
  if (review) {
    const args = ['script', topic];
    if (context) args.push(`--context=${context}`);
    runPhase(state, 'script', args);
  } else {
    const args = ['full', topic];
    if (context) args.push(`--context=${context}`);
    runPhase(state, 'full', args);
  }

  return NextResponse.json({ id });
}
