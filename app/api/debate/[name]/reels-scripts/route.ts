import { NextResponse } from 'next/server';
import fs from 'fs';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { reelPartScriptPath } from '@/src/shared/filesystem/paths';
import { invalidateProjectStages, markStageCompleted } from '@/src/infrastructure/storage/localPipelineStore';
import { expectedReelCount } from '@/src/features/rendering/videoFiles';

export const runtime = 'nodejs';

// GET — read every duration-balanced reel part script (for recovery/display).
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  const parts = [];
  for (let k = 1; k <= expectedReelCount(name); k++) {
    const p = reelPartScriptPath(name, k);
    if (fs.existsSync(p)) parts.push({ part: k, script: fs.readFileSync(p, 'utf-8') });
  }
  return NextResponse.json({ parts });
}

// PUT — save an edited reel part script. Body: { part, script }.
export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const part = Number(body.part);
  const script = typeof body.script === 'string' ? body.script : '';
  if (!Number.isInteger(part) || part < 1 || part > Math.max(1, expectedReelCount(name))) {
    return NextResponse.json({ error: 'Invalid Reel part number.' }, { status: 400 });
  }
  const p = reelPartScriptPath(name, part);
  if (!fs.existsSync(p)) {
    return NextResponse.json({ error: 'Extract the reel scripts first.' }, { status: 409 });
  }
  if (!script.trim()) {
    return NextResponse.json({ error: 'Script cannot be empty.' }, { status: 400 });
  }
  fs.writeFileSync(p, script, 'utf-8');
  markStageCompleted(name, 'reel-scripts');
  invalidateProjectStages(name, ['reels', 'publishing'], 'A reel script changed.');
  return NextResponse.json({ ok: true });
}
