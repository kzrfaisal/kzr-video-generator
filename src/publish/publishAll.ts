import fs from 'fs';
import path from 'path';
import { publishDir, publishMetadata, publishRecordPath, publishThumbnail } from '../paths';
import { parseSocialMetadata } from './metadata';
import { readProjectDocument } from '../infrastructure/storage/localProjectStore';
import { uploadToYouTube } from './youtube';
import { uploadInstagramReel } from './instagram';
import { readVisualPlan } from '../visualScenes';

interface YouTubeReceipt {
  videoId: string;
  url: string;
  publishedAt: string;
}

export interface PublishRecord {
  debateName: string;
  status: 'publishing' | 'complete' | 'error';
  startedAt: string;
  updatedAt: string;
  youtube: {
    main?: YouTubeReceipt;
    shorts: Array<YouTubeReceipt & { part: number }>;
  };
  instagram?: Array<{ part: number; mediaId: string; url?: string; publishedAt: string }>;
  error?: string;
}

export type PublishTarget = 'youtube' | 'instagram' | 'all';

function newestMainVideo(debateName: string): string {
  const dir = publishDir(debateName);
  const files = fs.readdirSync(dir).filter(file =>
    file.startsWith(`${debateName}_`) && file.endsWith('.mp4') && !/_part\d+_/.test(file),
  ).sort();
  if (!files.length) throw new Error('Generate the YouTube video before publishing.');
  return path.join(dir, files[files.length - 1]);
}

function newestReels(debateName: string): Array<{ part: number; file: string }> {
  const dir = publishDir(debateName);
  const byPart = new Map<number, string>();
  for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.mp4')).sort()) {
    const match = file.match(new RegExp(`^${debateName}_part(\\d+)_`));
    if (match) byPart.set(Number(match[1]), path.join(dir, file));
  }
  const reels = [...byPart].sort(([a], [b]) => a - b).map(([part, file]) => ({ part, file }));
  if (reels.length !== 3) throw new Error('Generate all 3 reel videos before publishing.');
  return reels;
}

function readRecord(debateName: string): PublishRecord | null {
  const file = publishRecordPath(debateName);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as PublishRecord & {
      youtube?: PublishRecord['youtube'] | YouTubeReceipt;
    };
    // Migrate receipts created by the earlier main-video-only YouTube publisher.
    if (parsed.youtube && 'videoId' in parsed.youtube) {
      parsed.youtube = { main: parsed.youtube, shorts: [] };
    }
    parsed.youtube ??= { shorts: [] };
    parsed.youtube.shorts ??= [];
    parsed.instagram ??= [];
    return parsed as PublishRecord;
  }
  catch { return null; }
}

function saveRecord(record: PublishRecord) {
  record.updatedAt = new Date().toISOString();
  fs.writeFileSync(publishRecordPath(record.debateName), JSON.stringify(record, null, 2), 'utf-8');
}

function pexelsCredits(debateName: string): string {
  const sources = readVisualPlan(debateName)?.scenes.flatMap(scene => scene.source ? [scene.source] : []) ?? [];
  if (sources.length === 0) return '';
  const unique = [...new Map(sources.map(source => [source.photoId, source])).values()];
  return [
    'Visuals provided by Pexels: https://www.pexels.com',
    ...unique.map(source => `Photo by ${source.photographer}: ${source.photoUrl}`),
  ].join('\n');
}

export async function publishAll(debateName: string, target: PublishTarget = 'all'): Promise<PublishRecord> {
  const projectMetadata = readProjectDocument(debateName).metadata;
  const metadata = projectMetadata ? {
    youtubeTitle: projectMetadata.youtube.title,
    youtubeDescription: projectMetadata.youtube.description,
    hashtags: projectMetadata.youtube.hashtags.join(' '),
    reelCaptions: projectMetadata.reels.map(reel => reel.caption),
  } : parseSocialMetadata(fs.readFileSync(publishMetadata(debateName), 'utf-8'));
  const mainVideo = newestMainVideo(debateName);
  const reels = newestReels(debateName);
  const now = new Date().toISOString();
  const record = readRecord(debateName) ?? {
    debateName, status: 'publishing', startedAt: now, updatedAt: now,
    youtube: { shorts: [] },
    instagram: [],
  };
  record.status = 'publishing';
  delete record.error;
  saveRecord(record);
  const visualCredits = pexelsCredits(debateName);

  try {
    if (target === 'youtube' || target === 'all') {
      const tags = metadata.hashtags.match(/#[\p{L}\p{N}_]+/gu)?.map(tag => tag.slice(1)) ?? [];
      if (!record.youtube.main) {
        console.log('Uploading the main video to YouTube…');
        const result = await uploadToYouTube({
          videoPath: mainVideo,
          thumbnailPath: publishThumbnail(debateName),
          title: metadata.youtubeTitle,
          description: `${metadata.youtubeDescription}\n\n${metadata.hashtags}${visualCredits ? `\n\n${visualCredits}` : ''}`.trim(),
          tags,
        });
        record.youtube.main = { ...result, publishedAt: new Date().toISOString() };
        saveRecord(record);
        console.log(`YouTube: ${result.url}`);
      }

      for (const reel of reels) {
        if (record.youtube.shorts.some(item => item.part === reel.part)) continue;
        console.log(`Uploading YouTube Short ${reel.part}/3…`);
        const caption = metadata.reelCaptions[reel.part - 1];
        const firstLine = caption.split(/\r?\n/)[0].trim();
        const result = await uploadToYouTube({
          videoPath: reel.file,
          title: firstLine || `Part ${reel.part} - ${metadata.youtubeTitle}`,
          description: `${caption}${visualCredits ? '\n\nVisuals provided by Pexels: https://www.pexels.com' : ''}`,
          tags,
        });
        record.youtube.shorts.push({ part: reel.part, ...result, publishedAt: new Date().toISOString() });
        record.youtube.shorts.sort((a, b) => a.part - b.part);
        saveRecord(record);
        console.log(`YouTube Short ${reel.part}: ${result.url}`);
      }
    }

    if (target === 'instagram' || target === 'all') {
      record.instagram ??= [];
      for (const reel of reels) {
        if (record.instagram.some(item => item.part === reel.part)) continue;
        console.log(`Publishing Instagram Reel ${reel.part}/3…`);
        const caption = `${metadata.reelCaptions[reel.part - 1]}${visualCredits ? '\n\nVisuals provided by Pexels.' : ''}`;
        const result = await uploadInstagramReel(reel.file, caption);
        record.instagram.push({ part: reel.part, ...result, publishedAt: new Date().toISOString() });
        record.instagram.sort((a, b) => a.part - b.part);
        saveRecord(record);
        console.log(`Instagram Reel ${reel.part}: ${result.url || result.mediaId}`);
      }
    }

    record.status = 'complete';
    saveRecord(record);
    return record;
  } catch (error) {
    record.status = 'error';
    record.error = error instanceof Error ? error.message : String(error);
    saveRecord(record);
    throw error;
  }
}
