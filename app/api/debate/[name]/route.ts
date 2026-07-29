import { NextResponse } from 'next/server';
import fs from 'fs';
import { isValidDebateName } from '@/lib/stage';
import { scriptPath, publishMetadata, projectPath, reelPartScriptPath } from '@/src/paths';
import { findMainVideo, findReelVideos, hasThumbnail, hasAudio } from '@/lib/videos';

export const runtime = 'nodejs';

// GET /api/debate/<name> — the debate's current state, read from disk (recovery source).
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  if (!fs.existsSync(scriptPath(name))) {
    return NextResponse.json({ error: 'Debate not found.' }, { status: 404 });
  }

  const script = fs.readFileSync(scriptPath(name), 'utf-8');
  const mdPath = publishMetadata(name);
  const metadata = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : null;

  let topic = '';
  let context = '';
  let savedConfig: Record<string, unknown> | null = null;
  const pp = projectPath(name);
  if (fs.existsSync(pp)) {
    try {
      const p = JSON.parse(fs.readFileSync(pp, 'utf-8'));
      topic = p.topic ?? '';
      context = p.context ?? '';
      savedConfig = p.config ?? null;
    } catch { /* ignore a corrupt sidecar */ }
  }

  // Reel part scripts that have been extracted (for recovery/editing).
  const reelScripts = [];
  for (let k = 1; k <= 3; k++) {
    const p = reelPartScriptPath(name, k);
    if (fs.existsSync(p)) reelScripts.push({ part: k, script: fs.readFileSync(p, 'utf-8') });
  }

  return NextResponse.json({
    debateName: name,
    topic,
    context,
    script,
    metadata,
    config: savedConfig,                  // null until the user changes settings
    thumbnailExists: hasThumbnail(name),
    audioExists: hasAudio(name),
    videoExists: findMainVideo(name) !== null,
    reelScripts,                          // [] until extracted
    reelsCount: findReelVideos(name).length,
  });
}
