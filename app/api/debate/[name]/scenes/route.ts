import { NextResponse } from 'next/server';
import type { ScriptScene, SpeakerRole } from '@/src/domain/projects/types';
import { scriptToLegacyText } from '@/src/domain/projects/script';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { readProjectDocument, saveProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import { invalidateProjectStages, markStageCompleted } from '@/src/infrastructure/storage/localPipelineStore';

export const runtime = 'nodejs';

function isSpeaker(value: unknown): value is SpeakerRole {
  return value === 'HOST' || value === 'A' || value === 'B';
}

// PUT /api/debate/<name>/scenes — save ordered structured scenes from the editor.
export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.scenes) || body.scenes.length === 0) {
    return NextResponse.json({ error: 'A project needs at least one scene.' }, { status: 400 });
  }

  try {
    const project = readProjectDocument(name);
    const existing = new Map(project.scenes.map(scene => [scene.id, scene]));
    const ids = new Set<string>();
    const scenes: ScriptScene[] = body.scenes.map((raw: unknown, index: number) => {
      if (!raw || typeof raw !== 'object') throw new Error(`Scene ${index + 1} is invalid.`);
      const value = raw as Record<string, unknown>;
      const id = typeof value.id === 'string' ? value.id : '';
      const narration = typeof value.narration === 'string' ? value.narration.trim() : '';
      if (!/^scene-\d{3,}$/.test(id) || ids.has(id)) throw new Error(`Scene ${index + 1} has an invalid or duplicate ID.`);
      if (!isSpeaker(value.speaker)) throw new Error(`Scene ${index + 1} has an invalid speaker.`);
      if (project.contentMode === 'narrated-explainer' && value.speaker !== 'HOST') {
        throw new Error('Explainer scenes must use the narrator.');
      }
      if (!narration) throw new Error(`Scene ${index + 1} needs narration.`);
      ids.add(id);
      const previous = existing.get(id);
      return {
        id,
        speaker: value.speaker,
        narration,
        headline: typeof value.headline === 'string' ? value.headline.trim() : '',
        visualQuery: typeof value.visualQuery === 'string' ? value.visualQuery.trim() : '',
        visualType: previous?.visualType ?? (project.contentMode === 'narrated-explainer' ? 'stock-photo' : 'character'),
        visualAssetPath: previous?.visualAssetPath ?? null,
        durationHintSeconds: previous?.durationHintSeconds ?? null,
        overlays: previous?.overlays ?? [],
        status: 'draft',
      };
    });

    const saved = saveProjectDocument({ ...project, scenes });
    markStageCompleted(name, 'script');
    invalidateProjectStages(
      name,
      ['metadata', 'visuals', 'thumbnail', 'audio', 'video', 'reel-scripts', 'reels', 'publishing'],
      'Scenes changed.',
    );
    return NextResponse.json({ ok: true, scenes: saved.scenes, script: scriptToLegacyText(saved.scenes) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid scenes.' },
      { status: 400 },
    );
  }
}
