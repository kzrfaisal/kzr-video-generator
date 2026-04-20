import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, parseDebateFile } from './utils';

const VOICE_MAP: Record<string, string> = {
  HOST: 'Tessa',
  A: 'Daniel',
  B: 'Aman',
};

function generateTts(text: string, baseFilename: string, voice: string): void {
  const aiffFile = baseFilename + '.aiff';
  const mp3File = baseFilename + '.mp3';

  let result = spawnSync('say', ['-v', voice, '-o', aiffFile, text], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`say failed for: ${baseFilename}`);

  result = spawnSync('ffmpeg', ['-y', '-i', aiffFile, '-q:a', '0', mp3File], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg conversion failed for: ${aiffFile}`);

  fs.unlinkSync(aiffFile);
}

export function run(debateName: string): void {
  const outputDir = `tmp/audio/${debateName}`;

  ensureDir('tmp');
  ensureDir('tmp/audio');
  ensureDir(outputDir);

  const lines = parseDebateFile(`output/debates/${debateName}.txt`);
  let counter = 1;

  for (const { speaker, text } of lines) {
    const voice = VOICE_MAP[speaker] ?? 'Tessa';
    const baseFilename = path.join(outputDir, `${String(counter).padStart(3, '0')}_${speaker}`);

    console.log(`Generating: ${baseFilename} using ${voice}`);
    generateTts(text, baseFilename, voice);
    counter++;
  }

  console.log('All audio generated successfully.');
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: tsx src/generateAudio.ts <debate_name>');
    process.exit(1);
  }
  try {
    run(debateName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}