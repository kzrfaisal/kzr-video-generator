import { spawnSync } from 'child_process';
import { run as runMain } from '../main';

async function main(): Promise<void> {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx src/runAll.ts "<topic>"');
    process.exit(1);
  }

  // 1. YouTube pipeline: script + metadata + thumbnail + audio + final video.
  const { debateName } = await runMain(topic);

  // 2. Reels pipeline: spawned as a subprocess so it loads its own config with style3
  //    (different images + portrait dimensions). Reuses the audio just generated.
  console.log(`\nYouTube pipeline done. Starting reels for ${debateName}...\n`);
  const result = spawnSync(
    'npx',
    ['tsx', 'src/makeReels.ts', debateName, '--style=style3'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
