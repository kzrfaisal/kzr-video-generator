import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, parseDebateFile, type DebateLine } from '@/src/shared/utils';
import { outroText } from './reelOutro';
import { readContentMode, type ContentMode } from '@/src/features/projects/contentMode';
import { projectPath, publishMetadata } from '@/src/shared/filesystem/paths';
import { readProjectDocument, saveProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import { applyExactProjectTitle, metadataToMarkdown } from '@/src/domain/projects/metadata';

// The longest cached outro is just over three seconds. Keeping source narration
// below 48.5 seconds lets the final render fit safely inside the 50-53 second
// product target. The renderer pads every finished Reel to exactly 52 seconds.
const MAX_REEL_SOURCE_SECONDS = 48.5;

export type ExtractedPart = {
  name: string;
  filePath: string;
  origLineIndices: number[];
  contentMode?: ContentMode;
};

type IndexedLine = { line: DebateLine; originalIndex: number; duration: number };

function audioDurations(debateName: string, lines: DebateLine[]): number[] {
  const dir = `output/audios/${debateName}`;
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(file => file.endsWith('.mp3')).sort()
    : [];

  return lines.map((line, index) => {
    const file = files[index];
    if (file) {
      const result = spawnSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        path.join(dir, file),
      ], { encoding: 'utf-8' });
      const duration = Number(result.stdout.trim());
      if (result.status === 0 && Number.isFinite(duration) && duration > 0) return duration;
    }

    const words = line.text.trim().split(/\s+/).filter(Boolean).length;
    return words / 2.4 + 0.25;
  });
}

/** Split all narration into ordered, balanced groups without dropping lines. */
function durationBalancedGroups(lines: DebateLine[], durations: number[]): IndexedLine[][] {
  const indexed = lines.map((line, originalIndex) => ({ line, originalIndex, duration: durations[originalIndex] }));
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const groupCount = Math.max(1, Math.ceil(total / MAX_REEL_SOURCE_SECONDS));
  const groups: IndexedLine[][] = [];
  let cursor = 0;
  let remainingDuration = total;

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
    const groupsLeft = groupCount - groupIndex;
    const target = Math.min(MAX_REEL_SOURCE_SECONDS, remainingDuration / groupsLeft);
    const group: IndexedLine[] = [];
    let duration = 0;

    while (cursor < indexed.length) {
      const entry = indexed[cursor];
      const linesAfterCandidate = indexed.length - (cursor + 1);
      if (linesAfterCandidate < groupsLeft - 1) break;
      const nextDuration = duration + entry.duration;
      if (group.length > 0 && nextDuration > MAX_REEL_SOURCE_SECONDS) break;
      if (
        group.length > 0
        && duration >= target
        && Math.abs(duration - target) <= Math.abs(nextDuration - target)
      ) break;
      group.push(entry);
      duration = nextDuration;
      cursor++;
    }

    if (group.length === 0 && cursor < indexed.length) {
      group.push(indexed[cursor]);
      duration = indexed[cursor].duration;
      cursor++;
    }
    groups.push(group);
    remainingDuration -= duration;
  }

  while (cursor < indexed.length) {
    const group: IndexedLine[] = [];
    let duration = 0;
    while (cursor < indexed.length) {
      const entry = indexed[cursor];
      if (group.length > 0 && duration + entry.duration > MAX_REEL_SOURCE_SECONDS) break;
      group.push(entry);
      duration += entry.duration;
      cursor++;
    }
    groups.push(group);
  }
  return groups.filter(group => group.length > 0);
}

function removeStalePartScripts(debateName: string, reelsDir: string): void {
  const pattern = new RegExp(`^${debateName}_part\\d+\\.txt$`);
  for (const file of fs.readdirSync(reelsDir)) {
    if (pattern.test(file)) fs.unlinkSync(path.join(reelsDir, file));
  }
}

function syncReelMetadata(debateName: string, groups: IndexedLine[][]): void {
  const project = readProjectDocument(debateName);
  if (!project.metadata) return;
  const existing = new Map(project.metadata.reels.map(reel => [reel.part, reel.caption]));
  const hashtags = project.metadata.youtube.hashtags.slice(0, 5).join(' ');
  project.metadata = applyExactProjectTitle({
    ...project.metadata,
    reels: groups.map((group, index) => ({
      part: index + 1,
      caption: existing.get(index + 1)
        || [`Part ${index + 1} - ${project.title}`, group[0]?.line.text, hashtags].filter(Boolean).join('\n'),
    })),
  }, project.title);
  saveProjectDocument(project);
  ensureDir(path.dirname(publishMetadata(debateName)));
  fs.writeFileSync(publishMetadata(debateName), metadataToMarkdown(project.metadata), 'utf-8');
}

/** Create as many 52-second Reels as the source narration requires. */
export function extract(debateName: string): ExtractedPart[] {
  const inputFile = `output/debates/${debateName}.txt`;
  if (!fs.existsSync(projectPath(debateName)) && !fs.existsSync(inputFile)) {
    throw new Error(`Project not found: ${debateName}`);
  }

  const lines = parseDebateFile(inputFile);
  if (!lines.length) throw new Error('The script has no narration to extract.');
  const contentMode = readContentMode(debateName);
  const groups = durationBalancedGroups(lines, audioDurations(debateName, lines));
  const reelsDir = 'output/debates/reels';
  ensureDir(reelsDir);
  removeStalePartScripts(debateName, reelsDir);

  const parts = groups.map((group, partIndex) => {
    const name = `${debateName}_part${partIndex + 1}`;
    const filePath = `${reelsDir}/${name}.txt`;
    const script = group.map(({ line }) => `${line.speaker}|${line.text}`).join('\n')
      + `\n\nHOST|${outroText(partIndex, contentMode)}\n`;
    fs.writeFileSync(filePath, script, 'utf-8');
    console.log(`Wrote: ${filePath}`);
    return {
      name,
      filePath,
      origLineIndices: group.map(({ originalIndex }) => originalIndex),
      contentMode,
    };
  });
  syncReelMetadata(debateName, groups);
  return parts;
}

export function run(debateName: string): void {
  extract(debateName);
}

if (require.main === module) {
  const debateName = process.argv[2];
  if (!debateName) {
    console.error('Usage: npm run extract-reel-scripts -- <debate_name>');
    process.exit(1);
  }
  try {
    run(debateName);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
