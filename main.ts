import 'dotenv/config';
import fs from 'fs';
import { run as generateScript } from './src/generateScript';
import { run as generateAudio } from './src/generateAudio';
import { run as makeVideo } from './src/makeVideo';
import { generateThumbnail } from './src/generateThumbnail';
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

export async function run(topic: string): Promise<{ debateName: string }> {
  // 1. Script — generate the debate text via OpenAI and save to output/debates/<debateName>.txt
  //    Also produces <debateName>.metadata.md when config.generateMetadata is true.
  const scriptStart = Date.now();
  const { debateName, promptTokens, completionTokens, scriptCost, metadata } = await generateScript(topic);
  const scriptTime = Date.now() - scriptStart;

  // 2. Manual review checkpoint — pause so the user can edit the script + metadata
  //    (including the `## Thumbnail Hook` line) before paying for TTS or rendering the thumbnail.
  console.log(`\nUsing script: ${debateName}.txt`);
  await waitForEnter(`\nReview before continuing:\n  output/debates/${debateName}.txt\n  output/debates/${debateName}.metadata.md  (edit '## Thumbnail Hook' here to change the thumbnail text)\n\nPress ENTER when ready to generate video...`);

  // 3. Thumbnail — render JPG using the (possibly edited) hook from metadata.md.
  //    Non-fatal: if config.generateThumbnail is off or rendering fails, the run continues.
  if (config.generateThumbnail) {
    try {
      generateThumbnail(debateName);
    } catch (err: any) {
      console.warn(`Thumbnail generation failed (non-fatal): ${err.message}`);
    }
  }

  // 4. Audio — per-line OpenAI TTS into output/audios/<debateName>/NNN_<speaker>.mp3
  const audioStart = Date.now();
  const { characters, audioCost } = await generateAudio(debateName);
  const audioTime = Date.now() - audioStart;

  // 5. Video — segments per line, optional prerendered transitions, final concat (see src/makeVideo.ts)
  const videoStart = Date.now();
  makeVideo(debateName);
  const videoTime = Date.now() - videoStart;

  const totalTime = scriptTime + audioTime + videoTime;
  const total = scriptCost + metadata.cost + audioCost;

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
    ...(metadata.cost > 0 ? [
      gap,
      row(`  Metadata  (${config.scriptModel})`),
      row(`    Input tokens:   ${metadata.promptTokens}`),
      row(`    Output tokens:  ${metadata.completionTokens}`),
      row(`    Cost:   ${fmtCost(metadata.cost)}`),
    ] : []),
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
    metadata: { model: config.scriptModel, promptTokens: metadata.promptTokens, completionTokens: metadata.completionTokens, cost: metadata.cost },
    audio: { model: config.ttsModel, characters, cost: audioCost, timeMs: audioTime },
    video: { timeMs: videoTime },
    totalCost: total,
    totalTimeMs: totalTime,
  };
  fs.appendFileSync('output/cost_log.jsonl', JSON.stringify(logEntry) + '\n', 'utf-8');

  return { debateName };
}

if (require.main === module) {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: tsx main.ts "<topic>"');
    process.exit(1);
  }
  run(topic).catch(err => { console.error(err.message); process.exit(1); });
}
