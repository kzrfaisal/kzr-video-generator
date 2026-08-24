import fs from 'fs';
import path from 'path';
import { ensureDir, parseDebateFile, waitForEnter } from '@/src/shared/utils';
import { extract, ExtractedPart } from './extractReelScripts';
import { run as makeVideo } from '@/src/features/rendering/makeVideo';
import { ensureOutroAudio } from './reelOutro';
import { buildRenderCaptions, type RenderCaption } from '@/src/domain/projects/captions';

function copyPartAudio(
  srcDir: string,
  srcFiles: string[],
  sourceCaptions: RenderCaption[],
  part: ExtractedPart,
  outroMp3: string,
): string {
  const destDir = `output/audios/reels/${part.name}`;
  ensureDir(destDir);

  // Clear any prior copy so an old run with more lines doesn't bleed into a shorter new run.
  for (const f of fs.readdirSync(destDir)) {
    if (f.endsWith('.mp3')) fs.unlinkSync(path.join(destDir, f));
  }

  const sourceLineIndices = new Set(part.origLineIndices);
  const selectedCaptionIndices = sourceCaptions
    .map((caption, index) => ({ caption, index }))
    .filter(({ caption }) => sourceLineIndices.has(caption.sourceLineIndex));
  selectedCaptionIndices.forEach(({ index: sourceAudioIndex }, newIdx) => {
    const srcFile = srcFiles[sourceAudioIndex];
    if (!srcFile) {
      throw new Error(
        `Missing source audio segment ${sourceAudioIndex + 1} of ${part.name}. ` +
        `Only ${srcFiles.length} source files were found.`
      );
    }
    const speaker = srcFile.split('_')[1].split('.')[0];
    const destFile = `${String(newIdx + 1).padStart(3, '0')}_${speaker}.mp3`;
    fs.copyFileSync(path.join(srcDir, srcFile), path.join(destDir, destFile));
  });

  // Append the cached HOST outro as the next-numbered file so it pairs with the
  // extra `HOST|<outro>` line appended by extractReelScripts.
  const outroIdx = selectedCaptionIndices.length + 1;
  const outroDest = path.join(destDir, `${String(outroIdx).padStart(3, '0')}_HOST.mp3`);
  fs.copyFileSync(outroMp3, outroDest);

  return destDir;
}

/**
 * Build the reel videos from already-extracted parts, reusing the debate's audio.
 * Split out from `run` so the web UI can extract + let the user edit the part scripts
 * before building. `parts` carries each part's original line indices (audio mapping).
 */
export async function buildReelsFromParts(debateName: string, parts: ExtractedPart[]): Promise<void> {
  const srcAudioDir = `output/audios/${debateName}`;
  if (!fs.existsSync(srcAudioDir)) {
    throw new Error(
      `Source audio directory not found: ${srcAudioDir}. ` +
      `Generate the YouTube video first so the reels can reuse its audio.`
    );
  }
  const srcFiles = fs.readdirSync(srcAudioDir).filter(f => f.endsWith('.mp3')).sort();
  if (srcFiles.length === 0) {
    throw new Error(`No audio files in ${srcAudioDir}.`);
  }
  const sourceCaptions = buildRenderCaptions(parseDebateFile(`output/debates/${debateName}.txt`));

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const outroMp3 = await ensureOutroAudio(i as 0 | 1 | 2, part.contentMode ?? 'debate');
    console.log(`\nCopying audio for ${part.name} (${part.origLineIndices.length} lines + outro)...`);
    copyPartAudio(srcAudioDir, srcFiles, sourceCaptions, part, outroMp3);

    console.log(`\nBuilding video for ${part.name}...`);
    makeVideo(`reels/${part.name}`);
  }
}

export async function run(debateName: string): Promise<void> {
  console.log(`Extracting reel scripts from ${debateName}...`);
  const parts = extract(debateName);

  await waitForEnter(
    `\nReview the reel scripts before continuing:\n` +
    parts.map(p => `  ${p.filePath}`).join('\n') +
    `\n\nPress ENTER when ready to build the reel videos...`
  );

  await buildReelsFromParts(debateName, parts);
  console.log('\nAll reel videos generated.');
}

if (require.main === module) {
  // Pick the first positional arg, skipping --flag=... and any value after a bare --style.
  const args = process.argv.slice(2);
  let debateName: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--style') { i++; continue; }
    if (a.startsWith('--')) continue;
    debateName = a;
    break;
  }
  if (!debateName) {
    console.error('Usage: npm run reels -- <debate_name>');
    process.exit(1);
  }
  run(debateName).catch(err => { console.error(err.message); process.exit(1); });
}
