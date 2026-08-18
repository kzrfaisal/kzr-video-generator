import assert from 'node:assert/strict';
import test from 'node:test';
import { SCRIPT_PROMPT_FIXTURES } from './promptFixtures';
import {
  METADATA_PROMPT_VERSION,
  SCRIPT_PROMPT_VERSION,
  VISUAL_PROMPT_VERSION,
  scriptDeveloperPrompt,
  scriptUserPrompt,
} from './prompts';
import { GeneratedMetadataSchema, GeneratedScriptSchema, GeneratedVisualPlanSchema } from './schemas';

test('keeps application rules in the developer prompt and creator data in the user prompt', () => {
  for (const fixture of SCRIPT_PROMPT_FIXTURES) {
    const developer = scriptDeveloperPrompt(fixture.contentMode);
    const user = scriptUserPrompt({
      title: fixture.title,
      context: fixture.context,
      contentMode: fixture.contentMode,
      videoLengthTarget: '2 minutes',
    });
    assert.match(developer, new RegExp(SCRIPT_PROMPT_VERSION));
    assert.doesNotMatch(developer, new RegExp(fixture.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const phrase of fixture.mustMention) assert.ok(user.includes(phrase));
  }
});

test('accepts a valid structured explainer and rejects an invalid speaker', () => {
  const valid = {
    scenes: [{
      speaker: 'HOST',
      narration: 'Rome built systems that still shape modern life.',
      headline: 'A lasting system',
      visualQuery: 'ancient roman forum sunrise',
      visualType: 'stock-photo',
      durationHintSeconds: null,
    }],
  };
  // The service schema requires at least three scenes.
  valid.scenes.push({ ...valid.scenes[0] }, { ...valid.scenes[0] });
  assert.equal(GeneratedScriptSchema.safeParse(valid).success, true);
  assert.equal(GeneratedScriptSchema.safeParse({ scenes: [{ ...valid.scenes[0], speaker: 'NARRATOR' }] }).success, false);
});

test('enforces complete publishing metadata', () => {
  const valid = {
    youtube: {
      title: 'A clear title',
      description: 'A useful description.',
      hashtags: ['#history', '#learning', '#rome', '#law', '#culture', '#cities', '#roads', '#language'],
    },
    reels: [1, 2, 3].map(part => ({ part, caption: `Part ${part} - A clear title\nCaption #history` })),
    thumbnailHook: 'ROME STILL SHAPES US',
  };
  assert.equal(GeneratedMetadataSchema.safeParse(valid).success, true);
  assert.equal(GeneratedMetadataSchema.safeParse({
    ...valid,
    youtube: { ...valid.youtube, hashtags: ['#TooBroad'] },
  }).success, false);
});

test('enforces visual-plan IDs and copy fields', () => {
  const result = GeneratedVisualPlanSchema.safeParse({
    scenes: [{ id: 'visual-scene-001', headline: 'Roman Roads', searchQuery: 'ancient roman stone road' }],
  });
  assert.equal(result.success, true);
  assert.match(METADATA_PROMPT_VERSION, /^metadata-v\d/);
  assert.match(VISUAL_PROMPT_VERSION, /^visual-v\d/);
});

