import type { ProjectMetadata } from './types';

/** Keep the creator's project title authoritative across publishing metadata. */
export function applyExactProjectTitle(metadata: ProjectMetadata, projectTitle: string): ProjectMetadata {
  const title = projectTitle.trim();
  return {
    ...metadata,
    youtube: { ...metadata.youtube, title },
    reels: metadata.reels.map(reel => {
      const lines = reel.caption.trim().split('\n');
      const bodyLines = /^Part\s+\d+\s*[-—]/i.test(lines[0] ?? '') ? lines.slice(1) : lines;
      return {
        ...reel,
        caption: [`Part ${reel.part} - ${title}`, ...bodyLines].filter(Boolean).join('\n'),
      };
    }),
  };
}

export function metadataSection(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) return '';
  const contentStart = start + marker.length;
  const nextHeading = markdown.indexOf('\n## ', contentStart);
  return markdown.slice(contentStart, nextHeading < 0 ? markdown.length : nextHeading).trim();
}

export function parseMetadataMarkdown(markdown: string): ProjectMetadata {
  const youtubeTitle = metadataSection(markdown, 'YouTube Title');
  const youtubeDescription = metadataSection(markdown, 'YouTube Description');
  const hashtagText = metadataSection(markdown, 'Hashtags');
  const thumbnailHook = metadataSection(markdown, 'Thumbnail Hook');
  const captions = [
    metadataSection(markdown, 'Reel 1 — Opening Caption') || metadataSection(markdown, 'Reel 1 — Hook Caption'),
    metadataSection(markdown, 'Reel 2 — Rebuttals Caption') || metadataSection(markdown, 'Reel 2 — Key Insight Caption'),
    metadataSection(markdown, 'Reel 3 — Closing Caption') || metadataSection(markdown, 'Reel 3 — Takeaway Caption'),
  ];

  if (!youtubeTitle || !youtubeDescription || !thumbnailHook || captions.some(caption => !caption)) {
    throw new Error('Metadata is incomplete. It needs a title, description, thumbnail hook, and three reel captions.');
  }

  return {
    youtube: {
      title: youtubeTitle,
      description: youtubeDescription,
      hashtags: hashtagText.match(/#[\p{L}\p{N}_]+/gu)?.map(tag => tag.toLowerCase()) ?? [],
    },
    reels: captions.map((caption, index) => ({
      part: (index + 1) as 1 | 2 | 3,
      caption,
    })),
    thumbnailHook,
  };
}

export function metadataToMarkdown(metadata: ProjectMetadata): string {
  const captions = new Map(metadata.reels.map(reel => [reel.part, reel.caption]));
  return [
    '## YouTube Title', metadata.youtube.title,
    '', '## YouTube Description', metadata.youtube.description,
    '', '## Hashtags', metadata.youtube.hashtags.join(' '),
    '', '## Thumbnail Hook', metadata.thumbnailHook,
    '', '## Reel 1 — Hook Caption', captions.get(1) ?? '',
    '', '## Reel 2 — Key Insight Caption', captions.get(2) ?? '',
    '', '## Reel 3 — Takeaway Caption', captions.get(3) ?? '',
    '',
  ].join('\n');
}
