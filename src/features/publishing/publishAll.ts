import fs from 'fs';
import path from 'path';
import { publishDir, publishMetadata, publishRecordPath, publishThumbnail } from '@/src/shared/filesystem/paths';
import { readProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import { applyExactProjectTitle, parseMetadataMarkdown } from '@/src/domain/projects/metadata';
import { uploadInstagramReel } from './instagram';
import { readVisualPlan } from '@/src/features/visuals/visualScenes';
import { expectedReelCount, findReelVideos } from '@/src/features/rendering/videoFiles';

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

function newestReels(debateName: string, required = true): Array<{ part: number; file: string }> {
  const reels = findReelVideos(debateName).map(file => {
    const match = path.basename(file).match(new RegExp(`^${debateName}_part(\\d+)_`));
    return { part: Number(match?.[1]), file };
  }).filter(reel => Number.isInteger(reel.part));
  const expected = expectedReelCount(debateName);
  const current = expected ? reels.filter(reel => reel.part <= expected) : reels;
  if (required && (expected < 1 || current.length !== expected)) {
    throw new Error('Generate all planned Reel videos before publishing.');
  }
  return current;
}

function reelCaption(metadata: { reelCaptions: string[]; youtubeTitle: string; hashtags: string }, part: number): string {
  return metadata.reelCaptions[part - 1]?.trim()
    || `Part ${part} - ${metadata.youtubeTitle}\n\n${metadata.hashtags}`.trim();
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
  const project = readProjectDocument(debateName);
  const storedMetadata = project.metadata
    ?? parseMetadataMarkdown(fs.readFileSync(publishMetadata(debateName), 'utf-8'));
  const projectMetadata = applyExactProjectTitle(storedMetadata, project.title);
  const metadata = {
    youtubeTitle: projectMetadata.youtube.title,
    youtubeDescription: projectMetadata.youtube.description,
    hashtags: projectMetadata.youtube.hashtags.join(' '),
    reelCaptions: projectMetadata.reels.map(reel => reel.caption),
  };
  const mainVideo = newestMainVideo(debateName);
  const reelsRequired = target === 'instagram' || target === 'all' || project.config.extractReels !== false;
  const reels = newestReels(debateName, reelsRequired);
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
      // Keep the Google client (and its legacy transitive dependencies) out of an
      // Instagram-only process.
      const { uploadToYouTube } = await import('./youtube');
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
        console.log(`Uploading YouTube Short ${reel.part}/${reels.length}…`);
        const caption = reelCaption(metadata, reel.part);
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
        console.log(`Publishing Instagram Reel ${reel.part}/${reels.length}…`);
        const caption = `${reelCaption(metadata, reel.part)}${visualCredits ? '\n\nVisuals provided by Pexels.' : ''}`;
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
