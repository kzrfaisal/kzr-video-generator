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

function buildDrawtextFilter(filePath: string, lineIndex: number, lineCount: number, style: SubtitleStyle, startPadSec: number): string {
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
  // Hide subtitle during the leading silence so it appears in sync with speech,
  // not 1s early during the crossfade window. Escape the comma in gte(t,...)
  // so ffmpeg doesn't interpret it as a filter-chain separator.
  if (startPadSec > 0) opts.push(`enable=gte(t\\,${startPadSec})`);
  return `drawtext=${opts.join(':')}`;
}

function buildAudioFilter(startPadSec: number, endPadSec: number): string {
  const filters: string[] = [];
  if (startPadSec > 0) {
    const ms = Math.round(startPadSec * 1000);
    filters.push(`adelay=delays=${ms}:all=1`);
  }
  filters.push(`apad=pad_dur=${endPadSec}`);
  return filters.join(',');
}

function createSegment(
  image: string,
  audio: string,
  text: string,
  outputPath: string,
  styleName: string,
  startPadSec: number,
  endPadSec: number,
): void {
  const style = STYLES[styleName] ?? STYLES['youtube-classic'];
  const wrapped = wrapText(text, style.wrapWidth ?? config.subtitleWrapWidth);

  const outputBase = outputPath.replace(/\.[^.]+$/, '');
  const textFiles = wrapped.map((line, i) => {
    const filePath = path.resolve(`${outputBase}_line${i}.txt`);
    fs.writeFileSync(filePath, line, 'utf-8');
    return filePath;
  });

  const allFilters: string[] = [
    config.isReelStyle
      ? 'scale=1080:1920'
      : 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black',
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
    allFilters.push(buildDrawtextFilter(filePath, i, wrapped.length, style, startPadSec));
  });

  // PCM audio in .mkv → sample-accurate durations, so the xfade chain in buildVideo
  // doesn't accumulate AAC frame-quantization drift across segments.
  const isFadePcm = config.transitionStyle === 'fade-pcm';

  const args = [
    '-y',
    '-loop', '1', '-i', image,
    '-i', audio,
    '-vf', allFilters.join(','),
    '-af', buildAudioFilter(startPadSec, endPadSec),
    '-shortest',
    '-r', String(config.fps),
    '-c:v', 'libx264',
    '-crf', String(config.videoCrf),
    '-preset', config.videoPreset,
    '-pix_fmt', 'yuv420p',
    ...(isFadePcm ? ['-c:a', 'pcm_s16le'] : []),
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

  const speakerOf = (f: string) => f.split('_')[1].split('.')[0];
  const fadeEnabled = config.transitionStyle === 'fade' || config.transitionStyle === 'fade-pcm';
  const segmentExt = config.transitionStyle === 'fade-pcm' ? 'mkv' : 'mp4';
  const D = config.transitionDuration;

  files.forEach((file: string, idx: number) => {
    const speaker = speakerOf(file);
    const prevSpeaker = idx > 0 ? speakerOf(files[idx - 1]) : null;
    const nextSpeaker = idx < files.length - 1 ? speakerOf(files[idx + 1]) : null;

    // Pad with silence at speaker boundaries so the xfade/acrossfade window in
    // buildVideo lands in silence instead of clipping into actual speech.
    const startPadSec = fadeEnabled && prevSpeaker !== null && prevSpeaker !== speaker ? D : 0;
    const endPadSec   = fadeEnabled && nextSpeaker !== null && nextSpeaker !== speaker
      ? Math.max(config.audioPadding, D)
      : config.audioPadding;

    const { styleName, image } = resolveStyleAndImage(speaker);
    const audioPath = path.join(audioDir, file);
    const segmentPath = path.join(segmentsDir, `segment_${String(idx).padStart(3, '0')}_${speaker}.${segmentExt}`);
    const text = lines[idx].text;

    console.log(`Creating segment for ${file}`);
    createSegment(image, audioPath, text, segmentPath, styleName, startPadSec, endPadSec);
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
