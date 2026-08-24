import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { runStage } from '@/src/infrastructure/process/runStage';
import { projectPath } from '@/src/shared/filesystem/paths';
import { findMainVideo, findReelVideos, hasAudio, hasThumbnail } from '@/src/features/rendering/videoFiles';
import { readProjectDocument, readProjectScriptText } from '@/src/infrastructure/storage/localProjectStore';
import { markStageCompleted, markStageRunning } from '@/src/infrastructure/storage/localPipelineStore';

export const runtime = 'nodejs';

function cleanStageError(output: string): string {
  return output
    .split(/\r?\n/)
    .filter(line => line.trim()
      && !line.startsWith('@@')
      && !line.includes('DeprecationWarning')
      && !line.startsWith('(Use `node --trace-deprecation'))
    .slice(-8)
    .join('\n');
}

// GET /api/debate — list local projects, newest first.
export async function GET() {
  const dir = 'output/debates';
  if (!fs.existsSync(dir)) return NextResponse.json({ projects: [] });

  const projects = fs.readdirSync(dir)
    .filter(file => /^debate\d+\.project\.json$/.test(file))
    .flatMap(file => {
      const debateName = file.replace('.project.json', '');
      try {
        const record = readProjectDocument(debateName);
        const updatedAt = fs.statSync(path.join(dir, file)).mtimeMs;
        return [{
          debateName,
          topic: record.title || debateName,
          updatedAt,
          contentMode: record.contentMode,
          scenesCount: record.scenes.length,
          thumbnailExists: hasThumbnail(debateName),
          audioExists: hasAudio(debateName),
          videoExists: findMainVideo(debateName) !== null,
          reelsCount: findReelVideos(debateName).length,
        }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ projects });
}

// POST /api/debate — generate a new debate script from a topic + context.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';
  const contentMode = body.contentMode ?? 'debate';
  const outputType = body.outputType ?? 'youtube';
  const videoLengthMinutes = Number(body.videoLengthMinutes ?? (outputType === 'short' ? 0.5 : 3));
  const extractReels = outputType === 'youtube' && body.extractReels !== false;
  if (!topic) {
    return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
  }
  if (!['debate', 'narrated-explainer'].includes(contentMode)) {
    return NextResponse.json({ error: 'Invalid content format.' }, { status: 400 });
  }
  if (!['youtube', 'short'].includes(outputType)) {
    return NextResponse.json({ error: 'Invalid video type.' }, { status: 400 });
  }
  if (!Number.isFinite(videoLengthMinutes) || videoLengthMinutes < 0.25 || videoLengthMinutes > 60) {
    return NextResponse.json({ error: 'Video length must be between 0.25 and 60 minutes.' }, { status: 400 });
  }

  const args = [
    'script',
    topic,
    `--content-mode=${contentMode}`,
    `--output-type=${outputType}`,
    `--video-length-minutes=${videoLengthMinutes}`,
    `--extract-reels=${extractReels}`,
  ];
  if (context) args.push(`--context=${context}`);
  const result = await runStage(args);

  const debateName = result.markers.DEBATE;
  if (!result.ok || !debateName) {
    return NextResponse.json(
      { error: 'Script generation failed.', detail: cleanStageError(result.output) },
      { status: 500 },
    );
  }

  const script = readProjectScriptText(debateName);
  const project = readProjectDocument(debateName);
  markStageRunning(debateName, 'script');
  markStageCompleted(debateName, 'script');
  return NextResponse.json({ debateName, topic, context, script, scenes: project.scenes });
}
