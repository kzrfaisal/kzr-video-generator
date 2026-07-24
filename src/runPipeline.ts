/**
 * Non-interactive pipeline for the web UI, runnable in three modes:
 *
 *   tsx src/runPipeline.ts full   "<topic>" [--context=…]   script → render (no pause)
 *   tsx src/runPipeline.ts script "<topic>" [--context=…]   script + metadata only
 *   tsx src/runPipeline.ts render <debateName>              thumbnail → audio → video → reels
 *
 * (No subcommand = `full`, so `tsx src/runPipeline.ts "<topic>"` still works.)
 *
 * The "script" then "render" split is what powers the review pause: the web app runs the
 * script phase, lets the user edit the draft, then runs the render phase on approval.
 *
 * The web app parses the `@@…@@` markers below off stdout to track progress.
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

export interface RenderResult {
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

/** Phase 1: generate the debate script (+ metadata). Returns the debate name. */
export async function runScriptPhase(
  topic: string,
  context: string = '',
  onStage: (stage: Stage) => void = () => {},
): Promise<string> {
  onStage('script');
  const { debateName } = await generateScript(topic, context);
  return debateName;
}

/** Phase 2: thumbnail → audio → video → reels for an already-generated script. */
export async function runRenderPhase(
  debateName: string,
  onStage: (stage: Stage) => void = () => {},
): Promise<RenderResult> {
  onStage('thumbnail');
  let thumbnailPath: string | null = null;
  if (config.generateThumbnail) {
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
  return { videoPath, thumbnailPath, reelPaths };
}

/** Full run: script then render, no pause. */
export async function runPipeline(
  topic: string,
  context: string = '',
  onStage: (stage: Stage) => void = () => {},
): Promise<RenderResult & { debateName: string }> {
  const debateName = await runScriptPhase(topic, context, onStage);
  const render = await runRenderPhase(debateName, onStage);
  return { debateName, ...render };
}

function printRender(r: RenderResult) {
  if (r.thumbnailPath) console.log(`@@THUMB@@ ${r.thumbnailPath}`);
  console.log(`@@RESULT@@ ${r.videoPath}`);
  for (const reel of r.reelPaths) console.log(`@@REEL@@ ${reel}`);
}

if (require.main === module) {
  const emit = (stage: Stage) => console.log(`@@STAGE@@ ${stage}`);
  const [sub] = process.argv.slice(2);

  if (sub === 'script') {
    const topic = process.argv[3];
    if (!topic) { console.error('Usage: tsx src/runPipeline.ts script "<topic>" [--context=…]'); process.exit(1); }
    const context = parseContextFlag() ?? '';
    runScriptPhase(topic, context, emit)
      .then(debateName => console.log(`@@DEBATE@@ ${debateName}`))
      .catch(err => { console.error(err.message); process.exit(1); });

  } else if (sub === 'render') {
    const debateName = process.argv[3];
    if (!debateName) { console.error('Usage: tsx src/runPipeline.ts render <debateName>'); process.exit(1); }
    runRenderPhase(debateName, emit)
      .then(printRender)
      .catch(err => { console.error(err.message); process.exit(1); });

  } else {
    // Full run: first arg is the topic (backwards compatible).
    const topic = sub;
    if (!topic) { console.error('Usage: tsx src/runPipeline.ts "<topic>" [--context=…]'); process.exit(1); }
    const context = parseContextFlag() ?? '';
    runPipeline(topic, context, emit)
      .then(r => { console.log(`@@DEBATE@@ ${r.debateName}`); printRender(r); })
      .catch(err => { console.error(err.message); process.exit(1); });
  }
}
