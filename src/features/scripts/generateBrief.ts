import { config } from '@/config';
import type { ContentMode } from '@/src/domain/projects/types';
import { GeneratedBriefSchema, type GeneratedBrief } from '@/src/services/openai/schemas';
import { generateStructured } from '@/src/services/openai/structuredOutput';
import { briefDeveloperPrompt, briefUserPrompt } from '@/src/services/openai/prompts';

export async function generateBrief(contentMode: ContentMode): Promise<GeneratedBrief> {
  const generated = await generateStructured({
    model: config.scriptModel,
    schema: GeneratedBriefSchema,
    schemaName: 'video_project_brief',
    developerPrompt: briefDeveloperPrompt(contentMode),
    userPrompt: briefUserPrompt(contentMode),
    label: 'brief generation',
    projectTitle: `New ${contentMode === 'debate' ? 'debate' : 'explainer'} brief`,
  });

  return generated.data;
}
