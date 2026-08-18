import fs from 'fs';
import {
  completeStage,
  createPipelineState,
  failStage,
  invalidateStages,
  startStage,
} from '@/src/domain/pipeline/state';
import {
  PIPELINE_STAGES,
  type PipelineStage,
  type ProjectPipelineState,
} from '@/src/domain/pipeline/types';
import { pipelineStatePath } from '@/src/shared/filesystem/paths';
import { readJsonFile, writeJsonAtomic } from './atomicJsonFile';

function isPipelineState(value: unknown): value is ProjectPipelineState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProjectPipelineState>;
  return typeof candidate.projectId === 'string'
    && !!candidate.stages
    && PIPELINE_STAGES.every(stage => !!candidate.stages?.[stage]);
}

export function readPipelineState(projectId: string): ProjectPipelineState {
  const file = pipelineStatePath(projectId);
  if (!fs.existsSync(file)) return createPipelineState(projectId);
  try {
    const state = readJsonFile<unknown>(file);
    return isPipelineState(state) ? state : createPipelineState(projectId);
  } catch {
    return createPipelineState(projectId);
  }
}

export function savePipelineState(state: ProjectPipelineState): ProjectPipelineState {
  writeJsonAtomic(pipelineStatePath(state.projectId), state);
  return state;
}

export function markStageRunning(projectId: string, stage: PipelineStage, jobId?: string): ProjectPipelineState {
  return savePipelineState(startStage(readPipelineState(projectId), stage, { jobId }));
}

export function markStageCompleted(projectId: string, stage: PipelineStage): ProjectPipelineState {
  return savePipelineState(completeStage(readPipelineState(projectId), stage));
}

export function markStageFailed(projectId: string, stage: PipelineStage, error: string): ProjectPipelineState {
  return savePipelineState(failStage(readPipelineState(projectId), stage, error));
}

export function invalidateProjectStages(
  projectId: string,
  stages: PipelineStage[],
  reason: string,
): ProjectPipelineState {
  return savePipelineState(invalidateStages(readPipelineState(projectId), stages, reason));
}
