/**
 * Non-interactive, per-stage pipeline for the web UI. Each subcommand is one step the UI
 * drives with its own button; the app parses the `@@…@@` markers off stdout.
 *
 *   tsx src/features/pipeline/runPipeline.ts script "<topic>" [--context=…]
 *   tsx src/features/pipeline/runPipeline.ts metadata <debateName>
 *   tsx src/features/pipeline/runPipeline.ts video <debateName>
 *   tsx src/features/pipeline/runPipeline.ts extract-reels <debateName>
 *   tsx src/features/pipeline/runPipeline.ts reels-build <debateName>
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { run as generateScript, type ScriptPreferences } from '@/src/features/scripts/generateScript';
import { generateMetadata } from '@/src/features/scripts/generateMetadata';
import { audioIsCurrent, run as generateAudio } from '@/src/features/rendering/generateAudio';
import { run as makeVideo } from '@/src/features/rendering/makeVideo';
import { generateThumbnail } from '@/src/features/visuals/generateThumbnail';
import { extract } from '@/src/features/reels/extractReelScripts';
import { buildReelsFromParts } from '@/src/features/reels/makeReels';
import { parseContextFlag } from '@/src/shared/utils';
import { config, configureRun } from '@/config';
import { publishDir, publishThumbnail, reelsPartsPath } from '@/src/shared/filesystem/paths';
import { publishAll, type PublishTarget } from '@/src/features/publishing/publishAll';
import { generateVisualScenes } from '@/src/features/visuals/visualScenes';
import { normalizeContentMode, type ContentMode } from '@/src/features/projects/contentMode';
import { readProjectDocument, readProjectScriptText } from '@/src/infrastructure/storage/localProjectStore';

export type Stage = 'script' | 'thumbnail' | 'visuals' | 'audio' | 'video' | 'reels' | 'publishing' | 'done';

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
  contentMode: ContentMode = 'debate',
  onStage: (stage: Stage) => void = () => {},
  preferences: ScriptPreferences = {},
): Promise<string> {
  onStage('script');
  config.generateMetadata = false; // metadata is a separate step
  configureRun(preferences);
  const { debateName } = await generateScript(topic, context, contentMode, preferences);
  return debateName;
}

/** Metadata step: (re)generate metadata from the saved project + current script. */
export async function runMetadataPhase(debateName: string): Promise<void> {
  const project = readProjectDocument(debateName);
  const scriptContent = readProjectScriptText(debateName);
  await generateMetadata(
    project.title,
    project.context,
    scriptContent,
    debateName,
    project.contentMode,
  );
}

/** Apply this debate's saved per-run config (voices, TTS, subtitle/video style). */
function applySavedConfig(debateName: string) {
  try {
    const project = readProjectDocument(debateName);
    if (project.config) configureRun(project.config);
  } catch (err: any) {
    console.warn(`Could not apply saved config: ${err.message}`);
  }
}

/** Reels keep the portrait preset while inheriting project-level visual display choices. */
function applySavedReelVisualMode(debateName: string) {
  try {
    const project = readProjectDocument(debateName);
    const visualMode = project.config?.visualMode;
    if (visualMode === 'debate' || visualMode === 'infographic') config.visualMode = visualMode;
    const sceneTitleMode = project.config?.sceneTitleMode;
    if (sceneTitleMode === 'intro' || sceneTitleMode === 'persistent' || sceneTitleMode === 'hidden') {
      config.sceneTitleMode = sceneTitleMode;
      config.sceneTitlesEnabled = sceneTitleMode !== 'hidden';
    } else if (typeof project.config?.sceneTitlesEnabled === 'boolean') {
      config.sceneTitlesEnabled = project.config.sceneTitlesEnabled;
      config.sceneTitleMode = project.config.sceneTitlesEnabled ? 'persistent' : 'hidden';
    }
  } catch (err: any) {
    console.warn(`Could not apply saved reel visual mode: ${err.message}`);
  }
}

/** Thumbnail only — renders the JPG from the metadata hook. */
export async function runThumbnail(debateName: string): Promise<string> {
  applySavedConfig(debateName);
  generateThumbnail(debateName);
  return publishThumbnail(debateName);
}

/** Audio only — per-line TTS. Applies the saved voice / TTS config. */
export async function runAudio(
  debateName: string,
  onStage: (stage: Stage) => void = () => {},
): Promise<void> {
  applySavedConfig(debateName);
  onStage('audio');
  await generateAudio(debateName);
  onStage('done');
}

