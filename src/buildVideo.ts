import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, formatTimestamp } from './utils';

const TRANSITIONS: Record<string, string> = {
  'HOST,A': 'assets/videos/transition_H_to_A.mp4',
  'HOST,B': 'assets/videos/transition_H_to_B.mp4',
  'A,B':    'assets/videos/transition_A_to_B.mp4',
  'A,HOST': 'assets/videos/transition_A_to_H.mp4',
  'B,A':    'assets/videos/transition_B_to_A.mp4',
  'B,HOST': 'assets/videos/transition_B_to_H.mp4',
};

function cleanTmp(): void {
  fs.rmSync('tmp', { recursive: true, force: true });
  fs.mkdirSync('tmp');
}

export function run(debateName: string): void {
  const segmentsDir = `tmp/video_segments/${debateName}`;
  const concatDir = 'tmp/concat';
  const concatFile = `tmp/concat/${debateName}_segments.txt`;
  const outputFile = `output/videos/${debateName}_${formatTimestamp()}.mp4`;

  ensureDir(concatDir);
  ensureDir('output/videos');

  if (!fs.existsSync(segmentsDir)) {
    throw new Error(`Video segments directory does not exist: ${segmentsDir}`);
  }

  const segmentFiles = fs.readdirSync(segmentsDir).filter(f => f.endsWith('.mp4')).sort();
  if (segmentFiles.length === 0) throw new Error('No video segments found');

  const finalSequence: string[] = [];

  for (let i = 0; i < segmentFiles.length; i++) {
    if (i > 0) {
      const prev = segmentFiles[i - 1].split('_').at(-1)!.replace('.mp4', '');
      const curr = segmentFiles[i].split('_').at(-1)!.replace('.mp4', '');

      if (prev !== curr) {
        const key = `${prev},${curr}`;
        const transition = TRANSITIONS[key];
        if (transition && fs.existsSync(transition)) {
          console.log(`Inserting transition ${prev} -> ${curr}`);
          finalSequence.push(transition);
        } else {
          console.log(`No transition defined for ${prev} -> ${curr}`);
        }
      }
    }
    finalSequence.push(path.join(segmentsDir, segmentFiles[i]));
  }

  const concatContent = finalSequence.map(p => `file '${path.resolve(p)}'`).join('\n');
  fs.writeFileSync(concatFile, concatContent, 'utf-8');

  const result = spawnSync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-vf', 'fade=t=in:st=0:d=0.12',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-pix_fmt', 'yuv420p',
    outputFile,
  ], { stdio: 'inherit' });

  if (result.status !== 0) throw new Error('ffmpeg concat failed');

  cleanTmp();
  console.log('Final video generated:', outputFile);
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: tsx src/buildVideo.ts <debate_name>');
    process.exit(1);
  }
  try {
    run(debateName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}