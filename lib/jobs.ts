/**
 * Background jobs for the LONG pipeline stages (video, reels) that take minutes. The UI
 * starts a job, then polls GET /api/job/<id> for its stage/status. Quick stages (script,
 * metadata, extract) don't use this — they're awaited directly (see lib/stage.ts).
 *
 * Single-user, local, one job at a time. Becomes a real queue in the SaaS build.
 */
import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { jobRecordPath } from '@/src/paths';

export type JobStatus = 'running' | 'done' | 'error';
export type JobKind = 'audio' | 'video' | 'reels' | 'publish' | 'publish-youtube' | 'publish-instagram';

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

function persistJob(job: Job) {
  const file = jobRecordPath(job.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(publicJob(job), null, 2), 'utf-8');
}

/** Find a live in-memory job or recover its last durable state after a reload. */
export function getJob(id: string): Job | null {
  const live = jobs.get(id);
  if (live) return live;
  const file = jobRecordPath(id);
  if (!fs.existsSync(file)) return null;
  try {
    const recovered = JSON.parse(fs.readFileSync(file, 'utf-8')) as Job;
    if (recovered.status === 'running') {
      recovered.status = 'error';
      recovered.error = 'The app restarted while this job was running. Check generated files, then retry the step.';
      persistJob(recovered);
    }
    jobs.set(id, recovered);
    return recovered;
  } catch {
    return null;
  }
}

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
    j.error = j.error ?? 'Background process ended unexpectedly.';
    persistJob(j);
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
  let changed = false;
  for (const raw of chunk.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith('@@STAGE@@ ')) {
      job.stage = line.slice('@@STAGE@@ '.length).trim();
      changed = true;
    } else if (line.startsWith('@@REEL@@ ')) {
      job.reelPaths.push(line.slice('@@REEL@@ '.length).trim());
      changed = true;
    } else {
      job.logs.push(line);
      if (job.logs.length > 80) job.logs.shift();
      changed = true;
    }
  }
  if (changed) persistJob(job);
}

/** Spawn a pipeline subcommand as a job and fold its output into `job`. */
export function startJob(job: Job, args: string[]) {
  const child = spawn('npx', ['tsx', 'src/runPipeline.ts', ...args], { cwd: process.cwd() });
  job.child = child;
  persistJob(job);

  child.stdout.on('data', d => ingest(job, d.toString()));
  child.stderr.on('data', d => ingest(job, d.toString()));

  child.on('error', err => {
    job.status = 'error';
    job.error = `Failed to start: ${err.message}`;
    job.child = undefined;
    persistJob(job);
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
    persistJob(job);
  });
}
