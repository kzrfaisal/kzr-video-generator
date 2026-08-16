import { NextResponse } from 'next/server';
import fs from 'fs';
import { isValidDebateName } from '@/lib/stage';
import { projectPath } from '@/src/paths';
import { STYLES, VIDEO_STYLES } from '@/config';
import { isValidVoice } from '@/lib/voices';

export const runtime = 'nodejs';

// PUT /api/debate/<name>/config — save the per-run config choices into the project sidecar.
export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isValidDebateName(name)) {
    return NextResponse.json({ error: 'Invalid debate name.' }, { status: 400 });
  }
  const pp = projectPath(name);
  if (!fs.existsSync(pp)) {
    return NextResponse.json({ error: 'Debate not found.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const c = body.config ?? {};

  // Validate every field before persisting.
  if (c.videoStyle && !(c.videoStyle in VIDEO_STYLES && c.videoStyle !== 'style3')) {
    return NextResponse.json({ error: `Invalid video style: ${c.videoStyle}` }, { status: 400 });
  }
  if (c.visualMode && !['debate', 'infographic'].includes(c.visualMode)) {
    return NextResponse.json({ error: `Invalid visual mode: ${c.visualMode}` }, { status: 400 });
  }
  if (c.subtitleStyle && !(c.subtitleStyle in STYLES)) {
    return NextResponse.json({ error: `Invalid subtitle style: ${c.subtitleStyle}` }, { status: 400 });
  }
  if (c.ttsModel && !['tts-1', 'tts-1-hd'].includes(c.ttsModel)) {
    return NextResponse.json({ error: `Invalid TTS model: ${c.ttsModel}` }, { status: 400 });
  }
  if (c.ttsSpeed !== undefined && (typeof c.ttsSpeed !== 'number' || c.ttsSpeed < 0.25 || c.ttsSpeed > 4)) {
    return NextResponse.json({ error: 'TTS speed must be between 0.25 and 4.' }, { status: 400 });
  }
  if (c.voices) {
    for (const v of Object.values(c.voices)) {
      if (!isValidVoice(v as string)) {
        return NextResponse.json({ error: `Invalid voice: ${v}` }, { status: 400 });
      }
    }
  }
  if (c.customSubtitle) {
    const cs = c.customSubtitle;
    if (cs.position && !['top', 'bottom', 'center'].includes(cs.position)) {
      return NextResponse.json({ error: `Invalid subtitle position: ${cs.position}` }, { status: 400 });
    }
    for (const k of ['fontsize', 'borderw', 'margin'] as const) {
      if (cs[k] !== undefined && typeof cs[k] !== 'number') {
        return NextResponse.json({ error: `${k} must be a number.` }, { status: 400 });
      }
    }
  }

  const project = JSON.parse(fs.readFileSync(pp, 'utf-8'));
  project.config = c;
  fs.writeFileSync(pp, JSON.stringify(project, null, 2), 'utf-8');
  return NextResponse.json({ ok: true });
}
