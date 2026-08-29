import { NextResponse } from 'next/server';
import fs from 'fs';
import { runStage, isValidDebateName } from '@/src/infrastructure/process/runStage';
import { reelPartScriptPath } from '@/src/shared/filesystem/paths';
import { markStageCompleted, markStageFailed, markStageRunning } from '@/src/infrastructure/storage/localPipelineStore';
import { expectedReelCount } from '@/src/features/rendering/videoFiles';

export const runtime = 'nodejs';

/** Read every Reel part created by duration-aware extraction. */
function readReelScripts(name: string) {
  const parts = [];
  for (let k = 1; k <= expectedReelCount(name); k++) {
    const p = reelPartScriptPath(name, k);
    if (fs.existsSync(p)) parts.push({ part: k, script: fs.readFileSync(p, 'utf-8') });
  }
  return parts;
}

// POST /api/debate/<name>/extract-reels — create editable 52-second Reel scripts.
export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }

  markStageRunning(name, 'reel-scripts');
  const result = await runStage(['extract-reels', name]);
  if (!result.ok || !('EXTRACT_DONE' in result.markers)) {
    markStageFailed(name, 'reel-scripts', result.output.slice(-600) || 'Reel script extraction failed.');
    return NextResponse.json(
      { error: 'Could not create the Reel scripts.', detail: result.output.slice(-600) },
      { status: 422 },
    );
  }

  markStageCompleted(name, 'reel-scripts');
  return NextResponse.json({ parts: readReelScripts(name) });
}
