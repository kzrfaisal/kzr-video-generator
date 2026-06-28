import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { config } from '../config';

const THUMB_W = 1280;
const THUMB_H = 720;

function readHookFromMetadata(debateName: string): string {
  const mdPath = `output/debates/${debateName}.metadata.md`;
  if (!fs.existsSync(mdPath)) {
    throw new Error(`Metadata file not found: ${mdPath}. Thumbnail needs the '## Thumbnail Hook' section.`);
  }
  const md = fs.readFileSync(mdPath, 'utf-8');
  // Capture everything between '## Thumbnail Hook' and the next '## ' heading (or EOF).
  const match = md.match(/^##\s+Thumbnail Hook\s*\n([\s\S]*?)(?=\n##\s|$)/m);
  if (!match) {
    throw new Error(`'## Thumbnail Hook' section missing from ${mdPath}.`);
  }
  const hook = match[1].trim().split('\n')[0].trim();
  if (!hook) {
    throw new Error(`'## Thumbnail Hook' section is empty in ${mdPath}.`);
  }
  return hook;
}

export function generateThumbnail(debateName: string): void {
  const hook = readHookFromMetadata(debateName);

  const bg = config.thumbnailBackground;
  if (!fs.existsSync(bg)) {
    throw new Error(`Thumbnail background image not found: ${bg}`);
  }

  const tf = config.thumbnailFont;
  const fontfile = path.resolve(tf.font);
  if (!fs.existsSync(fontfile)) {
    throw new Error(`Thumbnail font not found: ${fontfile}`);
  }
  // ffmpeg filter values pass through two parsers (filtergraph + filter option),
  // so ':' inside text must be escaped as '\\:' to survive both layers.
  const escapeInline = (s: string) =>
    s.replace(/\\/g, '\\\\\\\\')
     .replace(/:/g, '\\\\:')
     .replace(/'/g, "\\\\'")
     .replace(/%/g, '\\\\%');
  const labelText = escapeInline('DEBATE');
  const hookText  = escapeInline(hook);

  // Fake "glow" on the hook: stack drawtext passes with widening borders + fading alpha,
  // then draw the solid fill on top. ffmpeg has no real blur, so this halo is the closest approximation.
  // Tune `glowColor` and the {w, a} list to adjust intensity / spread / hue.
  const glowColor = '0xFFFFFF'; // white
  const haloPasses = [
    { w: 8, a: 0.10 },
    { w: 4, a: 0.20 },
  ];
  const hookBase = `fontfile=${fontfile}:text=${hookText}:fontsize=${tf.hook.size}:x=${tf.hook.x}:y=${tf.hook.y}`;
  const hookGlow = haloPasses.map(p =>
    `drawtext=${hookBase}:fontcolor=${glowColor}@${p.a}:borderw=${p.w}:bordercolor=${glowColor}@${p.a}`
  );

  const filter = [
    `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease`,
    `pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:black`,
    `drawtext=fontfile=${fontfile}:text=${labelText}:fontcolor=${tf.label.color}:fontsize=${tf.label.size}:x=${tf.label.x}:y=${tf.label.y}`,
    ...hookGlow,
    `drawtext=${hookBase}:fontcolor=${tf.hook.color}`,
  ].join(',');

  const outPath = `output/debates/${debateName}.thumbnail.jpg`;
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
    console.error('Usage: tsx src/generateThumbnail.ts <debateName>   e.g. tsx src/generateThumbnail.ts debate17');
    process.exit(1);
  }
  try {
    generateThumbnail(debateName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
