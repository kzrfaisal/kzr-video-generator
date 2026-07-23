/**
 * Non-interactive version of the `main.ts` pipeline, for driving from the web UI.
 *
 * Differences from `main.ts`:
 *   - no `waitForEnter` review pause (nothing can press ENTER on a server)
 *   - reports stage changes through an `onStage` callback
 *   - returns the paths of what it produced
 *
 * The web app spawns this file as a child process (`tsx src/runPipeline.ts "<topic>"`)
 * and reads the `@@…@@` markers below off stdout to track progress.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { run as generateScript } from './generateScript';
import { run as generateAudio } from './generateAudio';
import { run as makeVideo } from './makeVideo';
import { generateThumbnail } from './generateThumbnail';
import { parseContextFlag } from './utils';
import { config } from '../config';
import { publishDir, publishThumbnail } from './paths';

export type Stage = 'script' | 'thumbnail' | 'audio' | 'video' | 'done';

export interface PipelineResult {
  debateName: string;
  videoPath: string;
  thumbnailPath: string | null;
}

/** Newest final video for this debate, ignoring `_partN` reel files. */
function findMainVideo(debateName: string): string {
  const dir = publishDir(debateName);
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(`${debateName}_`) && f.endsWith('.mp4') && !/_part\d+_/.test(f))
    .sort();
  if (files.length === 0) throw new Error(`No final video found in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

export async function runPipeline(
  topic: string,
  context: string = '',
  onStage: (stage: Stage) => void = () => {},
): Promise<PipelineResult> {
  onStage('script');
  const { debateName } = await generateScript(topic, context);

  onStage('thumbnail');
  let thumbnailPath: string | null = null;
  if (config.generateThumbnail) {
    // Non-fatal, same as main.ts — a missing thumbnail shouldn't kill the run.
    try {
      generateThumbnail(debateName);
      thumbnailPath = publishThumbnail(debateName);
    } catch (err: any) {
      console.warn(`Thumbnail generation failed (non-fatal): ${err.message}`);
    }
  }

  onStage('audio');
  await generateAudio(debateName);

  onStage('video');
  makeVideo(debateName);

  const videoPath = findMainVideo(debateName);
  onStage('done');
  return { debateName, videoPath, thumbnailPath };
}

if (require.main === module) {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx src/runPipeline.ts "<topic>" [--context="<framing>"]');
    process.exit(1);
  }
  const context = parseContextFlag() ?? '';

  // Machine-readable markers the web app parses off stdout.
  runPipeline(topic, context, stage => console.log(`@@STAGE@@ ${stage}`))
    .then(result => {
      console.log(`@@DEBATE@@ ${result.debateName}`);
      if (result.thumbnailPath) console.log(`@@THUMB@@ ${result.thumbnailPath}`);
      console.log(`@@RESULT@@ ${result.videoPath}`);
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
