/**
 * In-memory registry of pipeline runs.
 *
 * HTTP is stateless, but a video render spans minutes and many polling requests, so the
 * server keeps each run's live state here. This is deliberately simple: single-user, local,
 * one run at a time. (A real multi-user SaaS would put this in a database + job queue.)
 */
import type { ChildProcess } from 'child_process';

export type RunStatus = 'running' | 'done' | 'error';
export type Stage = 'starting' | 'script' | 'thumbnail' | 'audio' | 'video' | 'reels' | 'done';

export interface RunState {
  id: string;
  topic: string;
  status: RunStatus;
  stage: Stage;
  logs: string[];            // recent stdout/stderr lines, for display
  debateName?: string;
  videoPath?: string;        // main video path on disk; served via the video route
  thumbnailPath?: string;
  reelPaths: string[];       // the 3 reel video paths, once built
  error?: string;
  createdAt: number;
  child?: ChildProcess;      // the running pipeline process (omitted from API responses)
}

// Survive dev hot-reload by stashing the Map on globalThis.
const g = globalThis as unknown as { __runs?: Map<string, RunState> };
export const runs: Map<string, RunState> = g.__runs ?? (g.__runs = new Map());

/** True while any run is still executing — we allow only one at a time. */
export function hasActiveRun(): boolean {
  for (const r of runs.values()) if (r.status === 'running') return true;
  return false;
}

/** The shape we send to the browser (drops the non-serializable child process). */
export function publicView(r: RunState) {
  const { child, videoPath, thumbnailPath, reelPaths, ...rest } = r;
  return {
    ...rest,
    hasVideo: Boolean(videoPath && r.status === 'done'),
    hasThumbnail: Boolean(thumbnailPath),
    reelCount: reelPaths.length,   // the browser plays reels by index via ?reel=<n>
  };
}
