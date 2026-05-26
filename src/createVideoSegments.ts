import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, wrapText, parseDebateFile } from './utils';

// ─── Subtitle style configuration ────────────────────────────────────────────

interface SubtitleStyle {
  fontsize: number;
  fontcolor: string;
  bordercolor?: string;
  borderw?: number;
  shadowcolor?: string;
  shadowx?: number;
  shadowy?: number;
  box?: number;
  boxcolor?: string;
  boxborderw?: number;
  position: 'top' | 'bottom';
  margin: number;                                      // px from top or bottom edge
  lowerThirdBar?: { color: string; padding: number };  // Style 5 only
}

const STYLES: Record<string, SubtitleStyle> = {
  // White text with thick black outline — most common YouTube style
  'youtube-classic': {
    fontsize: 44, fontcolor: 'white',
    bordercolor: 'black', borderw: 3,
    position: 'top', margin: 120,
  },
  // White text on a semi-transparent dark box
  'card': {
    fontsize: 40, fontcolor: 'white',
    box: 1, boxcolor: 'black@0.55', boxborderw: 12,
    position: 'top', margin: 120,
  },
  // Yellow text with heavy black border — sports/reaction style
  'bold-yellow': {
    fontsize: 46, fontcolor: 'yellow',
    bordercolor: 'black', borderw: 4,
    position: 'top', margin: 120,
  },
  // White text with strong shadow — cinematic/podcast look
  'glow': {
    fontsize: 40, fontcolor: 'white',
    shadowcolor: 'black@0.9', shadowx: 4, shadowy: 4,
    position: 'top', margin: 120,
  },
  // White text on a dark navy bar across full width — news/documentary
  'lower-third': {
    fontsize: 38, fontcolor: 'white',
    position: 'top', margin: 120,
    lowerThirdBar: { color: '0x1a1a2e@0.85', padding: 15 },
  },
  // Original top-center style (legacy)
  'top-classic': {
    fontsize: 40, fontcolor: 'white',
    shadowcolor: 'black', shadowx: 2, shadowy: 2,
    position: 'top', margin: 120,
  },
};

// ← Change this to switch subtitle style
const SUBTITLE_STYLE = 'top-classic';

// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_MAP: Record<string, string> = {
  HOST: 'assets/images/image_H.png',
  A: 'assets/images/image_A.png',
  B: 'assets/images/image_B.png',
};

const FONT = path.resolve('assets/fonts/Segoe UI Italic.ttf');
const LINE_HEIGHT = 50;

function lineY(lineIndex: number, lineCount: number, style: SubtitleStyle): string {
  if (style.position === 'top') {
    return String(style.margin + lineIndex * LINE_HEIGHT);
  }
  // Bottom: last line sits at (h - margin - LINE_HEIGHT), earlier lines stack upward
  return `h-${style.margin + (lineCount - lineIndex) * LINE_HEIGHT}`;
}

function buildDrawtextFilter(filePath: string, lineIndex: number, lineCount: number, style: SubtitleStyle): string {
  const opts: string[] = [
    `fontfile=${FONT}`,
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

function createSegment(image: string, audio: string, text: string, outputPath: string): void {
  const style = STYLES[SUBTITLE_STYLE] ?? STYLES['youtube-classic'];
  const wrapped = wrapText(text, 72);

  const textFiles = wrapped.map((line, i) => {
    const filePath = path.resolve(outputPath.replace('.mp4', `_line${i}.txt`));
    fs.writeFileSync(filePath, line, 'utf-8');
    return filePath;
  });

  const allFilters: string[] = ['scale=trunc(iw/2)*2:trunc(ih/2)*2'];

  // Lower-third bar sits behind the text
  if (style.lowerThirdBar) {
    const { color, padding } = style.lowerThirdBar;
    const barHeight = wrapped.length * LINE_HEIGHT + padding * 2;
    const barY = `ih-${style.margin + wrapped.length * LINE_HEIGHT + padding}`;
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
    '-af', 'apad=pad_dur=0.4',
    '-shortest',
    '-r', '30',
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'slow',
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
    const image = IMAGE_MAP[speaker] ?? IMAGE_MAP['A'];
    const audioPath = path.join(audioDir, file);
    const segmentPath = path.join(segmentsDir, `segment_${String(idx).padStart(3, '0')}_${speaker}.mp4`);
    const text = lines[idx].text;

    console.log(`Creating segment for ${file}`);
    createSegment(image, audioPath, text, segmentPath);
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
