import { spawnSync } from 'child_process';
import { config } from '../config';

function imageFor(code: string): string {
  const key = code === 'H' ? 'HOST' : code;
  return config.images[key];
}

const ALL_PAIRS: [string, string][] = [
  ['H', 'A'], ['H', 'B'],
  ['A', 'H'], ['A', 'B'],
  ['B', 'H'], ['B', 'A'],
];

function createTransition(from: string, to: string): void {
  const fromImage = imageFor(from);
  const toImage = imageFor(to);

  if (!fromImage || !toImage) {
    throw new Error(`Unknown speaker code "${from}" or "${to}". Use H, A, or B.`);
  }

  const outputPath = `assets/videos/transition_${from}_to_${to}.mp4`;

  const HOLD = 0.5;
  const firstDur = config.transitionDuration;
  const secondDur = config.transitionDuration + HOLD;

  const scaleFilter = config.isReelStyle
    ? 'scale=1080:1920'
    : 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black';

  const filterChain =
    `[0:v]${scaleFilter}[v0];[1:v]${scaleFilter}[v1];` +
    `[v0][v1]xfade=transition=${config.transitionEffect}:duration=${config.transitionDuration}:offset=0,format=yuv420p`;

  const args = [
    '-y',
    '-loop', '1', '-t', String(firstDur), '-i', fromImage,
    '-loop', '1', '-t', String(secondDur), '-i', toImage,
    '-filter_complex', filterChain,
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
