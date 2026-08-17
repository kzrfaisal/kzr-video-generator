import { parseMetadataMarkdown } from '../domain/projects/metadata';

export interface SocialMetadata {
  youtubeTitle: string;
  youtubeDescription: string;
  hashtags: string;
  reelCaptions: string[];
}

export function parseSocialMetadata(markdown: string): SocialMetadata {
  const metadata = parseMetadataMarkdown(markdown);
  return {
    youtubeTitle: metadata.youtube.title,
    youtubeDescription: metadata.youtube.description,
    hashtags: metadata.youtube.hashtags.join(' '),
    reelCaptions: metadata.reels.map(reel => reel.caption),
  };
}
