import { run as createVideoSegments } from './createVideoSegments';
import { run as buildVideo } from './buildVideo';

export function run(debateName: string): void {
  console.log(`Generating segment videos for ${debateName}...`);
  createVideoSegments(debateName);

  console.log(`Building video for ${debateName}...`);
  buildVideo(debateName);

  console.log('Done.');
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: tsx src/makeVideo.ts <debate_name>');
    process.exit(1);
  }
  try {
    run(debateName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
