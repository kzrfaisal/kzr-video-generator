import { NextResponse } from 'next/server';
import fs from 'fs';
import { isValidDebateName } from '@/lib/stage';
import { projectPath } from '@/src/paths';
import { updateProjectScriptFromText } from '@/src/infrastructure/storage/localProjectStore';

export const runtime = 'nodejs';

// PUT /api/debate/<name>/script — save the edited script back to disk.
export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!fs.existsSync(projectPath(name))) {
    return NextResponse.json({ error: 'Debate not found.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const script = typeof body.script === 'string' ? body.script : '';
  if (!script.trim()) {
    return NextResponse.json({ error: 'Script cannot be empty.' }, { status: 400 });
  }

  try {
    const project = updateProjectScriptFromText(name, script);
    return NextResponse.json({ ok: true, scenes: project.scenes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid script.' },
      { status: 400 },
    );
  }
}
