/**
 * Locate a debate's finished video files on disk. Used to serve/recover videos by debate
 * name (independent of any job), so a browser refresh can still play an earlier render.
 */
import fs from 'fs';
import path from 'path';
import { publishDir } from '@/src/paths';

/** Newest main (landscape) video, or null if none rendered yet. */
export function findMainVideo(debateName: string): string | null {
  const dir = publishDir(debateName);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(`${debateName}_`) && f.endsWith('.mp4') && !/_part\d+_/.test(f))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

/** Newest reel video per part, in order (part1, part2, part3). */
export function findReelVideos(debateName: string): string[] {
  const dir = publishDir(debateName);
  if (!fs.existsSync(dir)) return [];
  const newestByPart = new Map<string, string>();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort()) {
    const m = f.match(new RegExp(`^${debateName}_part(\\d+)_`));
    if (m) newestByPart.set(m[1], f);
  }
  return [...newestByPart.keys()].sort().map(k => path.join(dir, newestByPart.get(k)!));
}
