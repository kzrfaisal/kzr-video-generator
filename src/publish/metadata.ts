export interface SocialMetadata {
  youtubeTitle: string;
  youtubeDescription: string;
  hashtags: string;
  reelCaptions: string[];
}

function section(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) return '';
  const contentStart = start + marker.length;
  const nextHeading = markdown.indexOf('\n## ', contentStart);
  return markdown.slice(contentStart, nextHeading < 0 ? markdown.length : nextHeading).trim();
}

export function parseSocialMetadata(markdown: string): SocialMetadata {
  const youtubeTitle = section(markdown, 'YouTube Title');
  const youtubeDescription = section(markdown, 'YouTube Description');
  const hashtags = section(markdown, 'Hashtags');
  const reelCaptions = [
    section(markdown, 'Reel 1 — Opening Caption'),
    section(markdown, 'Reel 2 — Rebuttals Caption'),
    section(markdown, 'Reel 3 — Closing Caption'),
  ];

  if (!youtubeTitle || !youtubeDescription || reelCaptions.some(caption => !caption)) {
    throw new Error('Metadata is incomplete. Regenerate it before publishing.');
  }

  return { youtubeTitle, youtubeDescription, hashtags, reelCaptions };
}
