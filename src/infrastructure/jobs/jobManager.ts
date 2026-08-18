/**
 * Durable local background jobs for long pipeline stages. Each attempt is persisted
 * atomically and also updates the project's stage state, so failures can be retried
 * without losing completed outputs from other stages.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import type { PipelineStage } from '@/src/domain/pipeline/types';
import {
  invalidateProjectStages,
  markStageCompleted,
  markStageFailed,
  markStageRunning,
} from '@/src/infrastructure/storage/localPipelineStore';
import { readJsonFile, writeJsonAtomic } from '@/src/infrastructure/storage/atomicJsonFile';
import { jobRecordPath } from '@/src/shared/filesystem/paths';

export type JobStatus = 'running' | 'done' | 'error';
export type JobKind = 'visuals' | 'audio' | 'video' | 'reels' | 'publish' | 'publish-youtube' | 'publish-instagram';

export interface Job {
  id: string;
  debateName: string;
  kind: JobKind;
  pipelineStage: PipelineStage;
  status: JobStatus;
  stage: string;
  attempt: number;
  logs: string[];
  reelPaths: string[];
  error?: string;
  exitCode?: number | null;
  pid?: number;
  createdAt: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  child?: ChildProcess;
  _stdoutBuffer?: string;
  _stderrBuffer?: string;
}

const globalJobs = globalThis as unknown as { __jobs?: Map<string, Job>; __jobsRecovered?: boolean };
export const jobs: Map<string, Job> = globalJobs.__jobs ?? (globalJobs.__jobs = new Map());

function pipelineStageForKind(kind: JobKind): PipelineStage {
  if (kind.startsWith('publish')) return 'publishing';
  return kind as 'visuals' | 'audio' | 'video' | 'reels';
}

/** Create, register, and durably mark a new attempt before its process starts. */
export function createJob(input: { debateName: string; kind: JobKind; stage?: string }): Job {
  ensureRecovered();
  const id = randomUUID();
  const pipelineStage = pipelineStageForKind(input.kind);
  const downstream: Partial<Record<PipelineStage, PipelineStage[]>> = {
    visuals: ['video', 'reels', 'publishing'],
    audio: ['video', 'reels', 'publishing'],
    video: ['publishing'],
    reels: ['publishing'],
  };
  if (downstream[pipelineStage]) {
    invalidateProjectStages(input.debateName, downstream[pipelineStage]!, `${pipelineStage} is being regenerated.`);
  }
  const pipeline = markStageRunning(input.debateName, pipelineStage, id);
  const now = Date.now();
  const job: Job = {
    id,
    debateName: input.debateName,
    kind: input.kind,
    pipelineStage,
    status: 'running',
    stage: input.stage ?? pipelineStage,
    attempt: pipeline.stages[pipelineStage].attempts,
    logs: [],
    reelPaths: [],
    createdAt: now,
    startedAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  persistJob(job);
  return job;
}

function persistJob(job: Job): void {
  writeJsonAtomic(jobRecordPath(job.id), publicJob(job));
}

function normalizeStoredJob(value: unknown): Job | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Job>;
  if (!raw.id || !raw.debateName || !raw.kind || !raw.status) return null;
  const now = Date.now();
  return {
    id: raw.id,
    debateName: raw.debateName,
    kind: raw.kind,
    pipelineStage: raw.pipelineStage ?? pipelineStageForKind(raw.kind),
    status: raw.status,
    stage: raw.stage ?? raw.kind,
    attempt: raw.attempt ?? 1,
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    reelPaths: Array.isArray(raw.reelPaths) ? raw.reelPaths : [],
    error: raw.error,
    exitCode: raw.exitCode,
    pid: raw.pid,
    createdAt: raw.createdAt ?? now,
    startedAt: raw.startedAt ?? raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
    finishedAt: raw.finishedAt,
  };
}

function failJob(job: Job, error: string, exitCode: number | null = null): void {
  if (job.status === 'error') return;
  job.status = 'error';
  job.error = error;
  job.exitCode = exitCode;
  job.stage = job.pipelineStage;
  job.child = undefined;
  job.pid = undefined;
  job.updatedAt = Date.now();
  job.finishedAt = job.updatedAt;
  markStageFailed(job.debateName, job.pipelineStage, error);
  persistJob(job);
}

function completeJob(job: Job, exitCode: number): void {
  job.status = 'done';
  job.stage = 'done';
  job.exitCode = exitCode;
  job.child = undefined;
  job.pid = undefined;
  job.updatedAt = Date.now();
  job.finishedAt = job.updatedAt;
  markStageCompleted(job.debateName, job.pipelineStage);
  persistJob(job);
}

