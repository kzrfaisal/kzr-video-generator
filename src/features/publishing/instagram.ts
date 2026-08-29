import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { apiError, requireEnv } from './http';

function graphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || 'v24.0';
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${graphVersion()}/${path}`;
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normalize every upload to Meta's conservative Reel profile. Copying the generated
 * video stream preserved full-range yuvj420p and H.264 level 5.0; Meta's resumable
 * uploader can reject that combination with an opaque ProcessingFailedError.
 */
function prepareInstagramVideo(videoPath: string): { file: string; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kzr-instagram-'));
  const output = path.join(tempDir, 'reel.mp4');
  const result = spawnSync('ffmpeg', [
    '-y',
    '-i', videoPath,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-vf', 'scale=in_range=auto:out_range=tv,format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-profile:v', 'high',
    '-level:v', '4.2',
    '-color_range', 'tv',
    '-r', '30',
    '-fps_mode', 'cfr',
    '-g', '60',
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-flags', '+cgop',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',
    '-movflags', '+faststart',
    // Meta rejects MP4 edit lists with an opaque ProcessingFailedError.
    '-use_editlist', '0',
    '-map_metadata', '-1',
    '-f', 'mp4',
    output,
  ], { encoding: 'utf-8' });

  if (result.status !== 0 || !fs.existsSync(output)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Preparing Instagram reel failed: ${result.stderr.trim() || 'ffmpeg failed.'}`);
  }
  return {
    file: output,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

export async function uploadInstagramReel(
  videoPath: string,
  caption: string,
): Promise<{ mediaId: string; url?: string }> {
  const env = requireEnv(['INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN']);
  const prepared = prepareInstagramVideo(videoPath);
  try {
    const createParams = new URLSearchParams({
      media_type: 'REELS',
      upload_type: 'resumable',
      share_to_feed: process.env.INSTAGRAM_SHARE_TO_FEED?.trim() || 'true',
      caption: caption.slice(0, 2200),
      access_token: env.INSTAGRAM_ACCESS_TOKEN,
    });
    const create = await fetch(`${graphUrl(`${env.INSTAGRAM_USER_ID}/media`)}?${createParams}`, { method: 'POST' });
    if (!create.ok) throw await apiError(create, 'Creating Instagram reel container');
    const created = await create.json() as { id?: string; uri?: string };
    if (!created.id) throw new Error('Instagram did not return a media container ID.');

    const bytes = fs.readFileSync(prepared.file);
    const uploadUrl = created.uri || `https://rupload.facebook.com/ig-api-upload/${graphVersion()}/${created.id}`;
    const upload = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${env.INSTAGRAM_ACCESS_TOKEN}`,
        offset: '0',
        file_size: String(bytes.length),
      },
      body: bytes,
    });
    if (!upload.ok) throw await apiError(upload, 'Instagram reel upload');

    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const status = await fetch(`${graphUrl(created.id)}?fields=status_code,status&access_token=${encodeURIComponent(env.INSTAGRAM_ACCESS_TOKEN)}`);
      if (!status.ok) throw await apiError(status, 'Checking Instagram reel status');
      const data = await status.json() as { status_code?: string; status?: string };
      if (data.status_code === 'FINISHED') { ready = true; break; }
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
        throw new Error(`Instagram could not process the reel: ${data.status || data.status_code}`);
      }
      await sleep(5000);
    }
    if (!ready) throw new Error('Instagram reel processing timed out. Retry publishing to continue.');

    const publishParams = new URLSearchParams({ creation_id: created.id, access_token: env.INSTAGRAM_ACCESS_TOKEN });
    const publish = await fetch(`${graphUrl(`${env.INSTAGRAM_USER_ID}/media_publish`)}?${publishParams}`, { method: 'POST' });
    if (!publish.ok) throw await apiError(publish, 'Publishing Instagram reel');
    const result = await publish.json() as { id?: string };
    if (!result.id) throw new Error('Instagram published the reel but returned no media ID.');

    let url: string | undefined;
    const details = await fetch(`${graphUrl(result.id)}?fields=permalink&access_token=${encodeURIComponent(env.INSTAGRAM_ACCESS_TOKEN)}`);
    if (details.ok) url = ((await details.json()) as { permalink?: string }).permalink;
    return { mediaId: result.id, url };
  } finally {
    prepared.cleanup();
  }
}
