export const PIPELINE_STATE_VERSION = 1 as const;

export const PIPELINE_STAGES = [
  'script',
  'metadata',
  'visuals',
  'thumbnail',
  'audio',
  'video',
  'reel-scripts',
  'reels',
  'publishing',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PipelineStageState {
  status: PipelineStageStatus;
  attempts: number;
  lastJobId?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  invalidatedAt?: string;
  error?: string;
}

export interface ProjectPipelineState {
  schemaVersion: typeof PIPELINE_STATE_VERSION;
  projectId: string;
  stages: Record<PipelineStage, PipelineStageState>;
  updatedAt: string;
}
