import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { config } from '@/config';
import { ensureDir, wrapText } from '@/src/shared/utils';
import { publishDir, publishMetadata, publishThumbnail } from '@/src/shared/filesystem/paths';
import { readContentMode } from '@/src/features/projects/contentMode';
import { readVisualPlan } from './visualScenes';
import { readProjectDocument } from '@/src/infrastructure/storage/localProjectStore';

const THUMB_W = 1280;
const THUMB_H = 720;
// Hook auto-fit: keep the hook on ONE line, shrinking the font if it would overflow.
// Only wrap when even the minimum size wouldn't fit.
const HOOK_USABLE_W = 1180;  // canvas width minus side margins
const HOOK_CHAR_K = 0.8;     // approx glyph-width / fontsize for the thumbnail font (calibrated)
const HOOK_MIN_FONT = 38;    // don't shrink below this — wrap instead

function isInfographicProject(debateName: string): boolean {
  try {
    const project = readProjectDocument(debateName);
    return project.config?.visualMode === 'infographic';
  } catch {
    return false;
  }
}

/** Topic-photo thumbnail used by the single-narrator infographic workflow. */
function generateExplainerThumbnail(debateName: string, hook: string, fontfile: string): void {
  const scene = readVisualPlan(debateName)?.scenes.find(item => item.imagePath && fs.existsSync(item.imagePath));
  if (!scene?.imagePath) {
    throw new Error('Generate the infographic visual scenes before creating its thumbnail.');
  }

  const safeName = debateName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const hookLines = wrapText(hook.toUpperCase(), 18).slice(0, 3);
  const longest = Math.max(...hookLines.map(line => line.length));
  const hookSize = Math.min(64, Math.max(42, Math.floor(590 / (longest * 0.72))));
  const lineHeight = Math.round(hookSize * 1.22);
  const blockHeight = hookLines.length * lineHeight;
  const blockY = Math.round((THUMB_H - blockHeight) / 2) + 35;
  const tempFiles: string[] = [];
  const filters: string[] = [
    `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=increase`,
    `crop=${THUMB_W}:${THUMB_H}:x=(in_w-out_w)/2:y=(in_h-out_h)/2`,
    'eq=contrast=1.06:brightness=-0.04:saturation=1.08',
    'drawbox=x=0:y=0:w=720:h=720:color=0x020812@0.78:t=fill',
    'drawbox=x=720:y=0:w=560:h=720:color=0x020812@0.10:t=fill',
  ];

  hookLines.forEach((line, index) => {
    const file = path.resolve(`tmp/thumb_explainer_${safeName}_${index}.txt`);
    fs.writeFileSync(file, line, 'utf-8');
    tempFiles.push(file);
    filters.push([
      `drawtext=fontfile=${fontfile}`,
      `textfile=${file}`,
      'expansion=none',
      'fontcolor=white',
      `fontsize=${hookSize}`,
      'x=64',
      `y=${blockY + index * lineHeight}`,
      'shadowcolor=black@0.75',
      'shadowx=3',
      'shadowy=3',
    ].join(':'));
  });
  filters.push('drawbox=x=64:y=640:w=170:h=6:color=0x22d3ee@1:t=fill');

  ensureDir(publishDir(debateName));
  const outPath = publishThumbnail(debateName);
  const result = spawnSync('ffmpeg', [
    '-y', '-i', scene.imagePath, '-vf', filters.join(','),
    '-frames:v', '1', '-update', '1', outPath,
  ], { stdio: 'inherit' });
  tempFiles.forEach(file => { try { fs.unlinkSync(file); } catch {} });
  if (result.status !== 0) throw new Error(`ffmpeg failed for thumbnail: ${outPath}`);
  console.log(`Explainer thumbnail saved to ${outPath}`);
}

function readHookFromMetadata(debateName: string): string {
  try {
    const hook = readProjectDocument(debateName).metadata?.thumbnailHook.trim();
    if (hook) return hook.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 2).join('\n');
  } catch { /* fall back to the legacy markdown export below */ }

  const mdPath = publishMetadata(debateName);
  if (!fs.existsSync(mdPath)) {
    throw new Error(`Metadata file not found: ${mdPath}. Thumbnail needs the '## Thumbnail Hook' section.`);
  }
  const md = fs.readFileSync(mdPath, 'utf-8');
  // Capture everything between '## Thumbnail Hook' and the next '## ' heading (or EOF).
  // No /m flag: with it, `$` would match end-of-LINE and truncate a multi-line hook.
  const match = md.match(/(?:^|\n)##\s+Thumbnail Hook[ \t]*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!match) {
    throw new Error(`'## Thumbnail Hook' section missing from ${mdPath}.`);
  }
  // Preserve the author's line breaks (up to 2 non-empty lines) so a two-line hook
  // in the metadata is followed as written.
  const lines = match[1].trim().split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, 2);
  if (lines.length === 0) {
    throw new Error(`'## Thumbnail Hook' section is empty in ${mdPath}.`);
  }
  return lines.join('\n');
}

