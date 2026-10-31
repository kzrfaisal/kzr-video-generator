import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, wrapText, parseDebateFile } from '@/src/shared/utils';
import { config, STYLES, SubtitleStyle, type SceneTitleMode } from '@/config';
import { publishMetadata } from '@/src/shared/filesystem/paths';
import { createInfographicOverlay } from '@/src/features/visuals/infographic';
import { originalLineIndex, visualSceneForLine } from '@/src/features/visuals/visualScenes';
import { buildRenderCaptions } from '@/src/domain/projects/captions';
import { readProjectDocument } from '@/src/infrastructure/storage/localProjectStore';

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

function speakerDisplayName(speaker: string): string {
  if (speaker === 'A') return 'ZACH';
  if (speaker === 'B') return 'DAVID';
  return 'MODERATOR';
}

/** Read the `## YouTube Title` line from a debate's metadata file, or null if unavailable. */
function readYoutubeTitle(baseDebate: string): string | null {
  const mdPath = publishMetadata(baseDebate);
  if (!fs.existsSync(mdPath)) return null;
  const md = fs.readFileSync(mdPath, 'utf-8');
  const match = md.match(/^##\s+YouTube Title\s*\n([\s\S]*?)(?=\n##\s|$)/m);
  if (!match) return null;
  return match[1].trim().split('\n')[0].trim() || null;
}

/**
 * Build the reel banner text "Part N - <YouTube Title>" for a reel-part debate name
 * (e.g. "reels/debate10_part1"). Returns '' when this isn't a reel part or the
 * metadata title is unavailable (banner is silently skipped).
 */
function reelPartBanner(debateName: string): string {
  if (!config.isReelStyle) return '';
  // debateName is like "reels/debate21_part1" — strip the dir, then split base + part.
  const base = debateName.split('/').pop() ?? debateName;
  const m = base.match(/^(.+)_part(\d+)$/);
  if (!m) return '';
  const [, baseDebate, partNum] = m;
  const title = readYoutubeTitle(baseDebate);
  if (!title) return '';
  return `Part ${partNum} - ${title}`;
}

function buildDrawtextFilter(filePath: string, lineIndex: number, lineCount: number, style: SubtitleStyle, startPadSec: number, endSec: number): string {
  const opts: string[] = [
    `fontfile=${path.resolve(style.font ?? config.font)}`,
    `textfile=${filePath}`,
    'expansion=none',
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
  // A caption exists only for its matching audio window. Escaped commas keep the
  // between() expression inside drawtext instead of becoming filter separators.
  opts.push(`enable=between(t\\,${startPadSec.toFixed(3)}\\,${endSec.toFixed(3)})`);
  return `drawtext=${opts.join(':')}`;
}

function buildAudioFilter(startPadSec: number, endPadSec: number, segmentDurationSec: number): string {
  const filters: string[] = [];
  if (startPadSec > 0) {
    const ms = Math.round(startPadSec * 1000);
    filters.push(`adelay=delays=${ms}:all=1`);
  }
  filters.push(`apad=pad_dur=${endPadSec}`);
  filters.push(`atrim=duration=${segmentDurationSec.toFixed(6)}`);
  filters.push('asetpts=PTS-STARTPTS');
  return filters.join(',');
}

function audioDuration(file: string): number {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  return Number.parseFloat(result.stdout.trim());
}

/** Consistent eased zoom-out with a leftward image slide. */
function photoMotionFilter(portrait: boolean, _lineIndex: number, elapsedSec: number): string {
  const offset = Math.max(0, Math.round(elapsedSec * config.fps));
  const easeFrames = config.fps * 15;
  const ease = `(0.5-0.5*cos(PI*min((on+${offset})/${easeFrames}\\,1)))`;
  const zoom = `1.14-0.11*${ease}`;
  // Move the crop window right while zooming out, which makes the picture slide left.
  const xFactor = `0.05+0.90*${ease}`;
  const canvas = portrait ? '4320:7680' : '7680:4320';
  const output = portrait ? '1080x1920' : '1920x1080';
  return [
    `scale=${canvas}:force_original_aspect_ratio=increase`,
    `crop=${canvas}:x=(in_w-out_w)/2:y=(in_h-out_h)/2`,
    `zoompan=z='${zoom}':x='(iw-iw/zoom)*(${xFactor})':y='(ih-ih/zoom)/2':d=99999:s=${output}:fps=${config.fps}`,
    'setsar=1',
  ].join(',');
}

export function createSegment(
  speaker: string,
  debateName: string,
  lineIndex: number,
  lineCount: number,
  image: string,
  audio: string,
  text: string,
  outputPath: string,
  styleName: string,
  startPadSec: number,
  endPadSec: number,
  bannerText: string,
  photoMode = false,
  sceneHeadline?: string,
  motionOffsetSec = 0,
  speechDurationSec = audioDuration(audio),
  sceneTitleMode: SceneTitleMode = config.sceneTitleMode,
): void {
  const style = STYLES[styleName] ?? STYLES['youtube-classic'];
  const wrapped = wrapText(text, style.wrapWidth ?? config.subtitleWrapWidth);
  const segmentDurationSec = startPadSec + speechDurationSec + endPadSec;
  const subtitleEndSec = startPadSec + speechDurationSec;

  const outputBase = outputPath.replace(/\.[^.]+$/, '');
  const textFiles = config.subtitlesEnabled ? wrapped.map((line, i) => {
    const filePath = path.resolve(`${outputBase}_line${i}.txt`);
    fs.writeFileSync(filePath, line, 'utf-8');
    return filePath;
  }) : [];

  const allFilters: string[] = [
    photoMode
      ? photoMotionFilter(config.isReelStyle, lineIndex, motionOffsetSec)
      : config.isReelStyle
        ? 'scale=1080:1920,setsar=1'
        : 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black',
  ];

  if (photoMode) {
    // Preserve the photo's colour while giving white typography a little more
    // separation. This replaces the previous large grey masks.
    allFilters.push('eq=contrast=1.04:brightness=-0.025:saturation=1.08');
  }

  const infographic = config.visualMode === 'infographic'
      ? createInfographicOverlay(
        debateName, speaker, text, config.isReelStyle,
        outputBase, config.bannerFont.font, photoMode, sceneHeadline,
        sceneTitleMode,
      )
    : { filters: [], tempFiles: [] };
  allFilters.push(...infographic.filters);

  // Character mode needs a name label. Infographic mode already includes one in its header.
  let speakerLabelFile: string | null = null;
  if (config.visualMode !== 'infographic') {
    speakerLabelFile = path.resolve(`${outputBase}_speaker.txt`);
    fs.writeFileSync(speakerLabelFile, speakerDisplayName(speaker), 'utf-8');
    const label = config.isReelStyle
      ? { x: 42, y: 'h-310', w: 280, h: 76, size: 38 }
      : { x: 50, y: 'h-104', w: 235, h: 56, size: 28 };
    allFilters.push(`drawbox=x=${label.x}:y=${label.y}:w=${label.w}:h=${label.h}:color=black@0.62:t=fill`);
    allFilters.push([
      `drawtext=fontfile=${path.resolve(config.bannerFont.font)}`,
      `textfile=${speakerLabelFile}`,
      'expansion=none',
      'fontcolor=white',
      `fontsize=${label.size}`,
      `x=${label.x + 16}`,
      `y=${label.y}+(${label.h}-text_h)/2`,
    ].join(':'));
  }

  // Lower-third bar sits behind the text
  if (config.subtitlesEnabled && style.lowerThirdBar) {
    const { color, padding } = style.lowerThirdBar;
    const lh = style.lineHeight ?? config.subtitleLineHeight;
    const barHeight = wrapped.length * lh + padding * 2;
    const barY = `ih-${style.margin + wrapped.length * lh + padding}`;
    allFilters.push(`drawbox=x=0:y=${barY}:w=iw:h=${barHeight}:color=${color}:t=fill`);
  }

  textFiles.forEach((filePath, i) => {
    allFilters.push(buildDrawtextFilter(filePath, i, wrapped.length, style, startPadSec, subtitleEndSec));
  });

  // Persistent "Part N - <title>" banner, vertically centered, drawn on every frame.
  // Matches the thumbnail hook: soft glow halo (stacked passes) under a solid fill.
  const bannerFiles: string[] = [];
  if (bannerText) {
    const b = config.bannerFont;
    const bannerLines = wrapText(bannerText, b.wrapWidth);
    const n = bannerLines.length;
    const fontfile = path.resolve(b.font);
    bannerLines.forEach((line, i) => {
      const filePath = path.resolve(`${outputBase}_banner${i}.txt`);
      fs.writeFileSync(filePath, line, 'utf-8');
      bannerFiles.push(filePath);
      const y = `(h-${n * b.lineHeight})/2+${i * b.lineHeight}`;
      const base = `fontfile=${fontfile}:textfile=${filePath}:expansion=none:fontsize=${b.size}:x=(w-text_w)/2:y=${y}`;
      // Glow passes first (widest/faintest first), then the fill on top.
      for (const p of b.glow?.passes ?? []) {
        allFilters.push(`drawtext=${base}:fontcolor=${b.glow!.color}@${p.a}:borderw=${p.w}:bordercolor=${b.glow!.color}@${p.a}`);
      }
      allFilters.push(`drawtext=${base}:fontcolor=${b.color}`);
    });
  }

  // Give the video and audio streams the exact same segment boundary. This prevents
  // cumulative timestamp drift when dozens of caption segments are concatenated.
  allFilters.push(`trim=duration=${segmentDurationSec.toFixed(6)}`, 'setpts=PTS-STARTPTS');

  // PCM audio in .mkv → sample-accurate durations, so the xfade chain in buildVideo
  // doesn't accumulate AAC frame-quantization drift across segments.
  const isFadePcm = config.transitionStyle === 'fade-pcm';

  const args = [
    '-y',
    ...(!photoMode ? ['-loop', '1'] : []),
    '-i', image,
    '-i', audio,
    '-vf', allFilters.join(','),
    '-af', buildAudioFilter(startPadSec, endPadSec, segmentDurationSec),
    '-shortest',
    '-t', segmentDurationSec.toFixed(6),
    '-r', String(config.fps),
    '-c:v', 'libx264',
    '-crf', String(config.videoCrf),
    '-preset', config.videoPreset,
    '-pix_fmt', 'yuv420p',
    ...(isFadePcm ? ['-c:a', 'pcm_s16le'] : []),
    outputPath,
  ];

  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  [...textFiles, ...bannerFiles, ...(speakerLabelFile ? [speakerLabelFile] : []), ...infographic.tempFiles]
    .forEach((f: string) => { try { fs.unlinkSync(f); } catch {} });
  if (result.status !== 0) throw new Error(`ffmpeg failed for segment: ${outputPath}`);
}

export function run(debateName: string): void {
  const audioDir = `output/audios/${debateName}`;
  const segmentsDir = `tmp/video_segments/${debateName}`;

  ensureDir('tmp');
  ensureDir('tmp/video_segments');
  fs.rmSync(segmentsDir, { recursive: true, force: true });
  ensureDir(segmentsDir);

  if (!fs.existsSync(audioDir)) {
    throw new Error(`Audio directory does not exist: ${audioDir}`);
  }

  const files = fs.readdirSync(audioDir).filter((f: string) => f.endsWith('.mp3')).sort();
  if (files.length === 0) throw new Error(`No audio files found in ${audioDir}`);

  const lines = buildRenderCaptions(parseDebateFile(`output/debates/${debateName}.txt`));
  const bannerText = reelPartBanner(debateName);

  const speakerOf = (f: string) => f.split('_')[1].split('.')[0];
  const fadeEnabled = config.transitionStyle === 'fade' || config.transitionStyle === 'fade-pcm';
  const segmentExt = config.transitionStyle === 'fade-pcm' ? 'mkv' : 'mp4';
  const D = config.transitionDuration;
  const sceneElapsed = new Map<string, number>();
  const shownSectionTitles = new Set<string>();
  const parentProjectName = (debateName.split('/').pop() ?? debateName).replace(/_part\d+$/, '');
  let projectScenes: ReturnType<typeof readProjectDocument>['scenes'] = [];
  try { projectScenes = readProjectDocument(parentProjectName).scenes; }
  catch { /* Legacy scripts fall back to visual-scene title grouping below. */ }

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

    const text = lines[idx].text;
    const { styleName, image } = resolveStyleAndImage(speaker);
    const plannedScene = config.visualMode === 'infographic'
      ? visualSceneForLine(debateName, lines[idx].sourceLineIndex)
      : null;
    const hasScenePhoto = !!plannedScene?.imagePath && fs.existsSync(plannedScene.imagePath);
    const sceneImage = hasScenePhoto
      ? plannedScene!.imagePath!
      : config.visualMode === 'infographic'
        ? (config.isReelStyle ? 'assets/images/image_H_style3.png' : 'assets/images/image_H_style2.png')
        : image;
    const audioPath = path.join(audioDir, file);
    const segmentPath = path.join(segmentsDir, `segment_${String(idx).padStart(3, '0')}_${speaker}.${segmentExt}`);
    const sceneKey = plannedScene?.id ?? `line-${idx}`;
    const sourceScene = projectScenes[originalLineIndex(debateName, lines[idx].sourceLineIndex)];
    const sectionKey = sourceScene?.sectionId ?? plannedScene?.id ?? `line-${lines[idx].sourceLineIndex}`;
    const sceneHeadline = sourceScene?.headline.trim() || plannedScene?.headline;
    const sceneTitleMode = config.sceneTitleMode === 'intro' && shownSectionTitles.has(sectionKey)
      ? 'hidden'
      : config.sceneTitleMode;
    const motionOffsetSec = sceneElapsed.get(sceneKey) ?? 0;
    const speechDurationSec = audioDuration(audioPath);

    console.log(`Creating segment for ${file}`);
    createSegment(
      speaker, debateName, idx, files.length, sceneImage, audioPath, text,
      segmentPath, styleName, startPadSec, endPadSec, bannerText,
      hasScenePhoto, sceneHeadline, motionOffsetSec, speechDurationSec,
      sceneTitleMode,
    );
    if (sceneTitleMode === 'intro' && sceneHeadline) shownSectionTitles.add(sectionKey);
    // xfade overlaps the outgoing and incoming clips. Move the next clip's
    // camera clock back by that overlap so the photo stays pixel-aligned while
    // the speaker label and subtitles dissolve between each other.
    const overlapToNext = fadeEnabled && nextSpeaker !== null && nextSpeaker !== speaker ? D : 0;
    sceneElapsed.set(
      sceneKey,
      motionOffsetSec + startPadSec + speechDurationSec + endPadSec - overlapToNext,
    );
  });
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: tsx src/features/rendering/createVideoSegments.ts <debate_name>');
    process.exit(1);
  }
  try {
    run(debateName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
