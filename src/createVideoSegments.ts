import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, wrapText, parseDebateFile } from './utils';
import { config, STYLES, SubtitleStyle } from '../config';

function lineY(lineIndex: number, lineCount: number, style: SubtitleStyle): string {
  const lh = style.lineHeight ?? config.subtitleLineHeight;
  if (style.position === 'top') {
    return String(style.margin + lineIndex * lh);
  }
  if (style.position === 'center') {
    return `(h-${lineCount * lh})/2+${lineIndex * lh}`;
  }
  return `h-${style.margin + (lineCount - lineIndex) * lh}`;
}

function resolveStyleAndImage(speaker: string): { styleName: string; image: string } {
  return {
    styleName: config.subtitleStyle[speaker] ?? config.subtitleStyle.A,
    image:     config.images[speaker]        ?? config.images.A,
  };
}

function buildDrawtextFilter(filePath: string, lineIndex: number, lineCount: number, style: SubtitleStyle): string {
  const opts: string[] = [
    `fontfile=${path.resolve(style.font ?? config.font)}`,
    `textfile=${filePath}`,
    `fontcolor=${style.fontcolor}`,
    `fontsize=${style.fontsize}`,
    `x=(w-text_w)/2`,
    `y=${lineY(lineIndex, lineCount, style)}`,
  ];
  if (style.bordercolor !== undefined) opts.push(`bordercolor=${style.bordercolor}`);
  if (style.borderw    !== undefined) opts.push(`borderw=${style.borderw}`);
  if (style.shadowcolor !== undefined) opts.push(`shadowcolor=${style.shadowcolor}`);
  if (style.shadowx    !== undefined) opts.push(`shadowx=${style.shadowx}`);
  if (style.shadowy    !== undefined) opts.push(`shadowy=${style.shadowy}`);
  if (style.box        !== undefined) opts.push(`box=${style.box}`);
  if (style.boxcolor   !== undefined) opts.push(`boxcolor=${style.boxcolor}`);
  if (style.boxborderw !== undefined) opts.push(`boxborderw=${style.boxborderw}`);
  return `drawtext=${opts.join(':')}`;
}

function createSegment(image: string, audio: string, text: string, outputPath: string, styleName: string): void {
  const style = STYLES[styleName] ?? STYLES['youtube-classic'];
  const wrapped = wrapText(text, style.wrapWidth ?? config.subtitleWrapWidth);

  const textFiles = wrapped.map((line, i) => {
    const filePath = path.resolve(outputPath.replace('.mp4', `_line${i}.txt`));
    fs.writeFileSync(filePath, line, 'utf-8');
    return filePath;
  });

  const allFilters: string[] = [
    config.isReelStyle ? 'scale=1080:1920' : 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
  ];

  // Lower-third bar sits behind the text
  if (style.lowerThirdBar) {
    const { color, padding } = style.lowerThirdBar;
    const lh = style.lineHeight ?? config.subtitleLineHeight;
    const barHeight = wrapped.length * lh + padding * 2;
    const barY = `ih-${style.margin + wrapped.length * lh + padding}`;
    allFilters.push(`drawbox=x=0:y=${barY}:w=iw:h=${barHeight}:color=${color}:t=fill`);
  }

  textFiles.forEach((filePath, i) => {
    allFilters.push(buildDrawtextFilter(filePath, i, wrapped.length, style));
  });

  const args = [
    '-y',
    '-loop', '1', '-i', image,
    '-i', audio,
    '-vf', allFilters.join(','),
    '-af', `apad=pad_dur=${config.audioPadding}`,
    '-shortest',
    '-r', String(config.fps),
    '-c:v', 'libx264',
    '-crf', String(config.videoCrf),
    '-preset', config.videoPreset,
    '-pix_fmt', 'yuv420p',
    outputPath,
  ];

  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  textFiles.forEach((f: string) => { try { fs.unlinkSync(f); } catch {} });
  if (result.status !== 0) throw new Error(`ffmpeg failed for segment: ${outputPath}`);
}

export function run(debateName: string): void {
  const audioDir = `output/audios/${debateName}`;
  const segmentsDir = `tmp/video_segments/${debateName}`;

  ensureDir('tmp');
  ensureDir('tmp/video_segments');
  ensureDir(segmentsDir);

  if (!fs.existsSync(audioDir)) {
    throw new Error(`Audio directory does not exist: ${audioDir}`);
  }

  const files = fs.readdirSync(audioDir).filter((f: string) => f.endsWith('.mp3')).sort();
  if (files.length === 0) throw new Error(`No audio files found in ${audioDir}`);

  const lines = parseDebateFile(`output/debates/${debateName}.txt`);

  files.forEach((file: string, idx: number) => {
    const speaker = file.split('_')[1].split('.')[0];
    const { styleName, image } = resolveStyleAndImage(speaker);
    const audioPath = path.join(audioDir, file);
    const segmentPath = path.join(segmentsDir, `segment_${String(idx).padStart(3, '0')}_${speaker}.mp4`);
    const text = lines[idx].text;

    console.log(`Creating segment for ${file}`);
    createSegment(image, audioPath, text, segmentPath, styleName);
  });
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: tsx src/createVideoSegments.ts <debate_name>');
    process.exit(1);
  }
  try {
    run(debateName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
