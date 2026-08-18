import {
  PIPELINE_STAGES,
  PIPELINE_STATE_VERSION,
  type PipelineStage,
  type PipelineStageState,
  type ProjectPipelineState,
} from './types';

function pendingStage(): PipelineStageState {
  return { status: 'pending', attempts: 0 };
}

export function createPipelineState(projectId: string, now = new Date().toISOString()): ProjectPipelineState {
  return {
    schemaVersion: PIPELINE_STATE_VERSION,
    projectId,
    stages: Object.fromEntries(PIPELINE_STAGES.map(stage => [stage, pendingStage()])) as Record<PipelineStage, PipelineStageState>,
    updatedAt: now,
  };
}

export function startStage(
  state: ProjectPipelineState,
  stage: PipelineStage,
  options: { jobId?: string; now?: string } = {},
): ProjectPipelineState {
  const now = options.now ?? new Date().toISOString();
  const previous = state.stages[stage];
  return {
    ...state,
    updatedAt: now,
    stages: {
      ...state.stages,
      [stage]: {
        status: 'running',
        attempts: previous.attempts + 1,
        ...(options.jobId ? { lastJobId: options.jobId } : {}),
        startedAt: now,
      },
    },
  };
}

export function completeStage(
  state: ProjectPipelineState,
  stage: PipelineStage,
  now = new Date().toISOString(),
): ProjectPipelineState {
  const previous = state.stages[stage];
  return {
    ...state,
    updatedAt: now,
    stages: {
      ...state.stages,
      [stage]: {
        ...previous,
        status: 'completed',
        completedAt: now,
        failedAt: undefined,
        invalidatedAt: undefined,
        error: undefined,
      },
    },
  };
}

export function failStage(
  state: ProjectPipelineState,
  stage: PipelineStage,
  error: string,
  now = new Date().toISOString(),
): ProjectPipelineState {
  const previous = state.stages[stage];
  return {
    ...state,
    updatedAt: now,
    stages: {
      ...state.stages,
      [stage]: {
        ...previous,
        status: 'failed',
        failedAt: now,
        completedAt: undefined,
        error,
      },
    },
  };
}

export function invalidateStages(
  state: ProjectPipelineState,
  stages: PipelineStage[],
  reason: string,
  now = new Date().toISOString(),
): ProjectPipelineState {
  const nextStages = { ...state.stages };
  for (const stage of stages) {
    const previous = nextStages[stage];
    nextStages[stage] = {
      status: 'pending',
      attempts: previous.attempts,
      lastJobId: previous.lastJobId,
      invalidatedAt: now,
      error: reason,
    };
  }
  return { ...state, stages: nextStages, updatedAt: now };
}
