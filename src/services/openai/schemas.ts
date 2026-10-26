import { z } from 'zod';

export const GeneratedBriefSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  thumbnailHook: z.string().min(1).max(80),
});

export const GeneratedSubtitleSchema = z.object({
  speaker: z.enum(['HOST', 'A', 'B']),
  narration: z.string().min(1).max(500),
  visualQuery: z.string().min(1).max(120),
  visualType: z.enum(['stock-photo', 'character', 'generated-image', 'none']),
  durationHintSeconds: z.number().min(1).max(30).nullable(),
});

export const GeneratedScriptSchema = z.object({
  sections: z.array(z.object({
    title: z.string().max(60),
    subtitles: z.array(GeneratedSubtitleSchema).min(2).max(6),
  })).min(2).max(12),
});

const ReelMetadataSchema = z.object({
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  caption: z.string().min(1).max(2200),
});

export const GeneratedMetadataSchema = z.object({
  youtube: z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(5000),
    hashtags: z.array(z.string().regex(/^#[a-z0-9]+$/)).min(8).max(12),
  }),
  reels: z.array(ReelMetadataSchema).length(3),
  thumbnailHook: z.string().min(1).max(80),
});

export const GeneratedVisualPlanSchema = z.object({
  scenes: z.array(z.object({
    id: z.string().min(1).max(80),
    headline: z.string().min(1).max(60),
    searchQuery: z.string().min(1).max(100),
  })).min(1).max(100),
});

export type GeneratedScript = z.infer<typeof GeneratedScriptSchema>;
export type GeneratedBrief = z.infer<typeof GeneratedBriefSchema>;
export type GeneratedMetadata = z.infer<typeof GeneratedMetadataSchema>;
export type GeneratedVisualPlan = z.infer<typeof GeneratedVisualPlanSchema>;
