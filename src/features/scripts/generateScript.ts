import 'dotenv/config';
import fs from 'fs';
import { ensureDir, parseContextFlag } from '@/src/shared/utils';
import { config } from '@/config';
import { generateMetadata, MetadataResult } from './generateMetadata';
import type { ContentMode } from '@/src/features/projects/contentMode';
import { createProjectDocument, saveProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import { GeneratedScriptSchema } from '@/src/services/openai/schemas';
import { generateStructured } from '@/src/services/openai/structuredOutput';
import { SCRIPT_PROMPT_VERSION, scriptDeveloperPrompt, scriptUserPrompt } from '@/src/services/openai/prompts';
import type { ScriptScene, SpeakerRole } from '@/src/domain/projects/types';

const SCRIPT_INPUT_COST_PER_TOKEN  = 0.150 / 1_000_000;
const SCRIPT_OUTPUT_COST_PER_TOKEN = 0.600 / 1_000_000;

const EMPTY_METADATA: MetadataResult = { promptTokens: 0, completionTokens: 0, cost: 0 };

async function generateMetadataIfEnabled(
  topic: string,
  context: string,
  scriptContent: string,
  debateName: string,
  contentMode: ContentMode,
): Promise<MetadataResult> {
  if (!config.generateMetadata) return EMPTY_METADATA;
  try {
    return await generateMetadata(topic, context, scriptContent, debateName, contentMode);
  } catch (err: any) {
    console.warn(`Metadata generation failed (non-fatal): ${err.message}`);
    return EMPTY_METADATA;
  }
}

export async function run(topic: string, context: string = '', contentMode: ContentMode = 'debate'): Promise<{
  debateName: string;
  promptTokens: number;
  completionTokens: number;
  scriptCost: number;
  metadata: MetadataResult;
}> {
  ensureDir('output/debates');
  const generated = await generateStructured({
    model: config.scriptModel,
    schema: GeneratedScriptSchema,
    schemaName: 'video_script',
    developerPrompt: scriptDeveloperPrompt(contentMode, config.isReelStyle),
    userPrompt: scriptUserPrompt({
      title: topic,
      context,
      contentMode,
      videoLengthTarget: config.videoLengthTarget,
    }),
    label: 'script generation',
  });

  if (contentMode === 'narrated-explainer' && generated.data.scenes.some(scene => scene.speaker !== 'HOST')) {
    throw new Error('Structured explainer output contained a non-HOST speaker.');
  }
  if (contentMode === 'debate') {
    const speakers = new Set(generated.data.scenes.map(scene => scene.speaker));
    if (!speakers.has('HOST') || !speakers.has('A') || !speakers.has('B')) {
      throw new Error('Structured debate output must contain HOST, A, and B scenes.');
    }
  }

  const scenes: ScriptScene[] = generated.data.scenes.map((scene, index) => ({
    id: `scene-${String(index + 1).padStart(3, '0')}`,
    speaker: scene.speaker as SpeakerRole,
    narration: scene.narration.trim(),
    headline: scene.headline.trim(),
    visualQuery: scene.visualQuery.trim(),
    visualType: contentMode === 'narrated-explainer' ? 'stock-photo' : scene.visualType,
    visualAssetPath: null,
    durationHintSeconds: scene.durationHintSeconds,
    overlays: scene.headline.trim()
      ? [{ id: `scene-${String(index + 1).padStart(3, '0')}-headline`, type: 'headline', text: scene.headline.trim() }]
      : [],
    status: 'draft',
  }));
  const content = scenes.map(scene => `${scene.speaker}|${scene.narration}`).join('\n') + '\n';

  const existing = fs.readdirSync('output/debates')
    .filter((f: string) => f.startsWith('debate') && f.endsWith('.txt'))
    .map((f: string) => parseInt(f.replace('debate', '').replace('.txt', ''), 10))
    .filter((n: number) => !isNaN(n));

  const nextNumber = (existing.length > 0 ? Math.max(...existing) : 0) + 1;
  const debateName = `debate${nextNumber}`;
  const project = createProjectDocument({
    id: debateName,
    title: topic,
    context,
    contentMode,
    script: content,
    config: {
      contentMode,
      generation: {
        scriptPromptVersion: SCRIPT_PROMPT_VERSION,
        scriptResponseId: generated.responseId,
      },
    },
  });
  project.scenes = scenes;
  saveProjectDocument(project);
  console.log(`Project saved to output/debates/${debateName}.project.json`);
  console.log(`Text export saved to output/debates/${debateName}.txt`);

  const metadata = await generateMetadataIfEnabled(topic, context, content, debateName, contentMode);

  const usage = generated.usage;
  const scriptCost =
    usage.inputTokens * SCRIPT_INPUT_COST_PER_TOKEN +
    usage.outputTokens * SCRIPT_OUTPUT_COST_PER_TOKEN;

  return { debateName, promptTokens: usage.inputTokens, completionTokens: usage.outputTokens, scriptCost, metadata };
}

if (require.main === module) {
  const topic = process.argv[2];
  if (!topic) {
    console.error('Usage: npm run script -- <topic> [--context="<framing>"]');
    process.exit(1);
  }
  const context = parseContextFlag() ?? '';
  const modeArg = process.argv.find(arg => arg.startsWith('--content-mode='))?.split('=')[1];
  const contentMode: ContentMode = modeArg === 'narrated-explainer' ? 'narrated-explainer' : 'debate';
  run(topic, context, contentMode).then(({ debateName, promptTokens, completionTokens, scriptCost, metadata }) => {
    console.log(`[${debateName}] Script cost: input ${promptTokens} tokens, output ${completionTokens} tokens, $${scriptCost.toFixed(6)}`);
    if (metadata.cost > 0) {
      console.log(`[${debateName}] Metadata cost: input ${metadata.promptTokens} tokens, output ${metadata.completionTokens} tokens, $${metadata.cost.toFixed(6)}`);
    }
  }).catch(err => { console.error(err.message); process.exit(1); });
}
