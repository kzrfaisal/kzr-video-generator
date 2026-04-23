import { run as generateAudio } from './generateAudio';
import { run as createVideoSegments } from './createVideoSegments';
import { run as buildVideo } from './buildVideo';

export async function run(debateName: string): Promise<void> {
  console.log(`Generating audio for ${debateName}...`);
  await generateAudio(debateName);

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
  run(debateName).catch(err => { console.error(err.message); process.exit(1); });
}
