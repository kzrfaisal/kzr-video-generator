import assert from 'node:assert/strict';
import test from 'node:test';
import { SCRIPT_PROMPT_FIXTURES } from './promptFixtures';
import {
  BRIEF_PROMPT_VERSION,
  METADATA_PROMPT_VERSION,
  SCRIPT_PROMPT_VERSION,
  VISUAL_PROMPT_VERSION,
  briefDeveloperPrompt,
  briefUserPrompt,
  scriptDeveloperPrompt,
  scriptUserPrompt,
} from './prompts';
import { GeneratedBriefSchema, GeneratedMetadataSchema, GeneratedScriptSchema, GeneratedVisualPlanSchema } from './schemas';

test('creates explainer briefs for the selected format', () => {
  const developer = briefDeveloperPrompt('narrated-explainer');
  const user = briefUserPrompt('narrated-explainer');
  assert.match(developer, new RegExp(BRIEF_PROMPT_VERSION));
  assert.match(developer, /narrated explainer/);
  assert.ok(user.includes('narrated-explainer'));
  assert.equal(GeneratedBriefSchema.safeParse({
    title: 'How El Niño Can Make Everything More Expensive',
    description: 'Warm Pacific water can create global economic consequences.',
    thumbnailHook: 'WHY EVERYTHING COSTS MORE',
  }).success, true);
});

test('creates debate briefs around two defensible positions', () => {
  assert.match(briefDeveloperPrompt('debate'), /two genuinely defensible opposing positions/);
  assert.ok(briefUserPrompt('debate').includes('debate'));
});

test('keeps application rules in the developer prompt and creator data in the user prompt', () => {
  for (const fixture of SCRIPT_PROMPT_FIXTURES) {
    const developer = scriptDeveloperPrompt(fixture.contentMode);
    const user = scriptUserPrompt({
      title: fixture.title,
      context: fixture.context,
      contentMode: fixture.contentMode,
      videoLengthTarget: '2 minutes',
      wordCountMinimum: 250,
      wordCountMaximum: 310,
      wordCountTarget: 280,
      wordsPerSubtitleMinimum: 20,
      wordsPerSubtitleMaximum: 28,
    });
    assert.match(developer, new RegExp(SCRIPT_PROMPT_VERSION));
    assert.doesNotMatch(developer, new RegExp(fixture.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const phrase of fixture.mustMention) assert.ok(user.includes(phrase));
    assert.ok(user.includes('250-310 total spoken words'));
    assert.ok(user.includes('20-28 words'));
    assert.ok(user.includes('280'));
  }
});

test('accepts a valid structured explainer and rejects an invalid speaker', () => {
  const valid = {
    sections: [{
      title: 'A lasting system',
      subtitles: [{
        speaker: 'HOST',
        narration: 'Rome built systems that still shape modern life.',
        visualQuery: 'ancient roman forum sunrise',
        visualType: 'stock-photo',
        durationHintSeconds: null,
      }, {
        speaker: 'HOST',
        narration: 'Its roads and public spaces remain visible in city planning.',
        visualQuery: 'roman road modern city',
        visualType: 'stock-photo',
        durationHintSeconds: null,
      }],
    }, {
      title: 'A modern legacy',
      subtitles: [{
        speaker: 'HOST',
        narration: 'Roman systems influenced later cities.',
        visualQuery: 'roman forum modern plaza',
        visualType: 'stock-photo',
        durationHintSeconds: null,
      }, {
        speaker: 'HOST',
        narration: 'Their legacy remains part of daily urban life.',
        visualQuery: 'modern civic plaza people',
        visualType: 'stock-photo',
        durationHintSeconds: null,
      }],
    }],
  };
  assert.equal(GeneratedScriptSchema.safeParse(valid).success, true);
  assert.equal(GeneratedScriptSchema.safeParse({
    sections: [{
      ...valid.sections[0],
      subtitles: [{ ...valid.sections[0].subtitles[0], speaker: 'NARRATOR' }, valid.sections[0].subtitles[1]],
    }, valid.sections[1]],
  }).success, false);
  assert.equal(GeneratedScriptSchema.safeParse({
    sections: [{ ...valid.sections[0], subtitles: [valid.sections[0].subtitles[0]] }, valid.sections[1]],
  }).success, false);
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
