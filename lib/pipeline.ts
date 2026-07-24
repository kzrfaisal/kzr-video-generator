/**
 * Spawns `src/runPipeline.ts` in one of its phases and folds the process output back
 * into the run's live state. Shared by the start route (script/full) and the approve
 * route (render), so the stdout-marker parsing lives in one place.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import type { RunState, Stage } from './runs';
import { scriptPath, publishMetadata } from '@/src/paths';

export type Phase = 'script' | 'render' | 'full';

/** Parse the pipeline's `@@…@@` stdout markers and plain log lines into the run's state. */
function ingest(state: RunState, chunk: string) {
  for (const raw of chunk.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;

    if (line.startsWith('@@STAGE@@ ')) {
      state.stage = line.slice('@@STAGE@@ '.length).trim() as Stage;
    } else if (line.startsWith('@@DEBATE@@ ')) {
      state.debateName = line.slice('@@DEBATE@@ '.length).trim();
    } else if (line.startsWith('@@THUMB@@ ')) {
      state.thumbnailPath = line.slice('@@THUMB@@ '.length).trim();
    } else if (line.startsWith('@@RESULT@@ ')) {
      state.videoPath = line.slice('@@RESULT@@ '.length).trim();
    } else if (line.startsWith('@@REEL@@ ')) {
      state.reelPaths.push(line.slice('@@REEL@@ '.length).trim());
    } else {
      state.logs.push(line);
      if (state.logs.length > 80) state.logs.shift(); // keep only the tail
    }
  }
}

/** After the script phase, load the draft files so the browser can show/edit them. */
function loadDraft(state: RunState) {
  if (!state.debateName) throw new Error('Script phase produced no debate name.');
  state.scriptText = fs.readFileSync(scriptPath(state.debateName), 'utf-8');
  const md = publishMetadata(state.debateName);
  state.metadataText = fs.existsSync(md) ? fs.readFileSync(md, 'utf-8') : '';
}

/** Spawn a pipeline phase and wire its lifecycle into `state`. */
export function runPhase(state: RunState, phase: Phase, args: string[]) {
  state.phase = phase;
  const child = spawn('npx', ['tsx', 'src/runPipeline.ts', ...args], { cwd: process.cwd() });
  state.child = child;

  child.stdout.on('data', d => ingest(state, d.toString()));
  child.stderr.on('data', d => ingest(state, d.toString()));

  child.on('error', err => {
    state.status = 'error';
    state.error = `Failed to start pipeline: ${err.message}`;
    state.child = undefined;
  });

  child.on('close', code => {
    state.child = undefined;
    if (state.status === 'error') return;

    if (code !== 0) {
      state.status = 'error';
      state.error = state.error ?? `Pipeline exited with code ${code}.`;
      return;
    }

    if (phase === 'script') {
      // Park the run for review, exposing the draft script + metadata for editing.
      try {
        loadDraft(state);
        state.status = 'awaiting_review';
      } catch (err) {
        state.status = 'error';
        state.error = `Could not read draft: ${(err as Error).message}`;
      }
    } else if (state.videoPath) {
      state.status = 'done';
      state.stage = 'done';
    } else {
      state.status = 'error';
      state.error = state.error ?? 'Render finished but produced no video.';
    }
  });
}
