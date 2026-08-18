import type { ContentMode } from '../../domain/projects/types';

export interface ScriptPromptFixture {
  name: string;
  title: string;
  context: string;
  contentMode: ContentMode;
  mustMention: string[];
}

export const SCRIPT_PROMPT_FIXTURES: ScriptPromptFixture[] = [
  {
    name: 'historical explainer',
    title: 'How Ancient Rome shaped the modern world',
    context: 'Focus on law, infrastructure, and language.',
    contentMode: 'narrated-explainer',
    mustMention: ['Ancient Rome', 'law', 'infrastructure'],
  },
  {
    name: 'balanced technology debate',
    title: 'Should AI replace classroom teachers?',
    context: 'Compare personalization with the human role of teachers.',
    contentMode: 'debate',
    mustMention: ['AI', 'teachers', 'personalization'],
  },
];

