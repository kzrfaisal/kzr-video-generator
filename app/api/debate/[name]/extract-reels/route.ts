import { NextResponse } from 'next/server';
import fs from 'fs';
import { runStage, isValidDebateName } from '@/src/infrastructure/process/runStage';
import { reelPartScriptPath } from '@/src/shared/filesystem/paths';
import { markStageCompleted, markStageFailed, markStageRunning } from '@/src/infrastructure/storage/localPipelineStore';

export const runtime = 'nodejs';

/** Read whichever of the 3 reel part scripts exist. */
function readReelScripts(name: string) {
  const parts = [];
  for (let k = 1; k <= 3; k++) {
    const p = reelPartScriptPath(name, k);
    if (fs.existsSync(p)) parts.push({ part: k, script: fs.readFileSync(p, 'utf-8') });
  }
  return parts;
}

// POST /api/debate/<name>/extract-reels — split the debate into 3 editable reel scripts.
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
      { error: 'Could not create the three reel scripts.', detail: result.output.slice(-600) },
      { status: 422 },
    );
  }

  markStageCompleted(name, 'reel-scripts');
  return NextResponse.json({ parts: readReelScripts(name) });
}
