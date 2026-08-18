import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { scenesToDialogue } from '@/src/domain/projects/script';
import { readProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import { projectPath } from '@/src/shared/filesystem/paths';

export interface DebateLine { speaker: string; text: string; }

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Read `--context=<text>` (or `--context <text>`) from CLI args / npm env var,
 * so any entry point can pass extra framing/angle without editing prompts.
 * Same pattern as parseStyleFlag in config.ts.
 */
export function parseContextFlag(): string | undefined {
  if (process.env.npm_config_context) return process.env.npm_config_context;
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context' && args[i + 1]) return args[i + 1];
    const m = args[i].match(/^--context=(.+)$/);
    if (m) return m[1];
  }
  return undefined;
}

export function cleanTmp(): void {
  fs.rmSync('tmp', { recursive: true, force: true });
  fs.mkdirSync('tmp');
}

/**
 * Retry a promise-returning call on transient failures (rate limits, 5xx, network) with
 * exponential backoff. OpenAI occasionally returns 500s; one blip shouldn't fail a stage.
 */
export async function withRetry<T>(fn: () => Promise<T>, label = 'request', maxAttempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.status;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt >= maxAttempts) throw err;
      const waitMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      console.warn(`${label} attempt ${attempt}/${maxAttempts} failed (${err.message}); retrying in ${waitMs}ms…`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

export function waitForEnter(message: string): Promise<void> {
  // No interactive terminal (e.g. spawned by the web UI) — nothing can press ENTER,
  // so continue immediately instead of hanging forever.
  if (!process.stdin.isTTY) {
    console.log(message + '\n[non-interactive: continuing automatically]');
    return Promise.resolve();
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(message, () => { rl.close(); resolve(); }));
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
  const normalized = path.normalize(filePath);
  const parent = path.basename(path.dirname(normalized));
  const name = path.basename(normalized, path.extname(normalized));
  if (parent === 'debates' && fs.existsSync(projectPath(name))) {
    return scenesToDialogue(readProjectDocument(name).scenes);
  }

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
