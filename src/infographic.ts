import fs from 'fs';
import path from 'path';
import { wrapText } from './utils';
import { projectPath } from './paths';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'before', 'being', 'between',
  'could', 'does', 'from', 'have', 'into', 'just', 'more', 'most', 'only', 'other',
  'should', 'some', 'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those',
  'through', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your',
]);

function baseDebateName(name: string): string {
  return (name.split('/').pop() ?? name).replace(/_part\d+$/, '');
}

function readTopic(name: string): string {
  try {
    const project = JSON.parse(fs.readFileSync(projectPath(baseDebateName(name)), 'utf-8'));
    return typeof project.topic === 'string' && project.topic.trim() ? project.topic.trim() : 'Debate breakdown';
  } catch {
    return 'Debate breakdown';
  }
}

function keyPhrases(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const ranked = [...new Set(words)]
    .filter(word => word.length >= 5 && !STOP_WORDS.has(word))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  return ranked.length ? ranked : ['key', 'point'];
}

function labelFor(speaker: string): string {
  if (speaker === 'A') return "ZACH'S ARGUMENT";
  if (speaker === 'B') return "DAVID'S ARGUMENT";
  return 'MODERATOR CONTEXT';
}

function accentFor(speaker: string): string {
  if (speaker === 'A') return '0x06b6d4';
  if (speaker === 'B') return '0xf97316';
  return '0x8b5cf6';
}

function textFile(outputBase: string, suffix: string, value: string): string {
  const file = path.resolve(`${outputBase}_info_${suffix}.txt`);
  fs.writeFileSync(file, value, 'utf-8');
  return file;
}

export interface InfographicOverlay {
  filters: string[];
  tempFiles: string[];
}

/** Build FFmpeg-native infographic overlays so the mode needs no browser or image package. */
export function createInfographicOverlay(
  debateName: string,
  speaker: string,
  text: string,
  lineIndex: number,
  lineCount: number,
  portrait: boolean,
  outputBase: string,
  fontFile: string,
): InfographicOverlay {
  const accent = accentFor(speaker);
  const phrases = keyPhrases(text);
  const topicLines = wrapText(readTopic(debateName), portrait ? 34 : 48).slice(0, 2);
  const progress = Math.max(4, Math.round(((lineIndex + 1) / lineCount) * 100));
  const files: string[] = [];
  const makeText = (suffix: string, value: string) => {
    const file = textFile(outputBase, suffix, value);
    files.push(file);
    return file;
  };

  const labelFile = makeText('label', labelFor(speaker));
  const topicFiles = topicLines.map((line, index) => makeText(`topic${index}`, line));
  const phraseFiles = phrases.map((phrase, index) => makeText(`phrase${index}`, phrase.toUpperCase()));
  const progressFile = makeText('progress', `${progress}%`);
  const font = path.resolve(fontFile);
  const filters: string[] = [
    'drawbox=x=0:y=0:w=iw:h=ih:color=0x06101e@0.82:t=fill',
    `drawbox=x=0:y=0:w=${portrait ? 18 : 14}:h=ih:color=${accent}@0.95:t=fill`,
  ];

  const tag = portrait
    ? { x: 56, y: 64, w: 440, h: 64, size: 25 }
    : { x: 70, y: 44, w: 390, h: 54, size: 22 };
  filters.push(`drawbox=x=${tag.x}:y=${tag.y}:w=${tag.w}:h=${tag.h}:color=${accent}@0.18:t=fill`);
  filters.push(`drawtext=fontfile=${font}:textfile=${labelFile}:expansion=none:fontcolor=${accent}:fontsize=${tag.size}:x=${tag.x + 22}:y=${tag.y}+(${tag.h}-text_h)/2`);

  topicFiles.forEach((file, index) => {
    filters.push(`drawtext=fontfile=${font}:textfile=${file}:expansion=none:fontcolor=0x94a3b8:fontsize=${portrait ? 28 : 25}:x=${portrait ? 58 : 500}:y=${portrait ? 155 + index * 42 : 58 + index * 36}`);
  });

  const phraseY = portrait ? 1250 : 500;
  phraseFiles.forEach((file, index) => {
    filters.push(`drawtext=fontfile=${font}:textfile=${file}:expansion=none:fontcolor=${index === 0 ? 'white' : '0x94a3b8'}:fontsize=${portrait ? 68 - index * 9 : 74 - index * 10}:x=${portrait ? 70 : 110}:y=${phraseY + index * (portrait ? 92 : 84)}`);
  });

  const barX = portrait ? 80 : 1140;
  const barY = portrait ? 1560 : 610;
  const barMax = portrait ? 790 : 620;
  phrases.forEach((phrase, index) => {
    const value = 44 + ((phrase.length * 13 + lineIndex * 7 + index * 19) % 48);
    filters.push(`drawbox=x=${barX}:y=${barY + index * 78}:w=${barMax}:h=22:color=white@0.08:t=fill`);
    filters.push(`drawbox=x=${barX}:y=${barY + index * 78}:w=${Math.round(barMax * value / 100)}:h=22:color=${accent}@${0.9 - index * 0.18}:t=fill`);
  });

  const progressX = portrait ? 900 : 1735;
  const progressY = portrait ? 1795 : 970;
  filters.push(`drawbox=x=${progressX - 58}:y=${progressY - 42}:w=116:h=62:color=black@0.45:t=fill`);
  filters.push(`drawtext=fontfile=${font}:textfile=${progressFile}:expansion=none:fontcolor=white:fontsize=${portrait ? 30 : 26}:x=${progressX}-text_w/2:y=${progressY}-text_h`);

  return { filters, tempFiles: files };
}
