import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, escapeDrawtext, wrapText, parseDebateFile } from './utils';

const IMAGE_MAP: Record<string, string> = {
  HOST: 'assets/images/image_H.png',
  A: 'assets/images/image_A.png',
  B: 'assets/images/image_B.png',
};

const FONT = 'assets/fonts/Nunito-Regular.ttf';
const BASE_Y = 120;
const LINE_HEIGHT = 50;

function createSegment(image: string, audio: string, text: string, outputPath: string): void {
  const escaped = escapeDrawtext(text);
  const wrapped = wrapText(escaped, 72);

  const filters = wrapped.map((line, i) =>
    `drawtext=fontfile=${FONT}:text='${line}':fontcolor=white:fontsize=40:shadowcolor=black:shadowx=2:shadowy=2:x=(w-text_w)/2:y=${BASE_Y + i * LINE_HEIGHT}`
  );

  const drawtext = filters.join(',');

  const args = [
    '-y',
    '-loop', '1', '-i', image,
    '-i', audio,
    '-vf', drawtext,
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
  if (result.status !== 0) throw new Error(`ffmpeg failed for segment: ${outputPath}`);
}

export function run(debateName: string): void {
  const audioDir = `tmp/audio/${debateName}`;
  const segmentsDir = `tmp/video_segments/${debateName}`;

  ensureDir('tmp');
  ensureDir('tmp/video_segments');
  ensureDir(segmentsDir);

  if (!fs.existsSync(audioDir)) {
    throw new Error(`Audio directory does not exist: ${audioDir}`);
  }

  const files = fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).sort();
  if (files.length === 0) throw new Error(`No audio files found in ${audioDir}`);

  const lines = parseDebateFile(`output/debates/${debateName}.txt`);

  files.forEach((file, idx) => {
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