function recoverInterrupted(job: Job): Job {
  if (job.status !== 'running') return job;
  failJob(job, 'The app restarted during this attempt. Existing outputs were kept; retry this stage to resume.');
  return job;
}

function recoverPersistedJobs(): void {
  const dir = path.dirname(jobRecordPath('placeholder'));
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
    try {
      const job = normalizeStoredJob(readJsonFile<unknown>(path.join(dir, file)));
      if (!job) continue;
      jobs.set(job.id, recoverInterrupted(job));
    } catch {
      // A corrupt historical job must not prevent the app from starting.
    }
  }
}

function ensureRecovered(): void {
  if (globalJobs.__jobsRecovered) return;
  globalJobs.__jobsRecovered = true;
  recoverPersistedJobs();
}

/** Find a live in-memory job or recover its last durable state after a reload. */
export function getJob(id: string): Job | null {
  ensureRecovered();
  const live = jobs.get(id);
  if (live) return live;
  const file = jobRecordPath(id);
  if (!fs.existsSync(file)) return null;
  try {
    const recovered = normalizeStoredJob(readJsonFile<unknown>(file));
    if (!recovered) return null;
    jobs.set(id, recoverInterrupted(recovered));
    return jobs.get(id) ?? null;
  } catch {
    return null;
  }
}

function processAlive(job: Job): boolean {
  const child = job.child;
  if (!child || child.exitCode !== null || child.killed || !child.pid) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The running job, or null. Stale in-memory attempts are failed automatically. */
export function activeJob(): Job | null {
  ensureRecovered();
  for (const job of jobs.values()) {
    if (job.status !== 'running') continue;
    if (processAlive(job)) return job;
    failJob(job, 'The background process ended unexpectedly. Existing outputs were kept; retry this stage.');
  }
  return null;
}

export function hasActiveJob(): boolean {
  return activeJob() !== null;
}

/** Browser-facing view with process handles and parser buffers removed. */
export function publicJob(job: Job) {
  const { child, _stdoutBuffer, _stderrBuffer, pid, ...rest } = job;
  return rest;
}

function ingestLine(job: Job, line: string): void {
  const normalized = line.trimEnd();
  if (!normalized) return;
  if (normalized.startsWith('@@STAGE@@ ')) {
    job.stage = normalized.slice('@@STAGE@@ '.length).trim();
  } else if (normalized.startsWith('@@REEL@@ ')) {
    const reel = normalized.slice('@@REEL@@ '.length).trim();
    if (!job.reelPaths.includes(reel)) job.reelPaths.push(reel);
  } else {
    job.logs.push(normalized);
    if (job.logs.length > 200) job.logs.splice(0, job.logs.length - 200);
  }
  job.updatedAt = Date.now();
}

function ingest(job: Job, channel: 'stdout' | 'stderr', chunk: string, flush = false): void {
  const bufferKey = channel === 'stdout' ? '_stdoutBuffer' : '_stderrBuffer';
  const combined = (job[bufferKey] ?? '') + chunk;
  const lines = combined.split(/\r?\n/);
  const remainder = lines.pop() ?? '';
  job[bufferKey] = flush ? '' : remainder;
  for (const line of lines) ingestLine(job, line);
  if (flush && remainder) ingestLine(job, remainder);
  persistJob(job);
}

/** Spawn one pipeline stage and fold its output into the durable job attempt. */
export function startJob(job: Job, args: string[]): void {
  const child = spawn('npx', ['tsx', 'src/features/pipeline/runPipeline.ts', ...args], { cwd: process.cwd() });
  job.child = child;
  job.pid = child.pid;
  job.updatedAt = Date.now();
  persistJob(job);

  child.stdout.on('data', data => ingest(job, 'stdout', data.toString()));
  child.stderr.on('data', data => ingest(job, 'stderr', data.toString()));

  child.on('error', error => {
    ingest(job, 'stdout', '', true);
    ingest(job, 'stderr', '', true);
    failJob(job, `Failed to start: ${error.message}`);
  });

  child.on('close', code => {
    ingest(job, 'stdout', '', true);
    ingest(job, 'stderr', '', true);
    if (job.status === 'error') return;
    if (code === 0) {
      completeJob(job, code);
      return;
    }
    const tail = job.logs.slice(-3).join(' ').trim();
    failJob(job, tail || `Exited with code ${code}.`, code);
  });
}
