import { NextResponse } from 'next/server';
import fs from 'fs';
import { runs } from '@/lib/runs';
import { runPhase } from '@/lib/pipeline';
import { scriptPath, publishDir, publishMetadata } from '@/src/paths';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = runs.get(id);
  if (!state) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }
  if (state.status !== 'awaiting_review' || !state.debateName) {
    return NextResponse.json({ error: 'This run is not awaiting review.' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const script = typeof body.script === 'string' ? body.script : state.scriptText ?? '';
  const metadata = typeof body.metadata === 'string' ? body.metadata : state.metadataText ?? '';
  if (!script.trim()) {
    return NextResponse.json({ error: 'Script cannot be empty.' }, { status: 400 });
  }

  // Persist the (possibly edited) draft, then render from it.
  fs.writeFileSync(scriptPath(state.debateName), script, 'utf-8');
  fs.mkdirSync(publishDir(state.debateName), { recursive: true });
  fs.writeFileSync(publishMetadata(state.debateName), metadata, 'utf-8');

  state.status = 'running';
  state.stage = 'thumbnail';
  state.scriptText = undefined;
  state.metadataText = undefined;
  state.error = undefined;

  runPhase(state, 'render', ['render', state.debateName]);
  return NextResponse.json({ ok: true });
}
