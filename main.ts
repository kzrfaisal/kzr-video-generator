import 'dotenv/config';
import fs from 'fs';
import { run as generateScript } from './src/generateScript';
import { run as generateAudio } from './src/generateAudio';
import { run as makeVideo } from './src/makeVideo';
import { waitForEnter } from './src/utils';
import { config } from './config';

const USD_TO_INR = 84;

function fmtDur(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = String(Math.round((ms % 60_000) / 1000)).padStart(2, '0');
  return `${m}m ${s}s`;
}

function fmtCost(usd: number): string {
  return `$${usd.toFixed(6)}  (₹${(usd * USD_TO_INR).toFixed(2)})`;
}

async function main(): Promise<void> {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx main.ts "<topic>"');
    process.exit(1);
  }

  // 1. Script — generate the debate text via OpenAI and save to output/debates/<debateName>.txt
  const scriptStart = Date.now();
  const { debateName, promptTokens, completionTokens, scriptCost } = await generateScript(topic);
  const scriptTime = Date.now() - scriptStart;

  // 2. Manual review checkpoint — pause so the user can edit the script before paying for TTS
  console.log(`\nUsing script: ${debateName}.txt`);
  await waitForEnter(`\nReview the script before continuing:\noutput/debates/${debateName}.txt\n\nPress ENTER when ready to generate video...`);

  // 3. Audio — per-line OpenAI TTS into output/audios/<debateName>/NNN_<speaker>.mp3
  const audioStart = Date.now();
  const { characters, audioCost } = await generateAudio(debateName);
  const audioTime = Date.now() - audioStart;

  // 4. Video — segments per line, optional prerendered transitions, final concat (see src/makeVideo.ts)
  const videoStart = Date.now();
  makeVideo(debateName);
  const videoTime = Date.now() - videoStart;

  const totalTime = scriptTime + audioTime + videoTime;
  const total = scriptCost + audioCost;

  const W = 50;
  const bar = '═'.repeat(W);
  const row = (s: string) => `║${s.padEnd(W)}║`;
  const div = `╠${bar}╣`;
  const gap = row('');

  const report = [
    `╔${bar}╗`,
    row('                    Run Report'),
    div,
    gap,
    row(`  Script    (${config.scriptModel})`),
    row(`    Input tokens:   ${promptTokens}`),
    row(`    Output tokens:  ${completionTokens}`),
    row(`    Cost:   ${fmtCost(scriptCost)}`),
    row(`    Time:   ${fmtDur(scriptTime)}`),
    gap,
    div,
    gap,
    row(`  Audio     (${config.ttsModel})`),
    row(`    Characters:     ${characters}`),
    row(`    Cost:   ${fmtCost(audioCost)}`),
    row(`    Time:   ${fmtDur(audioTime)}`),
    gap,
    div,
    gap,
    row('  Video'),
    row(`    Time:   ${fmtDur(videoTime)}`),
    gap,
    div,
    gap,
    row(`  Total Cost:  ${fmtCost(total)}`),
    row(`  Total Time:  ${fmtDur(totalTime)}`),
    gap,
    `╚${bar}╝`,
  ].join('\n');

  console.log('\n' + report);

  const logEntry = {
    date: new Date().toISOString(),
    debateName,
    topic,
    script: { model: config.scriptModel, promptTokens, completionTokens, cost: scriptCost, timeMs: scriptTime },
    audio: { model: config.ttsModel, characters, cost: audioCost, timeMs: audioTime },
    video: { timeMs: videoTime },
    totalCost: total,
    totalTimeMs: totalTime,
  };
  fs.appendFileSync('output/cost_log.jsonl', JSON.stringify(logEntry) + '\n', 'utf-8');
}

main().catch(err => { console.error(err.message); process.exit(1); });
