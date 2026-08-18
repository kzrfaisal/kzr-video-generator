import fs from 'fs';
import path from 'path';
import { wrapText } from '@/src/shared/utils';
import { readContentMode } from '@/src/features/projects/contentMode';
import { readProjectDocument } from '@/src/infrastructure/storage/localProjectStore';

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
    const project = readProjectDocument(baseDebateName(name));
    return project.title.trim() || 'Debate breakdown';
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

function labelFor(name: string, speaker: string): string {
  if (readContentMode(name) === 'narrated-explainer') return 'VISUAL EXPLAINER';
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
  portrait: boolean,
  outputBase: string,
  fontFile: string,
  photoMode: boolean,
  sceneHeadline?: string,
): InfographicOverlay {
  const accent = accentFor(speaker);
  const headline = sceneHeadline?.trim() || keyPhrases(text).join(' ');
  const headlineLines = wrapText(headline.toUpperCase(), portrait ? 20 : 25).slice(0, 2);
  const topicLines = wrapText(readTopic(debateName), portrait ? 30 : 52).slice(0, 2);
  const files: string[] = [];
  const makeText = (suffix: string, value: string) => {
    const file = textFile(outputBase, suffix, value);
    files.push(file);
    return file;
  };

  const labelFile = makeText('label', labelFor(debateName, speaker));
  const topicFiles = topicLines.map((line, index) => makeText(`topic${index}`, line));
  const headlineFiles = headlineLines.map((line, index) => makeText(`headline${index}`, line));
  const font = path.resolve(fontFile);
  const filters: string[] = [
    ...(photoMode
      ? ['drawbox=x=0:y=0:w=iw:h=ih:color=0x020812@0.10:t=fill']
      : ['drawbox=x=0:y=0:w=iw:h=ih:color=0x06101e@0.82:t=fill']),
  ];

  const tag = portrait
    ? { x: 54, y: 58, w: 440, h: 64, size: 25 }
    : { x: 64, y: 42, w: 390, h: 54, size: 22 };
  filters.push(`drawbox=x=${tag.x}:y=${tag.y}:w=${tag.w}:h=${tag.h}:color=0x050b14@0.72:t=fill`);
  filters.push(`drawbox=x=${tag.x}:y=${tag.y}:w=7:h=${tag.h}:color=${accent}@1:t=fill`);
  filters.push(`drawtext=fontfile=${font}:textfile=${labelFile}:expansion=none:fontcolor=white:fontsize=${tag.size}:x=${tag.x + 24}:y=${tag.y}+(${tag.h}-text_h)/2`);

  topicFiles.forEach((file, index) => {
    const x = portrait ? 58 : 500;
    const y = portrait ? 156 + index * 39 : 50 + index * 34;
    filters.push(`drawtext=fontfile=${font}:textfile=${file}:expansion=none:fontcolor=white@0.78:fontsize=${portrait ? 27 : 24}:shadowcolor=black@0.9:shadowx=2:shadowy=2:x=${x}:y=${y}`);
  });

  const twoLineHeadline = headlineFiles.length > 1;
  const card = portrait
    ? { x: 48, y: twoLineHeadline ? 1400 : 1490, w: 984, h: twoLineHeadline ? 360 : 270, pad: 42, headlineSize: 54, lineHeight: 70 }
    : { x: 64, y: twoLineHeadline ? 700 : 770, w: 1240, h: twoLineHeadline ? 270 : 200, pad: 42, headlineSize: 54, lineHeight: 68 };
  filters.push(`drawbox=x=${card.x}:y=${card.y}:w=${card.w}:h=${card.h}:color=0x050b14@0.72:t=fill`);
  filters.push(`drawbox=x=${card.x}:y=${card.y}:w=${portrait ? 9 : 8}:h=${card.h}:color=${accent}@1:t=fill`);
  headlineFiles.forEach((file, index) => {
    filters.push(`drawtext=fontfile=${font}:textfile=${file}:expansion=none:fontcolor=white:fontsize=${card.headlineSize}:shadowcolor=black@0.65:shadowx=2:shadowy=2:x=${card.x + card.pad}:y=${card.y + 38 + index * card.lineHeight}`);
  });

  const ruleY = card.y + card.h - 36;
  filters.push(`drawbox=x=${card.x + card.pad}:y=${ruleY}:w=${portrait ? 170 : 140}:h=5:color=${accent}@1:t=fill`);

  return { filters, tempFiles: files };
}
