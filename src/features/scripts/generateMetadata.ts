import 'dotenv/config';
import fs from 'fs';
import { config } from '@/config';
import { ensureDir } from '@/src/shared/utils';
import { publishDir, publishMetadata } from '@/src/shared/filesystem/paths';
import type { ContentMode } from '@/src/features/projects/contentMode';
import { applyExactProjectTitle, metadataToMarkdown } from '@/src/domain/projects/metadata';
import { readProjectDocument, saveProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import { GeneratedMetadataSchema } from '@/src/services/openai/schemas';
import { generateStructured } from '@/src/services/openai/structuredOutput';
import { METADATA_PROMPT_VERSION, metadataDeveloperPrompt, metadataUserPrompt } from '@/src/services/openai/prompts';
import { textCostUsd } from '@/src/services/openai/pricing';

export interface MetadataResult {
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export async function generateMetadata(
  topic: string,
  context: string,
  scriptContent: string,
  debateName: string,
  contentMode: ContentMode = 'debate',
): Promise<MetadataResult> {
  const generated = await generateStructured({
    model: config.scriptModel,
    schema: GeneratedMetadataSchema,
    schemaName: 'publishing_metadata',
    developerPrompt: metadataDeveloperPrompt(contentMode),
    userPrompt: metadataUserPrompt({
      title: topic,
      context,
      contentMode,
      script: scriptContent,
    }),
    label: 'metadata generation',
  });
  const parts = [...generated.data.reels].sort((a, b) => a.part - b.part);
  if (parts.some((reel, index) => reel.part !== index + 1)) {
    throw new Error('Structured metadata must contain unique reel parts 1, 2, and 3.');
  }
  const structuredMetadata = applyExactProjectTitle({ ...generated.data, reels: parts }, topic);
  const markdown = metadataToMarkdown(structuredMetadata);

  const project = readProjectDocument(debateName);
  project.metadata = structuredMetadata;
  const generation = typeof project.config.generation === 'object' && project.config.generation !== null
    ? project.config.generation as Record<string, unknown>
    : {};
  project.config.generation = {
    ...generation,
    metadataPromptVersion: METADATA_PROMPT_VERSION,
    metadataResponseId: generated.responseId,
  };
  saveProjectDocument(project);

  ensureDir(publishDir(debateName));
  const outFile = publishMetadata(debateName);
  fs.writeFileSync(outFile, markdown, 'utf-8');
  console.log(`Metadata saved to ${outFile}`);

  const usage = generated.usage;
  const cost = textCostUsd({
    model: config.scriptModel,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
  });

  return {
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    cost,
  };
}
