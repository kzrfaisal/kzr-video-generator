import fs from 'fs';
import path from 'path';
import { wrapText } from '@/src/shared/utils';
import type { SceneTitleMode } from '@/config';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'before', 'being', 'between',
  'could', 'does', 'from', 'have', 'into', 'just', 'more', 'most', 'only', 'other',
  'should', 'some', 'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those',
  'through', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your',
]);

function keyPhrases(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const ranked = [...new Set(words)]
    .filter(word => word.length >= 5 && !STOP_WORDS.has(word))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  return ranked.length ? ranked : ['key', 'point'];
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
  _debateName: string,
  speaker: string,
  text: string,
  portrait: boolean,
  outputBase: string,
  fontFile: string,
  photoMode: boolean,
  sceneHeadline?: string,
  sceneTitleMode: SceneTitleMode = 'persistent',
): InfographicOverlay {
  const accent = accentFor(speaker);
  const headline = sceneHeadline?.trim() || keyPhrases(text).join(' ');
  const headlineLines = sceneTitleMode !== 'hidden'
    ? wrapText(headline.toUpperCase(), portrait ? 20 : 25).slice(0, 2)
    : [];
  const files: string[] = [];
  const makeText = (suffix: string, value: string) => {
    const file = textFile(outputBase, suffix, value);
    files.push(file);
    return file;
  };

  const headlineFiles = headlineLines.map((line, index) => makeText(`headline${index}`, line));
  const font = path.resolve(fontFile);
  const filters: string[] = [
    ...(photoMode
      ? ['drawbox=x=0:y=0:w=iw:h=ih:color=0x020812@0.10:t=fill']
      : ['drawbox=x=0:y=0:w=iw:h=ih:color=0x06101e@0.82:t=fill']),
  ];

  if (headlineFiles.length > 0) {
    const twoLineHeadline = headlineFiles.length > 1;
    const card = portrait
      ? { x: 48, y: twoLineHeadline ? 1400 : 1490, w: 984, h: twoLineHeadline ? 360 : 270, pad: 42, headlineSize: 54, lineHeight: 70 }
      : { x: 64, y: twoLineHeadline ? 700 : 770, w: 1240, h: twoLineHeadline ? 270 : 200, pad: 42, headlineSize: 54, lineHeight: 68 };
    const introWindow = sceneTitleMode === 'intro' ? ':enable=between(t\\,0\\,3)' : '';
    filters.push(`drawbox=x=${card.x}:y=${card.y}:w=${card.w}:h=${card.h}:color=0x050b14@0.72:t=fill${introWindow}`);
    filters.push(`drawbox=x=${card.x}:y=${card.y}:w=${portrait ? 9 : 8}:h=${card.h}:color=${accent}@1:t=fill${introWindow}`);
    headlineFiles.forEach((file, index) => {
      const x = sceneTitleMode === 'intro'
        ? `'${card.x + card.pad}+if(lt(t\\,0.35)\\,-36*(1-t/0.35)\\,0)'`
        : String(card.x + card.pad);
      const animation = sceneTitleMode === 'intro'
        ? `:alpha='if(lt(t\\,0.3)\\,t/0.3\\,if(lt(t\\,2.6)\\,1\\,max(0\\,(3-t)/0.4)))'${introWindow}`
        : '';
      filters.push(`drawtext=fontfile=${font}:textfile=${file}:expansion=none:fontcolor=white:fontsize=${card.headlineSize}:shadowcolor=black@0.65:shadowx=2:shadowy=2:x=${x}:y=${card.y + 38 + index * card.lineHeight}${animation}`);
    });

    const ruleY = card.y + card.h - 36;
    filters.push(`drawbox=x=${card.x + card.pad}:y=${ruleY}:w=${portrait ? 170 : 140}:h=5:color=${accent}@1:t=fill${introWindow}`);
  }

  return { filters, tempFiles: files };
}
