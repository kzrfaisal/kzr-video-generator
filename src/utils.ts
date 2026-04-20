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
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

// Parse a debate .txt file into DebateLine[].
// Validates every non-empty line matches SPEAKER|text format.
export function parseDebateFile(filePath: string): DebateLine[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result: DebateLine[] = [];

  for (const line of lines) {
    const match = line.match(/^(HOST|A|B)\|(.+)$/);
    if (!match) {
      throw new Error(`Invalid line in debate file: "${line}"`);
    }
    result.push({ speaker: match[1], text: match[2].trim() });
  }

  return result;
}