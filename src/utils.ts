import fs from 'fs';

export interface DebateLine {
  speaker: string;
  text: string;
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function formatTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function wrapText(text: string, width = 72): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

// Escape text for ffmpeg drawtext filter.
// Order matters: backslash must be escaped first to avoid double-escaping.
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function sanitizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02BC]/g, "'")  // curly apostrophes / modifier letter apostrophe → straight
    .replace(/[\u201C\u201D]/g, '"')         // curly double quotes → straight
    .replace(/\u2013/g, '-')                 // en dash → hyphen
    .replace(/\u2014/g, '-');                // em dash → hyphen
}

// Parse a debate .txt file into DebateLine[].
// Validates every non-empty line matches SPEAKER|text format.
export function parseDebateFile(filePath: string): DebateLine[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const result: DebateLine[] = [];

  for (const line of lines) {
    const match = line.match(/^(HOST|A|B)\|(.+)$/);
    if (!match) {
      throw new Error(`Invalid line in debate file: "${line}"`);
    }
    result.push({ speaker: match[1], text: sanitizeText(match[2].trim()) });
  }

  return result;
}