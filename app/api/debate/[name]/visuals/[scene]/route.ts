import { NextResponse } from 'next/server';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { regenerateVisualScene } from '@/src/features/visuals/visualScenes';
import {
  invalidateProjectStages,
  markStageCompleted,
  markStageFailed,
  markStageRunning,
} from '@/src/infrastructure/storage/localPipelineStore';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ name: string; scene: string }> }) {
  const { name, scene } = await params;
  if (!isValidDebateName(name) || !/^(?:visual-)?scene-\d{2,}$/.test(scene)) {
    return NextResponse.json({ error: 'Invalid visual scene.' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === 'string' ? body.query : undefined;
  markStageRunning(name, 'visuals');
  try {
    const visual = await regenerateVisualScene(name, scene, query);
    markStageCompleted(name, 'visuals');
    invalidateProjectStages(name, ['video', 'reels', 'publishing'], 'A visual scene changed.');
    return NextResponse.json({ scene: visual });
  } catch (error) {
    markStageFailed(name, 'visuals', error instanceof Error ? error.message : 'Could not regenerate scene.');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not regenerate scene.' },
      { status: 500 },
    );
  }
}
