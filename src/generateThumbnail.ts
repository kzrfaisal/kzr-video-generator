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

  const fontfile = path.resolve(config.font);
  // ffmpeg filter values pass through two parsers (filtergraph + filter option),
  // so ':' inside text must be escaped as '\\:' to survive both layers.
  const escapeInline = (s: string) =>
    s.replace(/\\/g, '\\\\\\\\')
     .replace(/:/g, '\\\\:')
     .replace(/'/g, "\\\\'")
     .replace(/%/g, '\\\\%');
  const labelText = escapeInline('DEBATE');
  const hookText  = escapeInline(hook);

  const filter = [
    `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease`,
    `pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:black`,
    `drawtext=fontfile=${fontfile}:text=${labelText}:fontcolor=yellow:fontsize=60:borderw=4:bordercolor=black:x=80:y=60`,
    `drawtext=fontfile=${fontfile}:text=${hookText}:fontcolor=white:fontsize=80:borderw=6:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-80`,
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
