/**
 * Central location for the per-debate "publish" bundle — the folder that gathers a
 * debate's shareable deliverables (metadata, thumbnail, final video, and any reel videos).
 *
 * A debate name can arrive in three forms; all resolve to the same parent folder so a
 * debate and its reels share one bundle:
 *   "debate11"              → parent "debate11"
 *   "debate11_part1"        → parent "debate11"
 *   "reels/debate11_part1"  → parent "debate11"
 */

/** The parent debate name: strip any leading dir and a trailing `_partN` suffix. */
function parentName(name: string): string {
  const base = name.split('/').pop() ?? name;
  return base.replace(/_part\d+$/, '');
}

/** The debate's script file (working file, kept in output/debates). */
export function scriptPath(name: string): string {
  return `output/debates/${name}.txt`;
}

/**
 * Per-debate project record (topic + context, and later config choices). This small
 * sidecar is the app's source of truth for a debate beyond its raw files — it becomes a
 * database row when this grows into a SaaS.
 */
export function projectPath(name: string): string {
  return `output/debates/${name}.project.json`;
}

/** A reel part's script file, e.g. output/debates/reels/debate11_part1.txt. */
export function reelPartScriptPath(name: string, part: number): string {
  return `output/debates/reels/${name}_part${part}.txt`;
}

/** Sidecar holding the extracted reel parts' metadata (line-index → audio mapping). */
export function reelsPartsPath(name: string): string {
  return `output/debates/reels/${name}.parts.json`;
}

/** Folder holding a debate's publishable deliverables, e.g. `output/publish/debate11`. */
export function publishDir(name: string): string {
  return `output/publish/${parentName(name)}`;
}

/** Path to the debate's metadata file inside the publish folder. */
export function publishMetadata(name: string): string {
  const parent = parentName(name);
  return `output/publish/${parent}/${parent}.metadata.md`;
}

/** Path to the debate's thumbnail inside the publish folder. */
export function publishThumbnail(name: string): string {
  const parent = parentName(name);
  return `output/publish/${parent}/${parent}.thumbnail.jpg`;
}
