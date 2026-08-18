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
 * Versioned project document. It owns title, context, structured scenes, metadata, and
 * config, and can later become a database row when this grows into a SaaS.
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

/** Persistent receipt for social uploads. Used to make publish retries idempotent. */
export function publishRecordPath(name: string): string {
  const parent = parentName(name);
  return `output/publish/${parent}/${parent}.publish.json`;
}

/** Durable local state for a background job, allowing errors to survive page reloads. */
export function jobRecordPath(id: string): string {
  return `output/jobs/${id}.json`;
}

/** Cached scene plan and downloaded source images for infographic projects. */
export function visualsDir(name: string): string {
  return `output/visuals/${parentName(name)}`;
}

export function visualPlanPath(name: string): string {
  const parent = parentName(name);
  return `${visualsDir(parent)}/${parent}.visuals.json`;
}

export function visualSceneImagePath(name: string, sceneId: string): string {
  return `${visualsDir(name)}/${sceneId}.jpg`;
}

export function visualCreditsPath(name: string): string {
  const parent = parentName(name);
  return `output/publish/${parent}/${parent}.visual-credits.txt`;
}
