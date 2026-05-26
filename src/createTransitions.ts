import { spawnSync } from 'child_process';
import { config } from '../config';

const IMAGE_MAP: Record<string, string> = {
  H: 'assets/images/image_H.png',
  A: 'assets/images/image_A.png',
  B: 'assets/images/image_B.png',
};

const ALL_PAIRS: [string, string][] = [
  ['H', 'A'], ['H', 'B'],
  ['A', 'H'], ['A', 'B'],
  ['B', 'H'], ['B', 'A'],
];

function createTransition(from: string, to: string): void {
  const fromImage = IMAGE_MAP[from];
  const toImage = IMAGE_MAP[to];

  if (!fromImage || !toImage) {
    throw new Error(`Unknown speaker code "${from}" or "${to}". Use H, A, or B.`);
  }

  const outputPath = `assets/videos/transition_${from}_to_${to}.mp4`;

  const args = [
    '-y',
    '-loop', '1', '-t', '1', '-i', fromImage,
    '-loop', '1', '-t', '1', '-i', toImage,
    '-filter_complex', `[0:v][1:v]xfade=transition=${config.transitionEffect}:duration=${config.transitionDuration}:offset=0,format=yuv420p`,
    '-r', String(config.fps),
    outputPath,
  ];

  console.log(`Creating ${outputPath}...`);
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg failed for: ${outputPath}`);
  console.log(`Saved: ${outputPath}`);
}

export function run(from?: string, to?: string): void {
  const pairs = (from && to) ? [[from.toUpperCase(), to.toUpperCase()]] : ALL_PAIRS;
  for (const [f, t] of pairs) {
    createTransition(f, t);
  }
}

if (require.main === module) {
  const [from, to] = process.argv.slice(2);
  if ((from && !to) || (!from && to)) {
    console.error('Usage: tsx src/createTransitions.ts [FROM TO]');
    console.error('  FROM and TO are speaker codes: H, A, B');
    console.error('  Omit both to regenerate all 6 transitions');
    process.exit(1);
  }
  try {
    run(from, to);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