export function generateThumbnail(debateName: string): void {
  const hook = readHookFromMetadata(debateName);

  const tf = config.thumbnailFont;
  const fontfile = path.resolve(tf.font);
  if (!fs.existsSync(fontfile)) {
    throw new Error(`Thumbnail font not found: ${fontfile}`);
  }

  if (readContentMode(debateName) === 'narrated-explainer' && isInfographicProject(debateName)) {
    ensureDir('tmp');
    generateExplainerThumbnail(debateName, hook, fontfile);
    return;
  }

  const bg = config.thumbnailBackground;
  if (!fs.existsSync(bg)) {
    throw new Error(`Thumbnail background image not found: ${bg}`);
  }

  // ffmpeg filter values pass through two parsers (filtergraph + filter option),
  // so ':' inside text must be escaped as '\\:' to survive both layers.
  const escapeInline = (s: string) =>
    s.replace(/\\/g, '\\\\\\\\')
     .replace(/:/g, '\\\\:')
     .replace(/'/g, "\\\\'")
     .replace(/%/g, '\\\\%');
  const labelText = escapeInline(readContentMode(debateName) === 'narrated-explainer' ? 'EXPLAINER' : 'DEBATE');

  // Decide the lines to render and the font size:
  //  - multiple lines in the hook → follow them, sized to the WIDEST line;
  //  - single line → auto-fit (shrink; wrap only if it can't fit even at the minimum size).
  const baseSize = tf.hook.size;
  const givenLines = hook.split('\n');
  let hookSize: number;
  let hookLines: string[];
  if (givenLines.length > 1) {
    hookLines = givenLines;
    const longest = Math.max(...givenLines.map(l => l.length));
    const fit = Math.floor(HOOK_USABLE_W / (longest * HOOK_CHAR_K));
    hookSize = Math.min(baseSize, Math.max(HOOK_MIN_FONT, fit));
  } else {
    const fit = Math.floor(HOOK_USABLE_W / (hook.length * HOOK_CHAR_K));
    if (fit >= baseSize) { hookSize = baseSize; hookLines = [hook]; }
    else if (fit >= HOOK_MIN_FONT) { hookSize = fit; hookLines = [hook]; }
    else {
      hookSize = HOOK_MIN_FONT;
      const wrapChars = Math.max(8, Math.floor(HOOK_USABLE_W / (HOOK_MIN_FONT * HOOK_CHAR_K)));
      hookLines = wrapText(hook, wrapChars);
    }
  }

  // Fake "glow": stacked drawtext passes (widening borders + fading alpha), fill on top.
  const glowColor = '0xFFFFFF';
  const haloPasses = [{ w: 8, a: 0.10 }, { w: 4, a: 0.20 }];

  // Render each line as its OWN centered drawtext — one line per file, so there's no
  // newline-in-textfile artifact, and every line is individually centered. Lines stack and
  // stay vertically centered around tf.hook.y.
  ensureDir('tmp');
  const safeName = debateName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const N = hookLines.length;
  const lineHeight = Math.round(hookSize * 1.2);
  const hookFilters: string[] = [];
  hookLines.forEach((line, i) => {
    const lineFile = path.resolve(`tmp/thumb_hook_${safeName}_${i}.txt`);
    fs.writeFileSync(lineFile, line, 'utf-8');
    const yOff = Math.round((i - (N - 1) / 2) * lineHeight);
    const base = `fontfile=${fontfile}:textfile=${lineFile}:fontsize=${hookSize}:x=${tf.hook.x}:y=(${tf.hook.y})+(${yOff})`;
    for (const p of haloPasses) {
      hookFilters.push(`drawtext=${base}:fontcolor=${glowColor}@${p.a}:borderw=${p.w}:bordercolor=${glowColor}@${p.a}`);
    }
    hookFilters.push(`drawtext=${base}:fontcolor=${tf.hook.color}`);
  });

  const filter = [
    `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease`,
    `pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:black`,
    `drawtext=fontfile=${fontfile}:text=${labelText}:fontcolor=${tf.label.color}:fontsize=${tf.label.size}:x=${tf.label.x}:y=${tf.label.y}`,
    ...hookFilters,
  ].join(',');

  ensureDir(publishDir(debateName));
  const outPath = publishThumbnail(debateName);
  const args = ['-y', '-i', bg, '-vf', filter, '-frames:v', '1', '-update', '1', outPath];

  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for thumbnail: ${outPath}`);
  }
  console.log(`Thumbnail saved to ${outPath}`);
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: npm run thumbnail -- <debateName>');
    process.exit(1);
  }
  try {
    generateThumbnail(debateName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
