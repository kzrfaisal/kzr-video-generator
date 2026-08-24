export interface CaptionSourceLine {
  speaker: string;
  text: string;
}

export interface RenderCaption extends CaptionSourceLine {
  sourceLineIndex: number;
}

/** Split narration into balanced, readable caption blocks without changing its words. */
export function splitCaptionText(text: string, maximumWords = 16): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunkCount = Math.ceil(words.length / maximumWords);
  const baseSize = Math.floor(words.length / chunkCount);
  const largerChunks = words.length % chunkCount;
  const captions: string[] = [];
  let offset = 0;
  for (let index = 0; index < chunkCount; index++) {
    const size = baseSize + (index < largerChunks ? 1 : 0);
    captions.push(words.slice(offset, offset + size).join(' '));
    offset += size;
  }
  return captions;
}

/** One render caption becomes exactly one audio file and one video segment. */
export function buildRenderCaptions(lines: CaptionSourceLine[]): RenderCaption[] {
  return lines.flatMap((line, sourceLineIndex) =>
    splitCaptionText(line.text).map(text => ({ speaker: line.speaker, text, sourceLineIndex })),
  );
}
