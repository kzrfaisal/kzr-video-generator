import fs from 'fs';
import { spawnSync } from 'child_process';

const AUDIO_FILE = 'assets/audios/transition_audio.wav';
const VIDEOS_DIR = 'assets/videos';

function addAudio(transitionName: string): void {
  const inputVideo = `${VIDEOS_DIR}/${transitionName}.mp4`;
  const tempOutput = `${VIDEOS_DIR}/${transitionName}.tmp.mp4`;

  if (!fs.existsSync(inputVideo)) {
    throw new Error(`Transition video not found: ${inputVideo}`);
  }
  if (!fs.existsSync(AUDIO_FILE)) {
    throw new Error(`Audio file not found: ${AUDIO_FILE}`);
  }

  const args = [
    '-y',
    '-i', inputVideo,
    '-i', AUDIO_FILE,
    '-map', '0:v', '-map', '1:a',
    '-af', 'apad',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-ar', '22050', '-ac', '1', '-b:a', '64k',
    '-shortest',
    tempOutput,
  ];

  console.log(`Adding audio to ${inputVideo}...`);
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    try { fs.unlinkSync(tempOutput); } catch {}
    throw new Error(`ffmpeg failed for: ${inputVideo}`);
  }

  fs.renameSync(tempOutput, inputVideo);
  console.log(`Done: ${inputVideo}`);
}

export function run(transitionName?: string): void {
  if (transitionName) {
    addAudio(transitionName.replace(/\.mp4$/, ''));
  } else {
    const files = fs.readdirSync(VIDEOS_DIR)
      .filter(f => f.startsWith('transition_') && f.endsWith('.mp4'));
    if (files.length === 0) throw new Error(`No transition videos found in ${VIDEOS_DIR}`);
    for (const file of files) {
      addAudio(file.replace('.mp4', ''));
    }
  }
}

if (require.main === module) {
  const transitionName = process.argv[2];
  try {
    run(transitionName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
