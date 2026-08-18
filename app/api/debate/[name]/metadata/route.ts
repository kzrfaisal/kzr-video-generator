import { NextResponse } from 'next/server';
import fs from 'fs';
import { runStage, isValidDebateName } from '@/src/infrastructure/process/runStage';
import { projectPath, publishDir, publishMetadata } from '@/src/shared/filesystem/paths';
import { parseMetadataMarkdown } from '@/src/domain/projects/metadata';
import { readProjectDocument, saveProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import {
  invalidateProjectStages,
  markStageCompleted,
  markStageFailed,
  markStageRunning,
} from '@/src/infrastructure/storage/localPipelineStore';

export const runtime = 'nodejs';

// POST /api/debate/<name>/metadata — generate metadata for an existing script.
export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!fs.existsSync(projectPath(name))) {
    return NextResponse.json({ error: 'Generate the script first.' }, { status: 409 });
  }

  markStageRunning(name, 'metadata');
  const result = await runStage(['metadata', name]);
  const mdPath = publishMetadata(name);
  if (!result.ok || !fs.existsSync(mdPath)) {
    markStageFailed(name, 'metadata', result.output.slice(-600) || 'Metadata generation failed.');
    return NextResponse.json(
      { error: 'Metadata generation failed.', detail: result.output.slice(-600) },
      { status: 500 },
    );
  }

  markStageCompleted(name, 'metadata');
  invalidateProjectStages(name, ['thumbnail', 'publishing'], 'Metadata changed.');
  return NextResponse.json({ metadata: fs.readFileSync(mdPath, 'utf-8') });
}

// PUT /api/debate/<name>/metadata — save the edited metadata back to disk.
export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const metadata = typeof body.metadata === 'string' ? body.metadata : '';
  try {
    const project = readProjectDocument(name);
    project.metadata = parseMetadataMarkdown(metadata);
    saveProjectDocument(project);
    fs.mkdirSync(publishDir(name), { recursive: true });
    fs.writeFileSync(publishMetadata(name), metadata, 'utf-8');
    markStageCompleted(name, 'metadata');
    invalidateProjectStages(name, ['thumbnail', 'publishing'], 'Metadata changed.');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid metadata.' },
      { status: 400 },
    );
  }
}
