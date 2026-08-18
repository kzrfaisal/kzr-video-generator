/**
 * Runs a short pipeline subcommand (script, metadata) to completion and
 * returns its result. Used for the quick stages that finish in seconds, so the API can
 * just await them — no background-job tracking needed (that's reserved for the long
 * audio/video stages in a later slice).
 */
import { spawn } from 'child_process';

export interface StageResult {
  ok: boolean;
  code: number | null;
  markers: Record<string, string>; // parsed @@KEY@@ value lines, e.g. { DEBATE: 'debate5' }
  output: string;                  // full combined stdout+stderr, for error messages
}

export function runStage(args: string[]): Promise<StageResult> {
  return new Promise(resolve => {
    const child = spawn('npx', ['tsx', 'src/features/pipeline/runPipeline.ts', ...args], { cwd: process.cwd() });
    let output = '';
    const markers: Record<string, string> = {};

    const onData = (d: Buffer) => {
      const s = d.toString();
      output += s;
      for (const line of s.split('\n')) {
        const m = line.match(/^@@(\w+)@@ ?(.*)$/);
        if (m) markers[m[1]] = m[2].trim();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', err => resolve({ ok: false, code: null, markers, output: `${output}\n${err.message}` }));
    child.on('close', code => resolve({ ok: code === 0, code, markers, output }));
  });
}

/** Debate names are `debate<N>` — validate before touching the filesystem. */
export function isValidDebateName(name: string): boolean {
  return /^debate\d+$/.test(name);
}
