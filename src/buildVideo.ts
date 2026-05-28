import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, formatTimestamp, cleanTmp } from './utils';
import { config } from '../config';

const TRANSITIONS: Record<string, string> = {
  'HOST,A': 'assets/videos/transition_H_to_A.mp4',
  'HOST,B': 'assets/videos/transition_H_to_B.mp4',
  'A,B':    'assets/videos/transition_A_to_B.mp4',
  'A,HOST': 'assets/videos/transition_A_to_H.mp4',
  'B,A':    'assets/videos/transition_B_to_A.mp4',
  'B,HOST': 'assets/videos/transition_B_to_H.mp4',
};

function ffprobeDuration(file: string): number {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  return parseFloat(r.stdout.trim());
}

function concatPlain(finalSequence: string[], concatFile: string, outputFile: string): void {
  const concatContent = finalSequence.map(p => `file '${path.resolve(p)}'`).join('\n');
  fs.writeFileSync(concatFile, concatContent, 'utf-8');

  const result = spawnSync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-vf', `fade=t=in:st=0:d=${config.fadeInDuration}`,
    '-r', String(config.fps),
    '-c:v', 'libx264',
    '-preset', config.videoPreset,
    '-pix_fmt', 'yuv420p',
    outputFile,
  ], { stdio: 'inherit' });

  if (result.status !== 0) throw new Error('ffmpeg concat failed');
}

function speakerOf(filePath: string): string {
  return path.basename(filePath).split('_').at(-1)!.replace('.mp4', '');
}

function mergeGroup(group: string[], outFile: string): void {
  const listFile = outFile.replace('.mp4', '.txt');
  fs.writeFileSync(listFile, group.map(p => `file '${path.resolve(p)}'`).join('\n'), 'utf-8');
  const r = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outFile,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg group concat failed: ${outFile}`);
}

/**
 * Two-pass concat:
 *  Pass 1 — merge runs of consecutive same-speaker segments via concat demuxer (-c copy, no re-encode).
 *  Pass 2 — xfade across the resulting clips, so fades only land at speaker boundaries.
 */
function concatWithFade(finalSequence: string[], outputFile: string): void {
  // Group consecutive same-speaker entries
  const groups: string[][] = [];
  for (const p of finalSequence) {
    const last = groups[groups.length - 1];
    if (last && speakerOf(last[0]) === speakerOf(p)) last.push(p);
    else groups.push([p]);
  }

  // Pass 1: merge each multi-segment group; single-segment groups pass through
  const groupDir = 'tmp/concat/groups';
  ensureDir(groupDir);
  const groupClips: string[] = groups.map((group, gIdx) => {
    if (group.length === 1) return group[0];
    const merged = path.join(groupDir, `group_${String(gIdx).padStart(3, '0')}.mp4`);
    mergeGroup(group, merged);
    return merged;
  });

  // Pass 2: xfade chain over the merged clips
  const D = config.transitionDuration;
  const durations = groupClips.map(ffprobeDuration);

  const inputs: string[] = [];
  groupClips.forEach(p => { inputs.push('-i', path.resolve(p)); });

  const filters: string[] = [];
  let vLabel = '[0:v]';
  let aLabel = '[0:a]';
  let totalDur = durations[0];

  for (let i = 1; i < groupClips.length; i++) {
    const offset = (totalDur - D).toFixed(3);
    const vNext = `[v${i}]`;
    const aNext = `[a${i}]`;
    filters.push(`${vLabel}[${i}:v]xfade=transition=fade:duration=${D}:offset=${offset}${vNext}`);
    filters.push(`${aLabel}[${i}:a]acrossfade=d=${D}${aNext}`);
    vLabel = vNext;
    aLabel = aNext;
    totalDur += durations[i] - D;
  }
  filters.push(`${vLabel}fade=t=in:st=0:d=${config.fadeInDuration}[vout]`);

  const result = spawnSync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', aLabel,
    '-r', String(config.fps),
    '-c:v', 'libx264',
    '-preset', config.videoPreset,
    '-pix_fmt', 'yuv420p',
    outputFile,
  ], { stdio: 'inherit' });

  if (result.status !== 0) throw new Error('ffmpeg xfade concat failed');
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

      if (prev !== curr && config.includeTransitionVideos) {
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

  if (config.transitionStyle === 'fade' && finalSequence.length > 1) {
    concatWithFade(finalSequence, outputFile);
  } else {
    concatPlain(finalSequence, concatFile, outputFile);
  }

  // cleanTmp();
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