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
  const reelHeadings = [...markdown.matchAll(/^## Reel (\d+) — .*Caption\s*$/gm)]
    .map(match => ({ part: Number(match[1]), heading: match[0].slice(3) }))
    .sort((a, b) => a.part - b.part);
  const captions = reelHeadings.map(({ part, heading }) => ({ part, caption: metadataSection(markdown, heading) }));

  if (!youtubeTitle || !youtubeDescription || !thumbnailHook || !captions.length || captions.some(item => !item.caption)) {
    throw new Error('Metadata is incomplete. It needs a title, description, thumbnail hook, and Reel captions.');
  }

  return {
    youtube: {
      title: youtubeTitle,
      description: youtubeDescription,
      hashtags: hashtagText.match(/#[\p{L}\p{N}_]+/gu)?.map(tag => tag.toLowerCase()) ?? [],
    },
    reels: captions,
    thumbnailHook,
  };
}

export function metadataToMarkdown(metadata: ProjectMetadata): string {
  return [
    '## YouTube Title', metadata.youtube.title,
    '', '## YouTube Description', metadata.youtube.description,
    '', '## Hashtags', metadata.youtube.hashtags.join(' '),
    '', '## Thumbnail Hook', metadata.thumbnailHook,
    ...metadata.reels.flatMap(reel => ['', `## Reel ${reel.part} — Caption`, reel.caption]),
    '',
  ].join('\n');
}
