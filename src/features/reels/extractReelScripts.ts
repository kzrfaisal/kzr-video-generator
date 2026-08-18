import fs from 'fs';
import { ensureDir, parseDebateFile, DebateLine } from '@/src/shared/utils';
import { outroText } from './reelOutro';
import { readContentMode, type ContentMode } from '@/src/features/projects/contentMode';
import { projectPath } from '@/src/shared/filesystem/paths';

type Block = { speaker: string; texts: string[]; origIndices: number[] };

export type ExtractedPart = {
  name: string;
  filePath: string;
  origLineIndices: number[];
  contentMode?: ContentMode;
};

function explainerParts(debateName: string, lines: DebateLine[]): ExtractedPart[] {
  if (lines.length < 3) throw new Error('The explainer needs at least three narration lines to create shorts.');
  const cuts = [0, Math.round(lines.length / 3), Math.round(lines.length * 2 / 3), lines.length];
  const reelsDir = 'output/debates/reels';
  ensureDir(reelsDir);
  return ([0, 1, 2] as const).map(partIndex => {
    const start = cuts[partIndex];
    const end = cuts[partIndex + 1];
    const selected = lines.slice(start, end);
    const name = `${debateName}_part${partIndex + 1}`;
    const filePath = `${reelsDir}/${name}.txt`;
    const script = selected.map(line => `HOST|${line.text}`).join('\n')
      + `\n\nHOST|${outroText(partIndex, 'narrated-explainer')}\n`;
    fs.writeFileSync(filePath, script, 'utf-8');
    console.log(`Wrote: ${filePath}`);
    return {
      name,
      filePath,
      origLineIndices: selected.map((_, index) => start + index),
      contentMode: 'narrated-explainer' as const,
    };
  });
}

function groupBlocks(lines: DebateLine[]): Block[] {
  const blocks: Block[] = [];
  lines.forEach((line, idx) => {
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === line.speaker) {
      last.texts.push(line.text);
      last.origIndices.push(idx);
    } else {
      blocks.push({ speaker: line.speaker, texts: [line.text], origIndices: [idx] });
    }
  });
  return blocks;
}

function blocksToScript(blocks: Block[]): string {
  return blocks
    .map(b => b.texts.map(t => `${b.speaker}|${t}`).join('\n'))
    .join('\n\n') + '\n';
}

/**
 * Split a long-form debate into 3 reel-sized parts based on the prompt's
 * HOST-A-HOST-B-HOST-A-HOST-B-HOST-A-HOST-B-[HOST] structure:
 *   Part 1 (opening)   = blocks 0..4   (HOST intro, A opening, HOST react, B opening)
 *   Part 2 (rebuttals) = blocks 4..8   (HOST transition, A rebuttal, HOST invite, B rebuttal)
 *   Part 3 (closing)   = blocks 8..end (HOST transition, A closing, HOST invite, B closing, optional HOST summary)
 *
 * Writes each part to output/debates/reels/<debateName>_partN.txt and returns
 * metadata (including the original line indices each part spans) so callers can
 * copy the matching pre-rendered audio files without re-running TTS.
 */
export function extract(debateName: string): ExtractedPart[] {
  const inputFile = `output/debates/${debateName}.txt`;
  if (!fs.existsSync(projectPath(debateName)) && !fs.existsSync(inputFile)) {
    throw new Error(`Project not found: ${debateName}`);
  }

  const lines = parseDebateFile(inputFile);
  const contentMode = readContentMode(debateName);
  if (contentMode === 'narrated-explainer') return explainerParts(debateName, lines);
  const blocks = groupBlocks(lines);

  const expected = ['HOST', 'A', 'HOST', 'B', 'HOST', 'A', 'HOST', 'B', 'HOST', 'A', 'HOST', 'B'];
  if (blocks.length < expected.length) {
    throw new Error(
      `Expected at least ${expected.length} speaker blocks following HOST-A-HOST-B rounds, got ${blocks.length}. ` +
      `The script doesn't match the long-form debate structure — extract manually.`
    );
  }
  for (let i = 0; i < expected.length; i++) {
    if (blocks[i].speaker !== expected[i]) {
      throw new Error(
        `Block ${i} is ${blocks[i].speaker}, expected ${expected[i]}. ` +
        `The script doesn't match the long-form debate structure — extract manually.`
      );
    }
  }

  const partSpecs: [string, Block[]][] = [
    [`${debateName}_part1`, blocks.slice(0, 4)],
    [`${debateName}_part2`, blocks.slice(4, 8)],
    [`${debateName}_part3`, blocks.slice(8)],
  ];

  const reelsDir = 'output/debates/reels';
  ensureDir(reelsDir);

  const parts: ExtractedPart[] = partSpecs.map(([name, partBlocks], partIndex) => {
    const filePath = `${reelsDir}/${name}.txt`;
    // Append a HOST outro line so each reel ends with an engagement prompt.
    // Its audio is supplied separately by ensureOutroAudio(partIndex) at reel-build time.
    const script = blocksToScript(partBlocks) + `HOST|${outroText(partIndex as 0 | 1 | 2, 'debate')}\n`;
    fs.writeFileSync(filePath, script, 'utf-8');
    console.log(`Wrote: ${filePath}`);
    const origLineIndices = partBlocks.flatMap(b => b.origIndices);
    return { name, filePath, origLineIndices, contentMode };
  });

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
