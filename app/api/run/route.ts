import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { runs, hasActiveRun, type RunState, type Stage } from '@/lib/runs';

// Force the Node.js runtime (not Edge) — we need child_process and the filesystem.
export const runtime = 'nodejs';

/** Parse the pipeline's `@@…@@` stdout markers and plain log lines into the run's state. */
function ingest(state: RunState, chunk: string) {
  for (const raw of chunk.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;

    if (line.startsWith('@@STAGE@@ ')) {
      state.stage = line.slice('@@STAGE@@ '.length).trim() as Stage;
    } else if (line.startsWith('@@DEBATE@@ ')) {
      state.debateName = line.slice('@@DEBATE@@ '.length).trim();
    } else if (line.startsWith('@@THUMB@@ ')) {
      state.thumbnailPath = line.slice('@@THUMB@@ '.length).trim();
    } else if (line.startsWith('@@RESULT@@ ')) {
      state.videoPath = line.slice('@@RESULT@@ '.length).trim();
    } else {
      state.logs.push(line);
      if (state.logs.length > 80) state.logs.shift(); // keep only the tail
    }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';

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
    createdAt: Date.now(),
  };
  runs.set(id, state);

  // Run the exact same pipeline the CLI runs, just via the non-interactive entry point.
  const args = ['tsx', 'src/runPipeline.ts', topic];
  if (context) args.push(`--context=${context}`);

  const child = spawn('npx', args, { cwd: process.cwd() });
  state.child = child;

  child.stdout.on('data', d => ingest(state, d.toString()));
  child.stderr.on('data', d => ingest(state, d.toString()));

  child.on('error', err => {
    state.status = 'error';
    state.error = `Failed to start pipeline: ${err.message}`;
    state.child = undefined;
  });

  child.on('close', code => {
    if (code === 0 && state.videoPath) {
      state.status = 'done';
      state.stage = 'done';
    } else if (state.status !== 'error') {
      state.status = 'error';
      state.error = state.error ?? `Pipeline exited with code ${code}.`;
    }
    state.child = undefined;
  });

  return NextResponse.json({ id });
}
