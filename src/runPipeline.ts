/**
 * Non-interactive, per-stage pipeline for the web UI. Each subcommand is one step the UI
 * drives with its own button; the app parses the `@@…@@` markers off stdout.
 *
 *   tsx src/runPipeline.ts script "<topic>" [--context=…]   generate script (+ project record)
 *   tsx src/runPipeline.ts metadata <debateName>            generate metadata
 *   tsx src/runPipeline.ts video <debateName>               thumbnail → audio → main video
 *   tsx src/runPipeline.ts extract-reels <debateName>       split into 3 editable reel scripts
 *   tsx src/runPipeline.ts reels-build <debateName>         build the 3 reel videos (needs --style=style3)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { run as generateScript } from './generateScript';
import { generateMetadata } from './generateMetadata';
import { run as generateAudio } from './generateAudio';
import { run as makeVideo } from './makeVideo';
import { generateThumbnail } from './generateThumbnail';
import { extract } from './extractReelScripts';
import { buildReelsFromParts } from './makeReels';
import { parseContextFlag } from './utils';
import { config, configureRun } from '../config';
import { publishDir, publishThumbnail, scriptPath, projectPath, reelsPartsPath } from './paths';

export type Stage = 'script' | 'thumbnail' | 'audio' | 'video' | 'reels' | 'done';

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

/** Script step: generate the debate script only, and save the project record. */
export async function runScriptPhase(
  topic: string,
  context: string = '',
  onStage: (stage: Stage) => void = () => {},
): Promise<string> {
  onStage('script');
  config.generateMetadata = false; // metadata is a separate step
  const { debateName } = await generateScript(topic, context);
  fs.writeFileSync(projectPath(debateName), JSON.stringify({ topic, context }, null, 2), 'utf-8');
  return debateName;
}

/** Metadata step: (re)generate metadata from the saved project + current script. */
export async function runMetadataPhase(debateName: string): Promise<void> {
  const project = JSON.parse(fs.readFileSync(projectPath(debateName), 'utf-8'));
  const scriptContent = fs.readFileSync(scriptPath(debateName), 'utf-8');
  await generateMetadata(project.topic, project.context ?? '', scriptContent, debateName);
}

/** Video step: thumbnail → audio → main (landscape) video. No reels. */
export async function runVideoPhase(
  debateName: string,
  onStage: (stage: Stage) => void = () => {},
): Promise<{ videoPath: string; thumbnailPath: string | null }> {
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

  onStage('done');
  return { videoPath, thumbnailPath };
}

if (require.main === module) {
  const emit = (stage: Stage) => console.log(`@@STAGE@@ ${stage}`);
  const [sub] = process.argv.slice(2);

  const fail = (msg: string) => { console.error(msg); process.exit(1); };
  const die = (err: any) => { console.error(err.message); process.exit(1); };

  if (sub === 'script') {
    const topic = process.argv[3];
    if (!topic) fail('Usage: tsx src/runPipeline.ts script "<topic>" [--context=…]');
    const context = parseContextFlag() ?? '';
    runScriptPhase(topic, context, emit)
      .then(debateName => console.log(`@@DEBATE@@ ${debateName}`))
      .catch(die);

  } else if (sub === 'metadata') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/runPipeline.ts metadata <debateName>');
    runMetadataPhase(debateName).then(() => console.log('@@METADATA_DONE@@')).catch(die);

  } else if (sub === 'video') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/runPipeline.ts video <debateName>');
    // Apply any per-run config (voices, TTS, subtitle/video style) saved for this debate.
    try {
      const project = JSON.parse(fs.readFileSync(projectPath(debateName), 'utf-8'));
      if (project.config) configureRun(project.config);
    } catch (err: any) {
      console.warn(`Could not apply saved config: ${err.message}`);
    }
    runVideoPhase(debateName, emit)
      .then(({ videoPath, thumbnailPath }) => {
        if (thumbnailPath) console.log(`@@THUMB@@ ${thumbnailPath}`);
        console.log(`@@RESULT@@ ${videoPath}`);
      })
      .catch(die);

  } else if (sub === 'extract-reels') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/runPipeline.ts extract-reels <debateName>');
    try {
      const parts = extract(debateName);
      fs.writeFileSync(reelsPartsPath(debateName), JSON.stringify(parts, null, 2), 'utf-8');
      console.log('@@EXTRACT_DONE@@');
    } catch (err) { die(err); }

  } else if (sub === 'reels-build') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/runPipeline.ts reels-build <debateName> --style=style3');
    const parts = JSON.parse(fs.readFileSync(reelsPartsPath(debateName), 'utf-8'));
    emit('reels');
    buildReelsFromParts(debateName, parts)
      .then(() => {
        for (const reel of findReels(debateName)) console.log(`@@REEL@@ ${reel}`);
        emit('done');
      })
      .catch(die);

  } else {
    fail('Usage: tsx src/runPipeline.ts <script|metadata|video|extract-reels|reels-build> …');
  }
}
