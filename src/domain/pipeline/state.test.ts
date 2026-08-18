import assert from 'node:assert/strict';
import test from 'node:test';
import { completeStage, createPipelineState, failStage, invalidateStages, startStage } from './state';

test('tracks retries and clears an earlier failure after completion', () => {
  let state = createPipelineState('debate1', '2026-01-01T00:00:00.000Z');
  state = startStage(state, 'video', { jobId: 'job-1', now: '2026-01-01T00:01:00.000Z' });
  state = failStage(state, 'video', 'ffmpeg failed', '2026-01-01T00:02:00.000Z');
  state = startStage(state, 'video', { jobId: 'job-2', now: '2026-01-01T00:03:00.000Z' });
  state = completeStage(state, 'video', '2026-01-01T00:04:00.000Z');

  assert.equal(state.stages.video.status, 'completed');
  assert.equal(state.stages.video.attempts, 2);
  assert.equal(state.stages.video.lastJobId, 'job-2');
  assert.equal(state.stages.video.error, undefined);
});

test('invalidates downstream output without losing attempt history', () => {
  let state = createPipelineState('debate1');
  state = startStage(state, 'audio');
  state = completeStage(state, 'audio');
  state = invalidateStages(state, ['audio', 'video'], 'Script changed', '2026-01-02T00:00:00.000Z');

  assert.equal(state.stages.audio.status, 'pending');
  assert.equal(state.stages.audio.attempts, 1);
  assert.equal(state.stages.audio.error, 'Script changed');
  assert.equal(state.stages.video.status, 'pending');
});
