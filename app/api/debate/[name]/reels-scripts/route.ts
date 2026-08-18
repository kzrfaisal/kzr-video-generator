import { NextResponse } from 'next/server';
import fs from 'fs';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { reelPartScriptPath } from '@/src/shared/filesystem/paths';

export const runtime = 'nodejs';

// GET — read the 3 reel part scripts (for recovery/display).
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  const parts = [];
  for (let k = 1; k <= 3; k++) {
    const p = reelPartScriptPath(name, k);
    if (fs.existsSync(p)) parts.push({ part: k, script: fs.readFileSync(p, 'utf-8') });
  }
  return NextResponse.json({ parts });
}

// PUT — save an edited reel part script. Body: { part: 1|2|3, script }.
export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const part = Number(body.part);
  const script = typeof body.script === 'string' ? body.script : '';
  if (![1, 2, 3].includes(part)) {
    return NextResponse.json({ error: 'part must be 1, 2, or 3.' }, { status: 400 });
  }
  const p = reelPartScriptPath(name, part);
  if (!fs.existsSync(p)) {
    return NextResponse.json({ error: 'Extract the reel scripts first.' }, { status: 409 });
  }
  if (!script.trim()) {
    return NextResponse.json({ error: 'Script cannot be empty.' }, { status: 400 });
  }
  fs.writeFileSync(p, script, 'utf-8');
  return NextResponse.json({ ok: true });
}
