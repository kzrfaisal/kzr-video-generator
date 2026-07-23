/**
 * Non-interactive version of the `main.ts` pipeline, for driving from the web UI.
 *
 * Differences from `main.ts`:
 *   - no `waitForEnter` review pause (nothing can press ENTER on a server)
 *   - reports stage changes through an `onStage` callback
 *   - also builds the 3 reels (like `npm run all`)
 *   - returns the paths of what it produced
 *
 * The web app spawns this file as a child process (`tsx src/runPipeline.ts "<topic>"`)
 * and reads the `@@…@@` markers below off stdout to track progress.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { run as generateScript } from './generateScript';
import { run as generateAudio } from './generateAudio';
import { run as makeVideo } from './makeVideo';
import { generateThumbnail } from './generateThumbnail';
import { parseContextFlag } from './utils';
import { config } from '../config';
import { publishDir, publishThumbnail } from './paths';

export type Stage = 'script' | 'thumbnail' | 'audio' | 'video' | 'reels' | 'done';

export interface PipelineResult {
  debateName: string;
  videoPath: string;
  thumbnailPath: string | null;
  reelPaths: string[];
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

/** The newest reel video for each part (part1, part2, part3), in order. */
function findReels(debateName: string): string[] {
  const dir = publishDir(debateName);
  const newestByPart = new Map<string, string>();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort()) {
    const m = f.match(new RegExp(`^${debateName}_part(\\d+)_`));
    if (m) newestByPart.set(m[1], f); // sorted ascending → last write wins = newest
  }
  return [...newestByPart.keys()].sort().map(k => path.join(dir, newestByPart.get(k)!));
}

/**
 * Build the 3 reels in a separate process so it loads its own `style3` config
 * (portrait 9:16 + reel images), reusing the audio just generated. Non-fatal.
 */
function buildReels(debateName: string): string[] {
  const result = spawnSync(
    'npx',
    ['tsx', 'src/makeReels.ts', debateName, '--style=style3'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.warn(`Reels generation failed (non-fatal), exit code ${result.status}`);
    return [];
  }
  return findReels(debateName);
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

  onStage('reels');
  const reelPaths = buildReels(debateName);

  onStage('done');
  return { debateName, videoPath, thumbnailPath, reelPaths };
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
      for (const reel of result.reelPaths) console.log(`@@REEL@@ ${reel}`);
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
