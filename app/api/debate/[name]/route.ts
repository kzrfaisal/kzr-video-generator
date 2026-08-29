import { NextResponse } from 'next/server';
import fs from 'fs';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { publishMetadata, publishRecordPath, projectPath, reelPartScriptPath } from '@/src/shared/filesystem/paths';
import { expectedReelCount, findMainVideo, findReelVideos, hasThumbnail, hasAudio } from '@/src/features/rendering/videoFiles';
import { readProjectDocument, readProjectScriptText } from '@/src/infrastructure/storage/localProjectStore';
import { applyExactProjectTitle, metadataToMarkdown, parseMetadataMarkdown } from '@/src/domain/projects/metadata';
import { readPipelineState } from '@/src/infrastructure/storage/localPipelineStore';

export const runtime = 'nodejs';

// GET /api/debate/<name> — the debate's current state, read from disk (recovery source).
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!fs.existsSync(projectPath(name))) {
    return NextResponse.json({ error: 'Debate not found.' }, { status: 404 });
  }

  const project = readProjectDocument(name);
  const script = readProjectScriptText(name);
  const mdPath = publishMetadata(name);
  const storedMetadata = fs.existsSync(mdPath)
    ? fs.readFileSync(mdPath, 'utf-8')
    : project.metadata ? metadataToMarkdown(project.metadata) : null;
  const storedMetadataFields = project.metadata ?? (storedMetadata ? parseMetadataMarkdown(storedMetadata) : null);
  const metadataFields = storedMetadataFields
    ? applyExactProjectTitle(storedMetadataFields, project.title)
    : null;
  const metadata = metadataFields ? metadataToMarkdown(metadataFields) : null;
  let publishing = null;
  const publishPath = publishRecordPath(name);
  if (fs.existsSync(publishPath)) {
    try { publishing = JSON.parse(fs.readFileSync(publishPath, 'utf-8')); }
    catch { /* ignore a corrupt publishing receipt */ }
  }

  // Reel part scripts that have been extracted (for recovery/editing).
  const reelScripts = [];
  const reelsTargetCount = expectedReelCount(name);
  for (let k = 1; k <= reelsTargetCount; k++) {
    const p = reelPartScriptPath(name, k);
    if (fs.existsSync(p)) reelScripts.push({ part: k, script: fs.readFileSync(p, 'utf-8') });
  }

  return NextResponse.json({
    debateName: name,
    topic: project.title,
    context: project.context,
    script,
    scenes: project.scenes,
    metadata,
    metadataFields,
    config: project.config,
    thumbnailExists: hasThumbnail(name),
    audioExists: hasAudio(name),
    videoExists: findMainVideo(name) !== null,
    reelScripts,                          // [] until extracted
    reelsCount: findReelVideos(name).length,
    reelsTargetCount,
    publishing,
    pipeline: readPipelineState(name),
  });
}