/** Video render only — builds the landscape video from existing audio. Applies subtitle/style config. */
export async function runVideoRender(
  debateName: string,
  onStage: (stage: Stage) => void = () => {},
): Promise<string> {
  applySavedConfig(debateName);
  if (!audioIsCurrent(debateName)) {
    throw new Error('Audio is missing or outdated. Generate audio before rendering the video.');
  }
  onStage('video');
  makeVideo(debateName);
  const videoPath = findMainVideo(debateName);
  onStage('done');
  return videoPath;
}

if (require.main === module) {
  const emit = (stage: Stage) => console.log(`@@STAGE@@ ${stage}`);
  const [sub] = process.argv.slice(2);

  const fail = (msg: string) => { console.error(msg); process.exit(1); };
  const die = (err: any) => { console.error(err.message); process.exit(1); };

  if (sub === 'script') {
    const topic = process.argv[3];
    if (!topic) fail('Usage: tsx src/features/pipeline/runPipeline.ts script "<topic>" [--context=…]');
    const context = parseContextFlag() ?? '';
    const contentModeArg = process.argv.find(arg => arg.startsWith('--content-mode='))?.split('=')[1];
    const contentMode = normalizeContentMode(contentModeArg);
    const outputTypeArg = process.argv.find(arg => arg.startsWith('--output-type='))?.split('=')[1];
    const outputType = outputTypeArg === 'short' ? 'short' : 'youtube';
    const lengthArg = process.argv.find(arg => arg.startsWith('--video-length-minutes='))?.split('=')[1];
    const videoLengthMinutes = lengthArg ? Number(lengthArg) : outputType === 'short' ? 0.5 : 3;
    const extractReels = process.argv.some(arg => arg === '--extract-reels=true');
    runScriptPhase(topic, context, contentMode, emit, { outputType, videoLengthMinutes, extractReels })
      .then(debateName => console.log(`@@DEBATE@@ ${debateName}`))
      .catch(die);

  } else if (sub === 'metadata') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/features/pipeline/runPipeline.ts metadata <debateName>');
    runMetadataPhase(debateName).then(() => console.log('@@METADATA_DONE@@')).catch(die);

  } else if (sub === 'thumbnail') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/features/pipeline/runPipeline.ts thumbnail <debateName>');
    runThumbnail(debateName).then(p => console.log(`@@THUMB@@ ${p}`)).catch(die);

  } else if (sub === 'audio') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/features/pipeline/runPipeline.ts audio <debateName>');
    runAudio(debateName, emit).catch(die);

  } else if (sub === 'visuals') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/features/pipeline/runPipeline.ts visuals <debateName>');
    emit('visuals');
    generateVisualScenes(debateName)
      .then(plan => {
        console.log(`@@VISUALS@@ ${plan.scenes.filter(scene => scene.imagePath).length}/${plan.scenes.length}`);
        emit('done');
      })
      .catch(die);

  } else if (sub === 'video') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/features/pipeline/runPipeline.ts video <debateName>');
    runVideoRender(debateName, emit).then(v => console.log(`@@RESULT@@ ${v}`)).catch(die);

  } else if (sub === 'extract-reels') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/features/pipeline/runPipeline.ts extract-reels <debateName>');
    try {
      const parts = extract(debateName);
      fs.writeFileSync(reelsPartsPath(debateName), JSON.stringify(parts, null, 2), 'utf-8');
      console.log('@@EXTRACT_DONE@@');
    } catch (err) { die(err); }

  } else if (sub === 'reels-build') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/features/pipeline/runPipeline.ts reels-build <debateName> --style=style3');
    const parts = JSON.parse(fs.readFileSync(reelsPartsPath(debateName), 'utf-8'));
    applySavedReelVisualMode(debateName);
    emit('reels');
    buildReelsFromParts(debateName, parts)
      .then(() => {
        for (const reel of findReels(debateName)) console.log(`@@REEL@@ ${reel}`);
        emit('done');
      })
      .catch(die);

  } else if (sub === 'publish') {
    const debateName = process.argv[3];
    if (!debateName) fail('Usage: tsx src/features/pipeline/runPipeline.ts publish <debateName>');
    const targetArg = process.argv.find(arg => arg.startsWith('--target='));
    const target = (targetArg?.slice('--target='.length) || 'all') as PublishTarget;
    if (!['youtube', 'instagram', 'all'].includes(target)) fail('Publish target must be youtube, instagram, or all.');
    emit('publishing');
    publishAll(debateName, target)
      .then(record => {
        console.log(`@@PUBLISH@@ ${JSON.stringify(record)}`);
        emit('done');
      })
      .catch(die);

  } else {
    fail('Usage: tsx src/features/pipeline/runPipeline.ts <script|metadata|thumbnail|visuals|audio|video|extract-reels|reels-build|publish> …');
  }
}
