import fs from 'fs';
import path from 'path';

/** Write JSON through a sibling temporary file so a crash cannot leave partial JSON. */
export function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf-8');
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function readJsonFile<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}
