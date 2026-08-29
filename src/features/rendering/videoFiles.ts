/**
 * Locate a debate's finished video files on disk. Used to serve/recover videos by debate
 * name (independent of any job), so a browser refresh can still play an earlier render.
 */
import fs from 'fs';
import path from 'path';
import { publishDir, publishThumbnail, reelsPartsPath } from '@/src/shared/filesystem/paths';

/** Whether the thumbnail JPG has been rendered. */
export function hasThumbnail(name: string): boolean {
  return fs.existsSync(publishThumbnail(name));
}

/** Whether per-line audio has been generated. */
export function hasAudio(name: string): boolean {
  const dir = `output/audios/${name}`;
  return fs.existsSync(audioManifestPath(name))
    && fs.existsSync(dir)
    && fs.readdirSync(dir).some(f => f.endsWith('.mp3'));
}

export function audioManifestPath(name: string): string {
  return path.join(`output/audios/${name}`, 'manifest.json');
}

export function invalidateAudioManifest(name: string): void {
  try { fs.unlinkSync(audioManifestPath(name)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Number of duration-balanced Reels planned by the latest extraction. */
export function expectedReelCount(name: string): number {
  const file = reelsPartsPath(name);
  if (!fs.existsSync(file)) return 0;
  try {
    const parts = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    return Array.isArray(parts) ? parts.length : 0;
  } catch {
    return 0;
  }
}

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
  const expected = expectedReelCount(debateName);
  const partsFile = reelsPartsPath(debateName);
  const planUpdatedAt = fs.existsSync(partsFile) ? fs.statSync(partsFile).mtimeMs : 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort()) {
    const m = f.match(new RegExp(`^${debateName}_part(\\d+)_`));
    const fullPath = path.join(dir, f);
    if (
      m
      && (!expected || Number(m[1]) <= expected)
      && fs.statSync(fullPath).mtimeMs >= planUpdatedAt
    ) newestByPart.set(m[1], f);
  }
  return [...newestByPart.keys()].sort().map(k => path.join(dir, newestByPart.get(k)!));
}
