import { NextResponse } from 'next/server';
import fs from 'fs';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { projectPath } from '@/src/shared/filesystem/paths';
import { STYLES, VIDEO_STYLES } from '@/config';
import { isValidVoice } from '@/src/shared/voices';
import { readProjectDocument, saveProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import type { PipelineStage } from '@/src/domain/pipeline/types';
import { invalidateProjectStages } from '@/src/infrastructure/storage/localPipelineStore';
import { invalidateAudioManifest } from '@/src/features/rendering/videoFiles';

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
  if (c.visualPacing && !['relaxed', 'balanced', 'detailed'].includes(c.visualPacing)) {
    return NextResponse.json({ error: `Invalid visual pacing: ${c.visualPacing}` }, { status: 400 });
  }
  if (c.contentMode && !['debate', 'narrated-explainer'].includes(c.contentMode)) {
    return NextResponse.json({ error: `Invalid content mode: ${c.contentMode}` }, { status: 400 });
  }
  if (c.outputType && !['youtube', 'short'].includes(c.outputType)) {
    return NextResponse.json({ error: `Invalid output type: ${c.outputType}` }, { status: 400 });
  }
  if (c.videoLengthMinutes !== undefined && (
    typeof c.videoLengthMinutes !== 'number'
    || !Number.isFinite(c.videoLengthMinutes)
    || c.videoLengthMinutes < 0.25
    || c.videoLengthMinutes > 60
  )) {
    return NextResponse.json({ error: 'Video length must be between 0.25 and 60 minutes.' }, { status: 400 });
  }
  if (c.extractReels !== undefined && typeof c.extractReels !== 'boolean') {
    return NextResponse.json({ error: 'Extract reels must be true or false.' }, { status: 400 });
  }
  if (c.subtitlesEnabled !== undefined && typeof c.subtitlesEnabled !== 'boolean') {
    return NextResponse.json({ error: 'Subtitles enabled must be true or false.' }, { status: 400 });
  }
  if (c.sceneTitlesEnabled !== undefined && typeof c.sceneTitlesEnabled !== 'boolean') {
    return NextResponse.json({ error: 'Scene titles enabled must be true or false.' }, { status: 400 });
  }
  if (c.sceneTitleMode !== undefined && !['intro', 'persistent', 'hidden'].includes(c.sceneTitleMode)) {
    return NextResponse.json({ error: `Invalid scene title mode: ${c.sceneTitleMode}` }, { status: 400 });
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

  const project = readProjectDocument(name);
  const changed = (key: string) => JSON.stringify(project.config[key]) !== JSON.stringify(c[key]);
  const invalidated = new Set<PipelineStage>();
  if (c.contentMode !== undefined && changed('contentMode')) {
    ['script', 'metadata', 'visuals', 'thumbnail', 'audio', 'video', 'reel-scripts', 'reels', 'publishing']
      .forEach(stage => invalidated.add(stage as PipelineStage));
  }
  if (['outputType', 'videoLengthMinutes'].some(key => c[key] !== undefined && changed(key))) {
    ['script', 'metadata', 'visuals', 'thumbnail', 'audio', 'video', 'reel-scripts', 'reels', 'publishing']
      .forEach(stage => invalidated.add(stage as PipelineStage));
  }
  if (c.extractReels !== undefined && changed('extractReels')) {
    ['reel-scripts', 'reels', 'publishing'].forEach(stage => invalidated.add(stage as PipelineStage));
  }
  if (c.visualMode !== undefined && changed('visualMode')) {
    ['visuals', 'thumbnail', 'video', 'reels', 'publishing']
      .forEach(stage => invalidated.add(stage as PipelineStage));
  }
  if (c.visualPacing !== undefined && changed('visualPacing')) {
    ['visuals', 'thumbnail', 'video', 'reels', 'publishing']
      .forEach(stage => invalidated.add(stage as PipelineStage));
  }
  if (['voices', 'ttsModel', 'ttsSpeed'].some(key => c[key] !== undefined && changed(key))) {
    ['audio', 'video', 'reels', 'publishing'].forEach(stage => invalidated.add(stage as PipelineStage));
  }
  if (['subtitlesEnabled', 'sceneTitlesEnabled', 'sceneTitleMode', 'subtitleStyle', 'videoStyle', 'customSubtitle'].some(key => c[key] !== undefined && changed(key))) {
    ['video', 'reels', 'publishing'].forEach(stage => invalidated.add(stage as PipelineStage));
  }
  const generation = project.config.generation;
  project.config = { ...project.config, ...c };
  if (generation !== undefined) project.config.generation = generation;
  if (c.contentMode) project.contentMode = c.contentMode;
  saveProjectDocument(project);
  if (invalidated.has('audio')) invalidateAudioManifest(name);
  if (invalidated.size > 0) {
    invalidateProjectStages(name, [...invalidated], 'Rendering configuration changed.');
  }
  return NextResponse.json({ ok: true });
}
