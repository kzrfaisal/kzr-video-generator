/**
 * Background jobs for the LONG pipeline stages (video, reels) that take minutes. The UI
 * starts a job, then polls GET /api/job/<id> for its stage/status. Quick stages (script,
 * metadata, extract) don't use this — they're awaited directly (see lib/stage.ts).
 *
 * Single-user, local, one job at a time. Becomes a real queue in the SaaS build.
 */
import { spawn, type ChildProcess } from 'child_process';

export type JobStatus = 'running' | 'done' | 'error';
export type JobKind = 'audio' | 'video' | 'reels';

export interface Job {
  id: string;
  debateName: string;
  kind: JobKind;
  status: JobStatus;
  stage: string;
  logs: string[];
  reelPaths: string[];
  error?: string;
  createdAt: number;
  child?: ChildProcess;
}

const g = globalThis as unknown as { __jobs?: Map<string, Job> };
export const jobs: Map<string, Job> = g.__jobs ?? (g.__jobs = new Map());

/** Whether a job's child process actually still exists in the OS (not just per Node's view). */
function processAlive(j: Job): boolean {
  const c = j.child;
  if (!c || c.exitCode !== null || c.killed || !c.pid) return false;
  try {
    process.kill(c.pid, 0); // signal 0 = existence probe; throws ESRCH if the process is gone
    return true;
  } catch {
    return false;
  }
}

/** The running job, or null. Self-heals: a 'running' job whose process is gone is stale. */
export function activeJob(): Job | null {
  for (const j of jobs.values()) {
    if (j.status !== 'running') continue;
    if (processAlive(j)) return j;
    // Process ended without a close event (e.g. server reload / orphaned) — unblock it.
    j.status = 'error';
    j.error = j.error ?? 'Render process ended unexpectedly.';
  }
  return null;
}

export function hasActiveJob(): boolean {
  return activeJob() !== null;
}

/** Browser-facing view (drops the child process). */
export function publicJob(j: Job) {
  const { child, ...rest } = j;
  return rest;
}

function ingest(job: Job, chunk: string) {
  for (const raw of chunk.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith('@@STAGE@@ ')) {
      job.stage = line.slice('@@STAGE@@ '.length).trim();
    } else if (line.startsWith('@@REEL@@ ')) {
      job.reelPaths.push(line.slice('@@REEL@@ '.length).trim());
    } else {
      job.logs.push(line);
      if (job.logs.length > 80) job.logs.shift();
    }
  }
}

/** Spawn a pipeline subcommand as a job and fold its output into `job`. */
export function startJob(job: Job, args: string[]) {
  const child = spawn('npx', ['tsx', 'src/runPipeline.ts', ...args], { cwd: process.cwd() });
  job.child = child;

  child.stdout.on('data', d => ingest(job, d.toString()));
  child.stderr.on('data', d => ingest(job, d.toString()));

  child.on('error', err => {
    job.status = 'error';
    job.error = `Failed to start: ${err.message}`;
    job.child = undefined;
  });

  child.on('close', code => {
    job.child = undefined;
    if (job.status === 'error') return;
    if (code === 0) {
      job.status = 'done';
      job.stage = 'done';
    } else {
      job.status = 'error';
      // Surface the tail of the output so the real cause (e.g. an API error) reaches the UI.
      const tail = job.logs.slice(-3).join(' ').trim();
      job.error = job.error ?? (tail || `Exited with code ${code}.`);
    }
  });
}
