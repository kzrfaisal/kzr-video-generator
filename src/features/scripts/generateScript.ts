import 'dotenv/config';
import fs from 'fs';
import { ensureDir, parseContextFlag } from '@/src/shared/utils';
import { config } from '@/config';
import { generateMetadata, MetadataResult } from './generateMetadata';
import type { ContentMode } from '@/src/features/projects/contentMode';
import { createProjectDocument, saveProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import { GeneratedScriptSchema, type GeneratedScript } from '@/src/services/openai/schemas';
import { generateStructured } from '@/src/services/openai/structuredOutput';
import { SCRIPT_PROMPT_VERSION, scriptDeveloperPrompt, scriptUserPrompt } from '@/src/services/openai/prompts';
import type { ScriptScene, SpeakerRole } from '@/src/domain/projects/types';
import { splitCaptionText } from '@/src/domain/projects/captions';
import { textCostUsd } from '@/src/services/openai/pricing';

const EMPTY_METADATA: MetadataResult = { promptTokens: 0, completionTokens: 0, cost: 0 };

export interface ScriptPreferences {
  outputType?: 'youtube' | 'short';
  videoLengthMinutes?: number;
  extractReels?: boolean;
}

function generationTargets(preferences: ScriptPreferences): {
  scenes: number;
  subtitles: number;
  minimumWords: number;
  maximumWords: number;
  targetWords: number;
  minimumWordsPerSubtitle: number;
  maximumWordsPerSubtitle: number;
} {
  const minutes = Math.max(0.25, preferences.videoLengthMinutes ?? 3);
  const scenes = preferences.outputType === 'short'
    ? 2
    : Math.max(2, Math.min(8, Math.round(minutes / 0.65)));
  const minimumWords = Math.round(minutes * 125);
  const maximumWords = Math.round(minutes * 155);
  const targetWords = Math.round(minutes * 140);
  const subtitles = Math.max(scenes * 2, Math.min(scenes * 6, Math.round(targetWords / 14)));
  return {
    scenes,
    subtitles,
    minimumWords,
    maximumWords,
    targetWords,
    minimumWordsPerSubtitle: Math.max(8, Math.floor(minimumWords / subtitles)),
    maximumWordsPerSubtitle: Math.max(12, Math.ceil(maximumWords / subtitles)),
  };
}

function generatedWordCount(script: GeneratedScript): number {
  return script.sections.reduce((total, section) => total + section.subtitles.reduce(
    (sectionTotal, subtitle) => sectionTotal + subtitle.narration.trim().split(/\s+/).filter(Boolean).length,
    0,
  ), 0);
}

function mergeSectionPair(
  sections: GeneratedScript['sections'],
  index: number,
): GeneratedScript['sections'] {
  const first = sections[index];
  const second = sections[index + 1];
  return [
    ...sections.slice(0, index),
    {
      title: first.title || second.title,
      subtitles: [...first.subtitles, ...second.subtitles],
    },
    ...sections.slice(index + 2),
  ];
}

/** Keep generated scenes editorially useful instead of accepting one tiny scene per beat. */
function balanceGeneratedSections(
  sections: GeneratedScript['sections'],
  targetSceneCount: number,
): GeneratedScript['sections'] {
  let balanced = sections.map(section => ({ ...section, subtitles: [...section.subtitles] }));
  while (balanced.length > targetSceneCount) {
    const candidates = balanced.slice(0, -1)
      .map((section, index) => ({ index, size: section.subtitles.length + balanced[index + 1].subtitles.length }))
      .filter(candidate => candidate.size <= 6)
      .sort((a, b) => a.size - b.size);
    if (candidates.length === 0) break;
    balanced = mergeSectionPair(balanced, candidates[0].index);
  }
  if (balanced.length > 1 && balanced.every(section => section.subtitles.length === 2)) {
    balanced = mergeSectionPair(balanced, 0);
  }
  return balanced;
}

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

export async function run(
  topic: string,
  context: string = '',
  contentMode: ContentMode = 'debate',
  preferences: ScriptPreferences = {},
): Promise<{
  debateName: string;
  promptTokens: number;
  completionTokens: number;
  scriptCost: number;
  metadata: MetadataResult;
}> {
  ensureDir('output/debates');
  const existing = fs.readdirSync('output/debates')
    .filter((file: string) => file.startsWith('debate') && file.endsWith('.txt'))
    .map((file: string) => parseInt(file.replace('debate', '').replace('.txt', ''), 10))
    .filter((number: number) => !Number.isNaN(number));
  const debateName = `debate${(existing.length > 0 ? Math.max(...existing) : 0) + 1}`;
  const targets = generationTargets(preferences);
  const promptInput = (validationFeedback?: string, previousDraft?: GeneratedScript) => scriptUserPrompt({
      title: topic,
      context,
      contentMode,
      videoLengthTarget: preferences.videoLengthMinutes
        ? `${preferences.videoLengthMinutes} minutes`
        : config.videoLengthTarget,
      sceneCountTarget: targets.scenes,
      subtitleCountTarget: targets.subtitles,
      wordCountMinimum: targets.minimumWords,
      wordCountMaximum: targets.maximumWords,
      wordCountTarget: targets.targetWords,
      wordsPerSubtitleMinimum: targets.minimumWordsPerSubtitle,
      wordsPerSubtitleMaximum: targets.maximumWordsPerSubtitle,
      validationFeedback,
      previousDraft,
    });
  let generated = await generateStructured({
    model: config.scriptModel,
    schema: GeneratedScriptSchema,
    schemaName: 'video_script',
    developerPrompt: scriptDeveloperPrompt(contentMode, config.isReelStyle),
    userPrompt: promptInput(),
    label: 'script generation',
    projectId: debateName,
    projectTitle: topic,
  });
  let inputTokens = generated.usage.inputTokens;
  let cachedInputTokens = generated.usage.cachedInputTokens;
  let outputTokens = generated.usage.outputTokens;
  let bestGenerated = generated;
  let bestDistance = Math.abs(generatedWordCount(generated.data) - targets.targetWords);
  for (let attempt = 1; attempt < 3; attempt++) {
    const actualWords = generatedWordCount(generated.data);
    if (actualWords >= targets.minimumWords && actualWords <= targets.maximumWords) break;
    generated = await generateStructured({
      model: config.scriptModel,
      schema: GeneratedScriptSchema,
      schemaName: 'video_script',
      developerPrompt: scriptDeveloperPrompt(contentMode, config.isReelStyle),
      userPrompt: promptInput(
        `The supplied draft contains ${actualWords} words. Expand and rewrite it to exactly ${targets.scenes} scenes and ${targets.subtitles} subtitles, targeting ${targets.targetWords} total narration words. Preserve its useful facts and improve the explanation without repetition.`,
        generated.data,
      ),
      label: `script duration correction ${attempt}`,
      projectId: debateName,
      projectTitle: topic,
    });
    inputTokens += generated.usage.inputTokens;
    cachedInputTokens += generated.usage.cachedInputTokens;
    outputTokens += generated.usage.outputTokens;
    const distance = Math.abs(generatedWordCount(generated.data) - targets.targetWords);
    if (distance < bestDistance) {
      bestGenerated = generated;
      bestDistance = distance;
    }
  }
  generated = bestGenerated;
  const finalWordCount = generatedWordCount(generated.data);
  if (finalWordCount < targets.minimumWords || finalWordCount > targets.maximumWords) {
    console.warn(`Script length is approximate: generated ${finalWordCount} words for a ${targets.targetWords}-word target.`);
  }

  const generatedSections = balanceGeneratedSections(generated.data.sections, targets.scenes)
    .map(section => ({
      ...section,
      subtitles: section.subtitles.flatMap(subtitle =>
        splitCaptionText(subtitle.narration).map(narration => ({ ...subtitle, narration })),
      ),
    }));
  const generatedSubtitles = generatedSections.flatMap((section, sectionIndex) =>
    section.subtitles.map(subtitle => ({
      ...subtitle,
      sectionId: `section-${String(sectionIndex + 1).padStart(3, '0')}`,
      headline: section.title,
    })),
  );

  if (contentMode === 'narrated-explainer' && generatedSubtitles.some(scene => scene.speaker !== 'HOST')) {
    console.warn('Explainer output contained a non-HOST speaker; it was normalized automatically.');
  }
  if (contentMode === 'debate') {
    const speakers = new Set(generatedSubtitles.map(scene => scene.speaker));
    if (!speakers.has('HOST') || !speakers.has('A') || !speakers.has('B')) {
      console.warn('Debate output did not use every speaker role; saving the generated draft for review.');
    }
  }

  const scenes: ScriptScene[] = generatedSubtitles.map((scene, index) => ({
    id: `scene-${String(index + 1).padStart(3, '0')}`,
    sectionId: scene.sectionId,
    speaker: (contentMode === 'narrated-explainer' ? 'HOST' : scene.speaker) as SpeakerRole,
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

  const project = createProjectDocument({
    id: debateName,
    title: topic,
    context,
    contentMode,
    script: content,
    config: {
      contentMode,
      ...preferences,
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

  const scriptCost = textCostUsd({
    model: config.scriptModel,
    inputTokens,
    cachedInputTokens,
    outputTokens,
  });

  return { debateName, promptTokens: inputTokens, completionTokens: outputTokens, scriptCost, metadata };
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
